# Overlay Lane Drag-to-Reposition-in-Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user drag a TEXT / IMAGE BOX / VIDEO BOX (PiP) lane's block left or right on the timeline's overlays row to shift when it appears in time (its `start`, and for TEXT also `end`, preserving duration), matching how VIDEO-row clips already drag horizontally.

**Architecture:** One new mousedown-delegated drag module, `static/timeline-overlay-time-drag.js`, mirrors the existing `timeline-clip-drag.js` pattern (threshold + `translateX` follow) but writes to each layer's own `start`/`end` field instead of reordering a sequence, since overlay items have independent timeline positions. A locked item (`entry.item.locked`) never enters drag-follow, matching the existing vertical-grip lock gate. VIDEO BOX blocks currently drag via native HTML5 DnD (to support dropping onto the VIDEO row and stitching into the main sequence) — that conflicts with a custom mousedown drag on the same element, so this plan removes the native DnD wiring and folds the stitch behavior into the new module: a video-box drag whose drop point lands inside `#row-video`'s bounds calls the existing `stitchVideoBoxIntoSequence` directly instead of writing `start`.

**Tech Stack:** Vanilla JS DOM modules (`static/timeline.js`, `static/timeline-overlay-time-drag.js`, `static/editor.js`), CSS (`static/css/components/timeline.css`). No backend changes — `start`/`end` already exist on all three layer types. Manual browser verification for the DOM/drag wiring (this codebase's existing convention for thin UI wiring — see `docs/superpowers/specs/2026-07-31-overlay-lane-time-drag-design.md`'s Testing section).

## Global Constraints

- Dragging preserves duration: TEXT shifts `start` and `end` by the same delta; IMAGE BOX/VIDEO BOX shift `start` only (spec: Behavior).
- New `start` clamps to `>= 0`; no upper bound (spec: Behavior).
- No snapping during this drag (spec: Behavior — confirmed, explicitly out of scope).
- A locked item (`entry.item.locked`) does not drag at all — no visual follow, no data change (spec: Behavior).
- Shapes are excluded — not requested, and `ShapeLayer` has no `locked` field (spec: Problem).
- The vertical grip (reorder + lock-toggle, `static/timeline-overlay-layer-drag.js`) is untouched; this drag lives on the lane's block in the timeline track, a separate DOM region (spec: Problem).
- Duration-resize handles (`.timeline-resize-handle` on TEXT/IMAGE BOX) keep working unchanged — the new listener must exclude clicks starting on them (spec: Behavior).
- VIDEO BOX dropped onto `#row-video` must still stitch into the sequence exactly as today via `stitchVideoBoxIntoSequence`, just invoked directly instead of through native `dataTransfer` (spec: VIDEO BOX exception).
- Every `static/*.js` file's own top-of-file header comment must be updated when its role changes (project CLAUDE.md convention).
- No hand-inlined `<svg>` — this feature adds no new icons, so no change needed there.

---

### Task 1: Drag-to-reposition for TEXT and IMAGE BOX lanes

**Files:**
- Create: `static/timeline-overlay-time-drag.js`
- Modify: `static/css/components/timeline.css:337-342` (add a sibling `.dragging` rule scoped to the overlays row)
- Modify: `static/index.html:824` (add the new script tag)

**Interfaces:**
- Consumes: `window.Timeline.PX_PER_SEC` (live getter, `static/timeline.js`), `window.OverlayLayers.mergedEntries(project)` (`static/timeline-overlay-layers.js`, returns `[{id, kind, item}]` where `kind` is `"text"`/`"video_box"`/`"image_box"`/`"shape"` and `item` is the live model object), global `project`/`saveProject()`/`renderTimeline()` (`static/editor.js`).
- Produces: no exports — this task's file only wires DOM events. `entry.kind === "video_box"` is explicitly skipped in this task (handled in Task 2) so this task cannot regress the existing native-DnD stitch behavior.

- [ ] **Step 1: Create the new drag file, skipping video boxes for now**

Create `static/timeline-overlay-time-drag.js`:

