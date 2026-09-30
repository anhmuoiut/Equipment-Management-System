# UI requirements: SolarEdge Equipment Management

Updated: 30 September 2026. Status: accepted design baseline.

## Read this before changing UI

This is the authoritative UI requirements document for new features and changes throughout this project: login, workspace, dashboard, equipment, administration, dialogs, notifications and printable labels. Developers and AI coding assistants must read it before changing UI.

The guiding principle is **compact, clear, consistent**. Preserve working space for equipment data and everyday tasks. Extend the existing design system rather than introducing a different visual language for each feature.

Explicit new user instructions take precedence. Otherwise, follow this document for visual decisions and the feature specifications for business behavior. If a deliberate design change is requested, update this document in the same change. Do not silently redesign unrelated screens.

[UI_LAYOUT.md](UI_LAYOUT.md) and screenshots in `docs/ui` are historical references, not the current visual acceptance target. [EQUIPMENT_DETAIL_MODAL.md](EQUIPMENT_DETAIL_MODAL.md) still describes detail-modal behavior; its visual treatment must follow this document.

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
| Overlay | `--overlay` |

`--ok` is a legacy brand-action alias, not the success color. Use `--success` for new success states. Do not add local hardcoded hex colors or override global tokens inside a feature to obtain a different palette.

## 2. Workspace shell and branding

- Keep **Jabil | SolarEdge Equipment Management** on a single row at the **left edge of the top bar**, with the existing padding and a subtle vertical divider. Use that exact app name.
- Both `.app-brand` and `.app-brand-row` must remain left-aligned with `justify-content: flex-start`. The parent must not inherit centered alignment when its flex direction is changed.
- Do not center the brand group, put the app name below the logo, or repeat the brand as another banner inside a workspace page.
- Keep preferences, notifications and user actions on the right. The page's own title belongs in its content heading, not a second header row.
- Use the existing `AppShell`, `TopBar`, sidebar and logo components. A new workspace route must participate in the shared shell rather than create its own header/navigation.
- The sidebar remains Prussian with a Picton selected item and readable labels. Preserve expanded, collapsed and mobile navigation behavior.
- On narrow screens, keep the brand left-aligned; truncate the app name with its full title available rather than wrapping or pushing actions off screen. Appearance controls use the existing mobile disclosure menu.

### Sidebar navigation structure

- **Workspace** is one flat level: Dashboard, Equipment masterlist, Archived equipment, Calibration, Golden master list. Archived equipment is a peer of the masterlist (same size and icon) and uses the same full-height list layout (`FULL_HEIGHT_LIST_PAGES` in `AppShell`). Calibration is shown only with `calibration.view`.
- A page that is reachable but not built yet shows a short badge beside its label (for example "Soon"); the link's accessible name includes it.
- **Administration** is one collapsible item — the WAI-ARIA disclosure pattern: a `button` with `aria-expanded`/`aria-controls`, never `role="menu"`. Its categories are the only second level: User management, Configuration (Master data, Calibration settings), Field management and System logs (Audit log, Error log). Grouping and order live in `ADMIN_CATEGORIES` (`lib/permissions`); names and icons in `components/admin/adminNavigation.ts`.
- Never add a third sidebar tier. A category with several pages links to its first page, and its pages switch with the page's own tab strip (`AdminNav`), shown at every width.
- The group opens when navigation arrives in the admin area and otherwise keeps the user's choice. If the current page is inside the closed group, the toggle carries the selection marker. On a category's other pages its link uses `aria-current="true"`, styled like the current page.
- List only what the account can open (`accessibleAdminCategories`); the server layouts enforce the same rules.
- In the icon rail, an open group gets a faint background band. Links in a closed group are `inert`, so they never take focus.
- Sidebar grids use `minmax(0, 1fr)` columns: a long (often Vietnamese) label truncates with an ellipsis and its `title` shows the full name, instead of widening every link past the sidebar edge.

### Current compact dimensions

These are the baseline for shared workspace UI. Reuse the existing classes; do not duplicate the values across feature stylesheets.

| Element | Desktop baseline | Responsive behavior |
| --- | --- | --- |
| Header | 52px high | 56px at 800px and below |
| Sidebar | 216px expanded / 68px rail | Overlay at 800px and below; width limited to viewport |
| Content padding | 16px | 12px at 800px and below |
| Page heading | 23px, weight 600 | 21px on mobile |
| Body type | 14px | Keep readable; do not shrink the entire UI |
| Table cells | 13px type; 9px vertical / 12px horizontal padding | 12px vertical padding on mobile |
| Table headings | 11px; 10px vertical / 12px horizontal padding | Preserve column readability |
| Shared buttons | 34px standard / 30px small minimum height | 44px minimum height on mobile |
| Toolbar | 10px vertical / 12px horizontal padding | Wrap controls into usable rows |
| Dialog body | 16px padding | Scroll without clipping required fields/actions |

Compact means removing duplication, excess margins and unnecessary containers. It does not mean hiding important labels, making touch targets difficult, or removing helpful error messages. Do not add oversized hero headings, large empty banners, decorative heading rows, or cards nested inside cards without a functional reason.

