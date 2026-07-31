# Drag-to-reposition-in-time for overlay lanes — design

Date: 2026-07-31

## Problem

The timeline's unified overlay row (`static/timeline.js`'s `renderOverlaysRow`)
renders one lane per TEXT block / VIDEO BOX / IMAGE BOX. Each lane's block can
be resized (TEXT/IMAGE BOX duration, via `.timeline-resize-handle`) and its
label-column grip drag-reorders/locks the layer vertically
(`static/timeline-overlay-layer-drag.js`). But there is no way to drag a lane's
block **left or right** to shift when it appears in time — the only way to
change a text block's start/end or an image/video box's start is to type
numbers into its TIME/BOX panel field. This adds that gesture, matching how a
VIDEO-row clip block already drags horizontally (`timeline-clip-drag.js`),
except overlay items have an independent `start` (not a sequence position), so
dragging simply shifts `start` (and `end`, for text) rather than reordering.

Shapes are excluded — not requested, and `ShapeLayer` has no `locked` field
today (see the locked-overlay-layers spec).

## Behavior

- Mousedown on a lane's `.timeline-block` (in the timeline track area, not the
  label column) and drag past a 4px threshold moves the block visually via
  `translateX`, same as `timeline-clip-drag.js`.
- On mouseup, the dragged pixel delta converts to a time delta
  (`dx / Timeline.PX_PER_SEC`) and is added to the item's stored `start`:
  - **TEXT**: `start` and `end` both shift by the same delta (duration
    preserved).
  - **IMAGE BOX**: `start` shifts; `duration` unchanged.
  - **VIDEO BOX**: `start` shifts; `in_point`/`out_point` (and therefore
    duration) unchanged — see the VIDEO-row exception below.
  - Every case clamps the new `start` to `>= 0`. No upper bound.
- **No snapping** — this drag does not consult `Timeline.snapTime`/
  `collectBoundaries`. (Confirmed: duration-preserving move only, no
  boundary-snap requested.)
- **Locked items don't drag.** Exactly like the existing vertical grip gate:
  if `entry.item.locked`, the mousedown handler no-ops immediately — no
  drag-follow, no visual feedback, nothing written.
- The block's own existing click-to-select behavior (wired in `addBlock`)
  keeps firing on a mouseup with no drag movement, same as
  `timeline-clip-drag.js`'s coexistence with clip selection.
- Duration-resize handles (`.timeline-resize-handle`, on TEXT/IMAGE BOX) are
  excluded from this listener (`e.target.closest(".timeline-resize-handle")`
  check) so resizing keeps working unchanged.

## VIDEO BOX exception: folding in the existing stitch-to-VIDEO-row gesture

Today, dragging a VIDEO BOX lane's block is already a gesture — native HTML5
drag-and-drop (`el.draggable = true` + `dragstart` in `timeline.js`,
`dataTransfer` read by `#row-video`'s `drop` handler in `editor.js`) that lets
the user drop a PiP box onto the VIDEO row to stitch it into the main sequence
via `stitchVideoBoxIntoSequence`. Native DnD and a custom mousedown-tracked
drag can't both live on the same element (native drag preempts `mousemove`
once the browser recognizes the gesture), so this design folds that behavior
into the new unified dragger instead of running two competing gestures:

- `timeline.js` stops setting `draggable`/`dragstart` on the VIDEO BOX lane
  block.
- The new dragger's `onUp` checks whether the drop point's Y coordinate falls
  inside `#row-video`'s `getBoundingClientRect()`. If so, it computes
  `dropTime` the same way the existing handler does
  (`Timeline.timeAtX(project.clips, rowVideoRect, upEvent.clientX)`) and calls
  `stitchVideoBoxIntoSequence(box, dropTime)` directly — instead of writing
  `box.start`.
  - Otherwise (drop stayed inside the overlays row, or anywhere else outside
    `#row-video`), it falls through to the normal `start`-shift behavior
    above.
- `editor.js`'s `#row-video` `drop` handler drops its now-dead
  `text/video-box-id` branch (nothing sets that `dataTransfer` key anymore);
  the `text/media-id` branch (FILES-panel media import drag) is untouched —
  different source element, unaffected by this change.

Net effect: identical end-user behavior for the stitch gesture, implemented
through the one new drag module instead of a separate native-DnD path.

## Explicitly out of scope

- No snapping to clip/text/caption boundaries during this drag.
- No visual cue while dragging a VIDEO BOX over `#row-video` (e.g. a
  row-highlight) — the drop just takes effect on mouseup, matching today's
  native-DnD UX (which also gives no highlight beyond the browser's default
  drag-ghost image).
- Shapes are not draggable-in-time by this feature.
- No changes to the vertical grip (reorder + lock-toggle) or to duration
  resize.

## Files touched

- `static/timeline-overlay-time-drag.js` (new) — the mousedown/mousemove/
  mouseup listener described above, delegated on `#row-overlays` (element
  persists across re-renders, same reasoning as `timeline-clip-drag.js`).
  Depends on `window.Timeline` (`PX_PER_SEC`, `timeAtX`),
  `OverlayLayers.mergedEntries` (to resolve the dragged entry's item/type by
  `dataset.blockId`), and `stitchVideoBoxIntoSequence` (`clip-sequence.js`) —
  loads after both.
- `static/timeline.js` — remove the VIDEO BOX lane's `draggable`/`dragstart`
  wiring in `renderOverlaysRow` (superseded by the new file).
- `static/editor.js` — remove the dead `text/video-box-id` branch from the
  `#row-video` `drop` handler.
- `static/index.html` — one new `<script>` tag for the new file, placed after
  `clip-sequence.js` and `timeline.js`.
- `static/css/components/timeline.css` — reuse (not duplicate) the existing
  `.dragging`/transform styling `timeline-clip-drag.js` already established
  for VIDEO-row blocks; add the same class to overlay blocks during this drag
  if not already generically styled.

## Testing

Thin UI wiring (DOM mouse events, no non-trivial pure logic to extract beyond
the existing `Timeline.PX_PER_SEC`/`timeAtX` helpers already covered
elsewhere) — verified manually in the browser on a throwaway project:

- Drag a TEXT block left/right: confirm `start`/`end` both shift, duration
  unchanged, panel TIME fields reflect the new values after drop.
- Drag an IMAGE BOX left/right: confirm `start` shifts, `duration` unchanged.
- Drag a VIDEO BOX left/right (staying within the overlays row): confirm
  `start` shifts, `in_point`/`out_point` unchanged.
- Drag a VIDEO BOX down onto the VIDEO row: confirm it stitches into the
  sequence exactly as before (same `stitchVideoBoxIntoSequence` call).
- Lock a layer, confirm dragging it left/right does nothing (no visual
  follow, no data change).
- Confirm resizing (image/text duration handle) still works unaffected.
- Confirm plain click-to-select on each lane type still works when no drag
  threshold is crossed.

No new pure-function surface area for `node --test`.
