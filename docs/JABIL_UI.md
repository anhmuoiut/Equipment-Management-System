# UI requirements: SolarEdge Equipment Management

Updated: 4 October 2026 (phone layout reworked: cards, bottom bars, account-menu preferences; laptop/desktop review: scan-friendly Masterlist, adaptive toolbar, cleaner panel header). Status: accepted design baseline.

## Read this before changing UI

This is the authoritative UI requirements document for new features and changes throughout this project: login, workspace, dashboard, equipment, administration, dialogs, notifications and printable labels. Developers and AI coding assistants must read it before changing UI.

The guiding principle is **compact, clear, consistent**. Preserve working space for equipment data and everyday tasks. Extend the existing design system rather than introducing a different visual language for each feature.

Explicit new user instructions take precedence. Otherwise, follow this document for visual decisions and the feature specifications for business behavior. If a deliberate design change is requested, update this document in the same change. Do not silently redesign unrelated screens.

[APP_SHELL.md](APP_SHELL.md) defines the menu and routes. [DETAIL_MODEL.md](DETAIL_MODEL.md) defines the one list and detail layout that every module uses (Masterlist + Detail Panel). Its visual treatment must follow this document.

## 1. Brand and typography

| Primary color | Value | Purpose |
| --- | --- | --- |
| Prussian Blue | `#002B49` | Primary text, sidebar, primary actions in light mode |
| White | `#FFFFFF` | Light content surfaces, text on Prussian backgrounds |
| Picton Blue | `#3CB4E5` | Selection, focus, chart accents, primary actions in dark mode |

These are the three **primary brand colors**, not a ban on semantic colors. Errors and destructive actions stay red, warnings stay amber, and success stays green. Photographs keep their original colors. Decorative surfaces, borders, shadows and overlays use the existing brand tokens and mixtures.

Use **IBM Plex Sans throughout the project**, including forms, buttons, tables, dialogs, identifiers and printed labels. Inherit `var(--font-ui)` and retain its system sans-serif fallback. Do not introduce another font for a new feature. Use tabular numerals for aligned numbers and identifiers.

Use Prussian text on Picton backgrounds and white text on Prussian backgrounds. Use theme tokens for text/surface combinations; do not assume light-mode colors work in dark mode.

### Required token reuse

| Meaning | Existing CSS tokens |
| --- | --- |
| Brand | `--jabil-prussian`, `--jabil-white`, `--jabil-picton` |
| Text | `--ink`, `--ink-2`, `--ink-3` |
| Surfaces and borders | `--surface`, `--panel`, `--rule`, `--rule-soft` |
| Actions and selection | `--machine`, `--machine-dark`, `--machine-tint`, `--action-ink` |
| Error / destructive | `--alert`, `--alert-tint` |
| Warning | `--warn`, `--warn-tint` |
| Success | `--success`, `--success-tint` |
| Information / waiting | `--info`, `--info-tint` |
| Neutral / inactive | `--neutral`, `--neutral-tint` |
| Status marks (dots, chart fills) | `--status-green`, `--status-yellow`, `--status-red`, `--status-blue`, `--status-gray` |
| Overlay | `--overlay` |

`--ok` is a legacy brand-action alias, not the success color. Use `--success` for new success states. Do not add local hardcoded hex colors or override global tokens inside a feature to obtain a different palette.

## 2. Workspace shell and branding

- Keep **Jabil | SolarEdge Equipment Management** on a single row at the **left edge of the top bar**, with the existing padding and a subtle vertical divider. Use that exact app name.
- Both `.app-brand` and `.app-brand-row` must remain left-aligned with `justify-content: flex-start`. The parent must not inherit centered alignment when its flex direction is changed.
- Do not center the brand group, put the app name below the logo, or repeat the brand as another banner inside a workspace page.
- Keep preferences, notifications and user actions on the right. The page's own title belongs in its content heading, not a second header row.
- Use the existing `AppShell`, `TopBar`, sidebar and logo components. A new workspace route must participate in the shared shell rather than create its own header/navigation.
- The sidebar remains Prussian with a Picton selected item and readable labels. Preserve expanded, collapsed and mobile navigation behavior.
- On narrow screens, keep the brand left-aligned; truncate the app name with its full title available rather than wrapping or pushing actions off screen. On a phone the header holds only menu · brand · notifications · account: **language and theme move into the account menu** (radio items for the language, one item for the theme) instead of a separate disclosure button.

### Sidebar navigation structure

The menu is defined in [APP_SHELL.md](APP_SHELL.md).

