# Font Family drill-down panel — design

## Summary

Inside the TEXT panel's existing FONT accordion (kept as-is, header text still "FONT"), replace the `<select>` with:

1. A **Font Family row** — a settings row showing label "Font Family" on the left and the current font's name on the right (rendered in that font), with a chevron pointing right.
2. Tapping the row opens a **Font Family drill-down view** that fills the TEXT panel: a header with a back arrow + "Font Family" title, and a list of all available fonts, each rendered in its own font.

This introduces a generic, reusable "settings row → drill-down view" pattern for any future setting that needs its own sub-view, not just Font Family.

## Components

Two new generic, presentational `window.UI.*` components (one per file, per project convention):

- **`static/ui-settings-row.js`** — `UI.settingsRow(container, {label, value, valueFontFamily, onClick}) -> {setValue(value, valueFontFamily)}`. Renders a clickable row: label left, value + right-chevron on the right. If `valueFontFamily` is given, the value text is styled in that font-family. Calls `onClick()` on click.
- **`static/ui-sub-panel-header.js`** — `UI.subPanelHeader(container, {title, onBack})`. Renders a back-chevron button + title text; wires the back button to `onBack()`.

Neither component owns app state — callers (editor.js) own data and behavior, matching the existing `UI.accordion`/`UI.buttonGroup` pattern.

## Markup changes (`static/index.html`)

- Keep the `#text-font-header` / `#text-font-body` accordion exactly as-is (header text stays "FONT", still wired via `UI.accordion`, collapsed by default). Only its body's contents change.
- Inside `#text-font-body`, remove the `<select id="text-font">` and replace it with `<div id="text-font-row"></div>`, populated via `UI.settingsRow` (label "Font Family").
- Wrap `#panel-text`'s existing contents (heading textarea, FONT accordion, MISC accordion, etc.) in a new `#panel-text-main` div — this is the "parent" view.
- Add a sibling `#panel-text-font` div (hidden by default) — the "Font Family" view — containing:
  - A header slot wired via `UI.subPanelHeader`.
  - `<ul id="text-font-list" class="font-list"></ul>` populated at render time.

`#panel-text-main` and `#panel-text-font` are mutually exclusive (only one visible at a time), toggled via their `hidden` attribute — same shape as the existing `.context-panel` sections in `#style-panel`.

## State & interaction flow (`editor.js`)

- `AVAILABLE_FONTS = ["Public Sans", "JetBrains Mono"]` — replaces the hardcoded `<select>` options as the single source of truth for selectable fonts.
- `fontPreviewValue` (module-level, `null` when not browsing) — the font currently being live-previewed in the drill-down view.
- **Opening the view** (`Font Family` row clicked): seed `fontPreviewValue` from the saved `preset.font`, render the font list, swap to `#panel-text-font`.
- **Tapping a font row**: sets `fontPreviewValue`, live-previews it on the canvas by calling `Preview.renderText` with a **shallow-cloned presets map** (`{ ...project.text_presets, [preset.id]: { ...preset, font: fontName } }`) so the real `project.text_presets` is untouched until Apply, then re-renders the list so the Apply button follows the previewed row and the active row is highlighted.
- **Apply button** (shown only on the currently-previewed row): persists `preset.font = fontName`, saves the project, clears `fontPreviewValue`, and swaps back to `#panel-text-main` (which now shows the updated Font Family row).
- **Back button** (in the sub-panel header): swaps back to `#panel-text-main` without persisting — the next `renderTextPanel()` call (see below) discards any unsaved preview.
- **Discarding an unsaved preview**: `renderTextPanel()` — already called on every TEXT-panel open / selection change — resets to `#panel-text-main` and clears `fontPreviewValue` at its top. This single choke point covers "back without apply" and "navigated away entirely (different clip/text selected, panel closed)" without extra event wiring.

## Styling

Two new CSS files, following the existing one-file-per-component convention:

- **`static/css/components/settings-row.css`** — `.settings-row` (flex row, ~40px tall, justify-content: space-between, cursor: pointer, hover state), `.settings-row-label` (small-caps style matching `.style-group-label`), `.settings-row-value` (14px, styled per-instance via inline `font-family`), `.settings-row-value-group` (flex, gap, chevron icon).
- **`static/css/components/sub-panel.css`** — `.sub-panel-header` (flex row: back button + title, matching `.style-panel-header` typography for the title), `.font-list` (reset `<ul>`), `.font-list-row` (flex row, padding, hover border, `.active` highlight via accent border/background), `.font-list-row-name` (16px, per-row inline `font-family`), `.font-list-apply-btn` (small button, accent-colored).

## Out of scope

- No changes to how fonts are vendored/added (still the 2 existing woff2 families).
- No multi-level back-stack — this is strictly parent (`TEXT`) ↔ child (`Font Family`), matching the only current use case. A future consumer of `UI.settingsRow`/`UI.subPanelHeader` with deeper nesting is not designed here.
- No changes to `ass_render.py`/export — this is purely an editor UI change to how the font is *selected*, not how it's applied to the rendered output.

## Tasks

- [ ] 1. Add `UI.settingsRow` (`static/ui-settings-row.js`) + `settings-row.css`
- [ ] 2. Add `UI.subPanelHeader` (`static/ui-sub-panel-header.js`) + `sub-panel.css`
- [ ] 3. Restructure `#panel-text` markup in `index.html`: `#panel-text-main` wrapper, new `#panel-text-font` view, keep the FONT accordion, replace its `<select>` with a `#text-font-row` mount point
- [ ] 4. Wire `editor.js`: `AVAILABLE_FONTS`, `fontPreviewValue` state, render/open/apply/back logic, reset-on-`renderTextPanel` discard behavior
- [ ] 5. Manual verification in browser: row shows current font styled correctly, opening/closing/back/apply/preview-discard all behave as designed, MISC accordion and rest of TEXT panel unaffected
- [ ] 6. Run `superpowers:finishing-a-development-branch` to integrate the work
