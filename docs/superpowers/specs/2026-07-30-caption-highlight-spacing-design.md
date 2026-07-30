# Caption highlight/spotlight background spacing — design

## Problem

Two caption-preset features paint a background rectangle behind caption text, and both are currently
sized wrong:

1. **Highlight** (`TextPreset.highlight`, `static/style-section-highlight.js`) is meant as an
   always-on background behind the visible caption text. Today it paints across the *entire fixed
   caption box* (e.g. 900x350px) for the whole lifetime of the caption track:
   - `static/preview-captions.js`'s `renderCaptions()` sets `backgroundColor`/`borderRadius` on the
     whole `.caption-block` div when `preset.highlight` is true.
   - `app/ass_render.py`'s `_caption_highlight_dialogue()` draws one rect sized to
     `box_width`x`box_height`, spanning `words[0].t_start` to `words[-1].t_end`.

   Since the caption box is always fixed-size (unlike TEXT blocks, which can be `box_width_mode:
   "fit"`), this produces one big rectangle that doesn't hug the 1-2 lines of text actually visible
   at any moment — confirmed by the reported screenshots (a wide black rectangle around short lines
   of text).

2. **Spotlight** background mode (`preset.highlight_mode === "background"`,
   `static/style-section-spotlight.js`) already highlights per active word, but with **no padding**:
   - Preview: the word `<span>` gets `backgroundColor`/`borderRadius` with no padding — width hugs
     the glyphs exactly (0 horizontal gap), height is whatever the browser's line-height box gives
     (no explicit control).
   - Export: `app/ass_render.py`'s `_background_word_dialogues()` sizes the rect to
     `measure(word.text)` wide (no padding) and `size_px * LINE_HEIGHT` (1.15) tall — taller than the
     glyphs (baked-in line leading) but with zero horizontal padding, so spacing looks uneven between
     axes.

## Goal

Both features should render a background that **hugs the actual rendered text** (not the fixed box),
with the **same visual padding amount on all four sides**, in both the live preview and burned-in
export. Per-line/per-word rectangles, not one rectangle around the whole caption box.

## Design

### Shared padding constant

Add one module constant next to the existing `CAPTION_PAD_X_EM`/`CAPTION_PAD_Y_EM` in
`app/ass_render.py`:

```python
HIGHLIGHT_PAD_EM = 0.2   # applied equally on all 4 sides of a highlight/spotlight rect
```

`pad_px = HIGHLIGHT_PAD_EM * preset.size_px` (canvas px, mirrored in JS as
`preset.size_px * HIGHLIGHT_PAD_EM`). This is a rendering-correctness constant, not a user-facing
field — no `TextPreset` model change.

### Tight text height vs. line pitch

Lines are still vertically spaced `size_px * LINE_HEIGHT` (1.15) apart when stacking multiple lines
— that must stay unchanged, since it's what both libass (export) and the browser (preview, via
`.caption-line` flow) actually use to lay out consecutive lines of text.

But each highlight/spotlight rectangle's own height should be based on the **tight** text height
(approximated as `size_px`, i.e. without the 1.15 line-height multiplier) plus `2 * pad_px`, and it
should be **vertically centered within its line's pitch slot**:

```
line_pitch   = size_px * LINE_HEIGHT
rect_height  = size_px + 2 * pad_px
rect_top     = line_slot_top + (line_pitch - rect_height) / 2
```

This is the "measuring" piece: without this centering step, using the same padding value on top of
the loose line-height box would look uneven (extra space silently already baked into line-height,
on top of which we'd be adding more).

Rectangle width is always `measured_text_width + 2 * pad_px`, left-shifted by `pad_px` from the
text's own left edge (so padding is symmetric left/right too).

### Highlight (`preset.highlight`)

Restructure from "one rect for the whole track lifetime" to "one rect per line, per page":

- `app/ass_render.py`: move highlight-rect emission from the single pre-loop
  `_caption_highlight_dialogue()` call into the existing per-page loop in `render_caption_ass()`,
  alongside `_karaoke_dialogue`/`_current_word_dialogues`/`_background_word_dialogues`. For each
  page, for each line in the page: measure that line's width, compute rect geometry per the formula
  above, emit one `Dialogue` spanning that page's active time window (first word's `t_start` to last
  word's `t_end` within the page — same window the page's own text dialogue uses).
- `static/preview-captions.js`: remove the whole-`.caption-block` `backgroundColor`/`borderRadius`
  assignment. Instead, when `preset.highlight` is true, wrap each rendered `.caption-line`'s content
  in an inline-block wrapper with `line-height: 1`, equal `padding` (px, converted via the existing
  stageH font-size scale) on all sides, `backgroundColor: preset.highlight_color`, `borderRadius`
  from `preset.highlight_border_radius`.

### Spotlight background mode (`highlight_mode === "background"`)

Add the missing padding, using the same tight-height + centering approach:

- `app/ass_render.py`'s `_background_word_dialogues()`: rect width becomes
  `measure(word.text) + 2 * pad_px` (left-shifted by `pad_px`); rect height/position use the
  line_pitch/rect_height/centering formula above instead of the flat `size_px * LINE_HEIGHT`.
- `static/preview-captions.js`: the active word's `<span>` gets `line-height: 1` and equal `padding`
  (same px conversion as Highlight above) in addition to its existing `backgroundColor`/
  `borderRadius`.

### Shared line-layout helper (export side)

`_background_word_dialogues()` already computes per-line word offsets/widths (`line_layout`). Factor
that into a small shared helper (e.g. `_line_word_offsets(page, measure) -> list[(offsets, line_width)]`)
so the new per-page Highlight code and `_background_word_dialogues` don't duplicate the same
line-layout math.

## Out of scope

- Spotlight's other modes (`current_word`, `progressive_fill`) are text-color swaps with no
  background rect — untouched.
- No new user-facing control for the padding amount; it's a fixed rendering constant.
- TEXT blocks' own highlight (`_highlight_dialogues`, formatting-run based) is a separate code path
  serving a different feature (per-run highlight within a `box_width_mode: "fit"` block, which
  already hugs content) — not touched by this fix.

## Testing

- `tests/test_ass_render.py`: assert `_caption_highlight_dialogue`'s per-line rects (new function
  signature) are sized to measured line width + padding, not the fixed box; assert
  `_background_word_dialogues` rects include padding on all sides.
- `tests/js/`: a pure-function test (if the padding/centering math is extracted as a testable pure
  helper) or a DOM-free assertion on the computed style values `preview-captions.js` would produce,
  consistent with how other JS/Python mirrored geometry (e.g. `box_mask.py`/`box-mask.js`) is pinned
  today.