- The sidebar has **one flat level** with six items in this order: Dashboard (`/`), Equipment (`/equipment`), Calibration (`/calibration`), Golden (`/golden`), then a divider, then Configuration (`/configuration/…`) and User Management (`/users`). There is no second sidebar tier and no Administration group.
- Configuration and User Management are shown only to Admin. User and Readonly see the first four items and no divider. The server layouts enforce the same rules, and an unauthorized route redirects to the Dashboard.
- Menu items carry no count badges. The sidebar holds only the items and the divider: no caption above them and no status/footer line below (a static dot reads as a live status that it is not).
- A detail route (for example `/equipment/{id}`) marks its parent item as current.
- Configuration picks its lists from an in-page grouped sub-list: DỮ LIỆU GỐC, HIỆU CHUẨN and HỆ THỐNG (Error log). Each group header is a disclosure button with `aria-expanded`. The group holding the current page is always open. On phones the sub-list becomes a grouped select at the top of the page.
- Sidebar grids use `minmax(0, 1fr)` columns, so a long label (often Vietnamese) truncates with an ellipsis instead of widening every link past the sidebar edge. Its `title` shows the full name.

### Current compact dimensions

These are the baseline for shared workspace UI. Reuse the existing classes; do not duplicate the values across feature stylesheets.

| Element | Desktop baseline | Responsive behavior |
| --- | --- | --- |
| Header | 52px high | 56px at 800px and below |
| Sidebar | 216px expanded / 64px rail | Overlay at 800px and below; width limited to viewport |
| Content padding | 16px | 12px at 800px and below |
| Page heading | 23px, weight 600 | 21px on mobile |
| Body type | 14px | Keep readable; do not shrink the entire UI |
| Table cells | 13px type; 9px vertical / 12px horizontal padding | 12px vertical padding on mobile |
| Table headings | 11px; 10px vertical / 12px horizontal padding | Preserve column readability |
| Shared buttons | 34px standard / 30px small minimum height | 44px minimum height on mobile (48px for the Detail Panel bottom bar) |
| Form controls | 14px / 13px type | **16px and 44px high on phones** — below 16px iOS zooms the page when a field is focused |
| Toolbar | 10px vertical / 12px horizontal padding | Wrap controls into usable rows |
| Dialog body | 16px padding | Scroll without clipping required fields/actions |

Compact means removing duplication, excess margins and unnecessary containers. It does not mean hiding important labels, making touch targets difficult, or removing helpful error messages. Do not add oversized hero headings, large empty banners, decorative heading rows, or cards nested inside cards without a functional reason.

## 3. Login design to preserve

Login is intentionally different from the authenticated shell; do not add the workspace header to it.

- One full-page background photo, [`login-signup-background.webp`](../public/login-signup/login-signup-background.webp), anchored top-left over the light blue page background. It is the only image on the page.
- Desktop: the product title on the left — "Equipment / Management" (second line blue), the workcell name, a short cyan accent bar and four capability icons — on a soft white glow so it stays readable over the photo; the form on the right in a white card with rounded corners and a light shadow (440px wide, 460px from 1600px).
- At 1100px and below everything stacks: a 440px photo band at the top, then the centred title, then the form card. The page scrolls on short screens.
- The same card holds sign-in, the account request (sign-up) form and its success message. `/change-password` reuses these form styles in a single column.
- Keep text and inputs clear of busy photographic content.
- Preserve IBM Plex Sans typography, 49px inputs and sign-in button, the password visibility control, the "Forgot your password?" help, the disabled SSO button ("Coming soon"), the account-request flow and the language/theme controls under the card.
- Autofill must use the normal input surface and readable text. Keep visible focus and semantic red errors in both themes.
- Preserve actual authentication and redirect behavior. A visual change must not modify access checks, credentials, session handling or API contracts.

## 4. Feature components and interaction

Reuse shared controls from [`components/ui/index.tsx`](../components/ui/index.tsx): `Button`, `Notice`, `Modal`, loading controls (`Spinner`, `Skeleton`, `TableSkeleton`, `LoadingOverlay`), `EmptyState`, `ErrorState` and the existing toast system. Turn API errors into user text with `errorMessage()` (`lib/client/api.ts`) and load data with `useFetch()` (`lib/client/useFetch.ts`) — never show raw error messages. Check the actual exported props before use. Extend a shared component for a reusable requirement rather than copy it into a feature with different styling.

Every module page uses the same list and detail components ([DETAIL_MODEL.md](DETAIL_MODEL.md)). A module only declares its columns, field groups, tabs and actions:

