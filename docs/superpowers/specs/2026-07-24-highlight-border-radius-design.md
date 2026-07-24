# Highlight background + border-radius for TEXT and CAPTIONS

Date: 2026-07-24

## Problem

Text-block "marker" highlighting (a colored background box behind text) already exists end-to-end in the backend and data model (`TextPreset.highlight`/`highlight_color`, `FormatRun.highlight`/`highlight_color`, `app/ass_render.py`'s `_highlight_dialogues`, and `preview-text.js`'s per-span `backgroundColor`) but has **no UI control anywhere** — there is no way to turn it on today. Its corner radius is hardcoded to 4px in the ASS export (`HIGHLIGHT_RADIUS`) and not applied at all in the live CSS preview.

Captions have a highlight concept too, but it's a karaoke word-color swap (`current_word` / `progressive_fill`) — there's no background-box highlight for captions at all.

## Goal

1. Surface a whole-block highlight toggle (on/off, color, border-radius) in the TEXT panel's Design tab.
2. Add a third caption highlight mode, "Background", that draws a rounded box behind the currently-active word instead of recoloring it.
3. Make the highlight's corner radius a user-editable field, shared by both features (mirrors how `highlight_color` is already shared between TEXT and CAPTIONS via the same `TextPreset`).

## Data model changes

`app/models.py`, `TextPreset`:
- New field `highlight_border_radius: int = 4` — default matches today's hardcoded ASS constant, so existing highlighted text (if any project has `highlight=True` set directly in stored JSON) renders unchanged until edited.
- `highlight_mode` gains a third accepted value: `"background"` (existing: `"current_word"`, `"progressive_fill"`).

No changes to `FormatRun` — TEXT highlight UI is whole-block only (writes to the base preset), not per-selection. `FormatRun.highlight`/`highlight_color` remain in the model (already used by `_highlight_dialogues`/`preview-text.js` when runs are present) but get no new UI in this pass.

## TEXT blocks: highlight UI

