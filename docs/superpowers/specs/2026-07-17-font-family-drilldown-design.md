# Font Family drill-down panel — design

## Summary

Inside the TEXT panel's existing FONT accordion (kept as-is, header text still "FONT"), replace the `<select>` with:

1. A **Font Family row** — a two-line settings row: top line "Font Family" (label caption), bottom line the current font's name at 16px (rendered in that font) + a right chevron.
2. Tapping the row opens a **Font Family drill-down view** that fills the TEXT panel: a header with a back arrow + "Font Family" title, and a list of all available fonts, each rendered in its own font.

This introduces a generic, reusable "settings row → drill-down view" pattern for any future setting that needs its own sub-view, not just Font Family.

## Revision history

Built and shipped once (Tasks 1-6, see git history on `font-family-drilldown`) as a single-line settings row + hover-free click-to-preview-then-Apply flow. Revised after seeing the live UI — the sections below now describe the CURRENT intended design directly; the original build's design is no longer described separately since it's superseded. The revision changed: the settings row to two stacked lines; the drill-down header's alignment; replaced the Apply-button/preview-then-commit flow with hover-to-preview + click-to-save; added a checkmark for the applied font, pinned to the top of the list; hover-only row background; and a divider between the FONT and MISC accordion content. See "Tasks (revision — this round)" below for the discrete implementation tasks.

## Components

Two generic, presentational `window.UI.*` components (one per file, per project convention):

- **`static/ui-settings-row.js`** — `UI.settingsRow(container, {label, value, valueFontFamily, onClick}) -> {setValue(value, valueFontFamily)}`. Renders a clickable two-line row: "Font Family" label on top, value (16px, styled in `valueFontFamily` if given) + right-chevron below. Calls `onClick()` on click.
- **`static/ui-sub-panel-header.js`** — `UI.subPanelHeader(container, {title, onBack})`. Renders a back-chevron button + title text; wires the back button to `onBack()`. Must visually align with `#style-panel-collapse-toggle` (see below).

Neither component owns app state — callers (editor.js) own data and behavior, matching the existing `UI.accordion`/`UI.buttonGroup` pattern.

## Markup changes (`static/index.html`)

- Keep the `#text-font-header` / `#text-font-body` accordion exactly as-is (header text stays "FONT", still wired via `UI.accordion`, collapsed by default). Only its body's contents change.
- Inside `#text-font-body`, remove the `<select id="text-font">` and replace it with `<div id="text-font-row"></div>`, populated via `UI.settingsRow` (label "Font Family").
- Add a divider element between the FONT accordion (`#text-font-header`/`#text-font-body`) and the MISC accordion header (`#text-misc-header`), reusing the existing `.style-divider` class already used elsewhere in the TEXT panel.
- Wrap `#panel-text`'s existing contents (heading textarea, FONT accordion, divider, MISC accordion, etc.) in a new `#panel-text-main` div — this is the "parent" view.
- Add a sibling `#panel-text-font` div (hidden by default) — the "Font Family" view — containing:
  - A header slot wired via `UI.subPanelHeader`.
  - `<ul id="text-font-list" class="font-list"></ul>` populated at render time.

`#panel-text-main` and `#panel-text-font` are mutually exclusive (only one visible at a time), toggled via their `hidden` attribute — same shape as the existing `.context-panel` sections in `#style-panel`.

The drill-down header (back arrow + title, inside `#panel-text-font`) must visually align in the same row as `#style-panel-collapse-toggle` — the whole-panel collapse icon button, absolutely positioned `top:12px; right:12px` inside `#style-panel` (`static/css/components/style-panel.css:15-19`, `static/index.html:115-118`). Currently `.sub-panel-header` sits in normal flow starting at `#style-panel`'s `padding-top: 18px` with its own `height: 40px`, which doesn't line up with the toggle. Fix via `.sub-panel-header`'s CSS (position/height/margin); tune visually in the browser rather than guessing exact pixels blind.

## State & interaction flow (`editor.js`)

