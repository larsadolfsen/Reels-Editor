# Two-ended overlay resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left-edge drag-to-resize handle to TEXT, IMAGE BOX, and SHAPE timeline overlay lanes, so duration can be pulled from either end, not just the right.

**Architecture:** Extract the one piece of real logic (compute a new start/end given which edge moved) into a shared pure module, `TimelineEdgeResize.computeEdgeResize`. `timeline.js`'s `addBlock` renders two handle divs instead of one when `resizable: true`. Each of the three per-type resize-wiring files (`timeline-text-resize.js`, `timeline-image-resize.js`, `timeline-shape-resize.js`) is updated to detect which handle was grabbed and call the shared function, then commit to its own model shape (`start`/`end` for TEXT, `start`/`duration` for IMAGE BOX and SHAPE).

**Tech Stack:** Vanilla JS (no build step, no framework), `node --test` for pure-module tests, plain CSS.

## Global Constraints

- No JS build step/bundler — new files are plain `<script>` tags loaded via `static/index.html`.
- Pure logic modules use the guarded dual-export pattern: `window.X` for the browser, `module.exports` for `node --test` (see `static/font-size-scale.js` for the exact shape to copy).
- Every `static/*.js` file opens with a 2-3 line header comment stating its purpose and key dependencies.
- No inline `style="..."` in HTML/JS-rendered markup for anything that belongs in CSS as a class — but note: this codebase's existing timeline resize files already set `blockEl.style.left`/`blockEl.style.width` directly for live drag feedback (dynamic per-drag positioning, not a static style) — that pattern is preserved, not a violation to fix here.
- VIDEO BOX is explicitly out of scope: it gets no resize handle, `addBlock`'s call site for `video_box` entries (`static/timeline.js` around line 337) is not touched.
- Start is always clamped to `>= 0`. Minimum duration: TEXT 0.3s (existing `MIN_DURATION` in `timeline-text-resize.js`), IMAGE BOX and SHAPE 0.1s (existing `MIN_DURATION` in their files) — do not change these values, only reuse them.
- Every commit that adds/modifies files must update the relevant entries in `CLAUDE.md`'s codebase map in the same commit.

---

### Task 1: Shared pure edge-resize geometry module

**Files:**
- Create: `static/timeline-edge-resize.js`
- Create: `tests/js/timeline-edge-resize.test.js`
- Modify: `static/index.html` (add script tag)
- Modify: `CLAUDE.md` (codebase map entry)

**Interfaces:**
- Produces: `window.TimelineEdgeResize.computeEdgeResize(edge, dx, initialStart, initialEnd, minDuration) -> { start, end }`, also available via `module.exports` for `node --test`. `edge` is the string `"start"` or `"end"`. `dx` is a delta in seconds (already converted from pixels by the caller). Consumed by Task 2 (TEXT) and Tasks 3-4 (IMAGE BOX, SHAPE).

- [ ] **Step 1: Write the failing test**

Create `tests/js/timeline-edge-resize.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const { computeEdgeResize } = require("../../static/timeline-edge-resize.js");

test("end edge: dragging right extends the end", () => {
  assert.deepStrictEqual(
    computeEdgeResize("end", 2, 5, 10, 0.1),
    { start: 5, end: 12 }
  );
});

test("end edge: dragging left shrinks the end, clamped to minDuration from start", () => {
  assert.deepStrictEqual(
    computeEdgeResize("end", -100, 5, 10, 0.1),
    { start: 5, end: 5.1 }
  );
});

test("start edge: dragging left extends the start backward", () => {
  assert.deepStrictEqual(
    computeEdgeResize("start", -2, 5, 10, 0.1),
    { start: 3, end: 10 }
  );
});

test("start edge: dragging right shrinks from the front, clamped to minDuration from end", () => {
  assert.deepStrictEqual(
    computeEdgeResize("start", 100, 5, 10, 0.1),
    { start: 9.9, end: 10 }
  );
});

test("start edge: dragging past zero clamps start to 0", () => {
  assert.deepStrictEqual(
    computeEdgeResize("start", -100, 5, 10, 0.1),
    { start: 0, end: 10 }
  );
});

test("zero dx is a no-op for either edge", () => {
  assert.deepStrictEqual(computeEdgeResize("start", 0, 5, 10, 0.1), { start: 5, end: 10 });
  assert.deepStrictEqual(computeEdgeResize("end", 0, 5, 10, 0.1), { start: 5, end: 10 });
});

test("end edge never moves start", () => {
  const result = computeEdgeResize("end", 3, 5, 10, 0.1);
  assert.strictEqual(result.start, 5);
});

test("start edge never moves end", () => {
  const result = computeEdgeResize("start", -3, 5, 10, 0.1);
  assert.strictEqual(result.end, 10);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/js/timeline-edge-resize.test.js`
