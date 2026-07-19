# Phase 5 — Rich-Text Formatting (Resolved Design)

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Depth doc (goal, data model rationale, original risk list):** [2026-07-17-phase-5-rich-text-formatting-design.md](2026-07-17-phase-5-rich-text-formatting-design.md)
**Status:** brainstormed in full, all four flagged technical risks resolved into concrete decisions (one — drag-vs-select — resolved into a design plus an explicit spike task, not a guess). Ready for `superpowers:writing-plans`.

## Goal

Unchanged from the original depth doc: let FONT properties (size, weight, italic, underline, color, outline, highlight) vary per selected range of text within a single text block, built on Phase 1's `contenteditable` stage element. This doc resolves the four risks the original depth doc deliberately left open and adds the parallel-dispatchable task breakdown.

## Current codebase state (verified at brainstorm time)

- Phase 1 has landed: `.text-block` is `contenteditable` via `static/ui-text-interaction.js` (click-to-edit vs. click-drag-to-move, 4px movement threshold), the five-accordion TEXT panel exists, saved STYLE presets exist (`static/text-panel-style.js`, `Api.savePreset`/`listPresets`).
- Phase 4 (Captions) has also landed — karaoke captions burn in via `render_caption_ass`, which does **not** share code with the rich-text-formatting path below and is untouched by this phase.
- `TextPreset` (`app/models.py:36`) and `TextBlockLayer` (`app/models.py:79`) are exactly as described in the original depth doc — no `formatting_runs` field yet.
- `app/font_metrics.py`'s `wrap_text(text, measure_width, max_width_px)` takes one whole-string measurer; `app/ass_render.py`'s `_wrapped_lines_and_size`/`_block_dialogue` call it with one `pil_font_measurer` per block.
- `static/preview.js`'s `renderText()` (line 146) renders one `.text-block` div per block with `div.textContent = block.heading` — a single flat style, no spans.

## Resolved risk 1 — word-wrap with mixed run widths

**Decision:** no prototype spike needed; there's a design that keeps `wrap_text`'s existing greedy line-breaking algorithm unchanged.

Word-wrap break decisions only ever happen at spaces, with or without rich text — a run boundary can fall mid-word, but a *line* boundary never does. So only the *measurement* of a candidate line needs to become run-aware, not the line-breaking logic itself.

Add a range-aware wrap function in `app/font_metrics.py`, alongside the existing `wrap_text` (kept as-is — captions never use rich formatting, so `render_caption_ass`'s call path is untouched):

```python
def wrap_text_runs(text: str, measure_range: Callable[[int, int], float], max_width_px: float) -> tuple[str, list[tuple[int, int]]]:
    ...
```

- Walks words by character offset into `text` instead of by substring (so `FormatRun` offsets stay meaningful after wrapping).
- Calls `measure_range(start, end)` instead of `measure_width(word)` for each candidate line.
- Returns both the wrapped text (for backward-compatible rendering) **and** each visual line's `(start, end)` character-offset span — needed by resolved risk 2 below.

`measure_range` is built in `ass_render.py`: given `[start, end)`, split at any `FormatRun` boundary crossed, measure each sub-piece with that piece's own `pil_font_measurer(font, size, weight)` (falling back to the block's base `TextPreset` for any sub-range not covered by a run), and sum the widths.

A `FormatRun` may start or end mid-word (e.g. bolding just "orl" in "World") — this matches normal rich-text editor UX (Google Docs, etc.), since `window.getSelection()` naturally produces arbitrary character offsets, not word-snapped ones. No word-boundary-snapping is imposed on the UI.

## Resolved risk 2 — multi-line highlight rendering

**Decision:** free in the browser, mechanical in ASS export — not a separate open question once risk 1 is resolved.

- **Browser preview:** each run renders as its own inline `<span style="background: highlight-color">` (needed anyway for per-run styling — see risk 3/frontend design below). When an inline span wraps across multiple visual lines, the browser's native inline box model already draws one background box per line automatically. No rectangle computation needed on our side.
- **ASS export:** has no equivalent native behavior, so rectangles must be drawn explicitly. Once `wrap_text_runs` (risk 1) returns each visual line's `(start, end)` offsets, this is mechanical: for each highlighted run, intersect its `[start, end)` with every line's range; for each non-empty intersection, measure that sub-range's x-offset and width within the line using the same `measure_range` machinery, and emit one `\p1` rounded-rect (reusing the existing `_rounded_rect_path`) positioned at that line's y-coordinate. A run spanning 3 wrapped lines emits 3 rectangles — the same "stacked boxes" visual that native text-selection highlighting already produces in every mainstream editor.

## Resolved risk 3 — drag-to-move vs. text-selection-drag