```javascript
// Drag-to-reposition-in-time for TEXT/IMAGE BOX/VIDEO BOX lanes in the merged overlays row:
// mousedown on a lane's `.timeline-block` (not its `.timeline-resize-handle`, duration resize
// stays wired to timeline-image-resize.js/timeline-text-resize.js) and horizontal drag past a
// 4px threshold shifts that item's `start` (TEXT also shifts `end` by the same delta, preserving
// duration) — new `start` clamps to >= 0, no snapping. Mirrors timeline-clip-drag.js's
// threshold+translateX-follow pattern, but writes an independent timeline position instead of
// reordering a sequence. A locked entry (entry.item.locked) never enters drag-follow at all,
// matching timeline-overlay-layer-drag.js's vertical-grip lock gate.
// Delegated on #row-overlays itself (persists across renders; only its children are rebuilt by
// Timeline.render), same pattern as timeline-image-resize.js/timeline-clip-drag.js.
// Reaches into editor.js's `project`/`saveProject`/`renderTimeline` globals and
// OverlayLayers.mergedEntries; depends on window.Timeline (PX_PER_SEC) already existing, so this
// file must load after timeline.js and timeline-overlay-layers.js.
(() => {
  const THRESHOLD_PX = 4;

  const row = document.getElementById("row-overlays");

  row.addEventListener("mousedown", (e) => {
    if (e.target.closest(".timeline-resize-handle")) return;
    const blockEl = e.target.closest(".timeline-block");
    if (!blockEl || !blockEl.dataset.blockId) return;
    const blockId = blockEl.dataset.blockId;

    const entry = OverlayLayers.mergedEntries(project).find((en) => en.item.id === blockId);
    // Shapes are permanently excluded (no `locked` field, not requested by the feature) even
    // though they also carry dataset.blockId. Video boxes are handled starting in Task 2.
    if (!entry || entry.kind === "shape" || entry.kind === "video_box") return;
    if (entry.item.locked) return;

    const item = entry.item;
    const startX = e.clientX;
    const startStart = item.start;
    const startEnd = entry.kind === "text" ? item.end : null;
    const px = Timeline.PX_PER_SEC;
    let dragging = false;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!dragging && Math.abs(dx) > THRESHOLD_PX) {
        dragging = true;
        blockEl.classList.add("dragging");
      }
      if (!dragging) return;
      blockEl.style.transform = `translateX(${dx}px)`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      blockEl.classList.remove("dragging");
      blockEl.style.transform = "";
      if (!dragging) return;

      const dx = (upEvent.clientX - startX) / px;
      const newStart = Math.max(0, startStart + dx);
      item.start = newStart;
      if (entry.kind === "text") item.end = newStart + (startEnd - startStart);
      saveProject();
      renderTimeline();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
```

- [ ] **Step 2: Add the script tag**

In `static/index.html`, find line 824:

```html
<script src="/static/timeline-overlay-layer-drag.js"></script>
```

Add immediately after it:

```html
<script src="/static/timeline-overlay-time-drag.js"></script>
```

- [ ] **Step 3: Add CSS for the drag-follow visual on overlay blocks**

In `static/css/components/timeline.css`, find (around line 335-342):

```css
/* Drag-to-reorder (static/timeline-clip-drag.js): the dragged block follows the pointer via
   `transform`, and a thin vertical line shows the snap-to-boundary drop target. */
.timeline-row[data-row="video"] .timeline-block.dragging {
  z-index: 5;
  opacity: 0.85;
  box-shadow: var(--shadow-chip);
  cursor: grabbing;
}
```

Add immediately after it:

```css
/* Drag-to-reposition-in-time (static/timeline-overlay-time-drag.js): same visual treatment as
   the VIDEO row's clip drag, applied to overlay lanes (TEXT/IMAGE BOX/VIDEO BOX). No
   snap-to-boundary indicator here — this drag doesn't snap. */
.timeline-row[data-row="overlays"] .timeline-block.dragging {
  z-index: 5;
  opacity: 0.85;
  box-shadow: var(--shadow-chip);
  cursor: grabbing;
}
```

