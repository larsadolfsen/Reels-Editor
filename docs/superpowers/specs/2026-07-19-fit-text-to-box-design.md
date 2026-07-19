# Fit Text to Box (FILL mode) — Design

## Task list

- [ ] `app/models.py`: no schema change needed — `box_width_mode`/`box_height_mode` are plain `str` fields, so `"fill"` is just a new valid value; confirm no validator/enum blocks it
- [ ] `app/ass_render.py`: extend `_wrapped_lines_and_size()`'s `"fixed"` checks to also treat `"fill"` as fixed-size for word-wrap and box-height math
- [ ] New `static/font-fit.js`: pure `wrapText`, `canvasMeasurer`, `fitFontSize`
- [ ] `static/preview.js`: centralized refit call at the top of `renderText()`'s per-block loop, with a memoization cache keyed by fit-relevant inputs
- [ ] `static/editor.js`: `maybeRefitFillText()` helper, SIZE row gains a third FILL button, box width/height field visibility bug fix, `onEditEnd` triggers a refit before save, drag-resize handles preserve `"fill"` mode
- [ ] `static/text-panel-font-style.js`: SIZE (PX) field becomes disabled/read-only when mode is `"fill"` (still shows the live computed value)
- [ ] `tests/test_ass_render.py`: cover `"fill"` mode taking the same code path as `"fixed"`
- [ ] `CLAUDE.md` inventory update

## Background

The Text Box component (see [2026-07-17-text-box-design.md](2026-07-17-text-box-design.md)) gave the BOX accordion a combined SIZE row with two modes: **FIT** (box sizes to content) and **FREE** (box is a fixed pixel size; text word-wraps within it at whatever `size_px` the user set, potentially overflowing if the text doesn't fit). This spec adds a third mode, **FILL**: the box is still a fixed pixel size, but instead of the user manually picking a font size that may or may not fit, the font size is automatically computed — shrinking or growing — so the wrapped text fills the box as large as possible without overflowing.

## Goals

- A third SIZE mode, **FILL**, alongside FIT/FREE, using the same fixed `box_width`/`box_height` fields FREE already has.
- Font size auto-computes to the largest value in the existing SIZE field's range (24–200px) such that the heading, word-wrapped, fits within the box's width and height (minus existing padding).
- Works both up and down from any starting size — short text in a big box scales up, long text in a small box scales down.
- The computed size is a real, persisted, visible value (`TextPreset.size_px`) — not a separate shadow value — so switching away from FILL leaves a sensible manually-editable size behind.
- Export (`ass_render.py`) renders the same wrapped text at the same size as the live preview, with no new export-side fitting logic.

## Non-goals

- Live font-size shrinking while actively typing a heading — refit happens on blur (edit end) and on box resize, not per keystroke (decided to avoid caret-preservation complexity in the contentEditable heading field).
- Independent per-axis FILL (e.g. width fixed+fill, height fit-to-content) — FILL, like FIT/FREE today, applies to both width and height together via one combined button group.
- Clipping/hiding overflow text when even the minimum font size (24px) doesn't fit — same graceful overflow behavior FREE mode already has.
- Server-side re-verification of the fit (export trusts the client-persisted `size_px`); see "Open questions / risks".

## Data model

No new `TextPreset` fields. `box_width_mode: str` / `box_height_mode: str` (`app/models.py`) simply gain a third valid value, `"fill"`, alongside the existing `"fit"` / `"fixed"`. `box_width` / `box_height` (already present, used by `"fixed"`) are reused unchanged by `"fill"`.

`size_px` continues to be a plain persisted int, but while a preset is in FILL mode its value is treated as computed/derived rather than directly user-set — see "Wiring" below for exactly when it's overwritten.

## Editor UI

### BOX accordion SIZE row

The existing `UI.buttonGroup` in `renderBoxPanel()` (`static/editor.js`) gains a third option:

```js
UI.buttonGroup(document.getElementById("text-box-size-mode-group"),
  [{ value: "fit", label: "FIT" }, { value: "fixed", label: "FREE" }, { value: "fill", label: "FILL" }],
  preset.box_width_mode,
  (value) => {
    preset.box_width_mode = value;
    preset.box_height_mode = value;
    saveProject(); renderTextPreview(); renderBoxPanel();
  });
```

**Bug fix along the way:** the WIDTH (PX)/HEIGHT (PX) field visibility check currently reads `boxSizeFieldsHidden = preset.box_width_mode !== "fixed"`, which would incorrectly hide those fields in the new FILL mode too (FILL needs an explicit box size exactly like FREE does). Change to `=== "fit"` (hidden only in FIT mode, shown for both FREE and FILL).

### SIZE (PX) field (FONT accordion, `text-panel-font-style.js`)

When the active block's preset is in FILL mode, the existing SIZE (PX) `UI.numberField` is disabled (not hidden) — it keeps showing the live computed value so the user can see what size resulted, but typing into it has no effect while FILL is active (FILL's whole point is that the size is derived, not chosen). Re-enabled immediately when switching back to FIT or FREE.