Expected: FAIL — `Cannot find module '../../static/timeline-edge-resize.js'`

- [ ] **Step 3: Write the implementation**

Create `static/timeline-edge-resize.js`:

```js
// Pure geometry for two-ended timeline duration resize (start-edge + end-edge), shared by
// timeline-text-resize.js/timeline-image-resize.js/timeline-shape-resize.js so the drag math
// isn't tripled across lane types x two edges. No DOM; exposes window.TimelineEdgeResize in
// the browser and the same object via module.exports for node --test.
(() => {
  // edge: "start" pulls the left edge (start moves, end fixed); "end" pulls the right edge
  // (end moves, start fixed). dx is the drag delta in seconds (already divided by px/sec by
  // the caller). Clamps start to >= 0 and duration to >= minDuration, measured from whichever
  // edge is fixed for this drag.
  function computeEdgeResize(edge, dx, initialStart, initialEnd, minDuration) {
    if (edge === "start") {
      const newStart = Math.min(Math.max(initialStart + dx, 0), initialEnd - minDuration);
      return { start: newStart, end: initialEnd };
    }
    const newEnd = Math.max(initialStart + minDuration, initialEnd + dx);
    return { start: initialStart, end: newEnd };
  }

  const api = { computeEdgeResize };
  if (typeof window !== "undefined") window.TimelineEdgeResize = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/js/timeline-edge-resize.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Wire the script tag**

In `static/index.html`, find these three lines (currently around line 810-812):

```html
<script src="/static/timeline-text-resize.js"></script>
<script src="/static/timeline-image-resize.js"></script>
<script src="/static/timeline-shape-resize.js"></script>
```

Add the new script immediately before them:

```html
<script src="/static/timeline-edge-resize.js"></script>
<script src="/static/timeline-text-resize.js"></script>
<script src="/static/timeline-image-resize.js"></script>
<script src="/static/timeline-shape-resize.js"></script>
```

- [ ] **Step 6: Update the codebase map**

In `CLAUDE.md`, find the file-structure entry for `timeline-text-resize.js` (in the `static/` tree listing near the other `timeline-*` files) and add a new entry directly above it:

```
  timeline-edge-resize.js # window.TimelineEdgeResize.computeEdgeResize(edge, dx, initialStart, initialEnd, minDuration) -> {start, end} (added 2026-08-01, two-ended overlay resize): pure geometry for a start-edge or end-edge timeline drag — clamps start to >= 0 and duration to >= minDuration, measured from whichever edge is fixed for the drag. Shared by timeline-text-resize.js/timeline-image-resize.js/timeline-shape-resize.js so the drag math isn't tripled across lane types x two edges; guarded dual export (window + module.exports) for node --test, loaded before its three consumers
