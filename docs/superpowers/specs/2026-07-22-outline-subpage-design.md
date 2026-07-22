# Outline settings moved into a subpage

## Problem

TEXT and CAPTIONS panels each show Outline color + Outline width as two separate inline fields in the Design tab. Font Family and Weight instead use a single settings row (label + value + chevron) that opens a drill-down subpanel. Outline should follow the same pattern for consistency, and the row's value should preview the outline itself: a small color square followed by the width in px (e.g. "1px").

## Design

### UI.settingsRow swatch support

`static/ui-settings-row.js` gains an optional `swatchColor` param: when present, renders a small `.settings-row-swatch` square (background-color = swatchColor) immediately before the value text inside `.settings-row-value-group`. The returned updater becomes `setValue(value, valueFontFamily, swatchColor)`, updating the swatch's background too. New `.settings-row-swatch` rule added to `static/css/components/settings-row.css` (small square, fixed size, rounded corner, 1px border using existing tokens — same visual language as `.color-swatch`).

### TEXT panel

- New `static/text-panel-outline.js`, structured exactly like `static/text-panel-font-weight.js`: a module-local `openOutlinePanel`/`closeOutlinePanel` pair toggling `#panel-text-main` vs `#panel-text-outline`, a `UI.subPanelHeader` back header, and `window.TextPanel.renderOutline()` which renders the settings row via `UI.settingsRow(..., { label: "Outline", value: `${preset.outline_px}px`, swatchColor: preset.outline_color, onClick: openOutlinePanel })`.
- The subpanel body (`#panel-text-outline`) contains the actual controls — the existing color-swatch (`text-outline-color-field`) and width number field (`text-outline-px-field`), unchanged in behavior including the FormatRun-aware `upsertFormatRun` logic, just moved out of `text-panel-font-style.js` into the new file.
- `text-panel-font-style.js` loses its Outline color/width block entirely (keeps Size/Italic/Underline/Color).
- `index.html`: in `#text-font-body`, replace the two outline `<label>` fields with one `<div id="text-outline-row" class="col-8"></div>` positioned where the outline fields used to sit (after Color). Add `#panel-text-outline` (containing `#text-outline-subpanel-header`, then the two moved fields) as a sibling of `#panel-text-font`/`#panel-text-weight`.
- `panel-text.js`: call `TextPanel.renderOutline()` at each place `renderFontStyle()`/`renderFontWeight()`/`renderFontFamily()` are currently called together.

### CAPTIONS panel

Same treatment, mirrored:
- New `static/caption-panel-outline.js` mirroring `caption-panel-font-weight.js`, exposing `window.CaptionPanel.renderOutline()`, targeting the caption track's preset via `ensureCaptionTrack()`/`ensureCaptionPreset()`.
- `caption-panel-font-style.js` loses its outline block.
- `index.html`: same row/subpanel restructuring under `#caption-font-body`, new `#panel-captions-outline` subpanel alongside `#panel-captions-font`/`#panel-captions-weight`.
- `panel-captions.js` wires the new render call alongside the existing font-style/weight/family calls.

### Script load order

Both new files reach into existing globals the same way their sibling `*-font-weight.js` files do (no bundler) — added to `index.html`'s script list immediately after their respective `-font-weight.js`/`-font-style.js` files.

## Out of scope

- No change to the underlying `TextPreset.outline_color`/`outline_px` data model.
- No change to caption/text FormatRun semantics.
- No automated test coverage — this repo has no JS test suite; verified manually via the dev server (both panels, base preset path and FormatRun-selection path).

## Codebase map update

`CLAUDE.md`'s file structure/inventory sections get the two new files added and the four touched files' descriptions updated to reflect the extraction, in the same commit as the code change.
