# Phase 3 — Rich-Text Formatting

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** planning only — brainstormed for this revision, but carries real open technical risk (see below) that the pre-plan brainstorm at pickup time should treat as a genuine design pass, not just a verification of this doc.

## Goal

Let FONT properties — size, weight, italic, underline, color, outline, and the new highlight — vary per selected range of text within a single text block, instead of being one flat style for the whole heading. Select text on the stage, change a control in the FONT accordion, and only the selection restyles live. This is also where the text-highlight feature (background behind glyphs) actually lands, since highlight only makes sense applied to a user-chosen range, not the whole block.

Split out of Phase 2 because it's a materially bigger and riskier unit of work than the accordion restructure — see the parent doc's Phase 2/3 split rationale.

## Why this is a real architecture change

Today a `TextBlockLayer` has one `preset_id` pointing at one `TextPreset` — the whole heading renders in one style. Rich text means part of a heading can be bold+red while another part is plain white. That needs:

- A **data model** for per-range overrides on top of the base preset.
- **Rendering** (`preview.js`) that splits the heading into styled spans instead of one styled div.
- **ASS export** (`ass_render.py`) that emits inline per-run override tags, and — the hardest part — **word-wrap that accounts for mixed run widths**, since `font_metrics.wrap_text` (built in Phase 1 for the Box feature) currently assumes one font/size for the whole block.

## Recommended data model

`TextBlockLayer` gains `formatting_runs: list[FormatRun]`, where each `FormatRun` is `{start: int, end: int, ...sparse style overrides}` — character offsets into `heading`, carrying only the fields that differ from the block's base `TextPreset` (e.g. a run might set only `color` and `highlight`, leaving size/font/etc. to fall through to the preset). A block with no runs (the common case — most text blocks won't use rich formatting) renders exactly as it does today, so this is additive, not a breaking change to existing projects.

Rationale for sparse overrides over "every run carries a fully-resolved style": when the base preset's font size changes, unstyled runs should follow it automatically; a fully-resolved-per-run model would require rewriting every run on every preset edit.

Highlight itself: `highlight: bool` + `highlight_color: str`, available both on `TextPreset` (as the block's default — off) and as a per-run override field, following the same sparse-override pattern as the rest of the rich-text fields.

## Selection → editing flow

1. Phase 2 lands `contenteditable` text-block editing on the stage (plain text only, no formatting UI yet — see [phase-2-accordion-restructure-design.md](2026-07-17-phase-2-accordion-restructure-design.md)). This phase builds on that element.
2. Selecting text inside the contenteditable block uses the browser's native Selection API (`window.getSelection()`), scoped to that element; the selected range is converted to character offsets into the plain-text `heading` string.
3. While a non-collapsed selection exists, changing any FONT accordion control writes/updates a `FormatRun` for that exact range instead of touching the base preset. With no selection (or a collapsed caret), FONT controls behave exactly as they do today — edit the base preset.
4. `preview.js` re-renders the block as a sequence of `<span>`s, each styled by merging the base preset with any overlapping run's overrides.

## Known technical risks — resolve these during this phase's own plan, not here

- **Word-wrap with mixed run widths.** `wrap_text`'s current signature (`text, measure_width, max_width_px`) assumes a single measurer for the whole string. Rich runs need wrapping that can switch measurers mid-string (different font/size per run). Recommend prototyping this in isolation (a pure-function spike with tests) before wiring it into `ass_render.py`, since a wrong abstraction here is expensive to unwind later.
- **Multi-line highlight rendering.** A run's highlighted range can span a wrapped line break, so a single background rectangle isn't enough — highlighting (in both the browser preview and the ASS `\p1` export) needs one rectangle per visual line the run touches, the way native text-selection highlighting works. Contained to the highlight-rendering subthread, but non-trivial.
- **Drag-to-move vs. text-selection-drag on the same element.** Phase 1's box-drag decided "click-drag inside the box that isn't a resize handle = move." Once the box is also `contenteditable` with text selection, a click-drag over the glyphs themselves should text-select, not move the box. Likely resolution: once a block is the active/selected block (already one click in), drags starting on visible glyphs select text; drags starting on empty box padding move the box. Prototype and confirm in-browser during implementation — flagged here so it isn't missed, not fully specified.
- **Saved STYLE presets vs. rich runs.** Confirm at implementation time: does applying a saved preset (Phase 2's STYLE accordion) clear existing formatting runs on the block, or only update the base and leave runs intact? Recommend clearing runs on preset-apply (a preset is "reset to this whole look"), but confirm this doesn't surprise users mid-session.

## Subthreads

### Backend

1. **`TextBlockLayer.formatting_runs` + `TextPreset`/run highlight fields** — [parallel-safe]. Model + migration (empty list default, fully backward compatible) in `app/models.py`.
2. **Word-wrap with mixed run widths** — [sequential, spike first per the risk above]. Extends `app/font_metrics.py`'s `wrap_text` (or adds a variant) to accept a measurer-per-range instead of one measurer for the whole string.
3. **`ass_render.py` per-run inline override tags** — [sequential, needs subthread 2]. Emits `{\...}`-prefixed style-switch tags at each run boundary within a block's Dialogue text.
4. **`ass_render.py` multi-line highlight rectangles** — [sequential, needs subthread 3]. Per-visual-line `\p1` background rectangles for highlighted runs, reusing `_rounded_rect_path`/`_ass_override_color` from the Text Box work.

### Frontend

5. **Selection → character-offset mapping** — [parallel-safe]. A small pure-ish utility converting a `window.getSelection()` range within a `.text-block` element to `{start, end}` offsets into `heading`.
6. **FONT accordion selection-awareness** — [depends on subthread 5]. Each FONT control's `onChange` checks for an active selection and writes a `FormatRun` instead of the base preset when one exists.
7. **`preview.js` multi-span rendering** — [parallel-safe]. Splits `heading` into `<span>`s per run (merging base + overrides), replacing the current single-styled-div rendering. Must preserve today's zero-run behavior exactly.
8. **`preview.js` multi-line highlight CSS** — [depends on subthread 7]. Browser-side equivalent of backend subthread 4 — background-behind-glyphs that correctly wraps per visual line.
9. **Drag-vs-select interaction on the contenteditable box** — [depends on Phase 1's drag landing]. Resolves the risk above in-browser.

## Verification (phase checkpoint)

- `pytest -q` green, including the word-wrap and ASS override-tag edge cases.
- Manual: select part of a heading, change size/color/bold/highlight — only the selection changes, live, on the stage; a block with no rich formatting still renders identically to before this phase; export a block with mixed formatting and confirm the mp4 matches the preview, including a highlight that spans a wrapped line break.
