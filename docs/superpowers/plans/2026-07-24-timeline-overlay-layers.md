# Unified Overlay Layer Stack on the Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the TEXT row and VIDEO BOX row into one z_index-ordered stack of per-item lanes on the timeline, each with a hover-reveal drag handle to reorder (changing `z_index`), and remove the separate Layers panel entirely.

**Architecture:** No data model changes — `TextBlockLayer.z_index`/`VideoBoxLayer.z_index` already exist and already drive stacking order in the preview. A small pure helper module (`static/timeline-overlay-layers.js`) merges text blocks + video boxes into one z_index-sorted list and renumbers `z_index` after a reorder — the exact logic the removed Layers panel (`static/panel-layers.js`) already used, just relocated. `static/timeline.js`'s TEXT/VIDEO BOX rows are replaced by one merged row (`#row-overlays`/`#label-overlays`) rendering one 44px lane per item, and a new drag gesture (`static/timeline-overlay-layer-drag.js`) reorders lanes via a hover-reveal handle in the label column.

**Tech Stack:** Vanilla JS + DOM (frontend only, no build step, no new dependencies, no backend changes).

## Global Constraints

- Participates in the stack: every `TextBlockLayer` and every `VideoBoxLayer`, mixed together and freely interleaved by `z_index` (matches the removed Layers panel's exact granularity — confirmed with the user).
- Does NOT participate: the VIDEO row (main clip sequence) and the AUDIO row — always fixed, never draggable.
- Unchanged: the CAPTIONS row stays exactly as-is — its own fixed row, not part of the merged stack (matches the Layers panel's existing scope, which never included captions).
- Ordering convention: top of the stack = highest `z_index` = frontmost (matches `panel-layers.js`'s existing `mergedEntries`/`renumber` convention exactly).
- Lane height: `44px` per item (matches the existing TEXT/CAPTIONS row height).
- No overlap/drop validity check for reordering — every item always has its own lane regardless of time overlap; dragging is a pure list reorder (unlike a design considered earlier in this session for TEXT-only lanes, which is superseded — see `docs/superpowers/specs/2026-07-24-timeline-overlay-layers-design.md`).
- Every new/edited `static/*.js` file gets a 2-3 line header comment per this repo's convention (see any existing file for the pattern).
- No inline `style="..."` attributes in `static/index.html` — height values that vary at runtime are set via JS (`el.style.height = ...`), the existing convention for computed positions.
- This repo has no JS test framework — new pure JS helpers are written framework-free and verified manually via the browser devtools console, matching the existing convention for `static/timeline-snap.js` / `static/undo-history.js`.

---

### Task 1: `static/timeline-overlay-layers.js` — pure merge/renumber helpers

**Files:**
- Create: `static/timeline-overlay-layers.js`
- Modify: `static/index.html` (script tag)

**Interfaces:**
- Consumes: `project.text_blocks` (each `{ id, z_index, ... }`), `project.video_boxes` (each `{ id, z_index, ... }`).
- Produces: `window.OverlayLayers.mergedEntries(project) -> [{ id, kind: "text" | "video_box", item }]` (sorted by `z_index` descending), `window.OverlayLayers.renumber(entries) -> void` (mutates each entry's `item.z_index` to match array order). Task 2 and Task 3 both depend on these exact names/signatures.

- [ ] **Step 1: Write the implementation**

Create `static/timeline-overlay-layers.js`:

```javascript
// Pure helpers for the timeline's unified overlay z-order stack: merges every text block +
// video box into one list ordered by z_index descending (top = frontmost, mirrors the
// removed Layers panel's convention), and renumbers z_index after a drag reorder. No
// DOM/fetch. Consumed by static/timeline.js (rendering) and
// static/timeline-overlay-layer-drag.js (drag-to-reorder).
// Exposes window.OverlayLayers.{mergedEntries, renumber}.
window.OverlayLayers = (() => {
  function mergedEntries(project) {
    const text = (project.text_blocks || []).map((b) => ({ id: b.id, kind: "text", item: b }));
    const boxes = (project.video_boxes || []).map((v) => ({ id: v.id, kind: "video_box", item: v }));
    return [...text, ...boxes].sort((a, b) => b.item.z_index - a.item.z_index);
  }

  // `entries` is already in the desired top-to-bottom (front-to-back) order; assign z_index
  // by position so a drag-drop reorder becomes the new persisted stacking order.
  function renumber(entries) {
    const n = entries.length;
    entries.forEach((e, i) => { e.item.z_index = n - 1 - i; });
  }

  return { mergedEntries, renumber };
})();
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, add this line immediately before the existing `<script src="/static/timeline.js"></script>` line:

```html
<script src="/static/timeline-overlay-layers.js"></script>
```

- [ ] **Step 3: Manually verify the pure functions**

Run: `.venv/Scripts/python -m uvicorn app.main:app --reload`, open `http://127.0.0.1:8000`, open devtools console, and type:

```js
const p = { text_blocks: [{id: "t1", z_index: 0}], video_boxes: [{id: "v1", z_index: 1}] };
OverlayLayers.mergedEntries(p).map(e => e.id)
// -> ["v1", "t1"]  (v1 has the higher z_index, so it sorts first/frontmost)
const entries = OverlayLayers.mergedEntries(p);
OverlayLayers.renumber(entries);
p.video_boxes[0].z_index
// -> 1
p.text_blocks[0].z_index
// -> 0
```

- [ ] **Step 4: Commit**

```bash
git add static/timeline-overlay-layers.js static/index.html
git commit -m "feat: add pure merge/renumber helpers for the unified overlay layer stack"
```

---

### Task 2: Merge TEXT + VIDEO BOX rows into one overlay stack (`static/timeline.js`, `static/index.html`, `static/css/components/timeline.css`, `static/timeline-text-resize.js`)

**Files:**
- Modify: `static/timeline.js` (constants, `render()`'s TEXT/VIDEO BOX loops and `setRowVisible` calls, new `renderOverlaysRow` function)
- Modify: `static/index.html` (label/row markup)
- Modify: `static/css/components/timeline.css`
- Modify: `static/timeline-text-resize.js` (delegation target)

**Interfaces:**
- Consumes: `OverlayLayers.mergedEntries` (Task 1), the existing `addBlock`/`clearTrack`/`videoBoxEnd`/`setRowVisible` helpers already in `static/timeline.js`.
- Produces: the TEXT row and VIDEO BOX row are gone, replaced by `#row-overlays`/`#label-overlays` rendering one lane per item — the actual fix for the original overlap bug, now generalized across both item types. Task 3 (drag) relies on `#label-overlays` containing `.overlay-lane-label` children with `dataset.entryId`.

- [ ] **Step 1: Replace the label markup**

In `static/index.html`, change:

```html
            <div class="row-label" id="ruler-label"></div>
            <div class="row-label" id="label-text">TEXT</div>
            <div class="row-label" id="label-captions">CAPTIONS</div>
            <div class="row-label" id="label-videobox">VIDEO BOX</div>
            <div class="row-label" id="label-video">VIDEO</div>
            <div class="row-label" id="label-audio">AUDIO</div>
```

to:

```html
            <div class="row-label" id="ruler-label"></div>
            <div id="label-overlays"></div>
            <div class="row-label" id="label-captions">CAPTIONS</div>
            <div class="row-label" id="label-video">VIDEO</div>
            <div class="row-label" id="label-audio">AUDIO</div>
```

- [ ] **Step 2: Replace the row markup**

In `static/index.html`, change:

```html
              <div class="timeline-row" data-row="text">
                <div class="row-track" id="row-text"></div>
              </div>
              <div class="timeline-row" data-row="captions">
                <div class="row-track" id="row-captions"></div>
              </div>
              <div class="timeline-row" data-row="videobox">
                <div class="row-track" id="row-videobox"></div>
              </div>
              <div class="timeline-row" data-row="video">
                <div class="row-track" id="row-video"></div>
              </div>
```

to:

```html
              <div class="timeline-row" data-row="overlays">
                <div id="row-overlays"></div>
              </div>
              <div class="timeline-row" data-row="captions">
                <div class="row-track" id="row-captions"></div>
              </div>
              <div class="timeline-row" data-row="video">
                <div class="row-track" id="row-video"></div>
              </div>
```

- [ ] **Step 3: Update CSS — label column**

In `static/css/components/timeline.css`, change:

```css
#label-text { height: 44px; }
#label-captions { height: 44px; }
#label-video { height: 56px; }
#label-audio { height: 40px; }
```

to:

```css
#label-captions { height: 44px; }
#label-video { height: 56px; }
#label-audio { height: 40px; }

/* Unified overlay z-order stack: #label-overlays/#row-overlays stack one 44px lane per
   text block + video box (static/timeline.js's renderOverlaysRow), height set inline per
   render from lane count. */
#label-overlays {
  display: flex;
  flex-direction: column;
}
#label-overlays[hidden] { display: none; }
.overlay-lane-label {
  height: 44px;
  flex-shrink: 0;
  position: relative;
  padding-left: 12px;
  display: flex;
  align-items: center;
}
```

- [ ] **Step 4: Update CSS — row column**

In `static/css/components/timeline.css`, change:

```css
.timeline-row[data-row="text"] { height: 44px; }
.timeline-row[data-row="captions"] { height: 44px; }
.timeline-row[data-row="video"] { height: 56px; }
.timeline-row[data-row="audio"] { height: 40px; }
```

to:

```css
.timeline-row[data-row="captions"] { height: 44px; }
.timeline-row[data-row="video"] { height: 56px; }
.timeline-row[data-row="audio"] { height: 40px; }

#row-overlays {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
.overlay-lane-track {
  height: 44px;
  flex-shrink: 0;
}
```

- [ ] **Step 5: Add the `LANE_HEIGHT` constant**

In `static/timeline.js`, change:

```javascript
  const LABEL_WIDTH = 88;
  const MIN_PX_PER_SEC_FLOOR = 60; // fallback if the scroll container can't be measured yet
```

to:

```javascript
  const LABEL_WIDTH = 88;
  const LANE_HEIGHT = 44; // px per overlay-stack lane, matches CAPTIONS row height
  const MIN_PX_PER_SEC_FLOOR = 60; // fallback if the scroll container can't be measured yet
```

- [ ] **Step 6: Add `renderOverlaysRow` and call it from `render()`**

In `static/timeline.js`, change:

```javascript
    const textTrack = clearTrack("row-text");
    for (const b of project.text_blocks || []) {
      const isSel = !!selected && selected.type === "text" && !!selected.item && selected.item.id === b.id;
      addBlock(textTrack, b.start * px, (b.end - b.start) * px, b.heading, isSel,
        () => onSelect({ type: "text", item: b }), { resizable: true });
      textTrack.lastElementChild.dataset.blockId = b.id;
    }

    const videoBoxTrack = clearTrack("row-videobox");
    for (const v of project.video_boxes || []) {
      const isSel = !!selected && selected.type === "video-box" && !!selected.item && selected.item.id === v.id;
      const name = v.file_path.split(/[\\/]/).pop();
      addBlock(videoBoxTrack, v.start * px, (videoBoxEnd(v) - v.start) * px, name, isSel,
        () => onSelect({ type: "video-box", item: v }));
      const el = videoBoxTrack.lastElementChild;
      el.draggable = true;
      el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/video-box-id", v.id));
    }
```

to:

```javascript
    renderOverlaysRow(project, px, selected, onSelect);
```

Then add the `renderOverlaysRow` function, placed right before `render()` (so it's in scope):

```javascript
  // Merges TEXT blocks + VIDEO BOX layers into one z_index-ordered stack of 44px lanes
  // inside #row-overlays (top = highest z_index = frontmost), replacing the old separate
  // TEXT/VIDEO BOX rows. Each lane still renders its item exactly as before (time-positioned
  // block, resize handle for text, drag-to-timeline for video boxes) — only the vertical
  // grouping/order changed. #label-overlays gets one "TEXT"/"VIDEO BOX" label per lane,
  // height-matched to its lane. Reordering (drag handle) is wired in
  // static/timeline-overlay-layer-drag.js via OverlayLayers.mergedEntries/renumber.
  function renderOverlaysRow(project, px, selected, onSelect) {
    const entries = OverlayLayers.mergedEntries(project);
    const rowEl = document.querySelector('.timeline-row[data-row="overlays"]');
    const totalHeight = `${Math.max(entries.length, 1) * LANE_HEIGHT}px`;
    rowEl.style.height = totalHeight;
    document.getElementById("label-overlays").style.height = totalHeight;

    const row = clearTrack("row-overlays");
    const labelContainer = clearTrack("label-overlays");

    for (const entry of entries) {
      const laneLabel = document.createElement("div");
      laneLabel.className = "row-label overlay-lane-label";
      laneLabel.dataset.entryId = entry.id;
      laneLabel.innerHTML = `<span class="overlay-lane-handle"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg></span>`;
      const text = document.createElement("span");
      text.textContent = entry.kind === "text" ? "TEXT" : "VIDEO BOX";
      laneLabel.appendChild(text);
      labelContainer.appendChild(laneLabel);

      const laneTrack = document.createElement("div");
      laneTrack.className = "row-track overlay-lane-track";
      row.appendChild(laneTrack);

      if (entry.kind === "text") {
        const b = entry.item;
        const isSel = !!selected && selected.type === "text" && !!selected.item && selected.item.id === b.id;
        addBlock(laneTrack, b.start * px, (b.end - b.start) * px, b.heading, isSel,
          () => onSelect({ type: "text", item: b }), { resizable: true });
        laneTrack.lastElementChild.dataset.blockId = b.id;
      } else {
        const v = entry.item;
        const isSel = !!selected && selected.type === "video-box" && !!selected.item && selected.item.id === v.id;
        const name = v.file_path.split(/[\\/]/).pop();
        addBlock(laneTrack, v.start * px, (videoBoxEnd(v) - v.start) * px, name, isSel,
          () => onSelect({ type: "video-box", item: v }));
        const el = laneTrack.lastElementChild;
        el.draggable = true;
        el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/video-box-id", v.id));
      }
    }
  }
```

- [ ] **Step 7: Update `setRowVisible` calls**

In `static/timeline.js`, change:

```javascript
    setRowVisible("text", (project.text_blocks || []).length > 0);
    setRowVisible("captions", groups.length > 0);
    setRowVisible("videobox", (project.video_boxes || []).length > 0);
    setRowVisible("audio", hasAudioContent);
```

to:

```javascript
    setRowVisible("overlays", (project.text_blocks || []).length > 0 || (project.video_boxes || []).length > 0);
    setRowVisible("captions", groups.length > 0);
    setRowVisible("audio", hasAudioContent);
```

- [ ] **Step 8: Point the TEXT resize gesture at the merged container**

In `static/timeline-text-resize.js`, change:

```javascript
// Drag-to-resize for TEXT-row blocks: mousedown on a block's right-edge
// `.timeline-resize-handle` (rendered by timeline.js's addBlock when { resizable: true })
// changes that TextBlockLayer's `end`, extending or shrinking its duration, clamped to a
// 0.3s minimum. Delegated on #row-text itself (persists across renders; only its children
// are rebuilt by Timeline.render), same pattern as timeline-clip-drag.js.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-text.js's `renderTextPanel`; depends on window.Timeline (PX_PER_SEC) already
// existing, so this file must load after timeline.js.
(() => {
  const MIN_DURATION = 0.3;

  const row = document.getElementById("row-text");
```

to:

```javascript
// Drag-to-resize for TEXT-row blocks: mousedown on a block's right-edge
// `.timeline-resize-handle` (rendered by timeline.js's addBlock when { resizable: true })
// changes that TextBlockLayer's `end`, extending or shrinking its duration, clamped to a
// 0.3s minimum. Delegated on #row-overlays itself (the merged overlay stack; persists across
// renders; only its children are rebuilt by Timeline.render), same pattern as
// timeline-clip-drag.js. Video box lanes in the same container have no resize handle, so
// this delegation is unaffected by the TEXT/VIDEO BOX merge.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-text.js's `renderTextPanel`; depends on window.Timeline (PX_PER_SEC) already
// existing, so this file must load after timeline.js.
(() => {
  const MIN_DURATION = 0.3;

  const row = document.getElementById("row-overlays");
```

- [ ] **Step 9: Manually verify the merged rendering**

Reload the app. Add a text block (TEXT icon rail) and add a video box (VIDEO BOX panel). Confirm in the browser:
- One merged row shows two 44px lanes — one labeled "TEXT", one labeled "VIDEO BOX" — ordered by their `z_index` (new items get `z_index: 0` by default, so order between them may need a moment's inspection; both should render distinctly, no stacking).
- Both blocks are still individually selectable, the text block still shows its resize handle and can be resized, and the video box is still draggable onto the VIDEO row.
- Delete both; confirm the merged row disappears (collapses) with no gap.
- Take a screenshot to confirm the visual layout.

- [ ] **Step 10: Commit**

```bash
git add static/timeline.js static/index.html static/css/components/timeline.css static/timeline-text-resize.js
git commit -m "feat: merge TEXT and VIDEO BOX timeline rows into one z-order overlay stack"
```

---

### Task 3: Drag-to-reorder via hover-reveal handle (`static/timeline-overlay-layer-drag.js`)

**Files:**
- Create: `static/timeline-overlay-layer-drag.js`
- Modify: `static/index.html` (script tag)
- Modify: `static/css/components/timeline.css` (handle + dragging visual states)

**Interfaces:**
- Consumes: `OverlayLayers.mergedEntries`, `OverlayLayers.renumber` (Task 1); `#label-overlays` containing `.overlay-lane-label` elements with `dataset.entryId` (Task 2); `project`/`saveProject`/`renderTimeline` globals (`static/editor.js`).
- Produces: the hover-reveal drag-to-reorder interaction described in the design spec.

- [ ] **Step 1: Write the implementation**

Create `static/timeline-overlay-layer-drag.js`:

```javascript
// Drag-to-reorder for the unified overlay z-order stack: mousedown on a lane's hover-reveal
// grip handle (.overlay-lane-handle, static/timeline.js's renderOverlaysRow) + vertical drag
// past a threshold reorders that entry (a text block or video box) among all overlay lanes.
// Releasing renumbers every entry's z_index to match the new order (OverlayLayers.renumber),
// saves, and re-renders — this replaces the removed #panel-layers side-panel's drag-and-drop
// list with the same mergedEntries/renumber logic, moved onto the timeline. Delegated on
// #label-overlays itself (persists across renders; its children are rebuilt by
// Timeline.render). Depends on window.OverlayLayers (timeline-overlay-layers.js) and
// editor.js's project/saveProject/renderTimeline globals.
(() => {
  const THRESHOLD_PX = 4;
  const LANE_HEIGHT = 44;

  const labelCol = document.getElementById("label-overlays");

  labelCol.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".overlay-lane-handle");
    if (!handle) return;
    const laneLabel = handle.closest(".overlay-lane-label");
    const entryId = laneLabel.dataset.entryId;

    const startY = e.clientY;
    let dragging = false;

    const onMove = (moveEvent) => {
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.abs(dy) > THRESHOLD_PX) {
        dragging = true;
        laneLabel.classList.add("dragging");
      }
      if (!dragging) return;
      laneLabel.style.transform = `translateY(${dy}px)`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      laneLabel.classList.remove("dragging");
      laneLabel.style.transform = "";
      if (!dragging) return;

      const entries = OverlayLayers.mergedEntries(project);
      const fromIndex = entries.findIndex((entry) => entry.id === entryId);
      if (fromIndex === -1) return;
      const colRect = labelCol.getBoundingClientRect();
      const contentY = upEvent.clientY - colRect.top;
      const toIndex = Math.max(0, Math.min(entries.length - 1, Math.floor(contentY / LANE_HEIGHT)));
      if (toIndex === fromIndex) return;

      const reordered = [...entries];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      OverlayLayers.renumber(reordered);
      saveProject();
      renderTimeline();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
```

- [ ] **Step 2: Wire the script tag**

In `static/index.html`, add this line immediately after the existing `<script src="/static/timeline-text-resize.js"></script>` line:

```html
<script src="/static/timeline-overlay-layer-drag.js"></script>
```

- [ ] **Step 3: Add handle + dragging CSS**

In `static/css/components/timeline.css`, immediately after the existing block:

```css
.timeline-row[data-row="video"] .timeline-block.dragging {
  z-index: 5;
  opacity: 0.85;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
  cursor: grabbing;
}
```

add:

```css
.overlay-lane-handle {
  display: inline-flex;
  align-items: center;
  opacity: 0;
  cursor: grab;
  color: var(--text-tertiary);
  margin-right: 4px;
}
.overlay-lane-label:hover .overlay-lane-handle { opacity: 1; }
.overlay-lane-label.dragging {
  z-index: 5;
  opacity: 0.85;
  cursor: grabbing;
}
```

- [ ] **Step 4: Manually verify drag-to-reorder**

Reload the app. Add two text blocks and one video box (three lanes total). Hover each lane's label — confirm a small grip handle fades in to the left of "TEXT"/"VIDEO BOX" only on hover.

Drag the video box's handle up so it lands between the two text lanes. Confirm:
- The video box's lane visually moves to sit between the two text lanes.
- In devtools console, `project.video_boxes[0].z_index` and both `project.text_blocks[*].z_index` reflect the new order (video box's value between the two text blocks' values).
- Reload the page — confirm the new order persists (was saved).

- [ ] **Step 5: Commit**

```bash
git add static/timeline-overlay-layer-drag.js static/index.html static/css/components/timeline.css
git commit -m "feat: drag-to-reorder overlay lanes via hover-reveal handle"
```

---

### Task 4: Remove the Layers panel

**Files:**
- Delete: `static/panel-layers.js`
- Delete: `static/css/components/layers-panel.css`
- Modify: `static/index.html` (CSS link, script tag, `#panel-layers` markup)
- Modify: `static/panel-nav.js` (`showPanel`'s type list, `PANEL_NAV_ITEMS`, `openLayersPanel`, `PANEL_NAV_HANDLERS`)

**Interfaces:**
- Consumes: nothing new — this task only removes code. `static/panel-layers.js`'s `mergedEntries`/`renumber` logic has already been superseded by `OverlayLayers` (Task 1); nothing outside the removed files referenced `window.LayersPanel`.
- Produces: no more LAYERS entry in the left icon rail, no `#panel-layers` section, no dead file/CSS.

- [ ] **Step 1: Delete the panel file and its stylesheet**

```bash
rm static/panel-layers.js static/css/components/layers-panel.css
```

- [ ] **Step 2: Remove the CSS link and script tag**

In `static/index.html`, remove this line:

```html
<link rel="stylesheet" href="/static/css/components/layers-panel.css">
```

and remove this line:

```html
<script src="/static/panel-layers.js"></script>
```

- [ ] **Step 3: Remove the `#panel-layers` markup**

In `static/index.html`, remove this block:

```html
      <div id="panel-layers" class="context-panel" hidden>
        <div class="style-panel-header">LAYERS</div>
        <ul id="layers-list" class="layers-list"></ul>
      </div>
```

- [ ] **Step 4: Remove the LAYERS entry from `showPanel`'s panel-type list**

In `static/panel-nav.js`, change:

```javascript
  ["files", "video", "text", "captions", "video-box", "layers", "settings", "export", "projects", "audio", "auto-slice"].forEach((t) => {
```

to:

```javascript
  ["files", "video", "text", "captions", "video-box", "settings", "export", "projects", "audio", "auto-slice"].forEach((t) => {
```

- [ ] **Step 5: Remove the `PANEL_NAV_ITEMS` layers entry**

In `static/panel-nav.js`, remove this block from the `PANEL_NAV_ITEMS` array:

```javascript
  {
    value: "layers",
    label: "LAYERS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="1"/><rect x="7" y="7" width="14" height="14" rx="1"/></svg>`,
  },
```

- [ ] **Step 6: Remove `openLayersPanel`**

In `static/panel-nav.js`, remove this function:

```javascript
function openLayersPanel() {
  selected = { type: "layers" };
  showPanel("layers");
  LayersPanel.render();
  renderTimeline();
}
```

- [ ] **Step 7: Remove the `PANEL_NAV_HANDLERS` layers key**

In `static/panel-nav.js`, change:

```javascript
const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, layers: openLayersPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel, audio: openAudioPanel, "auto-slice": openAutoSlicePanel };
```

to:

```javascript
const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel, audio: openAudioPanel, "auto-slice": openAutoSlicePanel };
```

- [ ] **Step 8: Manually verify removal**

Reload the app, open devtools console, confirm no errors (specifically no "LayersPanel is not defined" or 404s for `panel-layers.js`/`layers-panel.css`). Confirm the left icon rail no longer shows a LAYERS entry.

- [ ] **Step 9: Commit**

```bash
git add -A static/panel-layers.js static/css/components/layers-panel.css static/index.html static/panel-nav.js
git commit -m "feat: remove the Layers panel, superseded by the timeline overlay stack"
```

---

### Task 5: Update the codebase map (`CLAUDE.md`)

**Files:**
- Modify: `CLAUDE.md` (project-level, at repo root)

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: an up-to-date file structure tree and inventory, per this repo's convention that any commit adding/moving/renaming/deleting files must update the map in the same commit.

- [ ] **Step 1: Update the File structure tree**

In `CLAUDE.md`'s file structure tree:
- Remove the `static/panel-layers.js` entry and the "Layers panel (z-order)" inventory section's file references to it.
- Add entries for `static/timeline-overlay-layers.js` and `static/timeline-overlay-layer-drag.js`, following the existing one-line-per-file style used by neighboring entries like `static/timeline-clip-drag.js`.
- Update `static/timeline.js`'s entry to describe the merged `#row-overlays`/`#label-overlays` rendering (`renderOverlaysRow`) replacing the old separate TEXT/VIDEO BOX rows.
- Update `static/index.html`'s entry to note `#panel-layers` is removed and the TEXT/VIDEO BOX rows are merged into one overlay row.
- Remove `static/css/components/layers-panel.css` from the CSS file listing.

- [ ] **Step 2: Update or remove the "Layers panel (z-order)" inventory section**

Replace that section's content to describe the new unified-stack mechanism (`z_index` fields still drive stacking; reordering now happens via `static/timeline-overlay-layers.js` + `static/timeline-overlay-layer-drag.js` on the timeline itself, not a side panel).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update codebase map for the unified overlay layer stack"
```