```

- [ ] **Step 7: Commit**

```bash
git add static/timeline-edge-resize.js tests/js/timeline-edge-resize.test.js static/index.html CLAUDE.md
git commit -m "Add shared pure edge-resize geometry for two-ended overlay lane resize"
```

---

### Task 2: Two-ended resize for TEXT lanes (renders both handles for all lane types)

**Files:**
- Modify: `static/timeline.js:231-246` (`addBlock`)
- Modify: `static/css/components/timeline.css:321-337` (`.timeline-resize-handle`)
- Modify: `static/timeline-text-resize.js`
- Modify: `CLAUDE.md` (codebase map entries for `timeline.js`, `timeline-text-resize.js`)

**Interfaces:**
- Consumes: `TimelineEdgeResize.computeEdgeResize` from Task 1.
- Produces: `addBlock(..., { resizable: true })` now renders two handle divs with classes `timeline-resize-handle timeline-resize-handle-start` and `timeline-resize-handle timeline-resize-handle-end` (consumed by Tasks 3-4, which rely on these exact class names to detect which edge was grabbed).

Note: because `addBlock` is shared by all three lane types, this task's markup/CSS change makes IMAGE BOX and SHAPE lanes visually show a left handle too, before their own wiring (Tasks 3-4) understands it. Within this same plan/session that's fine — the whole plan lands before anyone tries the app; this task's own manual verification only covers TEXT.

- [ ] **Step 1: Render two handles in `addBlock`**

In `static/timeline.js`, replace the `addBlock` function (currently lines 231-246):

```js
  function addBlock(track, left, width, label, selected, onClick, { resizable } = {}) {
    const div = document.createElement("div");
    div.className = "timeline-block" + (selected ? " selected" : "");
    div.style.left = `${left}px`;
    div.style.width = `${Math.max(width, 4)}px`;
    const span = document.createElement("span");
    span.textContent = label;
    div.appendChild(span);
    div.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    if (resizable) {
      const handle = document.createElement("div");
      handle.className = "timeline-resize-handle";
      div.appendChild(handle);
    }
    track.appendChild(div);
  }
```

with:

```js
  function addBlock(track, left, width, label, selected, onClick, { resizable } = {}) {
    const div = document.createElement("div");
    div.className = "timeline-block" + (selected ? " selected" : "");
    div.style.left = `${left}px`;
    div.style.width = `${Math.max(width, 4)}px`;
    const span = document.createElement("span");
    span.textContent = label;
    div.appendChild(span);
    div.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    if (resizable) {
      const startHandle = document.createElement("div");
      startHandle.className = "timeline-resize-handle timeline-resize-handle-start";
      div.appendChild(startHandle);
      const endHandle = document.createElement("div");
      endHandle.className = "timeline-resize-handle timeline-resize-handle-end";
      div.appendChild(endHandle);
    }
    track.appendChild(div);
  }
```

- [ ] **Step 2: Split the handle positioning in CSS**

In `static/css/components/timeline.css`, replace this block (currently around lines 321-337):

```css
/* Right-edge duration resize handle for TEXT-row blocks (static/timeline-text-resize.js).
   Hidden by default, revealed on hover/selected so the block's own click-to-select stays
   the primary interaction. */
.timeline-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  opacity: 0;
}
.timeline-block:hover .timeline-resize-handle,
.timeline-block.selected .timeline-resize-handle {
  opacity: 1;
  background: var(--accent);
}
```

with:

```css
/* Left/right-edge duration resize handles for TEXT/IMAGE BOX/SHAPE overlay lanes
   (static/timeline-text-resize.js, timeline-image-resize.js, timeline-shape-resize.js).
   Hidden by default, revealed on hover/selected so the block's own click-to-select stays
   the primary interaction. Base rule holds shared sizing; -start/-end position each edge. */
