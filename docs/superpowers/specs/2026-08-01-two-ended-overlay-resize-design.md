# Two-ended duration resize for TEXT / IMAGE BOX / SHAPE overlay lanes

Date: 2026-08-01

## Problem

Timeline overlay lanes (TEXT, IMAGE BOX, SHAPE) currently have one drag-to-resize
handle, on the right edge only (`static/timeline.js`'s `addBlock({ resizable: true })`,
consumed by `timeline-text-resize.js` / `timeline-image-resize.js` /
`timeline-shape-resize.js`). Dragging it extends/shrinks the layer's duration by moving
its end forward or back; the start stays fixed. There is no way to pull the *start*
later/earlier from the timeline — the only way to change where a layer begins is the
separate drag-to-reposition-in-time gesture (`timeline-overlay-time-drag.js`), which
moves the whole block (both edges) together, not the duration.

Users expect duration to be pullable from either end, the standard trim-handle UX.

## Scope

Applies to the three lane types that already have a right-edge resize handle: **TEXT**,
**IMAGE BOX**, **SHAPE**. VIDEO BOX is explicitly out of scope — it has no resize handle
today (its duration is derived from the source clip's `in_point`/`out_point` trim, and
the panel's trim fields were intentionally removed 2026-07-30); this feature does not
change that.

## Behavior

Each resizable lane gains a second handle on its left edge, alongside the existing right
edge:

- **Right handle** (unchanged): drags the end forward/back; start stays fixed.
- **Left handle** (new): drags the start earlier/later; the *other* edge (end) stays
  fixed — pulling left extends the layer backward in time, pushing right shrinks it
  from the front.

Both handles respect the same clamps that already apply to each layer type:
- Start is clamped to `>= 0`.
- Duration is clamped to each layer's existing minimum: TEXT 0.3s, IMAGE BOX/SHAPE 0.1s.
- No snapping (matches today's right-handle behavior — only ruler-click/playhead-grip
  seeking snaps, per `timeline-snap.js`).

## Design

### Shared pure geometry (new)

`static/timeline-edge-resize.js` — one pure function, mirroring the
`FontSizeScale`/`StyleFields` guarded-dual-export pattern (`window.X` +
`module.exports`, no DOM):

```js
TimelineEdgeResize.computeEdgeResize(edge, dx, initialStart, initialEnd, minDuration)
  -> { start, end }
```

- `edge === "start"`: `newStart = clamp(initialStart + dx, 0, initialEnd - minDuration)`,
  `end` unchanged.
- `edge === "end"`: `newEnd = max(initialStart + minDuration, initialEnd + dx)`, `start`
  unchanged.

This is the one piece of actual logic duplicated three times today (as duration-only
math) and would otherwise be duplicated six times (two edges × three lane types) — so
it's extracted once and unit-tested directly, while the three per-type files stay thin
wiring, following the same shared-pure-module-plus-per-type-wiring shape already used
elsewhere (e.g. `box-panel-size-position.js`, `font-size-scale.js`).

### Rendering two handles

`static/timeline.js`'s `addBlock(track, left, width, label, selected, onClick, { resizable })`:
when `resizable` is true, render two handle divs instead of one:
- `class="timeline-resize-handle timeline-resize-handle-start"` (left edge)
- `class="timeline-resize-handle timeline-resize-handle-end"` (right edge)

Both keep the base `timeline-resize-handle` class so the existing hover/selected reveal
CSS rule (`.timeline-block:hover .timeline-resize-handle, .timeline-block.selected
.timeline-resize-handle { opacity: 1; background: var(--accent); }`) continues to apply
to both without changes.

### CSS

`static/css/components/timeline.css`: the current `.timeline-resize-handle` rule sets
`right: 0` directly. Split that off:
- `.timeline-resize-handle` keeps `position/top/bottom/width/cursor/opacity` (shared).
- `.timeline-resize-handle-start { left: 0; }`
- `.timeline-resize-handle-end { right: 0; }`

### Per-type wiring changes

`timeline-text-resize.js`, `timeline-image-resize.js`, `timeline-shape-resize.js` each
currently: find the right-edge handle via `e.target.closest(".timeline-resize-handle")`,
track one field (`end` for text, `duration` for image/shape) via mousemove, commit on
mouseup, re-render the panel if the item is selected.

Updated per file:
1. On mousedown, determine `edge` from which handle class was hit
   (`handle.classList.contains("timeline-resize-handle-start") ? "start" : "end"`).
2. Capture `initialStart`/`initialEnd` at drag start:
   - TEXT: `block.start`, `block.end` (unchanged shape — already start/end).
   - IMAGE BOX / SHAPE: `box.start`, `box.start + box.duration`.
3. On mousemove and mouseup, call
   `TimelineEdgeResize.computeEdgeResize(edge, dx, initialStart, initialEnd, MIN_DURATION)`.
   - mousemove: live-update `blockEl.style.left = start * px` and
     `blockEl.style.width = (end - start) * px` (today only `width` is updated, since
     `left` never changed — now it must, for the start-edge drag).
   - mouseup: commit to the model —
     TEXT: `block.start = start; block.end = end`.
     IMAGE BOX / SHAPE: `box.start = start; box.duration = end - start`.
4. Existing save/re-render/panel-refresh-if-selected logic is unchanged.

### Load order

`static/index.html`: add `<script src="/static/timeline-edge-resize.js"></script>`
before the three `timeline-*-resize.js` tags (it has no dependency on `timeline.js`
itself, being pure, but the three consumers depend on it being defined first).

### Testing

`tests/js/timeline-edge-resize.test.js` (`node --test`): covers `computeEdgeResize` for
both edges — normal drag in each direction, clamping start to 0, clamping duration to
`minDuration` from both edges, zero-dx no-op. No DOM/browser test exists for the other
three files today (they're wiring, verified live) — same stated gap, unchanged by this
feature; verified manually in-browser per layer type after implementation.

## Out of scope

- VIDEO BOX gains no resize handle (explicitly declined).
- No snapping added to resize drags.
- No changes to the drag-to-reposition-in-time gesture (`timeline-overlay-time-drag.js`).
- No data model changes — `start`/`end`/`duration` fields and their semantics are
  unchanged; this only adds a second way to drive them from the timeline.

## File changes summary

- New: `static/timeline-edge-resize.js`, `tests/js/timeline-edge-resize.test.js`
- Modified: `static/timeline.js`, `static/css/components/timeline.css`,
  `static/timeline-text-resize.js`, `static/timeline-image-resize.js`,
  `static/timeline-shape-resize.js`, `static/index.html`
- Codebase map (CLAUDE.md) entries for the above files updated in the same commit.
