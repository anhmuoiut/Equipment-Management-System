# Database reference

What the schema actually is today (Postgres via Supabase), how the pieces
fit together, and — in the final section — where it will bend or break as
the app grows, with concrete options for each.

Source of truth: [`database/full_reset.sql`](../database/full_reset.sql)
(the incremental migrations in `database/migrations/001`–`007` are folded
into it). Service layer: [`lib/services/`](../lib/services). Permission
rules: [`lib/permissions/index.ts`](../lib/permissions/index.ts). Auth:
[`lib/auth/`](../lib/auth).

## 1. Design philosophy

Four decisions shape everything else in this schema:

1. **No hard delete, anywhere.** `equipment` rows are soft-deleted via
   `archived_at`/`archived_by`. There is no delete path for `locations`
   either (only `is_active = false`). `audit_log` rows can never be
   updated or deleted (`revoke update, delete on public.audit_log from
   public`). History is permanent by construction, not by convention.
2. **Optimistic concurrency everywhere a row is mutated.** Every table
   that users edit through the UI (`equipment`) carries an integer
   `version` column. Every write RPC takes the version the client last
   read and does `where id = ... and version = $expected`; a 0-row update
   means someone else changed it first, and the RPC raises
   `OPTIMISTIC_CONFLICT`. There is no separate locking table or
   last-write-wins anywhere.
3. **RLS is deny-all; `withAuth()` is the real gate.** Row Level Security
   is enabled on every table, but `service_role` (used by the server-side
   Supabase client) bypasses RLS entirely — that's a deliberate trade,
   not an oversight: RLS policies can't express "same role, but only the
   fields this specific user was granted" the way `field_permissions`
   needs to. The actual authorization boundary is
   [`withAuth()`](../lib/auth/withAuth.ts), which every API route must be
   wrapped in and which declares the role/action it requires up front.
   RLS's job here is just a backstop against a client ever reaching the
   database directly with the anon key.
4. **All structural writes are `plpgsql` RPCs, not client-side
   `update()` calls.** Anything that touches more than one row atomically
   (moving a subtree, swapping two equipment, cascading a location change
   to live descendants) has to run inside the database — `supabase-js` has
   no client-side transactions. The service layer
   (`lib/services/equipment.ts`) is the only code allowed to call
   `supabaseAdmin()`, and for writes it almost always calls an RPC rather
   than `.insert()`/`.update()` directly.

## 2. Entity-relationship overview

```
locations ──1──< equipment >──0..1── equipment (self, parent_id)
    │                  │
    │                  ├──< audit_log (entity_type='equipment')
    │                  │
user_profiles ──0..*──<│  (created_by / updated_by / archived_by)
    │
    ├──< field_permissions >── field_definitions
    │
    ├──< audit_log (changed_by)
    └──< error_log (user_id, no FK)
```

- `equipment.parent_id` is a **self-referencing FK** — the hierarchy is a
  single adjacency-list tree, walked at read time with recursive CTEs
  (`get_equipment_ancestors` / `get_equipment_descendants`), not stored as
  a materialized path or nested-set.
- `field_permissions` is a many-to-many join between `user_profiles` and
  `field_definitions`, with a single boolean payload (`can_edit`).
- `audit_log` and `error_log` are append-only logs, not part of the
  relational graph — `entity_id` and `user_id` are plain UUID columns with
  no FK, on purpose (see §6).

## 3. Tables

### `locations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `code` | text, unique, not null | Short physical-location code (`B3F1`) — what every UI shows |
| `name` | text | Optional longer label |
| `sort_order` | integer, default 0 | Drives the app's default display order everywhere a location list appears |
| `is_active` | boolean, default true | Soft "retire a location" flag — no hard delete |
| `created_at` / `updated_at` | timestamptz | `updated_at` maintained by `set_updated_at()` trigger |

Index: `idx_locations_sort (sort_order, code)`.

There must always be at least one location — `equipment.current_location_id`
is `not null`. The seed data reserves a `UNKNOWN` location specifically as
a landing spot for legacy-import rows that didn't have a resolvable
location.

### `user_profiles`