### Drag-resize handles

`handleBoxResize`/`handleBoxResizeEnd` (`static/editor.js`) currently always force `box_width_mode`/`box_height_mode` to `"fixed"` on drag, on the theory that "dragging a handle means give this an explicit size." For FILL mode this needs to be non-destructive: if the preset was already in `"fill"` mode when the drag starts, it stays `"fill"` after the drag (only `box_width`/`box_height` change); dragging from FIT still switches to `"fixed"` as it does today (autofit stays an explicit opt-in via the button group, never a side effect of a drag). `handleBoxResizeEnd` additionally triggers a refit (see below) once the drag ends, consistent with the "refit on box resize" decision.

## Fit algorithm — new `static/font-fit.js`

A pure module, no framework dependency, following the same "mirror the Python math in JS" pattern `static/timeline.js` already uses for `app/timeline.py`:

```js
window.FontFit = {
  wrapText(text, measureFn, maxWidthPx) { ... },   // same greedy algorithm as app/font_metrics.py's wrap_text
  canvasMeasurer(fontFamily, sizePx, { bold, italic }) { ... },  // offscreen <canvas> 2D context, ctx.font + measureText
  fitFontSize(text, measurerFactory, boxWidthPx, boxHeightPx, { minSize, maxSize, padXEm, padYEm, lineHeight }) { ... },
};
```

- `wrapText` is a line-for-line JS port of `app/font_metrics.py`'s `wrap_text` (paragraph-aware greedy wrap, splitting on `\n` first, then spaces).
- `canvasMeasurer(fontFamily, sizePx, opts)` returns a `measure(text) -> width` closure backed by a single shared offscreen `<canvas>` (created lazily, reused across calls) with `ctx.font = "${opts.bold ? 'bold ' : ''}${opts.italic ? 'italic ' : ''}${sizePx}px \"${fontFamily}\""`. Because this measures with the actual loaded webfont through the same browser text engine that renders the visible `.text-block` div, there's no PIL-vs-browser measurement drift on the preview side (that drift only affects export, and is a pre-existing accepted risk from the original Text Box spec).
- `fitFontSize(text, measurerFactory, boxWidthPx, boxHeightPx, opts)`: binary search over integer sizes in `[minSize, maxSize]`. For each candidate size, builds a measurer via `measurerFactory(size)`, wraps the text, and checks whether the wrapped block's max line width (+ `padXEm * size * 2`) fits `boxWidthPx` and its line count × `size * lineHeight` (+ `padYEm * size * 2`) fits `boxHeightPx` — the same padding/line-height formula `app/ass_render.py`'s `_wrapped_lines_and_size()` already uses (`BOX_PAD_X_EM`/`BOX_PAD_Y_EM`/`LINE_HEIGHT`, mirrored here as JS constants so the two stay in sync). Returns `{ size, wrappedText }` for the largest fitting size; if `minSize` itself doesn't fit, clamps to `minSize` and returns whatever wrapped text results (allowed to overflow, matching FREE mode's existing behavior).
- `minSize`/`maxSize` reuse the existing SIZE field's bounds (24, 200 — from `text-panel-font-style.js`'s `UI.numberField` call), not new constants.

## Wiring — when the fit recomputes

A new `maybeRefitFillText(preset, heading)` helper in `static/editor.js`: if `preset.box_width_mode === "fill"`, builds a `measurerFactory` from `FontFit.canvasMeasurer`, calls `FontFit.fitFontSize(...)`, and overwrites `preset.size_px` with the result. No-op otherwise.

