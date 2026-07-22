# Text-block duration drag handle

## Problem

The TEXT row in the timeline strip shows each `TextBlockLayer` as a block spanning
`start`→`end`. There's no way to change a block's duration from the timeline — only a
"+ Add text" button next to the row (redundant with the left icon rail's TEXT entry,
which already inserts a new block).

## Change 1 — remove the redundant add button

Remove the TEXT row's `row-add-btn` (`onAddText` wiring in `timeline.js`/`editor.js`).
The VIDEO row's "+ Add clip" button is unaffected. Text blocks are still added via the
left icon rail's TEXT entry (`addTextBlockAndEdit()`, unchanged).

## Change 2 — drag handle to resize duration

Each `.timeline-block` in the TEXT row gets a small resize handle on its right edge.
Dragging it changes `TextBlockLayer.end` (extend or shrink), clamped to a 0.3s minimum
duration relative to `start`. No upper clamp — extending past the current timeline
duration is allowed, same as other layers that can extend the sequence.

- `timeline.js`'s `addBlock()` gains an optional `resizable` flag; when set, appends a
  `.timeline-resize-handle` child div pinned to the block's right edge (CSS only,
  visible on hover/selected via `timeline.css`, `cursor: ew-resize`).
- New file `static/timeline-text-resize.js` (mirrors `timeline-clip-drag.js`'s
  delegated-listener pattern): a single `mousedown` listener on the persistent
  `#row-text` container (survives `Timeline.render()` rebuilding children). Drag
  converts pointer `dx` to seconds via `Timeline.PX_PER_SEC`, live-updates the block's
  CSS width during the drag (no full re-render each frame), and on mouseup writes the
  clamped new `end` onto the block, then `saveProject()` + re-renders the timeline
  (and panel, if that block is selected).
- The handle calls `stopPropagation()` on its own `mousedown` so dragging it never
  triggers the block's own click-to-select listener.

## Out of scope

- Left-edge (start) resize — not requested.
- Collision/overlap prevention between text blocks — none exists today and this change
  doesn't add any.