**Decision:** design resolved below; implementation still gated by an explicit spike task (the one risk where genuine browser-behavior uncertainty remains, per the original depth doc's caution).

Change the trigger from movement-threshold-after-the-fact (today: "did the pointer move >4px before mouseup?") to a **hit-test at mousedown**, but only once a block is already the active/selected block:

- **Not yet selected:** a plain click always just activates/selects the block (unchanged from today) — the first click never starts a text selection.
- **Already selected:** at `mousedown`, hit-test whether the pointer landed on a glyph (via `Range.getClientRects()` over the block's text content) or on empty box padding.
  - Glyph hit → let the browser's native contenteditable selection-drag proceed untouched; on `mouseup`, read `window.getSelection()` to derive the `{start, end}` character-offset range for `FormatRun` writes.
  - Padding hit → intercept as a box-move drag, exactly as today.

The unresolved piece is purely implementation-level: whether native contenteditable drag-selection coexists cleanly with the existing custom `mousedown` interception in `static/ui-text-interaction.js` (browsers sometimes require selectively suppressing `preventDefault()`), which can't be confirmed without trying it. **This is subthread A3 below** — a spike combined with building the selection→offset mapping utility, since the spike's success criterion is literally "produces correct offsets from a real drag-selection."

## Resolved risk 4 — saved STYLE presets vs. rich runs

**Decision:** applying a saved STYLE preset clears the block's `formatting_runs` entirely. A preset is "reset to this whole look," not a partial patch — matches the original depth doc's own recommendation. No merge/preserve behavior.

## Data model

`TextBlockLayer` gains `formatting_runs: list[FormatRun] = []`. `FormatRun` is a new model: `{start: int, end: int, ...sparse style overrides}` — character offsets into `heading`, carrying only the fields that differ from the block's base `TextPreset` (e.g. a run might set only `color`, leaving size/font/weight/etc. to fall through). A block with an empty `formatting_runs` list renders exactly as it does today — additive, fully backward compatible with existing saved projects (no migration needed beyond the default empty list).

Highlight fields — `highlight: bool`, `highlight_color: str` — are added both to `TextPreset` (the block's default, off) and as sparse-overridable `FormatRun` fields, following the same pattern as every other rich-text field. (Captions already have their own separate `highlight_color`/`highlight_mode` fields on `TextPreset`, used by the unrelated karaoke path — no overlap or renaming needed.)

## Frontend rendering & interaction

- `static/preview.js`'s `renderText()` splits `block.heading` into one `<span>` per run (base preset merged with any overlapping run's overrides) instead of setting `div.textContent` directly. A block with no runs renders one span covering the whole string — verified to look pixel-identical to today's single-div rendering.
- A new small pure(-ish) utility converts a `window.getSelection()` range, scoped to one `.text-block` element, into `{start, end}` character offsets into `heading`.
- Each FONT accordion control's `onChange` checks for an active non-collapsed selection on the currently-edited block: if present, writes/updates a `FormatRun` for that exact range instead of the base preset; with no selection (or a collapsed caret), behavior is unchanged — edits the base preset.
- Drag-vs-select interaction changes as described in risk 3, landing in `static/ui-text-interaction.js`.
- STYLE preset apply (`static/text-panel-style.js`'s `applySavedPreset()`) additionally clears `block.formatting_runs = []`.

## Subthreads (parallel-dispatchable batches)

### Batch A — parallel, no dependencies

- **A1 (backend):** `FormatRun` model + `TextBlockLayer.formatting_runs` + highlight fields on `TextPreset`/`FormatRun`, in `app/models.py`. Pure model + default-value backward compatibility, no migration needed.
- **A2 (backend):** `wrap_text_runs` range-aware wrap function in `app/font_metrics.py`, pure function with its own unit tests (mixed-width runs, a run boundary mid-word, a run spanning a wrapped line break). `wrap_text` untouched.
- **A3 (frontend, spike):** drag-vs-select mousedown hit-test on the existing contenteditable `.text-block` (`static/ui-text-interaction.js`) combined with the selection→character-offset mapping utility — the spike's success criterion is producing correct `{start, end}` offsets from a real browser drag-selection while box-move-drag on padding still works.

### Batch B — after A1 + A2 merge

- **B1 (backend, needs A1+A2):** `app/ass_render.py` per-run inline ASS override tags (`{\c...}` etc.) emitted at run boundaries within a block's Dialogue text, using `measure_range` built from A1's runs and A2's wrap function.
- **B2 (backend, needs B1):** `app/ass_render.py` multi-line highlight rectangles — per-visual-line `\p1` rounded rects for highlighted runs, reusing `_rounded_rect_path`.
- **B3 (frontend, needs A1, parallel to B1/B2):** `static/preview.js` span-per-run rendering, including multi-line highlight via native inline-span backgrounds (no extra CSS work needed per resolved risk 2). Must preserve today's zero-run rendering exactly.

### Batch C — after A3 + B3 merge

- **C1 (frontend, needs A3+B3):** FONT accordion selection-awareness — each control writes a `FormatRun` when a selection is active, rendered live via B3.
- **C2 (frontend, needs A1, parallel to C1):** STYLE-preset-apply clears `formatting_runs` (`static/text-panel-style.js`).

### Final

- **D1 (sequential, last):** full `pytest -q` pass (including A2/B1/B2's new edge-case tests); manual walkthrough — select part of a heading, change size/color/bold/highlight and confirm only the selection changes live; a block with no rich formatting renders identically to before this phase; export a block with mixed formatting and confirm the mp4 matches the preview, including a highlight spanning a wrapped line break; then `superpowers:finishing-a-development-branch`.

## Verification (phase checkpoint)

Same as D1 above — this phase's mandatory visual-review checkpoint per the roadmap's process rules.