- [ ] **Step 4: Start the dev server and verify manually in the browser**

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000` against a throwaway test project (never a real project — see the project's `feedback_live_verify_throwaway_project` memory). Add a TEXT block and an IMAGE BOX (via the FILES panel plus-icon on an image row). In the timeline's overlays row:

1. Drag the TEXT block left/right past a few pixels — confirm it follows the cursor, and on release its position updates. Open the TEXT panel's Time tab and confirm both `start` and `end` shifted by the same amount (duration unchanged).
2. Drag the IMAGE BOX block left/right — confirm `start` updates in its Box/Time fields, `duration` unchanged.
3. Drag either block far enough left that the delta would push `start` negative — confirm it clamps to `0`, not negative.
4. Lock the TEXT layer (click its grip in the label column) and confirm dragging its block now does nothing (no visual follow).
5. Confirm a plain click (no drag) on either block still selects it (opens the matching panel), unaffected by this change.
6. Confirm dragging the IMAGE BOX's `.timeline-resize-handle` (duration resize) still works and does not also trigger the new reposition drag.
7. Confirm a VIDEO BOX lane still drags-and-drops onto the VIDEO row to stitch into the sequence exactly as before (native DnD, untouched by this task).
8. Add a SHAPE layer and confirm dragging its block does nothing new (no translateX follow, no data change) — its own existing duration-resize handle still works.

- [ ] **Step 5: Commit**

```bash
git add static/timeline-overlay-time-drag.js static/index.html static/css/components/timeline.css
git commit -m "Add drag-to-reposition-in-time for TEXT and IMAGE BOX timeline lanes"
```

---

### Task 2: Extend drag-to-reposition to VIDEO BOX, replacing its native drag-and-drop

**Files:**
- Modify: `static/timeline.js:304-312` (video_box branch of `renderOverlaysRow`)
- Modify: `static/timeline-overlay-time-drag.js` (remove the video_box skip, add video-box handling + stitch-on-drop-over-VIDEO-row)
- Modify: `static/editor.js:282-314` (`#row-video` drop handler — drop the now-dead `text/video-box-id` branch)

**Interfaces:**
- Consumes: `Timeline.timeAtX(clips, rulerRect, clientX)` (`static/timeline.js`, already used by the existing `#row-video` drop handler to compute `dropTime`), `stitchVideoBoxIntoSequence(box, dropTime)` (`static/clip-sequence.js`, mutates `project.clips`/`project.video_boxes` in place, no save/render — caller's responsibility), `Preview.load(project)` (`static/preview.js`), `openFilesPanel()`/`runAutoCaption()` (`static/panel-nav.js`/`static/caption-panel-auto-caption.js`, both already globals by the time this file's event handlers run).
- Produces: no new exports.

- [ ] **Step 1: Stop setting native `draggable`/`dragstart` on the VIDEO BOX lane block, add `dataset.blockId` instead**

In `static/timeline.js`, find (around line 304-312):

```javascript
      } else if (entry.kind === "video_box") {
        const v = entry.item;
        const isSel = !!selected && selected.type === "video-box" && !!selected.item && selected.item.id === v.id;
        const name = v.file_path.split(/[\\/]/).pop();
        addBlock(laneTrack, v.start * px, (videoBoxEnd(v) - v.start) * px, name, isSel,
          () => onSelect({ type: "video-box", item: v }));
        const el = laneTrack.lastElementChild;
        el.draggable = true;
        el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/video-box-id", v.id));
      } else if (entry.kind === "image_box") {
```

Replace the `draggable`/`dragstart` lines with a `dataset.blockId` assignment, matching the TEXT/IMAGE BOX/SHAPE branches:

```javascript
      } else if (entry.kind === "video_box") {
        const v = entry.item;
        const isSel = !!selected && selected.type === "video-box" && !!selected.item && selected.item.id === v.id;
        const name = v.file_path.split(/[\\/]/).pop();
        addBlock(laneTrack, v.start * px, (videoBoxEnd(v) - v.start) * px, name, isSel,
          () => onSelect({ type: "video-box", item: v }));
        laneTrack.lastElementChild.dataset.blockId = v.id;
      } else if (entry.kind === "image_box") {
```

- [ ] **Step 2: Update `renderOverlaysRow`'s header comment**