- `ModuleWorkspace` lays out the page. It renders the `Masterlist` (search, filters, sorting, column settings, Excel export, + Add) and the Detail Panel beside it. It also handles the `?id=` and `?new=1` URLs, ‹ › navigation in the current list order, and the ↑ ↓ / J K keys.
- `RecordDetail` shows a record and handles view, edit, create, action screens and delete in one panel. Delete and "unsaved changes" are confirmed in the panel footer, never in a second dialog.
- `RecordPage` shows the same detail as a full page, for the ⤢ button and QR links.

Do not build a per-feature modal or table for a record type. `Modal` stays only for global dialogs such as account settings.

Use the existing `lucide-react` icon style and established sizing. Decorative icons must not be announced as content; icon-only actions need an accessible name. Keep primary, quiet and destructive button variants consistent. Red destructive actions retain the existing confirmation behavior and warning treatment.

### Lists, tables and dashboards

- Module lists use `Masterlist` (`.ml-*` in [`app/workspace.css`](../app/workspace.css)). Other tables reuse `.page-heading` and `.grid-table`.
- Keep search, filters, counts and actions compact and clearly grouped. Preserve sorting, filtering, pagination and permission-based actions.
- **Phones do not squeeze the table.** The Masterlist becomes a list of cards (serial + status, then location / part number / type; Calibration adds the coloured due date). The toolbar is search + Filter & sort (a bottom sheet) + a ⋮ menu (Export, Import); a floating + adds a record. Details: [DETAIL_MODEL.md](DETAIL_MODEL.md) §3.11.
- Tables use subtle dividers, restrained alternating row tint, and readable hover/focus states (a keyboard-focused row gets a Picton outline, not just the hover tint). Wide tables scroll inside their panel; they must not widen the whole page or silently lose columns.
- **Column order is a scanning order**: Status first (documented), then what it is (serial, part number), where it is (location), then secondary columns. With the Detail Panel open only the first few columns are visible, so they must identify the record. Wrapping columns (Remark, Description…) show at most two lines (`.ml-clamp`); the full text is in the cell tooltip and the Detail Panel.
- **The toolbar adapts to the list, not the window**: when the list is narrow (a Detail Panel beside it, below ~800px) Columns, Export and module tools such as Import keep their icon and name (`aria-label`, tooltip) and drop the text (`ToolbarButton`, a container query on `.ws-list`). Filters and + Add always keep their text. Do not hide a toolbar action on desktop to save space.
- Title and record count share one line on list pages. A list with no records offers the + Add action; a list that filters hide offers Clear filters.
- Let the equipment table use the available workspace height. Do not add arbitrary minimum heights that push content beyond the viewport.
- Dashboard cards use compact spacing, small corner icons, tabular values, restrained Picton charts and semantic highlights. Do not invent metrics or status data to decorate a screen.
- The Dashboard **Status overview** shows Equipment, Calibration and Golden side by side (one column each, stacked on phones). Each has a stacked bar in status colors (2px gaps, ordered by the status sort order, not by count) and a legend with dot, name, count and percent, which works as the table view. Overdue and Due soon KPIs tint their icon red / amber only when the count is above zero.
- Recent activity must not grow the page with every log. Cap its list at `min(360px, 50svh)` and scroll within it, keeping the card heading outside the scroll area. Keep every returned log accessible, allow long notes to wrap, and support keyboard scrolling with a named focusable list. Short/empty lists should stay compact.
- Include appropriate loading, empty, error and success states for new data flows using shared patterns.

### Status and feedback

| Existing status meaning | Visual treatment |
| --- | --- |
| Active / valid / successful | Green success tokens |
| Overdue / not calibrated / failed / error | Red alert tokens |
| Due soon / repair / needs attention | Amber warning tokens |
| Waiting / registration / informational | Blue info tokens |
| Inactive / disabled / neutral | Neutral tokens |
| Selection / navigation | Brand tokens |

Calibration due dates (`DueDate`) and account statuses (`AccountStatusTag`) use the semantic tokens above.

### Status colors

Admins create statuses in Configuration › Status and must pick one of **five system colors** for each (`statuses.color`, see [DATABASE_MODIFIED.md](DATABASE_MODIFIED.md)). Red, green and yellow are required by the business; blue and gray complete the set. The meanings follow ISA-101 (green = running, yellow = caution, red = alarm, blue = manual/waiting, gray = stopped) and common design systems (Carbon, Atlassian, Primer).

