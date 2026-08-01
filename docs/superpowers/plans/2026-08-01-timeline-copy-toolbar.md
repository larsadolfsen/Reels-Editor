# Timeline Overlay-Lane Copy Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hover-reveal toolbar (triangle pointing down at the block, one Copy icon button) above every `#row-overlays` lane (text block / video box / image box / shape) that duplicates that layer in place.

**Architecture:** A pure `OverlayCopy.duplicate(project, entry, deps)` function (new file, dependency-injected against `OverlayLayers` for testability, mirroring `style-target-text.js`'s injectable-`deps` convention) does the clone + z-order placement. A thin DOM-wiring file (`timeline-overlay-copy-toolbar.js`, mirroring `timeline-overlay-layer-drag.js`) builds the toolbar markup per lane and calls the pure function on click. `timeline.js` wires the two together in its existing `renderOverlaysRow` loop.

**Tech Stack:** Vanilla JS (no framework, no build step — see project CLAUDE.md conventions), `node --test` for JS unit tests, plain CSS with the project's existing design tokens.

## Global Constraints

- No hand-inlined `<svg>` markup anywhere — icons must go through `UI.icon(name)` (`static/ui-icon.js`); `tests/js/no-raw-svg.test.js` enforces this.
- No inline `style="..."` attributes in `static/index.html` or JS-rendered markup — styling lives in `static/css/**` component files.
- Every `static/*.js` file opens with a 1-2 line header comment stating its purpose/exposed API/key dependencies.
- Reusable JS logic is one function/component per file — never grouped into a shared catch-all file.
- Scope is `#row-overlays` lanes only (text block, video box, image box, shape) — not MAIN clips, AUDIO, or CAPTIONS.
- The duplicate is placed at the identical position/time, one z-index step in front of (above) the original, and is auto-selected immediately after creation.
- A duplicated text block also gets its own cloned `TextPreset` (new id) rather than sharing the original's — see the design spec's "Duplicate semantics" section.

---

### Task 1: Add the `copy` icon to `UI.icon`

**Files:**
- Modify: `static/ui-icon.js`
- Test: `tests/js/ui-icon.test.js`

**Interfaces:**
- Produces: `UI.icon("copy", { size })` — usable by Task 3's toolbar button.

- [ ] **Step 1: Write the failing test**

Add this test to `tests/js/ui-icon.test.js`, right after the existing `"UI.icon embeds the clapperboard icon's path data"` test (around line 29):

```js
test("UI.icon embeds the copy icon's path data", () => {
  assert.match(global.UI.icon("copy"), /<rect width="14" height="14" x="8" y="8" rx="2" ry="2"\/>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/js/ui-icon.test.js`
Expected: FAIL — the new test throws `unknown icon` (or similar) since `"copy"` isn't in `ICON_PATHS` yet.

- [ ] **Step 3: Add the icon entry**

In `static/ui-icon.js`, add a `copy` key to the `ICON_PATHS` object (alongside the other entries, e.g. right after the `scissors` line):

```js
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/js/ui-icon.test.js`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add static/ui-icon.js tests/js/ui-icon.test.js
git commit -m "Add copy icon to UI.icon for the overlay-lane copy toolbar"
```

---

### Task 2: Pure `OverlayCopy.duplicate` helper

**Files:**
- Create: `static/overlay-copy.js`
- Test: `tests/js/overlay-copy.test.js`

**Interfaces:**
- Consumes: `OverlayLayers.mergedEntries(project) -> [{id, kind, item}]` and `OverlayLayers.renumber(entries) -> void` (both from `static/timeline-overlay-layers.js`, already in the codebase — see `tests/js/timeline-overlay-layers.test.js` for their exact behavior). `entry` objects passed in have the same shape: `{ id, kind: "text"|"video_box"|"image_box"|"shape", item }`.
- Produces: `window.OverlayCopy.duplicate(project, entry, deps = {}) -> newItem`, where `deps.overlayLayers` is an injectable `{ mergedEntries, renumber }` object (defaults to `window.OverlayLayers` in the browser). Also `module.exports = { duplicate }` for `node --test`. Task 3 consumes `OverlayCopy.duplicate` via the `window.OverlayCopy` global (no injected `deps`, so it falls back to `window.OverlayLayers`).

- [ ] **Step 1: Write the failing tests**

Create `tests/js/overlay-copy.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const OverlayLayers = require("../../static/timeline-overlay-layers.js");
const { duplicate } = require("../../static/overlay-copy.js");

function baseProject() {
  return {
    text_blocks: [{ id: "t1", preset_id: "p1", heading: "Hi", start: 1, end: 3, z_index: 0 }],
    text_presets: { p1: { id: "p1", name: "", font: "Public Sans", size_px: 96, color: "#FFFFFF" } },
    video_boxes: [{ id: "v1", file_path: "/a.mp4", x: 10, y: 20, z_index: 1 }],
    image_boxes: [{ id: "i1", file_path: "/b.jpg", x: 5, y: 5, z_index: -1 }],
    shapes: [{ id: "s1", x: 0, y: 0, width: 300, height: 300, z_index: 2 }],
  };
}

const deps = { overlayLayers: OverlayLayers };

test("duplicate clones a video_box with a new id, preserving other fields", () => {
  const project = baseProject();
  const entry = { id: "v1", kind: "video_box", item: project.video_boxes[0] };
  const newItem = duplicate(project, entry, deps);

  assert.strictEqual(project.video_boxes.length, 2);
  assert.notStrictEqual(newItem.id, "v1");
  assert.strictEqual(newItem.file_path, "/a.mp4");
  assert.strictEqual(newItem.x, 10);
  assert.strictEqual(newItem.y, 20);
});

test("duplicate clones an image_box with a new id, preserving other fields", () => {
  const project = baseProject();
  const entry = { id: "i1", kind: "image_box", item: project.image_boxes[0] };
  const newItem = duplicate(project, entry, deps);

  assert.strictEqual(project.image_boxes.length, 2);
  assert.notStrictEqual(newItem.id, "i1");
  assert.strictEqual(newItem.file_path, "/b.jpg");
});

test("duplicate clones a shape with a new id, preserving other fields", () => {
  const project = baseProject();
  const entry = { id: "s1", kind: "shape", item: project.shapes[0] };
  const newItem = duplicate(project, entry, deps);

  assert.strictEqual(project.shapes.length, 2);
  assert.notStrictEqual(newItem.id, "s1");
  assert.strictEqual(newItem.width, 300);
  assert.strictEqual(newItem.height, 300);
});

test("duplicate clones a text block AND its own TextPreset under a new id", () => {
  const project = baseProject();
  const entry = { id: "t1", kind: "text", item: project.text_blocks[0] };
  const newItem = duplicate(project, entry, deps);

  assert.strictEqual(project.text_blocks.length, 2);
  assert.notStrictEqual(newItem.id, "t1");
  assert.strictEqual(newItem.heading, "Hi");
  assert.notStrictEqual(newItem.preset_id, "p1");

  const newPreset = project.text_presets[newItem.preset_id];
  assert.ok(newPreset, "new preset should exist under the new preset_id");
  assert.strictEqual(newPreset.font, "Public Sans");
  assert.strictEqual(newPreset.size_px, 96);
  // original preset is untouched
  assert.strictEqual(project.text_presets.p1.font, "Public Sans");
});

test("duplicate places the new layer immediately in front of (above) the original", () => {
  const project = baseProject();
  const entry = { id: "v1", kind: "video_box", item: project.video_boxes[0] };
  const newItem = duplicate(project, entry, deps);

  const entries = OverlayLayers.mergedEntries(project);
  const newIndex = entries.findIndex((e) => e.id === newItem.id);
  const originalIndex = entries.findIndex((e) => e.id === "v1");
  assert.strictEqual(newIndex, originalIndex - 1, "duplicate should sit one position in front of the original");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/js/overlay-copy.test.js`
Expected: FAIL — `Cannot find module '../../static/overlay-copy.js'`

- [ ] **Step 3: Write the implementation**

Create `static/overlay-copy.js`:

```js
// Pure duplicate-in-place helper for the timeline's unified overlay stack (text block/video
// box/image box/shape lanes in #row-overlays, static/timeline-overlay-copy-toolbar.js's Copy
// button). No DOM/fetch — mutates the given project's arrays directly (matching
// timeline-slice.js's sliceClip/sliceVideoBox convention) and returns the newly created layer
// object. `deps.overlayLayers` (default window.OverlayLayers) is an injectable
// { mergedEntries, renumber } pair, mirroring style-target-text.js's injectable-deps pattern so
// this is unit-testable outside a browser. Exposes window.OverlayCopy.duplicate, plus
// module.exports for node --test.
(() => {
  function newId() {
    return crypto.randomUUID().replaceAll("-", "");
  }

  // Duplicates `entry` (one of OverlayLayers.mergedEntries(project)'s shape:
  // { id, kind, item }) into `project`, stacked one z-index step in front of the original, and
  // returns the new layer object. For a text block, also deep-clones its TextPreset under a new
  // id (project.text_presets[id]) and repoints the copy's preset_id at the clone — a text
  // block's preset is always 1:1 (see panel-text.js's addTextBlock/ensureTextPreset), so sharing
  // the original's preset would let restyling the copy silently restyle the original too.
  function duplicate(project, entry, deps = {}) {
    const OverlayLayers = deps.overlayLayers || (typeof window !== "undefined" ? window.OverlayLayers : undefined);
    const id = newId();
    let newItem;

    if (entry.kind === "text") {
      const presetId = newId();
      project.text_presets[presetId] = { ...project.text_presets[entry.item.preset_id], id: presetId };
      newItem = { ...entry.item, id, preset_id: presetId };
      project.text_blocks.push(newItem);
    } else if (entry.kind === "video_box") {
      newItem = { ...entry.item, id };
      project.video_boxes.push(newItem);
    } else if (entry.kind === "image_box") {
      newItem = { ...entry.item, id };
      project.image_boxes.push(newItem);
    } else {
      newItem = { ...entry.item, id };
      project.shapes.push(newItem);
    }

    // Place the new entry immediately in front of (one index before) the original, then
    // renumber so the persisted z_index reflects that order.
    const entries = OverlayLayers.mergedEntries(project);
    const newIndex = entries.findIndex((e) => e.id === id);
    const [newEntry] = entries.splice(newIndex, 1);
    const originalIndex = entries.findIndex((e) => e.id === entry.id);
    entries.splice(originalIndex, 0, newEntry);
    OverlayLayers.renumber(entries);

    return newItem;
  }

  const api = { duplicate };
  if (typeof window !== "undefined") window.OverlayCopy = api;
  if (typeof module !== "undefined") module.exports = api;
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/js/overlay-copy.test.js`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Run the full JS suite to check for regressions**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add static/overlay-copy.js tests/js/overlay-copy.test.js
git commit -m "Add pure OverlayCopy.duplicate helper for overlay-lane layers"
```

---

### Task 3: Hover toolbar DOM wiring + CSS + timeline integration

**Files:**
- Create: `static/timeline-overlay-copy-toolbar.js`
- Modify: `static/timeline.js` (wire into `renderOverlaysRow`)
- Modify: `static/index.html` (two new `<script>` tags)
- Modify: `static/css/components/timeline.css` (toolbar + triangle styling)

**Interfaces:**
- Consumes: `OverlayCopy.duplicate(project, entry)` (Task 2), `UI.icon("copy", {size})` (Task 1), the page-global `project`/`saveProject`/`onTimelineSelect` (from `editor.js`/`panel-nav.js`, resolved at call time — same pattern `timeline-slice.js` documents), and `VideoBoxPreview.render`/`ImageBoxPreview.render`/`ShapePreview.render` (existing globals).
- Produces: `window.OverlayCopyToolbar.attach(blockDiv, entry)` — called once per lane from `timeline.js`'s `renderOverlaysRow`.

This task has no automated test — it's thin DOM glue with no pure logic of its own (the project's stated-gap convention for this class of file, e.g. `style-panel-host.js`/`timeline-overlay-layer-drag.js`). It's verified by manual browser check in Step 5.

- [ ] **Step 1: Create the DOM wiring file**

Create `static/timeline-overlay-copy-toolbar.js`:

```js
// Hover-reveal copy toolbar for #row-overlays lanes (text block/video box/image box/shape):
// a small popover above the lane's .timeline-block with a triangle pointing down at it and one
// Copy icon button, mirroring the look of the playhead-handle's .slice-btn. Clicking Copy
// duplicates that layer via OverlayCopy.duplicate (static/overlay-copy.js), saves, and selects
// the new layer. Reaches into editor.js's project/saveProject/onTimelineSelect globals and
// VideoBoxPreview/ImageBoxPreview/ShapePreview globals at call time — same documented approach
// as static/timeline-slice.js. Exposes window.OverlayCopyToolbar.attach(blockDiv, entry), called
// from static/timeline.js's renderOverlaysRow.
(() => {
  const KIND_TO_SELECT_TYPE = {
    text: "text",
    video_box: "video-box",
    image_box: "image-box",
    shape: "shape",
  };

  // Explicit stage re-render after onTimelineSelect for kinds whose panel render doesn't already
  // repaint the stage itself — text's renderTextPanel() calls Preview.renderText() internally, so
  // it's excluded (same distinction timeline-slice.js/stage-shape-draw.js/panel-media.js draw
  // between text and video-box/image-box/shape).
  function repaintStage(kind) {
    const t = Preview.currentTimelineTime();
    if (kind === "video_box") VideoBoxPreview.render(project.video_boxes, t);
    else if (kind === "image_box") ImageBoxPreview.render(project.image_boxes, t);
    else if (kind === "shape") ShapePreview.render(project.shapes, t);
  }

  function attach(blockDiv, entry) {
    const toolbar = document.createElement("div");
    toolbar.className = "overlay-copy-toolbar";

    const btn = document.createElement("span");
    btn.className = "overlay-copy-icon";
    btn.title = "Copy layer";
    btn.innerHTML = UI.icon("copy", { size: 14 });
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const newItem = OverlayCopy.duplicate(project, entry);
      await saveProject();
      await onTimelineSelect({ type: KIND_TO_SELECT_TYPE[entry.kind], item: newItem });
      repaintStage(entry.kind);
    });

    toolbar.appendChild(btn);
    blockDiv.appendChild(toolbar);
  }

  if (typeof window !== "undefined") window.OverlayCopyToolbar = { attach };
})();
```

- [ ] **Step 2: Add the toolbar CSS**

In `static/css/components/timeline.css`, add this block after the `#playhead-grip:active { cursor: grabbing; }` rule (around line 70), reusing the same visual language as `.slice-btn`/`.slice-icon-trigger` above it:

```css
.overlay-copy-toolbar {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  z-index: 6;
  display: flex;
  background: var(--surface);
  border: var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-chip);
  padding: var(--space-1);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.1s;
}
.timeline-block:hover .overlay-copy-toolbar {
  opacity: 1;
  pointer-events: auto;
}
.overlay-copy-toolbar::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border: 5px solid transparent;
  border-top-color: var(--surface);
}

.overlay-copy-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.overlay-copy-icon:hover { background: var(--bg-2); }
```

- [ ] **Step 3: Wire the toolbar into `renderOverlaysRow`**

In `static/timeline.js`, the `renderOverlaysRow` function's per-entry loop ends its `if (entry.kind === "text") { ... } else if ... } else { ... }` chain (each branch ending with `laneTrack.lastElementChild.dataset.blockId = X.id;`) right before the loop's closing brace. Add one line right after that whole `if/else` chain (i.e. after the final `laneTrack.lastElementChild.dataset.blockId = s.id;` line, still inside the `for (const entry of entries)` loop, before its closing `}`):

```js
      OverlayCopyToolbar.attach(laneTrack.lastElementChild, entry);
```

- [ ] **Step 4: Add the two script tags to `index.html`**

In `static/index.html`, insert one new `<script>` tag right after `<script src="/static/timeline-overlay-layers.js"></script>` (so `OverlayCopy` loads before `timeline.js`, though load order doesn't strictly matter since both are call-time globals):

```html
<script src="/static/timeline-overlay-layers.js"></script>
<script src="/static/overlay-copy.js"></script>
<script src="/static/timeline.js"></script>
```

And insert the toolbar wiring file's script tag right after `<script src="/static/timeline-overlay-time-drag.js"></script>`:

```html
<script src="/static/timeline-overlay-time-drag.js"></script>
<script src="/static/timeline-overlay-copy-toolbar.js"></script>
<script src="/static/undo-history.js"></script>
```

- [ ] **Step 5: Manual verification in the browser**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`

Open `http://127.0.0.1:8000` on a throwaway test project (never real project data — live-verify only on a disposable project). For each of a text block, a video box, an image box, and a shape:

1. Add one to the timeline (via the FILES panel's hover-add icons for video/image, the TEXT/SHAPE rail tools for text/shape).
2. Hover its lane block in the timeline's overlay row — confirm the toolbar appears above the block with a downward triangle pointing at it, and one Copy icon.
3. Click Copy — confirm: a new identical layer appears at the same position/time; on the timeline it now shows as a second lane; its panel opens (auto-selected); on the stage it renders one layer in front of (visually on top of) the original where they overlap.
4. For the text-block case specifically: edit the copy's font color in its panel, then reselect the original and confirm the original's color is unchanged (proves the cloned preset is independent).

- [ ] **Step 6: Run the full JS test suite**

Run: `node --test "tests/js/**/*.test.js"`
Expected: PASS (no regressions — Task 3 added no new test files, but this confirms Tasks 1-2 still pass alongside the new files)

- [ ] **Step 7: Commit**

```bash
git add static/timeline-overlay-copy-toolbar.js static/timeline.js static/index.html static/css/components/timeline.css
git commit -m "Add hover-reveal copy toolbar to timeline overlay lanes"
```

---

### Task 4: Update the codebase map

**Files:**
- Modify: `CLAUDE.md` (project root)

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Add the new files to the File structure tree**

In `CLAUDE.md`'s `static/` file-structure tree, add entries for `overlay-copy.js` and `timeline-overlay-copy-toolbar.js` near the other `timeline-overlay-*`/`overlay-*` entries (alongside `timeline-overlay-layers.js`/`timeline-overlay-layer-drag.js`/`timeline-overlay-time-drag.js`), one line each summarizing their purpose per the header comments written in Task 2/3.

- [ ] **Step 2: Update the "Unified overlay layer stack (z-order)" inventory section**

Add a short paragraph noting the copy toolbar: `static/overlay-copy.js` (pure duplicate helper) + `static/timeline-overlay-copy-toolbar.js` (hover toolbar DOM wiring, attached per lane from `timeline.js`'s `renderOverlaysRow`) — duplicates a text block/video box/image box/shape in place, one z-index step above the original, auto-selected. Mention the `copy` icon addition to `ui-icon.js`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Update codebase map for the timeline overlay-lane copy toolbar"
```
