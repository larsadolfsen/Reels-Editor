# Caption box sizing — auto word-wrap/pagination design

Date: 2026-07-24

## Goal

Today the CAPTIONS panel's Box tab has a SIZE mode toggle (FIT/FREE/FILL) plus a manual
"MAX WORDS PER LINE" number under HIGHLIGHT. The manual number is disconnected from the box's
actual pixel size — a fixed-size box can already overflow if the chunk of words is too wide, and
FIT mode auto-sizes the box to whatever the fixed word count produces. There's also no support for
showing more than one line at a time.

This feature replaces both controls with one thing: a fixed WIDTH/HEIGHT box whose word-per-line
and lines-per-screen counts are computed automatically from the box size and the caption's current
font (family/size/weight), so text always fits the box the user defines, using as many lines as fit
without ever manually specifying a word count.

## 1. CAPTIONS Box tab UI

- Remove the SIZE (FIT/FREE/FILL) `UI.buttonGroup` from `static/caption-panel-box.js`. The caption
  box is always a fixed size — there is no more mode concept for captions.
- The WIDTH/HEIGHT `UI.numberField`s become unconditionally visible (today they're hidden via
  `boxSizeFieldsHidden = preset.box_width_mode === "fit"`; that conditional is deleted).
- Remove the "MAX WORDS PER LINE" `UI.numberField` from `static/caption-panel-highlight.js`.
  Highlight mode (current word / progressive fill) and highlight color stay unchanged.

This only touches the CAPTIONS panel. TEXT blocks (`text-panel-position.js` / `panel-text.js`'s
`renderBoxPanel`) keep their existing FIT/FREE/FILL modes and BOX FILL font auto-sizing — those are
unrelated to this change.

## 2. Data model

`app/models.py`'s `TextPreset.max_words_per_line` field is removed. It was already documented as
"unused by TextBlockLayer consumers," and once pagination replaces flat word-chunking nothing reads
it.

`box_width_mode`/`box_height_mode`/`box_width`/`box_height` fields stay on `TextPreset` (still used
by TEXT blocks) — captions just always use `"fixed"` mode going forward, enforced at the two places
that construct/read a caption preset rather than in the shared model:

