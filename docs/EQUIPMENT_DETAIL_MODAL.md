# Equipment detail modal

What happens when a user clicks a row in the Equipment masterlist (`/`) or
the Archived equipment page (`/archived`).

Source: [`components/equipment/DetailDrawer.tsx`](../components/equipment/DetailDrawer.tsx),
opened from [`components/equipment/EquipmentMasterlist.tsx`](../components/equipment/EquipmentMasterlist.tsx).

## Opening the modal

Clicking anywhere on a table row (or pressing Enter/Space while it's
focused) opens the modal in **read-only ("view") mode** — never straight
into editing. It loads two things in parallel:

- `GET /api/equipment/{id}` — the record itself.
- `GET /api/equipment/{id}/context` — its ancestors and descendants, for the
  Hierarchy tab.

The modal is a full overlay (`equipment-detail-overlay` / `-dialog`),
keyboard-trapped while open (Tab cycles only through its own focusable
elements) and closes on Escape or clicking the backdrop — unless a
structural-action dialog (Change location, Swap, etc.) is currently open on
top of it, in which case Escape closes that dialog first.

## Layout

```
┌───────────────────────────────────────────────────┐
│ SERIAL_NUMBER  [Archived] [Has parent]      [Close]│
│ Location · updated HH:MM DD/MM/YYYY · version N    │
├───────────────────────────────────────────────────┤
│ Information   Hierarchy   History                  │
├───────────────────────────────────────────────────┤
│ (tab content)                                      │
└───────────────────────────────────────────────────┘
```

The header always shows the serial number, an **Archived** tag if the
record is archived, a **Has parent** tag if it currently has one, its
current location code, last-updated time, and the optimistic-concurrency
`version` number used to detect conflicting edits.

## Visual design

### Shell

A dark scrim (`rgba(18,25,26,.45)`) covers the whole screen; the dialog
itself is centered, capped at **1200px wide**, up to `100dvh − 32px` tall,
white panel background, 12px rounded corners and a soft drop shadow
(`0 20px 60px`). On phones (≤480px) it drops the rounding/shadow entirely
and becomes a true full-screen sheet (`100dvh`, edge-to-edge), with padding
that respects the device's safe-area insets on notched screens.

### Header

Serial number in the header is set in **IBM Plex Mono** (the `.ident`
class used everywhere an identifier — serial, part number, location code —
appears, for visual consistency and to keep similar-looking codes easy to
scan). The Archived/Has-parent tags are the same pill-shaped `Tag`
component used in the masterlist table: a thin 1px border, small caps-ish
11px bold text, amber for Archived and a neutral outline for Has parent.
Close is a small bordered button pinned to the top-right.

### Tabs

A plain underline tab bar (`Information · Hierarchy · History`), each tab a
44px-tall button; the active tab gets a 2px bottom border in the app's
primary blue (`var(--machine)`) and full-strength text color, inactive tabs
sit at a muted gray. The Hierarchy tab additionally shows a small live
descendant count as a subscript next to its label when the record has any.

### Information tab

Each field is a labeled block in a responsive two-column grid (fields
stack to one column on narrow screens); `textarea`-type fields span both
columns. Required fields get a red asterisk after the label. A field in an
error or read-only state gets a tinted background and dimmer text instead
of just a border color change, so the difference is visible even to a
quick glance, not just close reading. All dropdown/location pickers are the
same searchable combobox used everywhere else in the app (small chevron,
opens a filterable list below the field). The Actions section beneath the
form (edit mode only) is a row of small outlined buttons, with the
Archive button rendered in red/danger styling to set it apart from the
purely-structural ones (Change location, Change parent, Swap, Detach).

### Hierarchy tab