In `static/timeline.js`, find the comment block directly above `function renderOverlaysRow(project, px, selected, onSelect) {` (starts `// Merges TEXT blocks + VIDEO BOX + IMAGE BOX layers...`). Replace the sentence `Each lane still renders its item exactly as before (time-positioned block, resize handle for text/image boxes/shapes, drag-to-timeline for video boxes) — only the vertical grouping/order changed.` with:

```
  // Each lane still renders its item exactly as before (time-positioned block, resize handle for
  // text/image boxes/shapes) — only the vertical grouping/order changed. As of 2026-07-31
  // (overlay-lane-time-drag), every lane's block also carries dataset.blockId (video boxes
  // included) and drag-to-reposition-in-time is wired in static/timeline-overlay-time-drag.js,
  // which also folds in dragging a VIDEO BOX onto the VIDEO row to stitch it into the main
  // sequence — replacing the native HTML5 draggable/dragstart wiring this branch used to set.
```

- [ ] **Step 3: Extend the drag file to handle VIDEO BOX**

In `static/timeline-overlay-time-drag.js`, replace the line:

```javascript
    if (!entry || entry.kind === "shape" || entry.kind === "video_box") return;
```

with:

```javascript
    if (!entry || entry.kind === "shape") return;
```

Then replace the `onUp` function body:

```javascript
    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      blockEl.classList.remove("dragging");
      blockEl.style.transform = "";
      if (!dragging) return;

      const dx = (upEvent.clientX - startX) / px;
      const newStart = Math.max(0, startStart + dx);
      item.start = newStart;
      if (entry.kind === "text") item.end = newStart + (startEnd - startStart);
      saveProject();
      renderTimeline();
    };
```

with:

```javascript
    const onUp = async (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      blockEl.classList.remove("dragging");
      blockEl.style.transform = "";
      if (!dragging) return;

      if (entry.kind === "video_box") {
        const videoRow = document.getElementById("row-video");
        const videoRect = videoRow.getBoundingClientRect();
        if (upEvent.clientY >= videoRect.top && upEvent.clientY <= videoRect.bottom) {
          const dropTime = Timeline.timeAtX(project.clips, videoRect, upEvent.clientX);
          const wasSelected = selected && selected.type === "video-box" && selected.item && selected.item.id === item.id;
          stitchVideoBoxIntoSequence(item, dropTime);
          await saveProject();
          Preview.load(project);
          renderTimeline();
          if (wasSelected) openFilesPanel(); // the selected box no longer exists
          await runAutoCaption(); // re-transcribes the whole (now-changed) sequence
          return;
        }
      }

      const dx = (upEvent.clientX - startX) / px;
      const newStart = Math.max(0, startStart + dx);
      item.start = newStart;
      if (entry.kind === "text") item.end = newStart + (startEnd - startStart);
      saveProject();
      renderTimeline();
    };
```

Also update the file's header comment (written in Task 1) to describe this: replace the sentence `A locked entry (entry.item.locked) never enters drag-follow at all, matching timeline-overlay-layer-drag.js's vertical-grip lock gate.` with:

```
// A locked entry (entry.item.locked) never enters drag-follow at all, matching
// timeline-overlay-layer-drag.js's vertical-grip lock gate. VIDEO BOX is a special case: if the
// drop point lands inside #row-video's bounds, it stitches into the main sequence via the
// existing stitchVideoBoxIntoSequence (same behavior the old native-DnD wiring provided) instead
// of shifting `start` — this replaces static/timeline.js's old draggable/dragstart wiring on the
// VIDEO BOX lane block, so that gesture and this one don't compete on the same element.
```

- [ ] **Step 4: Remove the now-dead `text/video-box-id` branch from the `#row-video` drop handler**

In `static/editor.js`, find (around line 282-314):