| `color` | Meaning | Example | Text / tint (light) | Mark light | Mark dark |
| --- | --- | --- | --- | --- | --- |
| `green` | Normal, passed, running | Active, Pass | `--success` / `--success-tint` | `#3DA535` | `#65C281` |
| `yellow` | Needs attention, in progress | Repair | `--warn` / `--warn-tint` | `#EFC23A` | `#F6CE22` |
| `red` | Failed, act now | Fail | `--alert` / `--alert-tint` | `#C8202D` | `#E93F2D` |
| `blue` | Waiting, informational | Wait Registration | `--info` / `--info-tint` | `#2A72D8` | `#447BE4` |
| `gray` | Inactive, neutral | Inactive | `--neutral` / `--neutral-tint` | `#98A3AD` | `#7A858F` |

- The database stores only the color name. The hex values live in `globals.css` (`--status-*` for marks), so retuning a shade changes every status that uses it. Never let admins enter free hex codes.
- The five marks were validated with the dataviz palette checker against the real surfaces (white, and the dark panel `#0D3652`): every pair stays apart under red-green color blindness (OKLab ΔE ≥ 8.8 light / 11.9 dark) and for normal vision (ΔE ≥ 15). Yellow and gray marks are below 3:1 on white by design, so a status mark is always accompanied by its text label.
- Text always uses the text tokens of the table (contrast ≥ 4.5:1 on its tint), never the mark color.
- `StatusTag name color` renders the colored tag. Put `data-status-color` on an element to get `--sc-mark`, `--sc-ink` and `--sc-tint` for custom marks (for example `.status-dot`, Dashboard segments).
- A missing status (`null`) uses the plain rule color, not gray, so "not set" never looks like Inactive.
- Status colors are reserved for statuses. Nominal breakdowns such as location or type use the single Picton bar color.

Keep visible status text on desktop and mobile. Supplement color with text, icons or existing border patterns; never show only a colored dot. Preserve existing status meanings and translations. Error copy should state the problem and a useful next step without exposing internal secrets.

### Forms, dialogs and menus

- Record forms are the Detail Panel itself: fields switch to inputs in place. Labels stay above values, required fields carry a red `*`, and errors appear under the field. Other forms reuse the existing input, validation and modal patterns.
- Dialog headers/close controls remain accessible while long bodies scroll. Stack fields on narrow screens and keep actions reachable, including the mobile safe area.
- On phones, pickers and filters are **bottom sheets** (`Modal` with `sheet`; `SearchableSelect` uses it too) and action menus open from the bottom with 48px rows. Escape closes only the newest dialog. Primary actions of a record sit in the Detail Panel's bottom bar, in thumb reach.
- Toasts appear below the header; the stack is portaled to `<body>`, so it must not depend on CSS variables defined on `.app-shell` (use a fallback). Error toasts use `role="alert"`; the others `role="status"`.
- A dialog closes on a backdrop click only when the press also started on the backdrop: selecting text in a field and releasing outside the dialog must not throw the form away. Forms outside the Detail Panel (Account settings) reuse its field styling (`ActionField` with `htmlFor`), not their own inputs.
- Action buttons say what they do: **Save** persists a record form, **Delete** removes, and a workflow screen names its verb (**Swap**, **Change location**, **Attach**, **Approve**…). Use the generic **Confirm** only when nothing more specific fits. One async operation shows one loading indicator.
- Preserve keyboard navigation, focus trapping/restoration and Escape handling. Dropdowns/popovers stay inside the viewport and use the established layering tokens.
- Keep disabled and loading states meaningful; prevent duplicate submissions through the existing behavior.
- Use subtle borders and existing radii/shadows rather than a new visual style for each dialog.

## 5. Responsive, themes and localization

Every new screen must support both light and dark themes and English/Vietnamese. Put new user-facing strings in both [`en.json`](../src/i18n/locales/en.json) and [`vi.json`](../src/i18n/locales/vi.json); reuse existing translation keys when appropriate. The fixed product brand name is not translated.

Check long Vietnamese text, long equipment identifiers, validation messages and empty results. Use wrapping/truncation deliberately; preserve access to essential information. Do not hide functionality solely to make a screenshot look compact.

Keep visible keyboard focus, semantic labels and readable contrast. Respect reduced-motion preferences for new animation. Printed equipment labels remain dark Prussian text/QR modules on white regardless of screen theme.

## 6. Implementation map and CSS rules

