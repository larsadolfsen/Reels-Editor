# Timeline overlay-lane copy toolbar

Date: 2026-08-01

## Problem

The unified overlay z-order row (`#row-overlays`, one lane per text block / video box /
image box / shape) has no way to duplicate a layer. There used to be a duplicate action
on the VIDEO clip panel and the TEXT panel, but both were removed because clip/text
duplication had caption-sync implications (see `caption-clip-sync.js`). Overlay-lane
layers (text/video-box/image-box/shape) have no such coupling — they're independent of
the MAIN clip sequence and captions — so a duplicate action for them is safe to add.

## Goal

Hovering a lane's block in `#row-overlays` shows a small toolbar above the block (dark
rounded rect with a downward-pointing triangle connecting it to the block, matching the
attached reference image). The toolbar holds exactly one control: a copy icon button
that duplicates that layer.

## Scope

- Applies to `#row-overlays` lanes only: text block, video box, image box, shape.
- Does **not** apply to the MAIN clip row, AUDIO row, or CAPTIONS row.
- Timeline-lane hover only — no equivalent toolbar on the stage.

## Duplicate semantics

- The duplicate gets an identical copy of every field (position, time, size, style)
  except its `id` (new `crypto.randomUUID().replaceAll("-", "")`, matching every other
  id-generation call site in the codebase).
- The duplicate is placed at the same position/time, one z-index step above the
  original (front of the original, not front of the whole stack), and is
  auto-selected (opens its panel) immediately after creation.
- For a **text block**, the linked `TextPreset` is also deep-cloned with a new id and
  the duplicate's `preset_id` repointed at the clone — matching the existing
  1-preset-per-block convention (`addTextBlock`/`ensureTextPreset`). Without this,
  restyling the copy would silently restyle the original too (they'd share a preset).
- For video box / image box / shape, there's no preset to clone — a plain shallow
  clone of the layer object (spread + new id) is sufficient, mirroring
  `timeline-slice.js`'s `sliceVideoBox`'s `{ ...box, id: newId }` pattern.

## Architecture

### `static/overlay-copy.js` (new, pure)

`window.OverlayCopy.duplicate(project, entry) -> newItem`

- `entry` is one of `OverlayLayers.mergedEntries(project)`'s shape:
  `{ id, kind: "text" | "video_box" | "image_box" | "shape", item }`.
- Builds the new item per the semantics above, pushes it (and, for text, its cloned
  preset) into the appropriate `project.*` array in place.
- Places the new item in front of the original in z-order: takes
  `OverlayLayers.mergedEntries(project)` (now including the new item, since it was
  already pushed), finds the original's index, moves the new entry to sit immediately
  before it (front = lower array index = higher z_index), and calls
  `OverlayLayers.renumber(entries)` to persist the new order.
- No DOM, no `fetch`. Unit-testable via `node --test "tests/js/**/*.test.js"` the same
  way `timeline-overlay-layers.js`/`timeline-slice.js` are.

### `static/timeline-overlay-copy-toolbar.js` (new, DOM wiring)

`window.OverlayCopyToolbar.attach(blockDiv, entry)`

- Builds the toolbar markup (triangle + one `UI.icon("copy")` button) as a child of
  `blockDiv` (the `.timeline-block` div `addBlock` already builds), the same way the
  existing resize handle is appended as a sibling child.
- Click handler: `e.stopPropagation()`, then:
  1. `const newItem = OverlayCopy.duplicate(project, entry)`
  2. `await saveProject()`
  3. `await onTimelineSelect({ type: <mapped from entry.kind>, item: newItem })`
     (`text` → `"text"`, `video_box` → `"video-box"`, `image_box` → `"image-box"`,
     `shape` → `"shape"`)
  4. For `video_box`/`image_box`/`shape` only: an explicit
     `VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime())` /
     `ImageBoxPreview.render(...)` / `ShapePreview.render(...)` call, mirroring the
     existing pattern in `panel-media.js`/`stage-shape-draw.js`/`timeline-slice.js`
     where `onTimelineSelect` alone doesn't repaint those stage elements. Text doesn't
     need this — `renderTextPanel()` (called by `onTimelineSelect`'s text branch)
     already calls `Preview.renderText(...)` itself.
- Reaches into `editor.js`/`panel-nav.js`'s `project`/`saveProject`/`onTimelineSelect`
  globals at call time, matching `timeline-slice.js`'s own documented approach.

### `static/timeline.js` (edit)

In `renderOverlaysRow`'s per-entry loop, right after each entry's `dataset.blockId`
line, call `OverlayCopyToolbar.attach(laneTrack.lastElementChild, entry)`.

### `static/ui-icon.js` (edit)

Add a `copy` entry to `ICON_PATHS` (Lucide `copy`: a stacked rounded-rect pair).

### CSS (edit `static/css/components/timeline.css`)

- `.overlay-copy-toolbar`: absolutely positioned above the block (`bottom: 100%`),
  horizontally centered, `opacity: 0` / `pointer-events: none` by default.
- `.timeline-block:hover .overlay-copy-toolbar { opacity: 1; pointer-events: auto; }`
  — same hover-reveal technique already used for `.timeline-resize-handle` and
  `.overlay-lane-handle`.
- A `::after` triangle (CSS border-trick) pointing down from the toolbar's bottom
  center to the block, matching the reference image.
- `.overlay-copy-toolbar-btn`: small icon-only button, reusing `button.css`'s
  `UI.button({ size: "sm" })` styling rather than inventing new button CSS.

## Testing

- `tests/js/overlay-copy.test.js` (new): unit tests for `OverlayCopy.duplicate` per
  entry kind — new id assigned, other fields preserved, correct array grows by one,
  text also clones its preset with a new id and repoints `preset_id`, and z-order
  places the duplicate directly in front of the original (verified via
  `OverlayLayers.mergedEntries` order before/after).
- DOM wiring (`timeline-overlay-copy-toolbar.js`) is thin glue with no pure logic of
  its own — per the project's stated-gap convention (see the "Shared style sections"
  inventory entry's own stated gap), it's verified manually in the browser rather than
  unit tested: hover a text/video-box/image-box/shape lane, confirm the toolbar
  appears with the triangle pointing at the block, click Copy, confirm a new
  identical layer appears one z-index above the original and is auto-selected.

## Non-goals

- No keyboard shortcut (e.g. Ctrl/Cmd+D) for this action.
- No stage-side equivalent toolbar.
- No special undo-history handling beyond the normal `saveProject()` snapshot.
- No copy action for MAIN clips, AUDIO, or CAPTIONS.