```javascript
document.getElementById("row-video").addEventListener("dragover", (e) => e.preventDefault());
document.getElementById("row-video").addEventListener("drop", async (e) => {
  e.preventDefault();
  const rect = document.getElementById("row-video").getBoundingClientRect();
  const dropTime = Timeline.timeAtX(project.clips, rect, e.clientX);
  const mediaId = e.dataTransfer.getData("text/media-id");
  const boxId = e.dataTransfer.getData("text/video-box-id");
  let addedAudibleClip = false;
  if (mediaId) {
    const m = project.media_library.find((x) => x.id === mediaId);
    if (!m) return;
    const clip = insertClipIntoSequence(
      { media_id: m.id, file_path: m.file_path, in_point: 0, out_point: m.duration },
      dropTime,
    );
    clipDurations[clip.id] = m.duration;
    addedAudibleClip = m.kind !== "image"; // an image clip has no audio worth transcribing
  } else if (boxId) {
    const box = project.video_boxes.find((v) => v.id === boxId);
    if (!box) return;
    stitchVideoBoxIntoSequence(box, dropTime);
    addedAudibleClip = true;
  } else {
    return;
  }
  await saveProject();
  Preview.load(project);
  renderTimeline();
  if (boxId && selected && selected.type === "video-box" && selected.item && selected.item.id === boxId) {
    openFilesPanel(); // the selected box no longer exists — fall back to a safe default panel
  }
  if (addedAudibleClip) await runAutoCaption(); // re-transcribes the whole (now-changed) sequence
});
```

Replace it with (only the FILES-panel media-drag path remains — the video-box stitch path moved to `timeline-overlay-time-drag.js`):

```javascript
document.getElementById("row-video").addEventListener("dragover", (e) => e.preventDefault());
document.getElementById("row-video").addEventListener("drop", async (e) => {
  e.preventDefault();
  const rect = document.getElementById("row-video").getBoundingClientRect();
  const dropTime = Timeline.timeAtX(project.clips, rect, e.clientX);
  const mediaId = e.dataTransfer.getData("text/media-id");
  if (!mediaId) return;
  const m = project.media_library.find((x) => x.id === mediaId);
  if (!m) return;
  const clip = insertClipIntoSequence(
    { media_id: m.id, file_path: m.file_path, in_point: 0, out_point: m.duration },
    dropTime,
  );
  clipDurations[clip.id] = m.duration;
  await saveProject();
  Preview.load(project);
  renderTimeline();
  if (m.kind !== "image") await runAutoCaption(); // an image clip has no audio worth transcribing
});
```

- [ ] **Step 5: Start the dev server and verify manually in the browser**