.timeline-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  opacity: 0;
}
.timeline-resize-handle-start {
  left: 0;
}
.timeline-resize-handle-end {
  right: 0;
}
.timeline-block:hover .timeline-resize-handle,
.timeline-block.selected .timeline-resize-handle {
  opacity: 1;
  background: var(--accent);
}
```

- [ ] **Step 3: Update `timeline-text-resize.js` for both edges**

Replace the full contents of `static/timeline-text-resize.js`:

```js
// Drag-to-resize for TEXT-row blocks: mousedown on a block's left- or right-edge
// `.timeline-resize-handle-start`/`-end` (rendered by timeline.js's addBlock when
// { resizable: true }) changes that TextBlockLayer's `start` or `end`, clamped to a 0.3s
// minimum duration and start clamped to >= 0 (as of 2026-08-01, two-ended overlay resize,
// via the shared static/timeline-edge-resize.js). Delegated on #row-overlays itself (the
// merged overlay stack; persists across renders; only its children are rebuilt by
// Timeline.render), same pattern as timeline-clip-drag.js. Video box lanes in the same
// container have no resize handle, so this delegation is unaffected by the TEXT/VIDEO BOX
// merge.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-text.js's `renderTextPanel`; depends on window.Timeline (PX_PER_SEC) and
// window.TimelineEdgeResize already existing, so this file must load after timeline.js and
// timeline-edge-resize.js.
(() => {
  const MIN_DURATION = 0.3;

  const row = document.getElementById("row-overlays");

  row.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".timeline-resize-handle");
    if (!handle) return;
    e.stopPropagation();
    const edge = handle.classList.contains("timeline-resize-handle-start") ? "start" : "end";
    const blockEl = handle.closest(".timeline-block");
    const blockId = blockEl.dataset.blockId;
    const block = (project.text_blocks || []).find((b) => b.id === blockId);
    if (!block) return;

    const startX = e.clientX;
    const initialStart = block.start;
    const initialEnd = block.end;
    const px = Timeline.PX_PER_SEC;

    const applyResize = (clientX) => {
      const dx = (clientX - startX) / px;
      return TimelineEdgeResize.computeEdgeResize(edge, dx, initialStart, initialEnd, MIN_DURATION);
    };

    const onMove = (moveEvent) => {
      const { start, end } = applyResize(moveEvent.clientX);
      blockEl.style.left = `${start * px}px`;
      blockEl.style.width = `${(end - start) * px}px`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const { start, end } = applyResize(upEvent.clientX);
      block.start = start;
      block.end = end;
      saveProject();
      renderTimeline();
      if (selected && selected.type === "text" && selected.item && selected.item.id === blockId) {
        renderTextPanel();
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
```

- [ ] **Step 4: Run the frontend test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (all existing tests still pass; this task added no new test file since it's DOM wiring — the geometry itself is covered by Task 1's tests)

- [ ] **Step 5: Manual verification**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`
Open `http://127.0.0.1:8000` in a browser on a throwaway/scratch project (never real project data — the app autosaves on unload). Add a text block, select it in the timeline overlays row, and confirm:
- The right-edge handle still extends/shrinks the block by moving its end (existing behavior unchanged).
- A new left-edge handle appears; dragging it left extends the block backward (start decreases, end unchanged); dragging it right shrinks the block from the front (start increases, end unchanged), stopping at a minimum 0.3s duration.
- Dragging the left handle far left stops at `start = 0`.
- After releasing, the stage preview and TEXT panel's Time tab (start/end fields) reflect the new values.

- [ ] **Step 6: Update the codebase map**

In `CLAUDE.md`, find the `timeline.js` entry in the file-structure tree and update its description of `addBlock`'s resize handle: locate the sentence `(resizable option on addBlock, dataset.blockId set on each block) driven by` (near the top of the `timeline.js` entry) and the entries for `timeline-text-resize.js` under both the file-structure tree and the "Timeline" inventory section. Update `timeline-text-resize.js`'s one-line description to:

```
  timeline-text-resize.js # Drag-to-resize for TEXT-row blocks: mousedown on a block's `.timeline-resize-handle-start` (left) or `-end` (right) handle (rendered by timeline.js's addBlock when { resizable: true }) changes that TextBlockLayer's `start` or `end` via the shared static/timeline-edge-resize.js's computeEdgeResize, clamped to a 0.3s minimum duration and start clamped to >= 0 (as of 2026-08-01, two-ended overlay resize — previously end-edge-only). Delegated on #row-overlays itself (persists across renders; only its children are rebuilt by Timeline.render), same pattern as timeline-clip-drag.js.
```

Also update the "Timeline" section's description of `addBlock` (search for `resizable` within the `static/timeline.js` inventory paragraph) to note it now renders two handles (`timeline-resize-handle-start`/`-end`) when `resizable: true`, instead of one right-edge handle.

- [ ] **Step 7: Commit**

```bash
git add static/timeline.js static/css/components/timeline.css static/timeline-text-resize.js CLAUDE.md
git commit -m "Add two-ended drag-to-resize for TEXT overlay lanes"
```

---

### Task 3: Two-ended resize for IMAGE BOX lanes

**Files:**
- Modify: `static/timeline-image-resize.js`
- Modify: `CLAUDE.md` (codebase map entry for `timeline-image-resize.js`)

**Interfaces:**
- Consumes: `TimelineEdgeResize.computeEdgeResize` from Task 1; handle classes `timeline-resize-handle-start`/`-end` from Task 2.

- [ ] **Step 1: Update `timeline-image-resize.js` for both edges**

Replace the full contents of `static/timeline-image-resize.js`:

```js
// Drag-to-resize for IMAGE BOX lanes in the merged overlays row: mousedown on a block's
// left- or right-edge `.timeline-resize-handle-start`/`-end` (rendered by timeline.js's
// addBlock when { resizable: true }) changes that ImageBoxLayer's `start`/`duration`,
// clamped to a 0.1s minimum duration and start clamped to >= 0 (as of 2026-08-01, two-ended
// overlay resize, via the shared static/timeline-edge-resize.js). Mirrors
// timeline-text-resize.js except it targets project.image_boxes and derives `duration`
// from `end - start` instead of storing `end` directly.
// Delegated on #row-overlays itself (persists across renders; only its children are rebuilt
// by Timeline.render), same pattern as timeline-text-resize.js/timeline-clip-drag.js.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-image-box.js's `ImageBoxPanel.render`; depends on window.Timeline (PX_PER_SEC) and
// window.TimelineEdgeResize already existing, so this file must load after timeline.js and
// timeline-edge-resize.js.
(() => {
  const MIN_DURATION = 0.1;

  const row = document.getElementById("row-overlays");

  row.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".timeline-resize-handle");
    if (!handle) return;
    e.stopPropagation();
    const edge = handle.classList.contains("timeline-resize-handle-start") ? "start" : "end";
    const blockEl = handle.closest(".timeline-block");
    const blockId = blockEl.dataset.blockId;
    const box = (project.image_boxes || []).find((b) => b.id === blockId);
    if (!box) return;

    const startX = e.clientX;
    const initialStart = box.start;
    const initialEnd = box.start + box.duration;
    const px = Timeline.PX_PER_SEC;

    const applyResize = (clientX) => {
      const dx = (clientX - startX) / px;
      return TimelineEdgeResize.computeEdgeResize(edge, dx, initialStart, initialEnd, MIN_DURATION);
    };

    const onMove = (moveEvent) => {
      const { start, end } = applyResize(moveEvent.clientX);
      blockEl.style.left = `${start * px}px`;
      blockEl.style.width = `${(end - start) * px}px`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const { start, end } = applyResize(upEvent.clientX);
      box.start = start;
      box.duration = end - start;
      saveProject();
      renderTimeline();
      if (selected && selected.type === "image-box" && selected.item && selected.item.id === blockId) {
        ImageBoxPanel.render(blockId);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
```

- [ ] **Step 2: Run the frontend test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS

- [ ] **Step 3: Manual verification**

With the dev server running on a throwaway project: add an image box (via the FILES panel's plus icon on an image row), select it in the timeline overlays row, and confirm:
- The right-edge handle still extends/shrinks duration (unchanged).
- The left-edge handle now shifts `start` earlier/later while the box's end stays fixed, clamped to a 0.1s minimum duration and `start >= 0`.
- After releasing, the stage preview and IMAGE BOX panel's Time tab (START/DURATION fields) reflect the new values.

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`, update `timeline-image-resize.js`'s one-line description in the file-structure tree to:

```
  timeline-image-resize.js # Drag-to-resize for IMAGE BOX lanes in the merged overlays row: mousedown on a block's `.timeline-resize-handle-start` (left) or `-end` (right) handle (rendered by timeline.js's addBlock when { resizable: true }) changes that ImageBoxLayer's `start`/`duration` via the shared static/timeline-edge-resize.js's computeEdgeResize, clamped to a 0.1s minimum duration and start clamped to >= 0 (as of 2026-08-01, two-ended overlay resize — previously end-edge-only, duration-only). Mirrors timeline-text-resize.js except it targets project.image_boxes and derives `duration` from `end - start` instead of storing `end` directly.
```

- [ ] **Step 5: Commit**

```bash
git add static/timeline-image-resize.js CLAUDE.md
git commit -m "Add two-ended drag-to-resize for IMAGE BOX overlay lanes"
```

---

### Task 4: Two-ended resize for SHAPE lanes

**Files:**
- Modify: `static/timeline-shape-resize.js`
- Modify: `CLAUDE.md` (codebase map entry for `timeline-shape-resize.js`)

**Interfaces:**
- Consumes: `TimelineEdgeResize.computeEdgeResize` from Task 1; handle classes `timeline-resize-handle-start`/`-end` from Task 2.

- [ ] **Step 1: Update `timeline-shape-resize.js` for both edges**

Replace the full contents of `static/timeline-shape-resize.js`:

```js
// Drag-to-resize for SHAPE lanes in the merged overlays row: mousedown on a block's
// left- or right-edge `.timeline-resize-handle-start`/`-end` (rendered by timeline.js's
// addBlock when { resizable: true }) changes that ShapeLayer's `start`/`duration`, clamped
// to a 0.1s minimum duration and start clamped to >= 0 (as of 2026-08-01, two-ended overlay
// resize, via the shared static/timeline-edge-resize.js). Mirrors
// timeline-image-resize.js exactly, targeting project.shapes instead of
// project.image_boxes.
// Delegated on #row-overlays itself (persists across renders; only its children are rebuilt
// by Timeline.render), same pattern as timeline-image-resize.js/timeline-clip-drag.js.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-shape.js's `ShapePanel.render`; depends on window.Timeline (PX_PER_SEC) and
// window.TimelineEdgeResize already existing, so this file must load after timeline.js and
// timeline-edge-resize.js.
(() => {
  const MIN_DURATION = 0.1;

  const row = document.getElementById("row-overlays");

  row.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".timeline-resize-handle");
    if (!handle) return;
    e.stopPropagation();
    const edge = handle.classList.contains("timeline-resize-handle-start") ? "start" : "end";
    const blockEl = handle.closest(".timeline-block");
    const blockId = blockEl.dataset.blockId;
    const shape = (project.shapes || []).find((s) => s.id === blockId);
    if (!shape) return;

    const startX = e.clientX;
    const initialStart = shape.start;
    const initialEnd = shape.start + shape.duration;
    const px = Timeline.PX_PER_SEC;

    const applyResize = (clientX) => {
      const dx = (clientX - startX) / px;
      return TimelineEdgeResize.computeEdgeResize(edge, dx, initialStart, initialEnd, MIN_DURATION);
    };

    const onMove = (moveEvent) => {
      const { start, end } = applyResize(moveEvent.clientX);
      blockEl.style.left = `${start * px}px`;
      blockEl.style.width = `${(end - start) * px}px`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const { start, end } = applyResize(upEvent.clientX);
      shape.start = start;
      shape.duration = end - start;
      saveProject();
      renderTimeline();
      if (selected && selected.type === "shape" && selected.item && selected.item.id === blockId) {
        ShapePanel.render(blockId);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
```

- [ ] **Step 2: Run the frontend test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS

- [ ] **Step 3: Manual verification**

With the dev server running on a throwaway project: draw a shape with the Shape tool, select it in the timeline overlays row, and confirm:
- The right-edge handle still extends/shrinks duration (unchanged).
- The left-edge handle now shifts `start` earlier/later while the shape's end stays fixed, clamped to a 0.1s minimum duration and `start >= 0`.
- After releasing, the stage preview and SHAPE panel's Time tab (START/DURATION fields) reflect the new values.
- Also spot-check a shape assigned as a video box's mask (via the timeline's MASK sub-lane): confirm the mask shape's own top-level lane doesn't exist (unchanged — masks stay inside their box's accordion, not a top-level SHAPE lane) and that this task hasn't affected `timeline-mask-accordion.js`'s rendering.

- [ ] **Step 4: Update the codebase map**

In `CLAUDE.md`, update `timeline-shape-resize.js`'s one-line description in the file-structure tree to:

```
  timeline-shape-resize.js # Drag-to-resize for SHAPE lanes in the merged overlays row: mousedown on a block's `.timeline-resize-handle-start` (left) or `-end` (right) handle (rendered by timeline.js's addBlock when { resizable: true }) changes that ShapeLayer's `start`/`duration` via the shared static/timeline-edge-resize.js's computeEdgeResize, clamped to a 0.1s minimum duration and start clamped to >= 0 (as of 2026-08-01, two-ended overlay resize — previously end-edge-only, duration-only). Mirrors timeline-image-resize.js exactly, targeting project.shapes instead of project.image_boxes.
```

- [ ] **Step 5: Run the full test suite**

Run: `.venv/Scripts/python -m pytest -q`
Expected: PASS (no backend files touched by this plan, but confirms nothing else broke)

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add static/timeline-shape-resize.js CLAUDE.md
git commit -m "Add two-ended drag-to-resize for SHAPE overlay lanes"
```
