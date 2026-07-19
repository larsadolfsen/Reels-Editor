# Right panel 8-column grid — design

Redesign `#style-panel`'s content layout onto a fixed 8-column grid, so every control in the FILES/VIDEO/TEXT/CAPTIONS/SETTINGS/EXPORT sections aligns to consistent column boundaries instead of today's ad-hoc flex rows.

## Goals

- Every row of controls in the right panel sits on the same 8-column grid: 28px columns, 8px gaps.
- Every control's width is a whole number of grid columns (1–8) — no `flex: 1`, no percentage widths, no arbitrary pixel widths.
- Full-width controls (e.g. the Font Family settings row) span all 8 columns.
- Panel width stays 320px.

## Grid mechanics

- `#style-panel`'s padding changes from `18px 16px` to `18px 20px` (left/right only) — `320 − 20×2 = 280px` of content width, which is exactly `8×28 + 7×8 = 280px`. This is the only panel-chrome change; panel width itself is unchanged.
- Each row container (`.style-row`, and single-control `.style-group` wrappers) becomes its own `display: grid; grid-template-columns: repeat(8, 28px); gap: 8px;` — not one grid spanning the whole panel. Rows still stack vertically top-to-bottom exactly as they do today; only the layout *within* a row changes from flex to grid.
- Every direct child of a row gets an explicit `grid-column: span N`, N a whole number 1–8.

## Column-span rules by control shape

| Control shape | Span rule | Examples |
|---|---|---|
| Full-width control (settings row, single number field, button, list row) | span 8 | Font Family row, Outline WIDTH field, Save-current-style button, FILES media rows, STYLES list rows, SETTINGS theme-toggle row, EXPORT button, CAPTIONS placeholder box |
| 2-up field row | span 4 + span 4 | BOX WIDTH (PX)/HEIGHT (PX), OFFSET H/V, TIME START/END, VIDEO TRIM in/out |
| Icon-square button (28px = 1 col) | span 1 each, row left-aligned — does not need to fill all 8 columns | FONT Bold/Italic/Underline, TEXT ALIGN icons, font-size step-down/step-up, CAPTIONS placeholder B/I/U/align icons, VIDEO ORDER move-up/move-down |
| Color swatch + text label | swatch span 1, label span 7 | FONT Color, FONT Outline color |
| Swatch-only (no label) + adjacent field | swatch span 1, field span 7 | BOX Background swatch + Opacity field |
| 3-field row: 2 number fields + label-less swatch | span 4 + span 3 + span 1 | BOX BORDER (PX) / RADIUS (PX) / Border Color — first number field gets the extra column |
| Full-width 2-way button group | span 4 + span 4 | BOX SIZE mode (FIT/FREE) |
| Full-width 3-way text-label button group | span 3 + span 2 + span 3 | BOX POSITION row-group (TOP/MID/BTM), POSITION col-group (LEFT/MID/RIGHT) |

Accordion headers (FONT/STYLES/BOX/TIME clickable bars) and section labels (SIZE, BORDER, TEXT ALIGN, POSITION) are not "controls" under this system — they stay full-width block text, not subject to column spans.

Dividers (`UI.divider`) stay full-width (span 8) horizontal rules.

## Implementation notes

- `.style-row` changes from `display: flex; gap: var(--space-2)` to `display: grid; grid-template-columns: repeat(8, 28px); gap: 8px;`. `.style-field`'s `flex: 1` rule is removed since widths become explicit.
- Column spans are applied as CSS utility classes (`.col-1` … `.col-8`, each just `grid-column: span N`), not inline styles — keeps the span visible in markup/component calls without repeating `grid-column: span N` strings everywhere.
- Shared components need a new option to set their own span, since they currently size themselves via flex:
  - `UI.numberField` — new `span` option (default 8 if omitted).
  - `UI.colorSwatch` — new `span` option controlling the label's span; the swatch itself is always span 1 (its 28px width already matches one column exactly, per the earlier icon-btn-size fix).
  - `UI.buttonGroup` — new per-button `span` (or `spans: [n, n, n]`) option, since existing groups fill their row evenly via `grid-auto-columns: 1fr` today and need to switch to explicit per-button spans instead.
  - `UI.settingsRow` — always span 8 (it's always a full-width row), no new option needed.
- Every call site across `static/editor.js` and the five `static/text-panel-*.js` files that renders into a `.style-row` needs its span assigned per the table above — this is the bulk of the implementation work, not the CSS mechanics themselves.
- No model or backend changes. Confined to `static/css/components/style-panel.css`, `static/css/components/button-group.css`/`number-field.css`/`color-swatch.css`, `static/ui-*.js`, and the panel markup/wiring in `static/index.html` + `static/editor.js` + `static/text-panel-*.js`.

## Risk / testing

Cross-cutting change touching nearly every control in the panel — higher regression risk than a typical polish item. Should land as its own plan (not folded into an unrelated task), with a visual pass afterward comparing every accordion/panel section (FILES/VIDEO/TEXT's five accordions/CAPTIONS/SETTINGS/EXPORT) against current screenshots to confirm nothing silently reflowed or clipped.

## Task list

- [ ] `.style-row` → CSS Grid (`repeat(8, 28px)`, 8px gap); add `.col-1`…`.col-8` utility classes; remove `.style-field`'s `flex: 1`
- [ ] `#style-panel` padding: `18px 16px` → `18px 20px`
- [ ] Add `span` option to `UI.numberField`, `UI.colorSwatch`, `UI.buttonGroup` (per-button spans)
- [ ] Apply column spans across every row in FONT/BOX/TIME/STYLES accordions (`static/editor.js`, `static/text-panel-*.js`)
- [ ] Apply column spans across VIDEO, FILES, CAPTIONS, SETTINGS, EXPORT panels (`static/editor.js`)
- [ ] Visual verification pass: every panel/accordion compared against current screenshots, confirm no clipping/reflow regressions