Reuse the running dev server from Task 1 (or start it per Task 1 Step 4) against the same throwaway test project. Add a VIDEO BOX (via the FILES panel's picture-in-picture hover icon on a video row). In the timeline's overlays row:

1. Drag the VIDEO BOX block left/right, staying within the overlays row — confirm `start` shifts in its Box/Time fields, `in_point`/`out_point` unchanged (duration preserved).
2. Drag the VIDEO BOX block far enough left to clamp `start` at `0` — confirm it doesn't go negative.
3. Drag the VIDEO BOX block down onto the VIDEO row — confirm it stitches into the sequence exactly as before: the box disappears from `project.video_boxes`, a new clip appears in the VIDEO row at the drop point, and (if the video's audio track is real, not silent) auto-caption re-runs.
4. Select a VIDEO BOX, then drag it onto the VIDEO row — confirm the panel falls back to FILES afterward (the box no longer exists).
5. Lock a VIDEO BOX and confirm dragging it (in either direction) does nothing.
6. Confirm a plain click on a VIDEO BOX block still selects it.
7. Re-run Task 1's TEXT/IMAGE BOX checks (steps 1-6) to confirm nothing regressed.

- [ ] **Step 6: Commit**

```bash
git add static/timeline.js static/timeline-overlay-time-drag.js static/editor.js
git commit -m "Extend drag-to-reposition-in-time to VIDEO BOX, replacing native DnD stitch wiring"
```

---

### Task 3: Update codebase map

**Files:**
- Modify: `CLAUDE.md` (project instructions file — "Unified overlay layer stack (z-order)", "Timeline", and "Video & image boxes" sections)

**Interfaces:**
- Consumes: nothing (documentation-only task).
- Produces: nothing (documentation-only task).

- [ ] **Step 1: Update the "Unified overlay layer stack (z-order)" section**

In `CLAUDE.md`, find the bullet starting `- \`static/timeline.js\` — \`renderOverlaysRow(project, px, selected, onSelect)\` renders one 44px lane per text block, video box, or image box...`. Its current text ends with:

```
...As of 2026-07-31, each lane's handle renders `UI.icon("lock")` instead of `UI.icon("grip-vertical")` when `entry.item.locked`, and a new `ensureFixedRowLockIcons()` (called from `render()`, idempotent) prepends a static non-interactive lock icon to the MAIN/AUDIO row labels, since those rows were never part of the draggable overlay stack.
```

Append a new sentence:

```
 As of 2026-07-31 (overlay-lane-time-drag), the VIDEO BOX branch no longer sets `draggable`/`dragstart` — every lane's block instead carries `dataset.blockId` (video boxes included), and `static/timeline-overlay-time-drag.js` drags any lane's block left/right to shift its `start` (TEXT also shifts `end`, preserving duration), folding in the old drag-to-stitch-onto-VIDEO-row gesture as a special case.
```

Add a new bullet immediately after the `static/timeline-overlay-layer-drag.js` bullet (before the `static/timeline.js` bullet):

```
- `static/timeline-overlay-time-drag.js` (added 2026-07-31, overlay-lane-time-drag) — drag-to-reposition-in-time: mousedown on a lane's `.timeline-block` (not its `.timeline-resize-handle`) and horizontal drag past a 4px threshold shifts `start` (TEXT also shifts `end` by the same delta), clamped to `>= 0`, no snapping; a locked entry never enters drag-follow. A VIDEO BOX dropped inside `#row-video`'s bounds instead calls `stitchVideoBoxIntoSequence` directly (`static/clip-sequence.js`) — the same stitch-into-sequence behavior the removed native-DnD wiring provided.
```

- [ ] **Step 2: Update the "Timeline" section's `editor.js` bullet**

In `CLAUDE.md`, find the bullet starting `- \`static/editor.js\` — playhead scrubbing:...`. It currently reads (in relevant part):

```
Clip placement / drag-to-stitch: FILES-panel media rows are draggable (`dragstart` sets `text/media-id`); the `#row-video` drop handler accepts that plus the video-box drag (`text/video-box-id`, see Video boxes below) — both insert via the shared `insertClipIntoSequence(source, dropTime)` (`static/clip-sequence.js`, extracted from `editor.js` 2026-07-21: splits the clip under the drop point into two trimmed halves, or inserts at the nearest boundary; returns the new clip).
```

Replace that sentence with:

```
Clip placement: FILES-panel media rows are draggable (`dragstart` sets `text/media-id`); the `#row-video` drop handler inserts the dropped media via the shared `insertClipIntoSequence(source, dropTime)` (`static/clip-sequence.js`, extracted from `editor.js` 2026-07-21: splits the clip under the drop point into two trimmed halves, or inserts at the nearest boundary; returns the new clip). As of 2026-07-31 (overlay-lane-time-drag), dragging a VIDEO BOX onto this row to stitch it into the sequence no longer goes through this handler's `dataTransfer` — see `static/timeline-overlay-time-drag.js`.
```

- [ ] **Step 3: Update the "Video & image boxes" section's stitch bullet**

In `CLAUDE.md`, find the bullet starting `- \`static/editor.js\` — \`openVideoBoxPanel()\` opens \`#panel-video-box\`...`. Its current text ends with:

```
...Drag-to-stitch onto the VIDEO row: `stitchVideoBoxIntoSequence(box, dropTime)` (`static/clip-sequence.js`, extracted from `editor.js` 2026-07-21) is a thin wrapper over the shared `insertClipIntoSequence` (see Timeline above) that inserts then removes the box from `project.video_boxes`.
```

Append a new sentence:

```
 As of 2026-07-31 (overlay-lane-time-drag), the drag gesture that triggers this is `static/timeline-overlay-time-drag.js` (a drop inside `#row-video`'s bounds), not this file's own `dataTransfer` handling — that path also now supports dragging a VIDEO BOX left/right to shift its `start` without stitching, when the drop stays inside the overlays row.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Update codebase map for overlay lane drag-to-reposition-in-time"
```