The single identity table for **both** authentication providers this app
supports — it is not just a "profile" bolted onto `auth.users`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` default (no longer FK'd to `auth.users`, see below) |
| `full_name` | text, not null | |
| `email` | text, nullable | Required for `auth_provider='supabase'`; not used for `local` accounts |
| `username` | text, unique (case-insensitive), not null | The actual login handle for both provider types; format-checked (`^[a-z0-9][a-z0-9._+-]{0,63}$`) |
| `employee_id` / `department` | text | Free-form, currently display-only |
| `role` | text, check `admin\|user\|viewer` | See §5 |
| `is_active` | boolean, default true | Deactivated accounts can't log in; not deleted |
| `must_change_password` | boolean, default true | Forces a password reset on first login |
| `can_create` / `can_move` / `can_detach` / `can_archive` | boolean | Per-user action toggles, independent of role (§5) |
| `auth_provider` | text, check `supabase\|local`, default `supabase` | Which login path this account uses |
| `password_hash` | text, nullable | Only set for `auth_provider='local'` — `scrypt:<saltHex>:<hashHex>` |
| `token_version` | integer, default 1 | Bumped on password change to invalidate existing local-session cookies |
| `created_at` / `updated_at` | timestamptz | |

Constraints:
- `user_profiles_local_password_chk`: `local` accounts must have a
  `password_hash`; `supabase` accounts must not.
- Unique index on `lower(email)` and on `lower(username)`.

**Why two providers exist**: `supabase` accounts are real Supabase Auth
users (email+password, managed by Supabase, currently used for admins);
`local` accounts are username+password pairs verified entirely by this
app's own code (`lib/auth/password.ts`), with a signed cookie session
(`lib/auth/localSession.ts`) instead of a Supabase session — no
corresponding `auth.users` row exists for them at all. `getCurrentSession()`
(`lib/auth/session.ts`) checks the Supabase session first, then falls back
to the local cookie, so the rest of the app never has to know which kind
of account is signed in.

This is also why `user_profiles.id` no longer has an `on delete cascade`
FK to `auth.users(id)` (migration `006_local_auth.sql` dropped it) — a
`local` row's `id` isn't a Supabase Auth user at all, so `equipment` and
every other table's `*_by` columns were re-pointed to reference
`user_profiles(id)` directly instead of `auth.users(id)`.

### `equipment`

The core table — everything else exists to support, permission, or audit
this one.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `jabil_id`, `part_number`, `asset`, `types`, `level`, `status`, `remark` | text, all nullable | Free text today; `types`/`level`/`status` are admin-configured dropdowns at the UI layer (§7), not DB enums |
| `serial_number` | text, not null | The identifier users search by; **not** globally unique at the DB level (duplicate warnings are a soft UI check, not a constraint — see §9.2) |
| `current_location_id` | uuid, not null, FK → `locations` | Structural — see §4 for why it's not editable via the generic update path |
| `parent_id` | uuid, FK → `equipment(id) on delete restrict`, nullable | Self-reference; `on delete restrict` means a parent can never be hard-deleted while children point at it (moot in practice since nothing hard-deletes equipment anyway) |
| `version` | integer, not null, default 1 | Optimistic concurrency token (§1.2) |
| `created_at`/`created_by`, `updated_at`/`updated_by`, `archived_at`/`archived_by` | timestamptz + uuid FK → `user_profiles` | Full lifecycle attribution |
| `serial_sort` | text, **generated always as ... stored** | See below |
| — | | `constraint equipment_no_self_parent check (id <> parent_id)` |

**`serial_sort`** is a generated column:
```sql
lpad(coalesce(nullif(regexp_replace(serial_number, '\D', '', 'g'), ''), '0'), 20, '0')
|| '|' || serial_number
```
It zero-pads the numeric portion of the serial number to 20 digits so
`"SN-89"` sorts before `"SN-1024"` (plain text sort would put `"1024"`
before `"89"`). It's `stored` (computed once at write time, not read
time) specifically so it can be indexed and used directly in `order by`
without a runtime function call on every row.

Indexes:
- `idx_equipment_serial_number`, `idx_equipment_part_number`,
  `idx_equipment_asset`, `idx_equipment_parent_id`,
  `idx_equipment_archived_at` — plain btree.
- `idx_equipment_location_id`, `idx_equipment_status`, `idx_equipment_types`
  — **partial** indexes (`where archived_at is null`), since almost every
  query filters out archived rows first and an index that includes
  archived rows would just be dead weight for the common case.

Free-text search (serial/part/jabil/asset/remark/type/level/status) is
deliberately **not** indexed — `lib/services/equipment.ts` uses
`ilike '%term%'`, which a btree index can't serve anyway (leading
wildcard). At the current data scale (~thousands of rows) a sequential
scan is sub-5ms, so a trigram (`pg_trgm`) index was judged not worth the
added extension dependency yet — see §9.1 for when that changes.

### `field_definitions`

Admin-configurable metadata for the fixed set of business fields on
`equipment`. This is *not* a fully dynamic custom-fields system — see
§9.4 for what that would take.

| Column | Type | Notes |
| --- | --- | --- |
| `field_key` | text, unique | One of the 9 hardcoded keys the app knows about (`jabil_id`, `part_number`, `serial_number`, `asset`, `types`, `level`, `status`, `remark`, `current_location_id`) — **not** `parent_id`, which is intentionally excluded (parent changes only through the Move/Swap/Detach actions, gated by `can_move`/`can_detach`, not by field permission) |
| `display_label` | text | Admin-editable label, localized in the UI via `lib/i18n/equipment.ts` when it matches a known seed value |
| `data_type` | text, check `text\|number\|date` | |
| `input_type` | text, check `text\|textarea\|number\|date\|dropdown\|location_ref` | Drives which control `DynamicForm` renders |
| `is_required` | boolean | |
| `dropdown_options` | jsonb, nullable | Array of `{ value, label, is_active }` — the actual enum values for `types`/`level`/`status` live **here**, not as a Postgres `check` or `enum` type, precisely so an admin can add/retire an option without a migration |
| `is_visible` | boolean | Hidden fields are omitted from every read, not just greyed out |
| `display_order` | integer | Form/table column order |
| `max_length`, `help_text`, `placeholder` | | |
| `is_system` | boolean, default false | **Currently unused by any code path** — flagged in §9 |
| `updated_by`, `updated_at` | | |

### `field_permissions`

```sql
primary key (user_id, field_key)
```
A pure allow-list: a row means "this user may edit this field"
(`can_edit` is stored but every current row has it `true`; absence of a
row is the deny state — see `lib/permissions/index.ts`). `role='admin'`
bypasses this table entirely; `role='viewer'` is denied everything
regardless of rows here. There is no equivalent table for *read*
permission — every signed-in user reads every `is_visible` field; this
table only ever restricts writes.

### `audit_log`

Append-only, and enforced as such at the grant level
(`revoke update, delete on public.audit_log from public`).

| Column | Type | Notes |
| --- | --- | --- |
| `entity_type` | text, check `equipment\|user\|field\|location` | Only `equipment` is populated by any current RPC — `user`/`field`/`location` changes are tracked in application code today, not written to this table (see §9.3) |
| `entity_id` | uuid, **no FK** | Deliberate — an audit row must survive even if the entity it describes is later hard-deleted by some future migration; a FK would force `on delete cascade`/`restrict` semantics that don't belong on a log |
| `action` | text, free-form (not a check-constrained enum) | Values in practice: `CREATE`, `UPDATE`, `CHANGE_LOCATION`, `MOVE`, `MOVE_CASCADE`, `SWAP`, `DETACH`, `ARCHIVE`, `RESTORE` |
| `changes` | jsonb, default `{}` | `{ field_key: { old, new } }` — only keys that actually changed are ever written (see the `007` fix below) |
| `changed_by` | uuid, FK → `user_profiles` | Nullable for `source='migration'` rows imported without a known actor |
| `request_id` | text | Correlates a row back to the API request that caused it, and to any matching `error_log` row |
| `source` | text, check `ui\|migration\|script` | Distinguishes normal UI-driven history from legacy Excel import rows (shown as "Imported from legacy Excel data" in the History tab) |
| `note` | text | Optional free-text reason (currently only populated by Swap's optional note) |

Indexes: `idx_audit_equipment (entity_id, created_at desc) where
entity_type = 'equipment'`, `idx_audit_recent (created_at desc)`.

**A field only appears in `changes` if its value actually changed.**
Migration `007_audit_log_fixes.sql` fixed `internal_move()` (shared by
Move/Detach/Swap) to stop always writing both `parent_id` and
`current_location_id` — a Detach deliberately keeps its current location,
so before the fix every "Detached from parent" entry showed a confusing
`Current Location: X → X` line with identical values on both sides.

`parent_id` and `current_location_id` are stored as raw UUIDs in
`changes` — meaningful to Postgres, meaningless to a person reading
history. `lib/services/equipment.ts`'s `resolveHistoryLabels()` resolves
them to `"Part Number | Serial Number"` and a location code respectively,
and `resolveActorNames()` resolves `changed_by` to a `full_name`, both
**server-side**, before the API response is ever built — the client never
sees a bare UUID in a history entry.

### `error_log`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `request_id` | text, not null | The thread that ties a user's bug report to server-side detail |
| `route`, `user_id`, `error_code`, `message`, `stack` | | `user_id` has **no FK**, same reasoning as `audit_log.entity_id` — must survive a deleted/deactivated user |
| `created_at` | timestamptz | |

Indexes: `idx_error_log_request (request_id)`, `idx_error_log_recent
(created_at desc)`. Exists because Vercel's own request logs are
short-retention (~1 hour on the Hobby tier) — this table is the durable
record an admin can search by the request ID a user reports.

## 4. The equipment hierarchy, in detail

`equipment.parent_id` self-references form a forest of trees (a
standalone piece of equipment is just a tree of size 1). Two invariants
are enforced, both **in the database**, not just the UI:

1. **No cycles.** `internal_subtree_ids()`/`internal_ancestor_ids()` walk
   with a recursive CTE capped at depth 50; hitting the cap raises
   `DEPTH_LIMIT_EXCEEDED` (a real cycle would otherwise recurse forever).
   `move_equipment()`/`internal_move()` additionally reject a new parent
   that is inside the moving node's own subtree (`PARENT_CYCLE_DETECTED`)
   before ever touching a row.
2. **Location follows the parent.** A child's `current_location_id`
   is *not* independently editable — `change_location_equipment()`
   explicitly raises `LOCATION_INHERITED_READ_ONLY` if the target has a
   parent. Location only changes for a non-root node as a *cascade*: when
   an ancestor moves, `internal_cascade_location()` updates every live
   (non-archived) descendant to the new location and writes one
   `MOVE_CASCADE` audit row per affected row, tagged with
   `note = 'caused_by=<the ancestor that moved>'`.

All four structural mutations (Move, Detach, Swap, and the cascade inside
Change-location) funnel through the same `internal_move()` core, which is
why the audit-log fix in §3/`audit_log` only had to be made in one place.
`swap_equipment()` calls `internal_move()` twice — once per side — inside
one transaction, after checking both equipment are the same `types`,
neither is an ancestor/descendant of the other
(`SWAP_INVALID_ANCESTOR_RELATION`), and both pass their expected
`version`.

Row locking: every structural RPC calls `internal_lock_rows()` (a plain
`select ... for update` over the full subtree, sorted by `id` to keep a
consistent lock order and avoid deadlocking against a concurrent
operation on an overlapping subtree) before making any change, and sets
`lock_timeout = 3s` / `statement_timeout = 8s` so a stuck concurrent
operation fails fast with `LOCK_TIMEOUT` instead of hanging the request.

## 5. Permission model

Three independent layers, all read from `user_profiles` (plus
`field_permissions`), checked in `lib/permissions/index.ts` and enforced
by `withAuth()` on every route — RLS plays no role in any of this (§1.3):

| Layer | Column(s) | Semantics |
| --- | --- | --- |
| Role | `role` | `admin` bypasses every other check. `viewer` can never write anything. `user` follows the two layers below. |
| Action permissions | `can_create`, `can_move`, `can_detach`, `can_archive` | Independent per-user booleans gating New Equipment, Change-parent+Swap, Detach, and Archive respectively. **Restore has no column of its own — it's always admin-only** (`canRestore()` just checks `role==='admin'`). |
| Field permissions | `field_permissions` rows | Which of the 9 `field_key`s a `user`-role account may edit via the generic update path. `null`/no rows = nothing editable; admins are never consulted against this table at all. |

There are no permission presets or role templates in the schema — every
non-admin user's four action booleans and field-permission rows are set
individually (a deliberate simplification made earlier in this project;
see §9.3 if that ever needs to scale to many users).

## 6. Auth & session model

- **`supabase` accounts**: real Supabase Auth users. Login/password are
  handled entirely by Supabase; `user_profiles.id` equals the
  `auth.users.id`. Session = Supabase's own cookie via `@supabase/ssr`.
- **`local` accounts**: `user_profiles.id` is a plain generated UUID with
  no corresponding `auth.users` row. `password_hash` is verified by
  `lib/auth/password.ts` (scrypt), and a signed cookie
  (`lib/auth/localSession.ts`) carries `{ uid, tv }` — `tv` is checked
  against `user_profiles.token_version` on every request, so bumping
  `token_version` (done on password change) instantly invalidates every
  existing local-session cookie for that account without needing a
  server-side session table.
- `getCurrentSession()` tries the Supabase session first, then the local
  cookie — this is the only place that needs to know two providers exist;
  everything downstream just gets a `userId`.

## 7. Business rules enforced where (a quick map)

| Rule | Enforced in |
| --- | --- |
| No cycles in the equipment tree | Postgres (`PARENT_CYCLE_DETECTED`, `DEPTH_LIMIT_EXCEEDED`) |
| Location follows parent, never independently set on a child | Postgres (`LOCATION_INHERITED_READ_ONLY`) |
| Can't archive equipment with live children | Postgres (`ARCHIVE_BLOCKED_HAS_CHILDREN`) |
| Can't restore under a still-archived parent | Postgres (`MOVE_TARGET_ARCHIVED` inside `restore_equipment`) |
| Swap requires same `types` | Postgres (`SWAP_INVALID`) |
| Optimistic concurrency (`version`) | Postgres, every write RPC |
| Role / action-permission / field-permission checks | Application (`lib/permissions`, called from `withAuth` and route handlers) — **not** RLS |
| Dropdown option validity, required fields, max length | Application (`lib/validators/`), backed loosely by `field_definitions` |
| Duplicate Part+Serial warning | Application only, non-blocking (§9.2 — no DB constraint) |

## 8. Seed data / field catalog today

`database/seed/001_seed.sql` is the only place the actual dropdown values
and starting locations live — nothing below is hardcoded in application
code beyond bilingual label lookups:

- **Locations**: `UNKNOWN` (required landing spot for unresolvable
  legacy-import rows) plus `B3F1`–`B3F5`.
- **`types`**: `tester`, `base`, `fixture`, `equipment`.
- **`level`**: `unified`, `eol`, `final_test`, `programming`,
  `function_test`.
- **`status`**: `active`, `inactive`, `repair`, `wait_reg`.

All four are ordinary `field_definitions.dropdown_options` rows — an
admin can add, relabel, or retire (`is_active: false`) any of these
without a migration, from Admin → Field configuration.

## 9. Scalability & extension points

This section is the "what would actually need to change" answer, ordered
roughly by how soon it's likely to matter.

### 9.1 Search will stop being "just `ilike`"

`listEquipment()` runs `ilike '%term%'` across up to 8 text columns with
no supporting index, justified in the code as fine "at 2,000 records."
That justification degrades non-linearly: a `%leading-wildcard%` pattern
can never use a plain btree, so cost scales with total row count, not
result size. If the fleet grows past roughly 20k–50k active equipment
rows, or search starts feeling slow under concurrent use, the fix is a
`pg_trgm` GIN index per searched column (`create extension pg_trgm;
create index ... using gin (part_number gin_trgm_ops);`) — a purely
additive migration, no application-code change beyond keeping the same
`ilike` queries (they'll just start using the index). Full-text search
(`tsvector`) would be overkill here since users search for exact-ish
codes, not prose.

### 9.2 Serial number isn't unique — decide if it should be

There's no `unique` constraint on `equipment.serial_number`; duplicates
are only flagged as a non-blocking warning at the application layer
(`findDuplicates()`, `DUPLICATE_WARNING`). This was presumably
deliberate (legacy data likely already has duplicates), but it means two
completely different pieces of equipment can share a serial number
forever with nothing but a soft warning distinguishing them. If the
business rule is actually "serial numbers must be unique going forward,
existing duplicates are grandfathered," a **partial unique index** is
the right tool: `create unique index ... on equipment (serial_number)
where archived_at is null and created_at >= '<cutover date>'` — enforces
uniqueness for new data without a backfill migration touching old rows.

### 9.3 Audit log only covers `equipment`

`entity_type` already has `user`/`field`/`location` in its check
constraint, but no RPC writes those rows today — user creation/role
changes, field-definition edits, and location edits are presumably only
traceable via each table's own `updated_at`/`updated_by`, with no
historical trail of *what* changed. If "who changed this user's role, and
when, and from what" ever needs to be answerable (a reasonable ask once
there's more than a couple of admins), the schema already supports it —
it just needs the corresponding service-layer calls
(`lib/services/admin.ts`, `lib/services/field-config.ts`) to also insert
into `audit_log` the same way `update_equipment_with_audit()` does. No
schema change required, only new write paths.

Related: today every non-admin user's four action booleans and field
permissions are set one-by-one (this was an explicit simplification made
in this project — presets were deliberately removed). That's fine at
current headcount; if the user base grows into the dozens, consider a
lightweight `permission_templates` table (name + the same 4 booleans + a
default field-permission set) that a new user can be *seeded from* — a
starting point an admin can still hand-edit afterward, not a rigid role
system. This is additive and wouldn't remove the current per-user
granularity.

### 9.4 `field_definitions` is "configurable," not "custom fields"

The 9 `field_key`s are a fixed list baked into `equipment`'s actual
columns, `toValues()`/`BUSINESS_KEYS` in the client, and the allowlist in
`update_equipment_with_audit()`. `field_definitions` lets an admin
relabel, reorder, hide, or add dropdown options to those 9 — it cannot
add a genuinely new field. If "let an admin add a whole new tracked
attribute without a deploy" becomes a real requirement, that's a bigger
change with a real trade-off, not a quick patch:

- **EAV-style side table** (`equipment_custom_values(equipment_id,
  field_key, value)`): fully dynamic, no migration to add a field, but
  loses typed columns, generated-column tricks like `serial_sort`, and
  makes `update_equipment_with_audit`'s current "build one UPDATE from an
  allowlist" pattern (and its clean diff-based audit logging) much
  harder — that function would need to branch into two write paths.
- **A `jsonb custom_fields` column on `equipment`** with
  `field_definitions` gaining a `is_custom boolean`: simpler to add, JSONB
  can be indexed with GIN if a custom field needs to be searchable, and
  the diffing/audit code only needs to special-case one column instead of
  a whole side table. This is the smaller lift of the two and would
  likely be the pragmatic choice if/when this is actually needed —
  but it's real schema + RPC + client work, not a config toggle, so it's
  worth confirming the actual requirement (how many custom fields, do
  they need to be searchable/filterable/reportable) before picking
  between these.

Not recommending either now — flagging it so a future "can we just add a
field called X without you writing code" request has a clear, pre-thought
answer instead of a scramble.

### 9.5 Multi-site / multi-tenant is not modeled

`locations` is a flat list — there's no `site`/`plant`/`org` grouping
above it. If this app is ever rolled out to a second Jabil site (or
externally, multi-tenant), every table with a natural site boundary
(`equipment`, `locations`, `user_profiles`) would need a `site_id`, RLS
would need to start doing real work for the first time (currently it's
deny-all + service-role-bypass, which only works because there's exactly
one tenant), and every list/search query would need an implicit
`site_id` filter. This is a substantial change, not a migration to queue
casually — worth treating as a distinct project if it's actually on the
roadmap, rather than something to "future-proof" preemptively into
today's schema.

### 9.6 Small, low-risk cleanups worth doing whenever you next touch these areas

- **`field_definitions.is_system`** is defined and always `false`,
  referenced nowhere in application code. Either wire it in (e.g. to
  prevent an admin from hiding `serial_number`, which the rest of the
  system assumes always exists) or drop the column — right now it's
  documentation that lies.
- **`audit_log.action`** is a free-text column, not `check`-constrained,
  while `ACTION_KEYS` in the client is a closed, hand-maintained map. A
  typo'd action string from a future RPC would silently fall back to
  showing the raw string in the History tab instead of failing loudly.
  A `check (action in (...))` constraint mirroring the client's
  `ACTION_KEYS` would catch that at write time.
- **`error_log.user_id` / `audit_log.entity_id`** having no FK is correct
  today (§3), but means a typo'd UUID would be inserted silently. That's
  the right trade for a log table — just noting it's intentional so a
  future contributor doesn't "fix" it by adding a FK and reintroducing
  the delete-ordering problem it was avoiding.

### What this means in practice

Nothing above is urgent — the current schema is internally consistent
and every rule has a clear, single enforcement point, which is the
property that actually matters for extending it safely. The items in
9.1–9.4 are the ones most likely to become real asks (faster search,
stricter serial-number rules, permission templates, genuinely dynamic
fields, in roughly that order of likelihood); 9.5 is the one substantial
rewrite if it ever comes up. None of them require touching the schema
today — they're here so the next feature request can be matched against
a plan instead of a fresh full-schema read-through.