The most visually distinct part of the modal. Cards sit on a light dotted
grid background (a subtle repeating radial-gradient dot pattern, evoking
graph paper) inside a bordered, rounded scroll canvas. Each equipment is a
200px-wide card: a small icon in a rounded square (Network for Tester,
Layers3 for Base, Box for everything else), the type name, a chevron (or a
"Viewing" pill on the currently-open card), then Part Number in bold as the
primary line and Serial Number smaller/gray beneath it, a status pill or
struck-through "Archived" label, and the location code with a pin icon.
Parent → child connections are drawn as simple right-angle connector lines
(CSS borders, not SVG) rather than a diagramming library. The card you're
currently viewing gets a thicker blue border, a tinted background, and its
icon inverts to a solid blue fill so it reads as "you are here" at a
glance; archived cards get a dashed border and struck-through text instead
of a solid one. A "Center selected" button re-scrolls the canvas back to
that card if you've panned away. On phones the tree drops the horizontal
canvas entirely and re-flows into a single vertical indented list (like a
file-explorer tree), since a wide side-scrolling diagram doesn't work at
that size.

### History tab

A simple vertical timeline: each entry has a left border rule, a bold
action label ("Changed parent", "Archived", …) with its timestamp
right-aligned, and an indented list of the individual field changes below
it in the `old value → new value` form, with resolved identifiers (see
below) rendered in the same monospace `.ident` style as everywhere else.

## Tab 1 — Information

Renders every visible field from `field_definitions` through
`DynamicForm`, in the admin-configured display order. Two states:

- **View** (the default): every field is read-only. If the signed-in user
  is allowed to edit *anything* on this record (see Permissions below) and
  it isn't archived, an **Edit** button appears.
- **Edit** (after clicking Edit): fields the user is allowed to change
  become interactive; fields they aren't allowed to change stay visibly
  read-only with a "You do not have permission to edit this field" note.
  **Save changes** is disabled until something actually changed, and
  **Undo** reverts to the last-loaded values without closing edit mode.

**Current Location is always locked in this form**, whether or not the
record has a parent — picking a new value here would silently be dropped on
Save. This is intentional, not a bug: location is a structural property
changed only through the dedicated actions below, so the field shows a note
pointing at whichever action applies instead of pretending it's editable.
Two different notes depending on state:
- Has a parent → "Location follows the parent automatically. Use Change
  location, Change parent or Detach to change it."
- Standalone → "Location can only be changed using the Change location
  action above."

### Actions (only shown once you click Edit)

