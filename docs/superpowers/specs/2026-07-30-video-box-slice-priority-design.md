# Video box slice priority — design

## Problem

The timeline's "Slice at playhead" scissors button (`#slice-action`, wired in
`static/timeline-slice.js`) always splits the MAIN video track
(`project.clips`), regardless of what's selected. There is no way to split a
video box (picture-in-picture layer) at the playhead — `project.video_boxes`
is never touched by the slice action.

Feature request: when a video box is selected and active at the playhead,
pressing slice should split that video box instead of the main video.

## Behavior

- **Trigger condition:** a video box is selected (`selected.type ===
  "video-box"`) **and** the playhead sits inside that box's own visible
  window: `box.start <= t && t < box.start + (box.out_point - box.in_point)`.
  When both hold, slice targets the video box. Otherwise (no box selected, or
  playhead outside the box's range), slice targets the main video exactly as
  today.
- **Scope:** video boxes only. Image boxes (`ImageBoxLayer`) have no
  `in_point`/`out_point` source trim — just `start`/`duration` — so "slicing"
  doesn't carry the same meaning and is out of scope for this feature.
- **Split result:** mirrors how slicing a main clip works, adapted for a box's
  own start/in/out fields (a box has no `order`, so no reordering is needed):
  - The original box keeps its `id`, position, size, z-index, and mask
    settings. Only `out_point` is trimmed to the split's source time.
  - A new box is created (new id) as a full copy of the original (same
    position/size/z-index/mask/media), except `in_point` = the split's source
    time and `start` = the playhead time — so it starts immediately where the
    first half ends, exactly like the two halves of a sliced main clip sit
    back-to-back.
- **Disabled state:** the scissors icon's existing grey-out behavior
  (`updateSliceButton` in `static/timeline.js`) becomes priority-aware: when a
  video box is the active target, disabled is computed against the box's own
  boundaries (near `box.start` or its end) instead of the main clip's.

## Data flow

No backend/API changes — this is a pure client-side array mutation on
`project.video_boxes`, followed by the existing whole-project
`PUT /api/projects/{id}` save (`saveProject()`), exactly like main-clip
slicing already works entirely client-side today.

## Components

`static/timeline-slice.js` gains three pure, DOM-free helpers (testable via
`node --test`, unlike the file's existing `Preview`-dependent helpers):

- `Timeline.isBoxActiveAt(box, t)` — `box.start <= t && t < boxEnd(box)`.
- `Timeline.isBoxSliceDisabled(box, t, eps = 0.05)` — true when `box` is
  inactive at `t`, or `t` is within `eps` seconds of `box.start` or the box's
  end.
- `Timeline.sliceVideoBox(videoBoxes, box, t, eps = 0.05)` — mirrors
  `sliceClip`'s shape: mutates `box.out_point`, pushes a new box, returns
  `{ videoBoxes, newId }` (`newId: null` when disabled — a no-op, same
  convention as `sliceClip`).

The `#slice-action` click handler branches: if `selected` is a video box and
`isBoxActiveAt` holds, call `sliceVideoBox`, save, refresh the box's on-stage
render (`VideoBoxPreview.render`) and its side panel
(`VideoBoxPanel.render`), then `renderTimeline()`. Otherwise, fall through to
today's unchanged main-clip slice path.

`static/timeline.js`'s `updateSliceButton()` picks which disabled-check to
run (box vs. main clip) using the same targeting condition as the click
handler, so the icon's grey-out state always matches what a click would
actually do.

## Testing

New `tests/js/timeline-slice.test.js` covers the three new pure helpers
directly (boundary conditions: exactly at `box.start`, exactly at the box's
end, well inside, well outside, within/outside `eps`). The existing
`Preview`-dependent helpers (`isSliceDisabled`, `sliceClip`) and the DOM
click-wiring stay untested, matching this file's pre-existing state (no test
file exists for it today) — not a regression introduced by this change.

Manual verification (no automated UI test exists for this app): open a
throwaway project with a main clip and a video box, select the box, seek the
playhead inside its window, click slice, confirm two video boxes appear
back-to-back and the main clip is untouched; then confirm the reverse (no
box selected, or playhead outside the box) still slices the main clip as
before.