This is called from **one centralized place**: the top of each block's iteration inside `Preview.renderText()` (`static/preview.js`), before that block's `sizePx`/CSS is computed. Because every existing mutation path that changes fit-relevant inputs (box mode switch, WIDTH/HEIGHT field edits, font-family change, Bold/Italic toggle, drag-resize end) already ends by calling `renderTextPreview()` → `Preview.renderText()`, they all get refit for free with no new call sites.

The one gap: heading edits do **not** call `renderTextPreview()` while typing, by design (`onInput` just mutates `block.heading` directly so the contentEditable div's own native text flow handles live typing without disrupting caret position — no live font-size animation while typing, per the earlier decision). To still refit once typing finishes, `onEditEnd` in `renderTextPanel()` (`static/editor.js`) gets one added call: `renderTextPreview();` before `await saveProject();`, so the final size is computed and persisted on blur.

## Performance guard

`Preview.renderText()` runs on every `requestAnimationFrame` tick during playback (per `editor.js`'s existing rAF loop), so recomputing a binary-search fit on every frame for every FILL-mode block would be wasted work when nothing about that block changed. `maybeRefitFillText` (or its caller in `preview.js`) keeps a small `Map<blockId, { inputs, size }>` cache; `inputs` is a plain object/string of the fields that affect fit — `heading`, `box_width`, `box_height`, `font`, `bold`, `italic`, `align` — and the fit is only recomputed when that snapshot differs from the cached one for that block.

## Export rendering (`app/ass_render.py`)

Minimal change: `_wrapped_lines_and_size()`'s two mode checks —

```python
text = wrap_text(b.heading, measure, ...) if p.box_width_mode == "fixed" else b.heading
...
height = p.box_height if p.box_height_mode == "fixed" else ...
```

— both extend to treat `"fill"` the same as `"fixed"` (`p.box_width_mode in ("fixed", "fill")`, `p.box_height_mode in ("fixed", "fill")`). No new Python fitting function, no recomputation of font size server-side: export trusts `p.size_px` as already correctly fitted by the client and persisted via `saveProject()`. `_style()`, `_box_dialogue()`, and `_block_dialogue()` need no changes — they already just read `p.size_px`/`p.box_width`/`p.box_height` as opaque values.

## Testing

- `tests/test_ass_render.py`: a case confirming `box_width_mode == "fill"` produces the same wrapped/boxed output as an equivalent `"fixed"` preset (same `box_width`/`box_height`/`size_px`) — i.e. FILL is a pure UI/data-entry-point distinction from the export's point of view, not a distinct rendering path.
- No JS test suite exists in this project (per `CLAUDE.md`'s `pytest`-only test command), so `font-fit.js`'s `wrapText`/`fitFontSize` correctness is verified manually in-browser during implementation (matching how other pure JS math, e.g. `timeline.js`'s `timeAtX`, is currently verified) — call this out explicitly during the implementation plan's verification step.

## Open questions / risks

- **Export doesn't re-verify the fit.** If a user's browser and PIL disagree enough on text metrics (font hinting/kerning differences, an existing accepted risk from the original Text Box spec), the exported video could show slightly different wrapping than the preview for a FILL-mode block, in the same way FREE mode already can. FILL doesn't introduce a new risk here, but it does make the *box itself* fixed-size in more cases (since FILL always implies both axes fixed), so a wrap mismatch is slightly more likely to be visually consequential (text touching or crossing the box edge) than in FIT mode where the box grows with the text. If this proves to be a real problem in practice, a future fix would add a small safety margin (extra padding) specifically for FILL mode, or move the fit computation server-side and have the client poll it — not attempted now, since it adds real complexity for a risk that's currently only theoretical.
- **Binary search assumes monotonicity** (larger font size never produces a *smaller* wrapped bounding box) — true for the greedy word-wrap algorithm in normal use, but pathological inputs (e.g. a single very long unbreakable "word") could in principle behave oddly. Not a new risk — `wrap_text`/`FontFit.wrapText` already have this property today for FREE mode's fixed-width wrapping; FILL just adds a search loop around the same primitive.
