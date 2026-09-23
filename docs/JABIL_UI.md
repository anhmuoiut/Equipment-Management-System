# Jabil interface system

Implemented 23 September 2026. This supersedes the color and typography guidance in the earlier UI layout review.

## Palette and typography

- Prussian Blue: `#002B49` for navigation, primary text and light-theme actions.
- White: `#FFFFFF` for content surfaces and text on Prussian Blue.
- Picton Blue: `#3CB4E5` for selected navigation, focus, charts and accents.
- All supporting shades, shadows and overlays are mixtures or transparent versions of these three colors. Photographs retain their original colors. Black alpha masks control transparency and do not paint black into the interface.
- IBM Plex Sans is used throughout, including controls, dialogs, tables and identifiers. Tabular numerals preserve alignment. The existing system sans-serif fallback remains available if web fonts cannot load.
- Picton Blue backgrounds use Prussian text, rather than white text, for contrast. The dark theme uses the same three colors and changes surface and action foreground tokens.

## Screen system

- Login retains the uncropped TE-guy photograph, clear form area, no header or form card, and its language/theme controls. Solar and Jabil artwork use the approved palette.
- Workspace uses a light header, Prussian navigation rail, Picton selected state, and clear page headings with a short Picton accent.
- Dashboard uses larger tabular KPI values, a Prussian lead tile, consistent section cards, Picton bars and visible warning border patterns.
- Equipment and administration share table typography, restrained row striping, search styling, filter chips and action controls.
- Equipment details, hierarchy, calibration, repair, account settings and administration dialogs share surface, border, spacing and control treatments.
- Status labels remain readable text. Active states have Picton borders, inactive/overdue states are filled, waiting states have dashed borders, and repair states have double borders. Mobile status labels remain visible instead of relying on color dots.
- Notices and warning tags include icons. Destructive buttons include a warning icon and dashed border; the existing confirmation behavior is unchanged.
- Printable labels use Prussian QR modules on white, with dark text on white in either screen theme.
- Existing routing, authentication, authorization, data mutations, filtering, focus handling and localization are unchanged.

## Files

- `app/globals.css`: palette and semantic tokens, base layout and typography.
- `app/brand.css`: workspace, shared controls and responsive visual system.
- `app/login/login.css`: photographic authentication composition.
- `components/ui/index.tsx`: shared button variants and semantic notice/tag icons.
- `app/layout.tsx`: global styles and IBM Plex Sans font loading.

## Validation

- TypeScript and lint passed.
- All 73 existing tests passed, including login, shared dropdowns, equipment forms and administration editing.
- CSS syntax and the locally served stylesheet bundle checked.
- No production data was changed.
- Automated browser visual review was unavailable in this session. Earlier screenshots in `docs/ui` show the previous design, not this update.