| Source | Responsibility |
| --- | --- |
| [`app/globals.css`](../app/globals.css) | Base typography, palette/semantic tokens, shared layout and behavior styles |
| [`app/brand.css`](../app/brand.css) | Current workspace branding, compact dimensions, component styling and responsive overrides |
| [`app/layout.tsx`](../app/layout.tsx) | Font loading and global CSS import order: globals before brand |
| [`components/AppShell.tsx`](../components/AppShell.tsx) | Shared authenticated workspace |
| [`components/TopBar.tsx`](../components/TopBar.tsx) | Left-aligned brand row and right-side controls |
| [`components/layout/AppSidebar.tsx`](../components/layout/AppSidebar.tsx) | Six-item menu, collapsed/mobile sidebar |
| [`lib/client/usePhone.ts`](../lib/client/usePhone.ts) | The one `(max-width: 800px)` check for JS — keep equal to the CSS media queries |
| [`components/ui/ActionMenu.tsx`](../components/ui/ActionMenu.tsx) | `Actions ▾` / ⋮ menu (dropdown; bottom sheet on phones) |
| [`lib/permissions/index.ts`](../lib/permissions/index.ts), [`components/ViewerContext.tsx`](../components/ViewerContext.tsx) | Role groups (Admin / User / Readonly) and which buttons a viewer sees |
| [`app/workspace.css`](../app/workspace.css) | Masterlist, Detail Panel, history, equipment tree, Configuration sub-list, Dashboard |
| [`components/ui/masterlist/`](../components/ui/masterlist) | `Masterlist`, `ColumnSettings`, `ToolbarButton`, Excel export |
| [`components/ui/detail/`](../components/ui/detail) | `DetailPanel`, `RecordDetail`, `ActionScreen`, `DetailHistory` |
| [`components/ui/workspace/`](../components/ui/workspace) | `ModuleWorkspace` (list + panel page), `RecordPage` (full-page detail) |
| [`components/ui/tags.tsx`](../components/ui/tags.tsx) | `StatusTag`, `DueDate`, `AccountStatusTag` |
| [`components/configuration/ConfigNav.tsx`](../components/configuration/ConfigNav.tsx) | Grouped Configuration sub-list; becomes a select on phones |
| [`components/JabilLogo.tsx`](../components/JabilLogo.tsx) | Reusable Jabil brand asset |
| [`components/ui/index.tsx`](../components/ui/index.tsx) | Shared controls and feedback |
| [`components/Preferences.tsx`](../components/Preferences.tsx) | Theme/language controls |
| [`app/login/page.tsx`](../app/login/page.tsx), [`app/login/login.css`](../app/login/login.css) | Authentication composition and scoped styles |

Before editing, inspect both the base rule and its overrides/media queries. Change the owning rule rather than continually appending conflicting fixes. Keep feature selectors scoped, avoid broad overrides of all buttons/inputs/headings, and do not use inline colors/font styles to bypass the system. Preserve global CSS import order.

## 7. Checklist for developers and AI assistants

Before implementing a feature:

- Read this document and inspect the nearest existing screen/component for the same task.
- Reuse the shared shell, tokens, components and localization structure.
- Identify the smallest UI addition that satisfies the feature without consuming unnecessary workspace.

Before delivering:

- Confirm the Jabil/app-name group is still on one line at the left, with actions on the right.
- Confirm the font, three primary brand colors and semantic feedback match this document.
- Check light/dark themes, EN/VI, long content, loading, empty, error and disabled states affected by the change.
- Inspect desktop (for example 1440x900), laptop (1366x768) and phone (390x844, and 320x568 for the smallest), plus affected breakpoints. Ensure no page overflow, clipped actions or photo/form overlap, and touch targets of at least 44px on phones.
- Check keyboard focus, dialog/menu navigation and touch usability for changed controls.
- For code changes, run `npm run typecheck`, `npm run lint` and relevant existing tests; add behavior tests when the new functionality warrants them. Documentation-only edits need link/content checks, not a full application test run.
- Perform browser visual verification when available. Report any unavailable checks honestly; passing lint/tests is not proof of visual correctness. Historical screenshots are not current verification evidence.
- Update this document if the requested feature intentionally changes the shared UI standard. Keep unrelated data, authentication and authorization behavior intact.

Suggested instruction for future feature requests:

> Implement the requested feature using the existing UI system. Read and follow `docs/JABIL_UI.md` first; reuse shared components and tokens, preserve the left-aligned Jabil/app-name header, compact workspace, IBM Plex Sans, semantic status colors, light/dark themes and EN/VI support. Do not redesign unrelated screens.
