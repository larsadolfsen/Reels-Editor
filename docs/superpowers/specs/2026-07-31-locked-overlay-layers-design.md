# Lockable overlay layers — design

Date: 2026-07-31

## Problem

The timeline's unified overlay z-order stack (TEXT / VIDEO BOX / IMAGE BOX lanes,
`static/timeline.js`'s `renderOverlaysRow`) lets any lane be drag-reordered via a
hover-reveal grip handle (`.overlay-lane-handle`). There is no way to protect a
layer from being accidentally reordered. Separately, the MAIN (video) and AUDIO
rows are permanently non-reorderable but give no visual signal of that.

## Data model

Add one field, default `False`, to each layer type that participates in the
overlay stack (`app/models.py`):

- `TextBlockLayer.locked: bool = False`
- `VideoBoxLayer.locked: bool = False`
- `ImageBoxLayer.locked: bool = False`

Existing saved projects load unaffected (field defaults `False`). No change to
`CaptionTrack` — captions are not part of the draggable overlay stack and are
excluded from `OverlayLayers.mergedEntries`. No new API route: `locked` rides
along with the rest of the layer JSON on the existing project save.

## Toggle interaction (TEXT / VIDEO BOX / IMAGE BOX lanes)

Same DOM spot as today's grip handle, `.overlay-lane-handle` inside
`.overlay-lane-label` (`static/timeline.js` renderOverlaysRow):

- **Unlocked** (today's rendering, unchanged): hover reveals a `grip-vertical`
  icon. Mousedown + vertical drag past the existing 4px threshold reorders the
  lane (unchanged logic in `static/timeline-overlay-layer-drag.js`). A mouseup
  with **no** drag movement is new: it now toggles `locked = true` instead of
  being a no-op.
- **Locked**: the same spot renders a `lock` icon (`UI.icon("lock", {size:14})`)
  instead of the grip, and it is **always visible** (not hover-gated) via a
  `.overlay-lane-label.locked .overlay-lane-handle` CSS override, so a locked
  layer is visible at a glance without hovering. Mousedown on a locked lane does
  not start the drag-follow/reorder logic at all — only a plain click (mouseup
  with no meaningful movement) fires, and it toggles `locked = false`.

Both directions: flip `entry.item.locked`, `saveProject()`, `renderTimeline()`.
No selection/stage side effects.

## Fixed rows (MAIN / AUDIO)

These rows are outside the overlay stack (`#label-video`, `#label-audio` in
`static/index.html`) and are never reorderable regardless of any field — the
lock icon here is a static visual cue, not a real per-layer toggle affecting a
model. On first `Timeline.render()`, prepend a small non-interactive `lock`
icon (`UI.icon("lock", {size:14})`, wrapped in a `span.row-label-lock` with
`title="Always locked"`) to `#label-video` and `#label-audio`, idempotently
(skip if already present, since `render()` runs on every save/update but these
label elements are never cleared/rebuilt). The `title` attribute is picked up
automatically by `UI.tooltip`'s document-wide `MutationObserver` hydration — no
extra tooltip wiring needed.

## Explicitly out of scope

- Locking does not affect stage selection, drag-to-move, or resize — only the
  timeline reorder gesture, per confirmed scope.
- No lock/unlock for CAPTIONS (not part of the overlay stack).
- No bulk lock-all / unlock-all control.
- No visual change to the block itself inside the lane's timeline track (only
  the label-column icon changes).

## Files touched

- `app/models.py` — 3 field additions (`locked: bool = False`)
- `static/timeline.js` — lane label renders lock vs. grip icon based on
  `entry.item.locked`; new `ensureFixedRowLockIcons()` for MAIN/AUDIO, called
  once per `render()`
- `static/timeline-overlay-layer-drag.js` — locked lanes skip the drag-follow
  logic; a plain click (either state) toggles `locked` and re-renders
- `static/css/components/timeline.css` — `.overlay-lane-label.locked
  .overlay-lane-handle { opacity: 1; }` (always visible when locked) +
  `.row-label-lock` styling for the MAIN/AUDIO static icon

## Testing

Thin UI wiring (DOM events, no pure logic worth extracting beyond what already
exists in `OverlayLayers`) — verified manually in the browser: lock a TEXT
layer, confirm it can no longer be dragged but can still be selected/moved on
stage, confirm the lock icon persists across a reload (survives save/reload of
`project.text_blocks[].locked`), confirm MAIN/AUDIO show a static lock icon.
No new pure-function surface area to unit test with `node --test`.