- `static/panel-captions.js`'s `defaultCaptionPreset()`: sets `box_width_mode: "fixed",
  box_height_mode: "fixed", box_width: 900, box_height: 350` (matches the existing caption
  safe-zone band's rough proportions — see `static/css/components/safe-zones.css`'s
  `.safe-zone-caption`) instead of `"fit"`/`0`/`0`.
- `ensureCaptionPreset(id)`: after loading/creating, self-heals a preset that predates this change —
  if `box_width_mode !== "fixed"` or `box_width <= 0` or `box_height <= 0`, backfill the same
  `900`/`350` fixed defaults. This mirrors the existing self-healing pattern noted in the codebase
  map for `CaptionTrack.preset_id`.
- `app/ass_render.py`'s `render_caption_ass(project, preset)`: applies the identical fallback
  locally (computing local `box_width`/`box_height` variables, never mutating the passed-in
  `preset`) so exporting an old project — one that hasn't been reopened in the updated app yet —
  still renders correctly instead of producing a zero-size box.

## 3. Pagination algorithm (mirrored JS + Python)

A new pure greedy wrap-and-paginate function, in the same spirit as `font-fit.js`'s `wrapText` /
`app/font_metrics.py`'s `wrap_text_runs`, but working over discrete `CaptionWord`-shaped objects
(so each word carries its own timing) instead of a plain string, and adding a height-driven page
break on top of the width-driven line break:

- Expand each `CaptionWord` into per-word sub-ranges via the existing
  `estimate_word_timings`/`Timeline.estimateWordTimings` helpers (same first step `group_words`
  takes today), then sort by `t_start`.
- Walk the sorted words, greedily packing each onto the current line: if `measure(currentLine +
  " " + word) <= boxWidthPx`, append it to the line; otherwise close the line and start a new one
  with that word. A single word wider than the box still gets its own line (allowed to overflow
  horizontally) — no character-level splitting, matching `wrapText`'s existing behavior.
- Track line count against `maxLines = max(1, floor(boxHeightPx / (fontSizePx * lineHeightEm)))`.
  When closing a line would make the page exceed `maxLines`, close the current *page* instead
  (starting a new page with that line) rather than just a new line.
- Output shape: pages → lines → words, i.e. `list[list[list[CaptionWord]]]` /
  `Array<Array<Array<word>>>`.

New files:
- `static/caption-layout.js` — `window.CaptionLayout.paginateWords(words, measureFn, boxWidthPx,
  boxHeightPx, fontSizePx, lineHeightEm = 1.15)`, pure, no DOM/fetch dependency beyond the passed-in
  `measureFn` (built via `FontFit.canvasMeasurer` at the call site, same as BOX FILL text sizing
  does today).
- `app/caption_layout.py` — `paginate_words(words, measure_range, box_width_px, box_height_px,
  font_size_px, line_height=1.15)`, pure, using `app/font_metrics.py`'s existing PIL-based
  measurer the same way `wrap_text_runs` does.

`app/ass_render.py`'s `group_words()` function is deleted; `render_caption_ass` calls
`paginate_words` instead.

## 4. Rendering

**Preview (`static/preview-captions.js`):**
- Replace `activeCaptionGroup`'s flat `Timeline.groupWords` chunking with a call to
  `CaptionLayout.paginateWords`, memoized per `(track.words reference, box_width, box_height,
  size_px, font, weight, italic)` so it isn't recomputed every animation frame — same memoization
  shape as `preview-text.js`'s existing `fitCache` for BOX FILL text.
- The "active page" is whichever page's word range covers the current `timelineTime` (first word's
  `t_start` through last word's `t_end` across all its lines) — same boundary rule
  `activeCaptionGroup` uses today, just over a page instead of a flat group.
- `.caption-block` is sized to `preset.box_width`/`box_height` (canvas-scaled px, like a TEXT
  block's fixed box) and becomes a vertical stack of line `<div>`s (top-anchored, one per line in
  the active page), each holding the same per-word `<span>` highlight markup as today. The
  block-level `white-space: pre` in `static/css/components/stage.css` moves down to each line div;
  the outer `.caption-block` adds `overflow: hidden` so a degenerate case (box too small for even
  one line's font size) clips rather than blowing out the layout.

**Export (`app/ass_render.py`):**
- `_karaoke_dialogue`/`_current_word_dialogues` take a page (list of lines) instead of a flat word
  list. They join lines with ASS `\N` inside the dialogue body — `_karaoke_dialogue` still emits one
  `Dialogue` per page with `\k` tags running across all its words in reading order;
  `_current_word_dialogues` still emits one `Dialogue` per active word, with that word's `\1c`
  highlight override applied wherever it falls across the page's lines.
- The existing `Alignment` value in `_caption_style` (7/8/9 for left/center/right, i.e. the
  top-anchored row) already controls how libass justifies multiple `\N`-joined lines relative to
  each other, so no style-line change is needed.

## 5. Testing

- `tests/test_models.py`: drop any `max_words_per_line` references.
- `tests/test_ass_render.py`: replace `test_group_words_*`/`max_words_per_line`-based tests with
  equivalent `paginate_words` tests (respects box width, respects box height/paginates, sorts by
  start time, expands multi-word entries, empty input) plus updated `render_caption_ass` tests
  using `box_width`/`box_height`/`size_px` instead of `max_words_per_line`.
- New pure unit tests for `app/caption_layout.py`'s `paginate_words`: width-based line packing,
  height-based page breaks, an oversized single word overflowing its own line, empty input.
- Frontend: no existing JS test harness for `static/*.js` in this repo (consistent with other
  `static/*.js` pure-logic files like `font-fit.js`/`timeline-snap.js`, which also have no direct
  JS unit tests) — `caption-layout.js` is a pure mirror of `caption_layout.py`, which is
  test-covered; manual verification is via the live preview per
  `superpowers:verification-before-completion`.

## Out of scope

- TEXT block box sizing (FIT/FREE/FILL, BOX FILL font auto-sizing) — unchanged.
- Any change to how karaoke highlight timing/colors work — unchanged, just now applied across
  multiple lines instead of one.
- Any change to the timeline strip's CAPTIONS row preview or `timeline-snap.js`'s boundary
  collection — both keep using `Timeline.groupWords(words, 4)` with its existing hardcoded default,
  since that's a cosmetic reference-only chunking, not the actual on-stage/export layout.
