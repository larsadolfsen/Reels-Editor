# Slice + Timeline Editing — Design

**Status:** brainstormed 2026-07-20, ready for a build session to write its implementation plan. No further design questions open.

## What / Why

Make the timeline a real editing surface. Three sub-features, user-scoped:

1. **Slice** — the existing `.slice-btn` (visual-only today) cuts the **video clip** under the playhead into two clips. Video clips only; text blocks and captions keep their own start/end fields.
2. **Zoom** — the timeline toolbar's −/+ buttons (dead today) actually zoom.
3. **Drag-to-reorder** — drag a clip block left/right to change its sequence position. The VIDEO panel's move up/down buttons stay.

## Design

### Slice

- Pure function `slice_clip(clips, timeline_time) -> (clips', new_clip_id | None)` in `app/timeline.py`, next to `locate()` (which already maps timeline time → clip + source time). Splitting clip `c` at source time `s`: first clip keeps `in_point..s`, second is a new `ClipLayer` (new id, same `media_id`, `s..out_point`), inserted immediately after in `order`; subsequent clips' `order` values shift by one. Returns input unchanged when the time falls in no clip or within ε (0.05 s) of a clip boundary.
- Mirrored in JS (`static/timeline-slice.js`, one function per file convention) the same way `locate` is already mirrored in `preview.js`. The `.slice-btn` click handler calls it with `Preview.currentTimelineTime()`, mutates `project.clips`, saves, re-renders.
- Button disabled state (`.slice-btn[disabled]`) when the playhead is outside any clip or at a boundary — updated in `Timeline.tick()`, which already repositions the button every frame.

### Zoom

- Module state `pxPerSecond` in `static/timeline.js` (replaces the current fit-to-width scale) with zoom levels stepping ×1.5 per click, clamped [fit-to-width … 200 px/s]; the − button at minimum returns to fit-to-width. All row-position math in `timeline.js` already goes through shared helpers — thread the factor through them.
- When zoomed content exceeds the strip width, the track area scrolls horizontally (`overflow-x: auto` on the rows container; ruler/playhead/rows share one scroll container so they stay aligned). During playback, auto-scroll keeps the playhead visible.
- Zoom level is view state only — not persisted, not in undo history.

### Drag-to-reorder

- On a clip block: mousedown + horizontal drag past a small threshold starts a reorder gesture (below threshold it stays a click-to-select — same hit-test-then-classify pattern as `ui-text-interaction.js`). While dragging, the block follows the pointer (CSS transform) and a drop indicator line shows the target gap.
- Drop computes the target index from pointer x against the other blocks' midpoints and reuses the exact reorder logic the VIDEO panel's move up/down buttons use in `editor.js` (extract it to a shared `moveClipTo(clipId, newIndex)` if it's currently inline), then saves and re-renders.
- No cross-row dragging, no drag-to-trim edges (explicitly declined — panel trim fields remain the trim UI).

## Data model

No new entities or fields. Slice creates a standard `ClipLayer` via `new_id()`; both halves reference the same `MediaItem`.

## Reuse

- `locate()` / its JS mirror for playhead → clip+source-time.
- `Timeline.tick()` for slice-button state; `timeline.js`'s existing row-position helpers for zoom.
- The VIDEO panel's reorder logic for drop handling.
- `ui-text-interaction.js`'s drag-vs-click classification pattern (pattern reuse, not code — different element/gesture).

## Tasks

1. `slice_clip()` in `app/timeline.py` + full pytest coverage.
2. JS mirror `static/timeline-slice.js` + slice-button click/disabled-state wiring in `Timeline.tick()`.
3. Zoom: `pxPerSecond` state through `timeline.js`'s position helpers + shared scroll container + playhead auto-scroll.
4. Drag-to-reorder: gesture (threshold classify, transform, drop indicator) + `moveClipTo()` extraction from the VIDEO panel logic.

## Testing

- `slice_clip()` fully pytest-covered in `tests/test_timeline.py`: mid-clip split (durations, orders, shared `media_id`, new id), boundary/ε no-op, empty-clips no-op, split of an already-trimmed clip.
- Zoom math: if extracted as a pure helper it's still JS (no runner) — untested layer stated per convention; keep it tiny.
- Manual verification checklist: slice at mid-clip yields two independently trimmable/reorderable clips that play back seamlessly and export correctly; slice disabled at boundaries/empty timeline; zoom in/out re-lays-out all four rows consistently and scroll-follows the playhead; drag reorder updates playback order and survives reload.

## Out of scope

- Slicing text blocks or captions.
- Drag-to-trim clip edges on the timeline.
- Ripple-delete, gaps, or multi-track video.
- Persisting zoom level.
