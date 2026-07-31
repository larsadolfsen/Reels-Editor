# Video Box Slice Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a video box is selected and the playhead is inside its own range, the timeline's "Slice at playhead" scissors button splits that video box instead of the main video track.

**Architecture:** Add three pure, DOM-free helper functions to `static/timeline-slice.js` (mirroring the existing `isSliceDisabled`/`sliceClip` pair, but keyed off a single video box's own `start`/`in_point`/`out_point` instead of an ordered clip list). Then branch the existing `#slice-action` click handler and `static/timeline.js`'s `updateSliceButton()` disabled-check on whether a video box is the active target.

**Tech Stack:** Vanilla JS, no build step, `node --test` for pure-function unit tests.

## Global Constraints

- No backend/API changes — this is a pure client-side array mutation on `project.video_boxes`, saved via the existing whole-project `PUT /api/projects/{id}` (`saveProject()`).
- Scope is video boxes only, not image boxes.
- Every `static/*.js` file must keep its existing one/two-line header comment current (see repo `CLAUDE.md`).
- No inline `style="..."` attributes, no hand-inlined SVGs — not applicable here (no markup changes in this feature).

---

## Task 1: Pure video-box slice helpers + tests

**Files:**
- Modify: `static/timeline-slice.js` (add helpers + module.exports guard + document-guard around the existing DOM wiring)
- Test: `tests/js/timeline-slice.test.js` (new)

**Interfaces:**
- Produces (consumed by Task 2):
  - `Timeline.isBoxActiveAt(box, t) -> boolean`
  - `Timeline.isBoxSliceDisabled(box, t, eps = 0.05) -> boolean`
  - `Timeline.sliceVideoBox(videoBoxes, box, t, eps = 0.05) -> { videoBoxes, newId: string|null }`
  - A `VideoBoxLayer`-shaped object has at least: `{ id, start, in_point, out_point }` (other fields like `x`/`y`/`width`/`height`/`z_index`/`media_id`/`file_path`/`mask_*` are copied through unchanged by `sliceVideoBox` via object spread).

The current file (read it before editing — it's short) is:

```js
// Timeline slice: pure Timeline.sliceClip (JS mirror of app.timeline.slice_clip) + wiring for the
// #slice-action scissors button, which cuts the video clip under the playhead in two. Reaches into
// editor.js's project/saveProject/renderTimeline and Preview globals. Depends on Preview.locate.
window.Timeline = window.Timeline || {};

// True when slicing at timeline-time t would be a no-op: the playhead is outside every clip
// (including the empty-timeline case, since Preview.locate returns null for an empty list) or
// within eps source-seconds of a clip boundary. Drives both sliceClip's own no-op guard below
// and the slice button's visual disabled state (static/timeline.js's updateSliceButton).
Timeline.isSliceDisabled = function (clips, t, eps = 0.05) {
  const loc = Preview.locate(clips, t);
  if (!loc) return true;
  const c = loc.clip, s = loc.src;
  return Math.abs(s - c.in_point) < eps || Math.abs(c.out_point - s) < eps;
};

// Splits the clip under timeline-time t at that point. Mutates `clips` in place; returns { clips, newId }.
// No-op (newId null) when t is in no clip or within eps (source-seconds) of a boundary.
Timeline.sliceClip = function (clips, t, eps = 0.05) {
  const loc = Preview.locate(clips, t);
  if (!loc) return { clips, newId: null };
  const c = loc.clip, s = loc.src;
  if (Timeline.isSliceDisabled(clips, t, eps)) return { clips, newId: null };
  clips.forEach((o) => { if (o.order > c.order) o.order += 1; });
  const newId = crypto.randomUUID().replaceAll("-", "");
  clips.push({
    id: newId, media_id: c.media_id, file_path: c.file_path,
    in_point: s, out_point: c.out_point, order: c.order + 1,
    fill_mode: c.fill_mode, speed: c.speed,
  });
  c.out_point = s;
  return { clips, newId };
};

document.getElementById("slice-action").addEventListener("click", async () => {
  const t = Preview.currentTimelineTime();
  const { newId } = Timeline.sliceClip(project.clips, t);
  if (!newId) return;                 // boundary / empty timeline -> harmless no-op
  await saveProject();
  Preview.load(project);
  Preview.seek(t);                    // Preview.load resets the clock to 0; seek back so the
  renderTimeline();                   // playhead (blue line) stays where the cut was made
});
```

- [ ] **Step 1: Write the failing tests**

Create `tests/js/timeline-slice.test.js`:

```js
// Pure video-box slice helpers (isBoxActiveAt/isBoxSliceDisabled/sliceVideoBox), mirroring
// app-side main-clip slicing but keyed off a single VideoBoxLayer's own start/in/out fields.
const test = require("node:test");
const assert = require("node:assert");
const { isBoxActiveAt, isBoxSliceDisabled, sliceVideoBox } = require("../../static/timeline-slice.js");

function makeBox(overrides = {}) {
  return {
    id: "box1", media_id: "m1", file_path: "/a.mp4",
    in_point: 2, out_point: 12, start: 5,
    x: 100, y: 100, width: 300, height: 500, z_index: -1,
    mask_enabled: false, mask_angle: 0, mask_offset: 0, mask_flip: false,
    ...overrides,
  };
}

test("isBoxActiveAt: true strictly inside the box's start..end window", () => {
  const box = makeBox(); // start=5, in=2, out=12 -> window [5, 15)
  assert.strictEqual(isBoxActiveAt(box, 5), true);   // at start (inclusive)
  assert.strictEqual(isBoxActiveAt(box, 10), true);  // well inside
  assert.strictEqual(isBoxActiveAt(box, 14.999), true);
});

test("isBoxActiveAt: false before start, at/after end", () => {
  const box = makeBox(); // window [5, 15)
  assert.strictEqual(isBoxActiveAt(box, 4.999), false);
  assert.strictEqual(isBoxActiveAt(box, 15), false);  // end is exclusive
  assert.strictEqual(isBoxActiveAt(box, 20), false);
});

test("isBoxSliceDisabled: disabled when box isn't active at t", () => {
  const box = makeBox(); // window [5, 15)
  assert.strictEqual(isBoxSliceDisabled(box, 4), true);
  assert.strictEqual(isBoxSliceDisabled(box, 16), true);
});

test("isBoxSliceDisabled: disabled within eps of start or end, enabled well inside", () => {
  const box = makeBox(); // window [5, 15)
  assert.strictEqual(isBoxSliceDisabled(box, 5.01, 0.05), true);   // within eps of start
  assert.strictEqual(isBoxSliceDisabled(box, 14.99, 0.05), true);  // within eps of end
  assert.strictEqual(isBoxSliceDisabled(box, 10, 0.05), false);    // well inside
});

test("sliceVideoBox: no-op (newId null, videoBoxes untouched) when disabled", () => {
  const box = makeBox();
  const videoBoxes = [box];
  const result = sliceVideoBox(videoBoxes, box, 4, 0.05); // outside the window
  assert.strictEqual(result.newId, null);
  assert.strictEqual(videoBoxes.length, 1);
  assert.strictEqual(box.out_point, 12); // untouched
});

test("sliceVideoBox: splits into two back-to-back boxes at t=10", () => {
  const box = makeBox(); // start=5, in=2, out=12 -> window [5, 15)
  const videoBoxes = [box];
  const result = sliceVideoBox(videoBoxes, box, 10, 0.05);

  assert.notStrictEqual(result.newId, null);
  assert.strictEqual(videoBoxes.length, 2);

  // Original box: same id, position/size/z-index/mask unchanged, out_point trimmed to the split's
  // source time (in_point 2 + (10 - start 5) = 7).
  assert.strictEqual(box.id, "box1");
  assert.strictEqual(box.in_point, 2);
  assert.strictEqual(box.out_point, 7);
  assert.strictEqual(box.start, 5);
  assert.strictEqual(box.x, 100);
  assert.strictEqual(box.width, 300);
  assert.strictEqual(box.z_index, -1);

  // New box: new id, same position/size/z-index/mask/media, starts where the first half ends,
  // in_point continues from the split's source time, out_point unchanged from the original (12).
  const newBox = videoBoxes.find((b) => b.id === result.newId);
  assert.ok(newBox);
  assert.strictEqual(newBox.start, 10);
  assert.strictEqual(newBox.in_point, 7);
  assert.strictEqual(newBox.out_point, 12);
  assert.strictEqual(newBox.media_id, "m1");
  assert.strictEqual(newBox.file_path, "/a.mp4");
  assert.strictEqual(newBox.x, 100);
  assert.strictEqual(newBox.width, 300);
  assert.strictEqual(newBox.z_index, -1);
  assert.strictEqual(newBox.mask_enabled, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/js/timeline-slice.test.js`

Expected: FAIL — `require("../../static/timeline-slice.js")` throws because that file has no
`module.exports` yet (and its top-level `document.getElementById(...)` call throws first in a
Node environment with no `document`).

- [ ] **Step 3: Add the three helpers, a document-guard around the existing DOM wiring, and a module.exports guard**

Edit `static/timeline-slice.js` — replace its entire contents with:

```js
// Timeline slice: pure Timeline.sliceClip/sliceVideoBox (JS mirror of app.timeline.slice_clip,
// extended client-side-only for video boxes) + wiring for the #slice-action scissors button.
// The button cuts whichever is the active target at the playhead: a selected video box that's
// active there takes priority (video-box-slice-priority feature); otherwise it cuts the main
// video clip under the playhead, as before. Reaches into editor.js's project/selected/
// saveProject/renderTimeline and Preview/VideoBoxPreview/VideoBoxPanel globals. Depends on
// Preview.locate for the main-clip path; the video-box helpers are pure and DOM-free (also
// exported via module.exports for node --test — see tests/js/timeline-slice.test.js).
window.Timeline = window.Timeline || {};

// True when slicing at timeline-time t would be a no-op: the playhead is outside every clip
// (including the empty-timeline case, since Preview.locate returns null for an empty list) or
// within eps source-seconds of a clip boundary. Drives both sliceClip's own no-op guard below
// and the slice button's visual disabled state (static/timeline.js's updateSliceButton).
Timeline.isSliceDisabled = function (clips, t, eps = 0.05) {
  const loc = Preview.locate(clips, t);
  if (!loc) return true;
  const c = loc.clip, s = loc.src;
  return Math.abs(s - c.in_point) < eps || Math.abs(c.out_point - s) < eps;
};

// Splits the clip under timeline-time t at that point. Mutates `clips` in place; returns { clips, newId }.
// No-op (newId null) when t is in no clip or within eps (source-seconds) of a boundary.
Timeline.sliceClip = function (clips, t, eps = 0.05) {
  const loc = Preview.locate(clips, t);
  if (!loc) return { clips, newId: null };
  const c = loc.clip, s = loc.src;
  if (Timeline.isSliceDisabled(clips, t, eps)) return { clips, newId: null };
  clips.forEach((o) => { if (o.order > c.order) o.order += 1; });
  const newId = crypto.randomUUID().replaceAll("-", "");
  clips.push({
    id: newId, media_id: c.media_id, file_path: c.file_path,
    in_point: s, out_point: c.out_point, order: c.order + 1,
    fill_mode: c.fill_mode, speed: c.speed,
  });
  c.out_point = s;
  return { clips, newId };
};

// True when a single video box is visible at timeline-time t — its own start..end window,
// independent of any other box (a VideoBoxLayer isn't part of an ordered sequence like clips).
function isBoxActiveAt(box, t) {
  return box.start <= t && t < box.start + (box.out_point - box.in_point);
}

// Mirrors isSliceDisabled, but against one video box's own boundaries instead of a clip list:
// disabled when the box isn't active at t, or t is within eps seconds of the box's start or end.
function isBoxSliceDisabled(box, t, eps = 0.05) {
  if (!isBoxActiveAt(box, t)) return true;
  const end = box.start + (box.out_point - box.in_point);
  return Math.abs(t - box.start) < eps || Math.abs(end - t) < eps;
}

// Splits video box `box` (a member of `videoBoxes`) at timeline-time t, mirroring sliceClip's
// shape for a box's own start/in/out fields (no `order` field to shift — a box isn't part of an
// ordered sequence). The original box keeps its id/position/size/z-index/mask fields, only
// out_point trims to the split's source time. The new box is a full copy (position/size/
// z-index/mask/media carried through via spread) starting immediately where the first half
// ends. Mutates `box`/pushes onto `videoBoxes` in place; returns { videoBoxes, newId }.
// No-op (newId null) when isBoxSliceDisabled(box, t, eps) is true.
function sliceVideoBox(videoBoxes, box, t, eps = 0.05) {
  if (isBoxSliceDisabled(box, t, eps)) return { videoBoxes, newId: null };
  const srcTime = box.in_point + (t - box.start);
  const newId = crypto.randomUUID().replaceAll("-", "");
  videoBoxes.push({ ...box, id: newId, in_point: srcTime, start: t });
  box.out_point = srcTime;
  return { videoBoxes, newId };
}

Timeline.isBoxActiveAt = isBoxActiveAt;
Timeline.isBoxSliceDisabled = isBoxSliceDisabled;
Timeline.sliceVideoBox = sliceVideoBox;

if (typeof document !== "undefined") {
  document.getElementById("slice-action").addEventListener("click", async () => {
    const t = Preview.currentTimelineTime();
    if (selected && selected.type === "video-box" && Timeline.isBoxActiveAt(selected.item, t)) {
      const { newId } = Timeline.sliceVideoBox(project.video_boxes, selected.item, t);
      if (!newId) return;                 // near box boundary -> harmless no-op
      await saveProject();
      VideoBoxPreview.render(project.video_boxes, t);
      VideoBoxPanel.render(selected.item.id);
      renderTimeline();
      return;
    }
    const { newId } = Timeline.sliceClip(project.clips, t);
    if (!newId) return;                 // boundary / empty timeline -> harmless no-op
    await saveProject();
    Preview.load(project);
    Preview.seek(t);                    // Preview.load resets the clock to 0; seek back so the
    renderTimeline();                   // playhead (blue line) stays where the cut was made
  });
}

if (typeof module !== "undefined") {
  module.exports = { isBoxActiveAt, isBoxSliceDisabled, sliceVideoBox };
}
```

Note: the click-handler wiring (video-box branch) is added in this step's file rewrite so the
file is only edited once, but it's *exercised* and manually verified in Task 2 — Task 1's own
test/verify steps only cover the pure helpers.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/js/timeline-slice.test.js`

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Run the full JS test suite to make sure nothing else broke**

Run: `node --test "tests/js/**/*.test.js"`

Expected: PASS (all suites, including the new file).

- [ ] **Step 6: Commit**

```bash
git add static/timeline-slice.js tests/js/timeline-slice.test.js
git commit -m "Add video-box slice helpers and wire the slice button to prioritize an active box"
```

---

## Task 2: Priority-aware disabled state on the scissors button + manual verification

**Files:**
- Modify: `static/timeline.js:140-151` (the `updateSliceButton` function)

**Interfaces:**
- Consumes: `Timeline.isBoxActiveAt(box, t)`, `Timeline.isBoxSliceDisabled(box, t, eps)`, `Timeline.isSliceDisabled(clips, t, eps)` (all from Task 1/pre-existing), and the `selected` global (`editor.js`, shape `{ type, item, groupIndex }`).
- Produces: nothing new consumed by later tasks — this is the last task in the plan.

The current function (`static/timeline.js:140-151`) is:

```js
  function updateSliceButton() {
    const btn = document.getElementById("slice-btn");
    const scrollEl = document.getElementById("timeline-scroll");
    const playhead = document.getElementById("playhead");
    const left = parseFloat(playhead.style.left) || 0;
    btn.style.left = `${LABEL_WIDTH + left - scrollEl.scrollLeft}px`;

    const sliceAction = document.getElementById("slice-action");
    const clips = (lastProject && lastProject.clips) || [];
    const disabled = Timeline.isSliceDisabled(clips, lastTimelineTime);
    sliceAction.classList.toggle("disabled", disabled);
  }
```

- [ ] **Step 1: Update `updateSliceButton` to check the active video box first**

Replace the function body in `static/timeline.js` with:

```js
  function updateSliceButton() {
    const btn = document.getElementById("slice-btn");
    const scrollEl = document.getElementById("timeline-scroll");
    const playhead = document.getElementById("playhead");
    const left = parseFloat(playhead.style.left) || 0;
    btn.style.left = `${LABEL_WIDTH + left - scrollEl.scrollLeft}px`;

    const sliceAction = document.getElementById("slice-action");
    const activeBox = (selected && selected.type === "video-box" && Timeline.isBoxActiveAt(selected.item, lastTimelineTime))
      ? selected.item
      : null;
    const disabled = activeBox
      ? Timeline.isBoxSliceDisabled(activeBox, lastTimelineTime)
      : Timeline.isSliceDisabled((lastProject && lastProject.clips) || [], lastTimelineTime);
    sliceAction.classList.toggle("disabled", disabled);
  }
```

Also update this file's header comment block (top of `static/timeline.js`, the lines describing
`#slice-btn`) to mention the new priority behavior — find the existing lines:

```js
// The playhead-handle box (#slice-btn) tracks the playhead
// and holds two icons: a grip-vertical handle (dragged in editor.js to scrub the playhead)
// and a scissors icon (visual only, no slice feature yet).
```

Replace with:

```js
// The playhead-handle box (#slice-btn) tracks the playhead
// and holds two icons: a grip-vertical handle (dragged in editor.js to scrub the playhead)
// and a scissors icon (static/timeline-slice.js wires its click; updateSliceButton below only
// drives its disabled-state indicator, priority-aware as of video-box-slice-priority: a
// selected video box active at the playhead is checked instead of the main clip list).
```

(This comment lived a few lines below the file's top header block — search for the exact text
above rather than assuming a line number, since earlier edits in this session may have shifted
it slightly.)

- [ ] **Step 2: Run the full JS test suite to confirm no regressions**

Run: `node --test "tests/js/**/*.test.js"`

Expected: PASS (this task has no new automated test — `updateSliceButton` is DOM-driven timeline
wiring with no prior test coverage in this file, matching the pre-existing gap noted in the
spec; verified manually in the next step instead).

- [ ] **Step 3: Manual verification in the running app**

This app has no automated UI/E2E test suite (per the codebase map, DOM-heavy files are verified
live). Verify by hand against a **throwaway project** — never the user's real project data (its
media library can be reused read-only by pointing new `MediaItem`s at real file paths already on
disk; never edit/save over an existing project). Use the running dev server
(`.venv/Scripts/python -m uvicorn app.main:app --reload`, http://127.0.0.1:8000, or whichever
port is free) and the browser preview tools:

1. Create a fresh project via `POST /api/projects`, switch `localStorage.projectId` to its id,
   and call the page's global `openProject({id})` (avoids a stale-tab `beforeunload` save race —
   see this session's earlier debugging notes) to load it without a full page reload.
2. `PUT` a project body with one main clip (`project.clips`, some `media_id`/`file_path` from an
   existing media file on disk, `in_point: 0, out_point: 20`) and one video box
   (`project.video_boxes`, `in_point: 0, out_point: 15, start: 2`) referencing a second media
   file, then reload via `openProject({id})` again.
3. Select the video box (click its lane in the timeline's overlay row, or call
   `onTimelineSelect({ type: "video-box", item: project.video_boxes[0] })` from the console).
4. Seek the playhead inside the box's window (e.g. `Preview.seek(5)` — inside both the box's
   `[2, 17)` range and the main clip's `[0, 20)` range) and click `#slice-action` (or call
   `document.getElementById("slice-action").click()`).
5. Confirm: `project.video_boxes.length` is now 2 (back-to-back, second box's `start` equals the
   playhead time used, its `in_point` continues from the first box's trimmed `out_point`), and
   `project.clips` is **unchanged** (still one clip, `out_point: 20`).
6. Now deselect the box (`onTimelineSelect({ type: "video", item: project.clips[0] })` or click
   the main video row) and click slice again at a time inside the main clip. Confirm this time
   `project.clips` splits into two and `project.video_boxes` is unchanged — the original
   main-clip-slice behavior still works when no video box is the active target.
7. Delete the throwaway project (`DELETE /api/projects/{id}`) to clean up.

- [ ] **Step 4: Commit**

```bash
git add static/timeline.js
git commit -m "Make the slice button's disabled-state indicator priority-aware for video boxes"
```