| Action | Shown when | What it does |
| --- | --- | --- |
| **Change location** | no parent, not archived | Moves this equipment (and any live descendants) to a different location. Shows how many child records will move with it. |
| **Change parent** | `can_move`, not archived | Re-parents this equipment under another one, found by searching serial numbers. Its own descendants are excluded from the search (can't become your own grandparent). Location then follows the new parent. |
| **Swap** | `can_move`, not archived | Exchanges position with another equipment of the **same Type** (Part Number is not considered). Shows a Before/After location preview and an optional reason note. Any live children move together with their parent. |
| **Detach from parent** | has a parent, `can_detach`, not archived | Becomes standalone. Keeps its *current* location (does not revert to any previous one). Its own children are unaffected. |
| **Archive** | `can_archive`, not archived | Soft-deletes the record — hidden from the default masterlist, data and history kept. Blocked if it still has any non-archived children (archive or detach them first). |
| **Restore** | archived, **admin only** | Un-archives the record. Blocked if its parent is still archived (restore the parent first). |

There is no hard delete anywhere in this system — "Archive" is the only
delete-like action, and it's always reversible by an admin via Restore.

Every structural action re-validates on the server against the row's
current `version`; if someone else changed it in the meantime you get an
`OPTIMISTIC_CONFLICT` with a "Reload latest data" link instead of silently
overwriting their change.

## Tab 2 — Hierarchy

A visual tree: ancestors above, the equipment you opened in the middle
(highlighted, labeled "Viewing"), its descendants below. Each card shows a
type icon, the **Part Number** (bold, primary line), the Serial Number
(smaller, secondary line), a status tag (or "Archived" struck through), and
its location code. Clicking any other card in the tree re-opens the modal
for that equipment instead — a quick way to walk the chain without closing
and re-searching. A summary line at the top gives ancestor/direct-children/
total-descendants counts.

## Tab 3 — History

The full audit trail for this record, newest first, loaded from
`GET /api/equipment/{id}/history`. Each entry shows what happened (Created,
Updated fields, Changed location, Changed parent, Swapped, Detached,
Archived, Restored, or "Location changed with parent" for a cascade caused
by an ancestor moving) and when.

For field-level changes, each line reads `Label: old value → new value`.
Two fields get special handling before this ever reaches the browser,
because their raw stored value (a uuid) is meaningless to a person reading
the log:
- **Parent** — resolved to `Part Number | Serial Number` of the equipment
  it pointed to.
- **Current Location** — resolved to the location's code.

A field that didn't actually change is never listed — e.g. detaching from
a parent only ever logs the parent change, not a location entry showing the
same value on both sides.

## Permissions, in one place

Everything above is gated by the signed-in user's own profile
(`components/equipment/DetailDrawer.tsx`'s `Me` type), assigned per-user in
Admin → Users & permissions:

- `role`: `admin` bypasses every check below entirely. `viewer` can never
  edit anything, full stop. `user` follows the flags beneath.
- `editable_fields`: `null` means "every field" (always true for admins);
  otherwise an explicit list of `field_key`s this user may change via the
  Information tab.
- `can_create` / `can_move` / `can_detach` / `can_archive`: independent
  per-user toggles gating New Equipment, Change parent + Swap, Detach, and
  Archive respectively. Restore has no toggle of its own — it's always
  admin-only.

Read access is not gated the same way: anyone signed in can see every
`is_visible` field, every tab, and the full history — these permissions
only ever restrict *writing*.

## Colors, type & icons reference

Nothing here is specific to the modal — it's the same design tokens used
across the whole app (`app/globals.css`), which is why the modal never
looks like a separate "mode."

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--machine` | `#0067b1` | `#247cc2` | Primary blue — active tab underline, selected hierarchy card border, primary buttons |
| `--machine-tint` | `#eaf3fc` | `#16344e` | Tinted background behind the selected/hovered card, primary button hover |
| `--ink` / `--ink-2` / `--ink-3` | dark → light gray | light → darker gray | Primary text / secondary text (labels, meta) / tertiary text (hints, captions) |
| `--panel` | white | `#122335` | Card and dialog surface |
| `--surface` | `#f3f6fa` | `#0c1825` | Page/canvas background (the hierarchy dot-grid sits on this) |
| `--rule` / `--rule-soft` | light gray borders | dark gray borders | Default borders / lighter dividers |
| `--warn` | amber | amber | Archived tags/labels |
| `--alert` | red | red | Danger actions (Archive button), error notices |
| `--ok` | blue-teal | light blue | "Viewing" pill, success notices |

Status pills (`active` / `inactive` / `under registration`) use their own
fixed green/red/amber palette rather than the theme tokens above, so a
status reads the same regardless of light/dark mode.

**Typography**: IBM Plex Sans for all UI text, IBM Plex Mono (`.ident`) for
every identifier — serial numbers, part numbers, location codes, request
IDs — so codes are visually distinct from prose and align in fixed-width
columns.

**Icons**: [lucide-react](https://lucide.dev), 13–18px, always
`aria-hidden` when paired with visible text. Notable ones in this modal:
`Network` (Tester type / hierarchy header), `Layers3` (Base type), `Box`
(Fixture/Equipment type), `MapPin` (location), `LocateFixed` (Center
selected), `ChevronRight` (drill-down affordance on non-selected hierarchy
cards).

Everything respects both the light/dark theme toggle and the English/
Vietnamese language switch already covered in [`UI_LAYOUT.md`](UI_LAYOUT.md)
— this modal doesn't introduce any new theming or i18n mechanism of its
own.