New file `static/text-panel-highlight.js`, structurally identical to the existing `static/text-panel-shadow.js` (settings-row + drill-down subpanel pattern, same as Outline/Shadow):
- A settings row (swatch + "ON"/"OFF" value) in the Design tab, below the existing Shadow row.
- Clicking it opens a subpanel with:
  - An ON/OFF `UI.buttonGroup` writing `preset.highlight`.
  - A `UI.colorSwatch` writing `preset.highlight_color`.
  - A `UI.numberField` (0–40px, matching the existing `box_border_radius` field's range) writing `preset.highlight_border_radius`.
- All three fields hidden except the row itself when `preset.highlight` is off, exactly like the Shadow subpanel's `shadowFieldsHidden` pattern.

`static/index.html`:
- `#text-highlight-row` added to `#text-font-body`, after `#text-shadow-row`.
- `#panel-text-highlight` subpanel added after `#panel-text-shadow`, mirroring its structure (header, toggle group, color field, radius field).
- New `<script src="/static/text-panel-highlight.js">` tag alongside the other `text-panel-*.js` includes.

`static/panel-text.js`: `renderTextPanel()`'s orchestration calls `TextPanel.renderHighlight()` alongside the other Design-tab renderers.

## TEXT blocks: rendering changes

`app/ass_render.py`:
- Delete the `HIGHLIGHT_RADIUS = 4` module constant.
- `_highlight_dialogues` passes `p.highlight_border_radius` to `_rounded_rect_path` instead of the deleted constant.

`static/preview-text.js`:
- In the per-run rendering loop (where `span.style.backgroundColor` is already set from `highlighted`), add `span.style.borderRadius = highlighted ? (preset.highlight_border_radius / 1920 * stageH) + "px" : ""`, following the same canvas-px-to-stage-px conversion already used for `size_px` on the line above it.

## CAPTIONS: Background highlight mode

`static/index.html`:
- `#caption-highlight-mode-group`'s button list gains a third option, `{value: "background", label: "Background"}`. Since three buttons don't split evenly across the existing 8-column row (the current two use `span: 4` each), the new option renders full-width (`span: 8`) on its own row below the first two (`span: 4` each, unchanged).
- New `<label id="caption-highlight-border-radius-field"></label>` added to `#caption-highlight-body`, below the existing color field.

`static/caption-panel-highlight.js`:
- Extend the `UI.buttonGroup` options array with the third "Background" option as above.
- Add a `UI.numberField` for `preset.highlight_border_radius` (same 0–40px range as the TEXT one), hidden unless `preset.highlight_mode === "background"` — same conditional-hide approach as the Shadow subpanel.

`static/preview-captions.js`:
- In the per-word span loop, branch on `preset.highlight_mode`:
  - `"background"`: `span.style.backgroundColor` = `preset.highlight_color` when active else `"transparent"`; `span.style.borderRadius` = `preset.highlight_border_radius` converted to stage px (same pattern as `preview-text.js`); `span.style.color` stays `preset.color` always (no color swap in this mode).
  - `"current_word"` / `"progressive_fill"`: unchanged (existing `isHighlighted` → color-swap logic), with `backgroundColor`/`borderRadius` explicitly reset to `transparent`/`0` so switching modes doesn't leave stale styling on re-render.

`app/ass_render.py`:
- New helper `_background_word_dialogues(page: list[list[CaptionWord]], p: TextPreset) -> list[str]`, added near `_current_word_dialogues`:
  - For each line in the page, measure each word's width and cumulative x-offset (plain `pil_font_measurer`, no per-run styling needed — captions have no `FormatRun`s), and the line's total width — mirroring the per-line offset/width computation already in `_highlight_dialogues`.
  - For each active word (same "one dialogue window per active word" structure as `_current_word_dialogues`), emit two `Dialogue` lines for that word's `[t_start, t_end)` window:
    1. A rounded-rect (`_rounded_rect_path` with `p.highlight_border_radius`) positioned behind the word, using the same `p.align`-relative left-origin math as `_highlight_dialogues` (`p.x` is the line's left/right/center anchor depending on `align`, consistent with `_caption_style`'s alignment field) and `line_index * (size_px * LINE_HEIGHT)` for the vertical offset.
    2. The full page's word text (all words in `preset.color`, no per-word color swap), positioned via the existing `\pos(p.x, p.y)` + style-alignment anchor, same as `_karaoke_dialogue`'s body.
  - The rect dialogue is appended to the output list before the text dialogue for the same word/window, so it renders underneath (matching the existing `render_ass` ordering convention where `_highlight_dialogues` output precedes `_block_dialogue`).
- `render_caption_ass`: branches three ways instead of two — `"current_word"` → `_current_word_dialogues`, `"background"` → `_background_word_dialogues`, else (`"progressive_fill"`) → `_karaoke_dialogue` (unchanged fallback behavior).

## Testing

`tests/test_ass_render.py`:
- TEXT: a highlighted run's rect path reflects a non-default `highlight_border_radius` (not the old hardcoded 4), confirming the constant was actually replaced.
- CAPTIONS: `highlight_mode = "background"` produces, per active word, a rect `Dialogue` immediately followed by a text `Dialogue` covering the same `[t_start, t_end)` window; rect uses the configured radius; existing `current_word`/`progressive_fill` tests unchanged (regression check that the third branch didn't disturb the other two).

Manual/live verification (browser, throwaway project, per project convention): toggle TEXT highlight on/off, change color and radius, confirm the stage preview updates; switch a caption track to Background mode, confirm the active word shows a rounded highlight box that tracks playback, and confirm HIGH/MEDIUM export burns in both correctly (spot-check via a short export).

## Out of scope

- Per-selection (`FormatRun`) highlight UI for TEXT blocks — the toggle/color/radius apply to the whole block only.
- Per-run border-radius override.
- Horizontal padding around the caption background chip — kept flush with the word's measured width to match the ASS export pixel-for-pixel (no CSS-only padding that the export can't reproduce).