## 3. Login design to preserve

Login is intentionally different from the authenticated shell; do not add the workspace header to it.

- Use the existing landscape asset [`TEguy.png`](../public/Image/TEguy.png) and Solar icon. Display the photo at its native **3:2 ratio**, showing the technician and surrounding workcell equipment. Do not zoom/crop it back into a large portrait.
- Desktop has the photo on the left and a separate open form on the right. Keep the subtle technical grid, Picton corner accents and restrained shadow.
- At 900px and below, stack the full-ratio photo above the form. Keep the form readable and the page scrollable on short screens.
- Do not restore the removed bottom-left Jabil/text block, large empty navy panel, repeated slogans, hard diagonal overlays, or an opaque boxed card behind the form.
- Keep text and inputs clear of busy photographic content. Do not fade the photograph through the input area.
- Preserve the current IBM Plex Sans typography, product/icon identity, 50px inputs and sign-in button, password visibility control, help, account-request flow and language/theme controls.
- Autofill must use the normal input surface and readable text. Keep visible focus and semantic red errors in both themes.
- Preserve actual authentication and redirect behavior. A visual change must not modify access checks, credentials, session handling or API contracts.

## 4. Feature components and interaction

Reuse shared controls from [`components/ui/index.tsx`](../components/ui/index.tsx): `Button`, `Tag`, `Notice`, `Modal`, `ConfirmDialog`, loading/skeleton controls, `EmptyState`, `ErrorState` and the existing toast system. Check the actual exported props before use. Extend a shared component for a reusable requirement rather than copy it into a feature with different styling.

Use the existing `lucide-react` icon style and established sizing. Decorative icons must not be announced as content; icon-only actions need an accessible name. Keep primary, quiet and destructive button variants consistent. Red destructive actions retain the existing confirmation behavior and warning treatment.

### Lists, tables and dashboards

- Reuse `.page-heading`, `.equipment-panel`, `.list-toolbar` / `.equipment-toolbar` and `.grid-table` patterns where applicable.
- Keep search, filters, counts and actions compact and clearly grouped. Preserve sorting, filtering, pagination and permission-based actions.
- Tables use subtle dividers, restrained alternating row tint, and readable hover/focus states. Wide tables scroll inside their panel; they must not widen the whole page or silently lose columns.
- Let the equipment table use the available workspace height. Do not add arbitrary minimum heights that push content beyond the viewport.
- Dashboard cards use compact spacing, small corner icons, tabular values, restrained Picton charts and semantic highlights. Do not invent metrics or status data to decorate a screen.
- Recent activity must not grow the page with every log. Cap its list at `min(360px, 50svh)` and scroll within it, keeping the card heading outside the scroll area. Keep every returned log accessible, allow long notes to wrap, and support keyboard scrolling with a named focusable list. Short/empty lists should stay compact.
- Include appropriate loading, empty, error and success states for new data flows using shared patterns.

### Status and feedback

| Existing status meaning | Visual treatment |
| --- | --- |
| Active / valid / successful | Green success tokens |
| Inactive / overdue / not calibrated / error | Red alert tokens |
| Waiting / registration / due soon / repair | Amber warning tokens |
| Neutral information / selection | Brand tokens |

Keep visible status text on desktop and mobile. Supplement color with text, icons or existing border patterns; never show only a colored dot. Preserve existing status meanings and translations. Error copy should state the problem and a useful next step without exposing internal secrets.

### Forms, dialogs and menus

- Reuse existing input, validation and modal patterns. Use persistent labels, visible required markers and clear field-level feedback.
- Dialog headers/close controls remain accessible while long bodies scroll. Stack fields on narrow screens and keep actions reachable, including the mobile safe area.
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
| [`components/layout/AppSidebar.tsx`](../components/layout/AppSidebar.tsx) | Navigation and collapsed/mobile sidebar |
| [`components/admin/AdminNav.tsx`](../components/admin/AdminNav.tsx), [`lib/permissions/index.ts`](../lib/permissions/index.ts) | Tabs inside an Administration category; section/category grouping and access |
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
- Inspect desktop (for example 1440x900), laptop (1366x768) and phone (390x844), plus affected breakpoints. Ensure no page overflow, clipped actions or photo/form overlap.
- Check keyboard focus, dialog/menu navigation and touch usability for changed controls.
- For code changes, run `npm run typecheck`, `npm run lint` and relevant existing tests; add behavior tests when the new functionality warrants them. Documentation-only edits need link/content checks, not a full application test run.
- Perform browser visual verification when available. Report any unavailable checks honestly; passing lint/tests is not proof of visual correctness. Historical screenshots are not current verification evidence.
- Update this document if the requested feature intentionally changes the shared UI standard. Keep unrelated data, authentication and authorization behavior intact.

Suggested instruction for future feature requests:

> Implement the requested feature using the existing UI system. Read and follow `docs/JABIL_UI.md` first; reuse shared components and tokens, preserve the left-aligned Jabil/app-name header, compact workspace, IBM Plex Sans, semantic status colors, light/dark themes and EN/VI support. Do not redesign unrelated screens.