- `AVAILABLE_FONTS = ["Public Sans", "JetBrains Mono"]` — the single source of truth for selectable fonts.
- **Rendering the list**: the currently-applied font (`preset.font`) is rendered first, followed by the rest of `AVAILABLE_FONTS` in their existing order (skipping the already-rendered applied font). The applied font's row shows a checkmark icon on the right; no other row shows anything extra there.
- **Opening the view** (`Font Family` row clicked): render the font list (ordered as above), swap to `#panel-text-font`. No preview state is seeded — nothing is "active" until the user interacts.
- **Hovering a font row** (`mouseenter`): live-previews that font on the canvas by calling `Preview.renderText` with a shallow-cloned presets map (`{ ...project.text_presets, [preset.id]: { ...preset, font: fontName } }`) — the real `project.text_presets` is untouched. On `mouseleave`, reverts the canvas to the real saved preset via the normal `renderTextPreview()` call.
- **Clicking a font row**: persists `preset.font = fontName` immediately, saves the project, re-renders the list (new checkmark position/order), and navigates back to `#panel-text-main` (whose Font Family row now shows the new font). No separate Apply step and no "back without saving" case to guard against, since nothing is applied until the click itself.
- **Back button** (in the sub-panel header): simply swaps back to `#panel-text-main` — since hovering never persists anything, there's nothing to discard.
- **Discarding a stale drill-down view**: `renderTextPanel()` — already called on every TEXT-panel open / selection change — resets to `#panel-text-main` at its top, so navigating away and back to TEXT never leaves the drill-down stuck open.

## Styling

Two CSS files, following the existing one-file-per-component convention:

- **`static/css/components/settings-row.css`** — `.settings-row` (two-line stacked layout: label row, then a value+chevron row, ~48-56px tall total, cursor: pointer, hover state), `.settings-row-label` (small-caps style matching `.style-group-label`), `.settings-row-value` (16px, styled per-instance via inline `font-family`), `.settings-row-value-group` (flex, gap, chevron icon).
- **`static/css/components/sub-panel.css`** — `.sub-panel-header` (flex row: back button + title, aligned with `#style-panel-collapse-toggle` per above), `.font-list` (reset `<ul>`), `.font-list-row` (flex row, padding, transparent background at rest, lighter-grey background on `:hover` only, using theme tokens — not a hardcoded color, must read correctly in both dark/light themes), `.font-list-row-name` (16px, per-row inline `font-family`), `.font-list-checkmark` (small check icon, shown only on the currently-applied font's row).

## Out of scope

- No changes to how fonts are vendored/added (still the 2 existing woff2 families).
- No multi-level back-stack — this is strictly parent (`TEXT`) ↔ child (`Font Family`), matching the only current use case. A future consumer of `UI.settingsRow`/`UI.subPanelHeader` with deeper nesting is not designed here.
- No changes to `ass_render.py`/export — this is purely an editor UI change to how the font is *selected*, not how it's applied to the rendered output.

## Tasks (original build — shipped)

- [x] 1. Add `UI.settingsRow` (`static/ui-settings-row.js`) + `settings-row.css`
- [x] 2. Add `UI.subPanelHeader` (`static/ui-sub-panel-header.js`) + `sub-panel.css`
- [x] 3. Restructure `#panel-text` markup in `index.html`: `#panel-text-main` wrapper, new `#panel-text-font` view, keep the FONT accordion, replace its `<select>` with a `#text-font-row` mount point
- [x] 4. Wire `editor.js`: `AVAILABLE_FONTS`, `fontPreviewValue` state, render/open/apply/back logic, reset-on-`renderTextPanel` discard behavior
- [x] 5. Manual verification in browser: row shows current font styled correctly, opening/closing/back/apply/preview-discard all behave as designed, MISC accordion and rest of TEXT panel unaffected
- [x] 6. Run `superpowers:finishing-a-development-branch` to integrate the work

## Tasks (revision — this round)

- [x] 7. Rework the Font Family settings row into two stacked lines (label above, value+chevron below) — `UI.settingsRow` markup/CSS
- [ ] 8. Align the drill-down header (back arrow + title) into the same row as `#style-panel-collapse-toggle`
- [ ] 9. Rework font list rows: remove Apply-button/live-preview-then-commit logic; hover previews live on canvas, click saves immediately and navigates back
- [ ] 10. Add checkmark icon on the currently-applied font's row; pin that row to the top of the list
- [ ] 11. Font list row background: transparent at rest, lighter grey on hover only
- [x] 12. Add a divider between the FONT accordion's content and the MISC accordion
- [ ] 13. Manual verification in browser: two-line row, header alignment, hover-preview + click-to-save, checkmark + pinned-to-top, hover-only background, divider — all behave as designed; MISC accordion and rest of TEXT panel unaffected
- [ ] 14. Run `superpowers:finishing-a-development-branch` to integrate the work
