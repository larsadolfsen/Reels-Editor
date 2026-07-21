# Slice + Timeline Editing — Zoom & Drag-Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the "Slice + Timeline Editing" backlog item: working timeline zoom (−/+ buttons + horizontal scroll + playhead auto-scroll during playback), drag-a-clip-block-to-reorder in the VIDEO row, and the deferred slice-button disabled visual state at boundaries/empty timeline.

**Architecture:** `static/timeline.js` gains a `pxPerSecond` module variable (replacing the fixed `PX_PER_SEC` constant) with a fit-to-width auto mode and manual zoom levels; every position-math helper reads it through one accessor so ruler/blocks/playhead/scroll-width stay in sync. Drag-to-reorder is a new small file (`static/timeline-clip-drag.js`) following the same "pure-ish gesture module that reaches into editor.js globals" pattern as `static/timeline-slice.js`, delegated on the persistent `#row-video` container. Reorder math is centralized in a single `VideoPanel.moveClipTo(clipId, newIndex)` in `static/panel-video.js`, replacing the old two-clip `moveClip(a, b)` swap so the VIDEO panel's move-up/down buttons and the new drag gesture share one code path. The slice-button disabled state is a pure predicate (`Timeline.isSliceDisabled`) reused by both the click handler's existing no-op and a new visual `.disabled` class toggle.

**Tech Stack:** Vanilla JS (no build step), FastAPI/Pydantic backend (untouched by this plan — `app/timeline.py`'s `slice_clip` already shipped and is not modified here).

## Global Constraints

- No JS build step/bundler; one function/feature per file per `CLAUDE.md`.
- No inline `style="..."` in `static/index.html` — dynamically-set positions (`el.style.left`, etc.) from JS are the existing exception already used throughout `timeline.js`/`preview.js`; this plan follows that same existing pattern, it does not add new inline attributes to markup.
- `static/timeline.js` does `window.Timeline = (() => {...})()`, which **replaces** `window.Timeline` — any file extending it (`static/timeline-snap.js`, `static/timeline-slice.js`, and the new `static/timeline-clip-drag.js`) must load in `static/index.html` **after** `static/timeline.js`.
- Zoom level is view state only: not persisted to the project, not recorded in undo history, reset to fit-to-width whenever a project is opened.
- Slicing/dragging apply to video clips only — text blocks and captions are out of scope (per the design doc).
- Live-verify UI changes only on a throwaway project created via `Api.createProject()` / deleted via `Api.deleteProject()` when done — never touch real project data (the app's on-unload keepalive-save persists in-memory edits to disk immediately).
- This is UI/gesture-wiring work with no JS test runner in this repo (pytest only covers `app/*.py`). Per `CLAUDE.md`'s stated exception for untestable layers: keep all logic in small pure-ish functions (`fitToWidthPx`, `currentPxPerSecond`, `nearestReorderIndex`, `Timeline.isSliceDisabled`, `VideoPanel.moveClipTo`) and verify the DOM wiring manually in the browser each task, per the "Manual verification" step included in every task below.

---

## Task 1: Zoom state + math in `static/timeline.js`

**Files:**
- Modify: `static/timeline.js` (whole file — replaces the `PX_PER_SEC` constant with zoom state; see exact diffs below)

**Interfaces:**
- Consumes: none new.
- Produces: `Timeline.PX_PER_SEC` (now a **getter**, was a plain number — returns the *current* effective px/sec, auto or manual), `Timeline.resetZoom()` (called by `editor.js` on project open, Task 1 Step 6 also wires this call).

- [ ] **Step 1: Replace the fixed scale constant with zoom module state**

In `static/timeline.js`, replace line 16 (`const PX_PER_SEC = 60;`) and the module var block (lines 16-18) with:

```javascript
  const LABEL_WIDTH = 88;
  const MIN_PX_PER_SEC_FLOOR = 60; // fallback if the scroll container can't be measured yet
  const MAX_PX_PER_SEC = 200;
  const ZOOM_STEP = 1.5;
  let lastDuration = 1;
  let pxPerSecond = null; // null = auto fit-to-width (the zoomed-out floor); a number once the user zooms in

  // Fit-to-width: the scale at which the whole sequence exactly fills the visible scroll
  // container, with no horizontal scrollbar. Recomputed fresh every call (not cached) since
  // the container can resize (panel collapse/expand, window resize).
  function fitToWidthPx(duration) {
    const scrollEl = document.getElementById("timeline-scroll");
    const w = scrollEl ? scrollEl.clientWidth : 0;
    if (!w || !duration) return MIN_PX_PER_SEC_FLOOR;
    return w / duration;
  }

  function currentPxPerSecond() {
    return pxPerSecond !== null ? pxPerSecond : fitToWidthPx(lastDuration);
  }

  function zoomIn() {
    const base = currentPxPerSecond();
    pxPerSecond = Math.min(MAX_PX_PER_SEC, base * ZOOM_STEP);
  }

  function zoomOut() {
    if (pxPerSecond === null) return; // already at the fit-to-width floor
    const next = pxPerSecond / ZOOM_STEP;
    const fit = fitToWidthPx(lastDuration);
    pxPerSecond = next <= fit ? null : next; // snap back to auto fit-to-width at the floor
  }

  function resetZoom() {
    pxPerSecond = null;
  }
```

(Keep the rest of the existing module — `ordered`, `clipDuration`, `sequenceDuration`, `videoBoxEnd`, `groupWords` — unchanged, immediately below this block.)

- [ ] **Step 2: Route every remaining `PX_PER_SEC` usage through `currentPxPerSecond()`**

Replace each of these (all still in `static/timeline.js`):

```javascript
  function tick(timelineTime) {
    document.getElementById("playhead").style.left = `${timelineTime * PX_PER_SEC}px`;
    document.getElementById("timeline-time").textContent =
      `${formatTimeDeci(timelineTime)} / ${formatTimeDeci(lastDuration)}`;
    updateSliceButton();
  }
```

with:

```javascript
  function tick(timelineTime) {
    document.getElementById("playhead").style.left = `${timelineTime * currentPxPerSecond()}px`;
    document.getElementById("timeline-time").textContent =
      `${formatTimeDeci(timelineTime)} / ${formatTimeDeci(lastDuration)}`;
    updateSliceButton();
  }
```

Replace:

```javascript
  function timeAtX(clips, rulerRect, clientX) {
    return Math.max(0, (clientX - rulerRect.left) / PX_PER_SEC);
  }
```

with:

```javascript
  function timeAtX(clips, rulerRect, clientX) {
    return Math.max(0, (clientX - rulerRect.left) / currentPxPerSecond());
  }
```

Replace the ruler-tick loop:

```javascript
  function renderRuler(duration) {
    const ruler = document.getElementById("timeline-ruler");
    ruler.querySelectorAll(".tick").forEach((t) => t.remove());
    for (let s = 0; s <= Math.ceil(duration); s += 2) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.left = `${s * PX_PER_SEC}px`;
      tick.textContent = formatTime(s);
      ruler.appendChild(tick);
    }
  }
```

with:

```javascript
  function renderRuler(duration, px) {
    const ruler = document.getElementById("timeline-ruler");
    ruler.querySelectorAll(".tick").forEach((t) => t.remove());
    for (let s = 0; s <= Math.ceil(duration); s += 2) {
      const tick = document.createElement("div");
      tick.className = "tick";
      tick.style.left = `${s * px}px`;
      tick.textContent = formatTime(s);
      ruler.appendChild(tick);
    }
  }
```

- [ ] **Step 3: Thread the resolved `px` value through `render()`**

Replace the top of `render()`:

```javascript
  function render(project, timelineTime, selected, onSelect, actions = {}) {
    const clips = ordered(project.clips || []);
    const duration = totalDuration(project);
    lastDuration = duration;
    const contentWidth = duration * PX_PER_SEC;
    document.getElementById("timeline-content").style.width = `${contentWidth}px`;

    renderRuler(duration);
    document.getElementById("playhead").style.left = `${timelineTime * PX_PER_SEC}px`;
```

with:

```javascript
  function render(project, timelineTime, selected, onSelect, actions = {}) {
    const clips = ordered(project.clips || []);
    const duration = totalDuration(project);
    lastDuration = duration;
    const px = currentPxPerSecond();
    const contentWidth = duration * px;
    document.getElementById("timeline-content").style.width = `${contentWidth}px`;

    renderRuler(duration, px);
    document.getElementById("playhead").style.left = `${timelineTime * px}px`;
```

Then replace every remaining bare `PX_PER_SEC` further down in `render()` (the clip/text/video-box/caption block loops) with `px`:

```javascript
    const videoTrack = clearTrack("row-video");
    let acc = 0;
    for (const c of clips) {
      const d = clipDuration(c);
      const media = project.media_library.find((m) => m.id === c.media_id);
      const name = (media && (media.name || media.file_path.split(/[\\/]/).pop())) || c.file_path.split(/[\\/]/).pop();
      const isSel = !!selected && selected.type === "video" && selected.item.id === c.id;
      addBlock(videoTrack, acc * px, d * px, name, isSel, () => onSelect({ type: "video", item: c }));
      acc += d;
    }
    if (actions.onAddClip) addRowAddButton(videoTrack, acc * px, "Add clip", actions.onAddClip);

    const textTrack = clearTrack("row-text");
    for (const b of project.text_blocks || []) {
      const isSel = !!selected && selected.type === "text" && !!selected.item && selected.item.id === b.id;
      addBlock(textTrack, b.start * px, (b.end - b.start) * px, b.heading, isSel,
        () => onSelect({ type: "text", item: b }));
    }
    const textEnd = (project.text_blocks || []).reduce((m, b) => Math.max(m, b.end), 0);
    if (actions.onAddText) addRowAddButton(textTrack, textEnd * px, "Add text", actions.onAddText);

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

    const capTrack = clearTrack("row-captions");
    const groups = project.captions ? groupWords(project.captions.words) : [];
    groups.forEach((g, i) => {
      const start = g[0].t_start, end = g[g.length - 1].t_end;
      const label = g.map((w) => w.text).join(" ");
      const isSel = !!selected && selected.type === "caption" && selected.groupIndex === i;
      addBlock(capTrack, start * px, (end - start) * px, label, isSel,
        () => onSelect({ type: "caption", item: g, groupIndex: i }));
    });
```

(This is the same loop body as today, just `PX_PER_SEC` → `px` throughout — no other logic changes.)

- [ ] **Step 4: Tag each VIDEO-row block with its clip id (needed by Task 4's drag gesture)**

In the video-block loop from Step 3, change:

```javascript
      addBlock(videoTrack, acc * px, d * px, name, isSel, () => onSelect({ type: "video", item: c }));
      acc += d;
```

to:

```javascript
      addBlock(videoTrack, acc * px, d * px, name, isSel, () => onSelect({ type: "video", item: c }));
      videoTrack.lastElementChild.dataset.clipId = c.id;
      acc += d;
```

- [ ] **Step 5: Expose `PX_PER_SEC` as a live getter and add `resetZoom`, wire the zoom buttons**

Replace the final `return` statement:

```javascript
  return { render, groupWords, timeAtX, tick, PX_PER_SEC };
})();
```

with:

```javascript
  document.getElementById("zoom-in").addEventListener("click", () => { zoomIn(); renderTimeline(); });
  document.getElementById("zoom-out").addEventListener("click", () => { zoomOut(); renderTimeline(); });

  return {
    render, groupWords, timeAtX, tick, resetZoom,
    get PX_PER_SEC() { return currentPxPerSecond(); },
  };
})();
```

(`renderTimeline` is defined later in `static/editor.js`; referencing it here is safe because the click handler body only runs after user interaction, by which time `editor.js` has already loaded and defined it — the same deferred-global-reference pattern `static/panel-video.js` already uses for `project`/`saveProject`.)

- [ ] **Step 6: Reset zoom to fit-to-width whenever a project opens**

In `static/editor.js`, in `openProject()`, change:

```javascript
  MediaPanel.render();
  Preview.load(project);
  await renderTextPanel();
  renderTimeline();
  openFilesPanel();
```

to:

```javascript
  MediaPanel.render();
  Preview.load(project);
  Timeline.resetZoom();
  await renderTextPanel();
  renderTimeline();
  openFilesPanel();
```

- [ ] **Step 7: Update `static/timeline.js`'s file header comment**

Change the header comment's line about the fixed scale (currently: `// Fixed pixels-per-second scale (not stretched to container width) so content is always` / `// readable; #timeline-scroll provides horizontal scroll when content exceeds the viewport.`) to:

```javascript
// Zoomable pixels-per-second scale: auto fit-to-width by default, or a manual zoom level set
// via the toolbar −/+ buttons (×1.5 steps, clamped [fit-to-width, 200 px/s]); not persisted,
// reset to fit-to-width on every project open (editor.js calls Timeline.resetZoom()).
// #timeline-scroll provides horizontal scroll once zoomed content exceeds the viewport.
```

- [ ] **Step 8: Manual verification**

Run the server (`.venv/Scripts/python -m uvicorn app.main:app --reload`), open `http://127.0.0.1:8000` in the browser tool. Create a throwaway project via the "+ NEW PROJECT" picker button, add 2-3 short clips so the timeline has visible blocks. Verify:
- Clicking `+` (zoom in) visibly widens all rows' blocks together (ruler ticks, TEXT/CAPTIONS/VIDEO/VIDEO BOX blocks all rescale in sync) and a horizontal scrollbar appears once content exceeds the visible width.
- Clicking `−` repeatedly shrinks back down and stops at fit-to-width (clicking `−` again does nothing further, blocks exactly fill the row width with no scrollbar).
- Reload the page (re-opens the same project fresh) — zoom is back at fit-to-width (not persisted).
- Delete the throwaway project via the PROJECTS panel when done, or note its id for reuse in later tasks' manual verification (recommended: keep it until Task 6's final pass, then delete).

- [ ] **Step 9: Commit**

```bash
git add static/timeline.js static/editor.js
git commit -m "feat: wire timeline zoom (fit-to-width + manual −/+ levels)"
```

---

## Task 2: Playhead auto-scroll during playback

**Files:**
- Modify: `static/timeline.js`

**Interfaces:**
- Consumes: `currentPxPerSecond()`, `#timeline-scroll` (from Task 1).
- Produces: none new (internal behavior only).

- [ ] **Step 1: Add an auto-scroll helper and call it from `tick()`**

In `static/timeline.js`, add this function near `updateSliceButton`:

```javascript
  // Keeps the playhead within view during playback by nudging #timeline-scroll's scrollLeft
  // when the playhead nears either visible edge. Only called from tick() (the playback RAF
  // loop) — manual scrubbing/scrolling elsewhere is left entirely to the user.
  function autoScrollToPlayhead(timelineTime) {
    const scrollEl = document.getElementById("timeline-scroll");
    const x = timelineTime * currentPxPerSecond();
    const margin = 40;
    if (x < scrollEl.scrollLeft + margin) {
      scrollEl.scrollLeft = Math.max(0, x - margin);
    } else if (x > scrollEl.scrollLeft + scrollEl.clientWidth - margin) {
      scrollEl.scrollLeft = x - scrollEl.clientWidth + margin;
    }
  }
```

Then update `tick()` (from Task 1 Step 2) to call it:

```javascript
  function tick(timelineTime) {
    document.getElementById("playhead").style.left = `${timelineTime * currentPxPerSecond()}px`;
    document.getElementById("timeline-time").textContent =
      `${formatTimeDeci(timelineTime)} / ${formatTimeDeci(lastDuration)}`;
    autoScrollToPlayhead(timelineTime);
    updateSliceButton();
  }
```

- [ ] **Step 2: Manual verification**

In the browser (same throwaway project from Task 1, now zoomed in enough that the sequence overflows the visible width — click `+` a few times), press play. Confirm the view scrolls to keep the playhead visible as it moves right, and stays put once the whole remaining sequence already fits (no jitter/over-scrolling). Pause and manually scroll left with the mouse wheel — confirm nothing snaps it back until you press play again.

- [ ] **Step 3: Commit**

```bash
git add static/timeline.js
git commit -m "feat: auto-scroll timeline to keep playhead visible during playback"
```

---

## Task 3: Extract `VideoPanel.moveClipTo(clipId, newIndex)`

**Files:**
- Modify: `static/panel-video.js:42-49` (VIDEO panel's up/down buttons), `static/panel-video.js:114-121` (`moveClip` → `moveClipTo`), `static/panel-video.js:139` (export name)

**Interfaces:**
- Consumes: `project.clips` (global, from `editor.js`), `saveProject()`, `Preview.load()`, `renderTimeline()` (all existing globals already used elsewhere in this file).
- Produces: `window.VideoPanel.moveClipTo(clipId, newIndex)` — reindexes `project.clips` so the clip with id `clipId` ends up at position `newIndex` (0-based, among clips ordered by `order`), renumbering every clip's `order` to `0..n-1` gap-free, then saves/reloads/re-renders. Consumed by this task's button wiring and by Task 4's drag gesture.

- [ ] **Step 1: Replace `moveClip(a, b)` with `moveClipTo(clipId, newIndex)`**

Replace (lines 114-121):

```javascript
  async function moveClip(a, b) {
    const t = a.order;
    a.order = b.order;
    b.order = t;
    await saveProject();
    Preview.load(project);
    renderTimeline();
  }
```

with:

```javascript
  // Reindexes project.clips so `clipId` ends up at position `newIndex` (0-based, among clips
  // ordered by `.order`), renumbering every clip's `.order` to 0..n-1 gap-free. `newIndex` is
  // clamped to the valid range. Shared by the VIDEO panel's move-up/down buttons and the
  // timeline's drag-to-reorder gesture (static/timeline-clip-drag.js).
  async function moveClipTo(clipId, newIndex) {
    const list = [...project.clips].sort((a, b) => a.order - b.order);
    const from = list.findIndex((c) => c.id === clipId);
    if (from === -1) return;
    const clamped = Math.max(0, Math.min(newIndex, list.length - 1));
    const [moved] = list.splice(from, 1);
    list.splice(clamped, 0, moved);
    list.forEach((c, i) => { c.order = i; });
    await saveProject();
    Preview.load(project);
    renderTimeline();
  }
```

- [ ] **Step 2: Update the up/down button wiring**

Replace (lines 44-49):

```javascript
    const upBtn = document.getElementById("video-move-up");
    const downBtn = document.getElementById("video-move-down");
    upBtn.disabled = idx <= 0;
    downBtn.disabled = idx === -1 || idx === ordered.length - 1;
    upBtn.onclick = async () => { await moveClip(c, ordered[idx - 1]); render(c); };
    downBtn.onclick = async () => { await moveClip(c, ordered[idx + 1]); render(c); };
```

with:

```javascript
    const upBtn = document.getElementById("video-move-up");
    const downBtn = document.getElementById("video-move-down");
    upBtn.disabled = idx <= 0;
    downBtn.disabled = idx === -1 || idx === ordered.length - 1;
    upBtn.onclick = async () => { await moveClipTo(c.id, idx - 1); render(c); };
    downBtn.onclick = async () => { await moveClipTo(c.id, idx + 1); render(c); };
```

- [ ] **Step 3: Update the exported name**

Replace line 139 (`window.VideoPanel.moveClip = moveClip;`) with:

```javascript
  window.VideoPanel.moveClipTo = moveClipTo;
```

- [ ] **Step 4: Update the file header comment**

Change line 2 (`// window.VideoPanel.render()/select()/deleteClip()/moveClip(), plus the shared clampTrim()`) to:

```javascript
// window.VideoPanel.render()/select()/deleteClip()/moveClipTo(), plus the shared clampTrim()
```

- [ ] **Step 5: Manual verification**

In the browser (throwaway project, 3+ clips), select each clip in turn and use the VIDEO panel's move-up/move-down buttons. Confirm: the clip trades places with its neighbor exactly as before, the button disables correctly at the first/last position, playback order updates immediately (scrub through and confirm clip content plays in the new order), and the change survives a page reload.

- [ ] **Step 6: Commit**

```bash
git add static/panel-video.js
git commit -m "refactor: extract VideoPanel.moveClipTo(clipId, newIndex) from the up/down swap"
```

---

## Task 4: Drag-a-clip-block-to-reorder in the VIDEO row

**Files:**
- Create: `static/timeline-clip-drag.js`
- Modify: `static/index.html` (one `<script>` tag)
- Modify: `static/css/components/timeline.css` (append two rules)
- Modify: `CLAUDE.md` (codebase map — new file entry)

**Interfaces:**
- Consumes: `window.Timeline.PX_PER_SEC` (getter, from Task 1), `project.clips` (global), `window.VideoPanel.moveClipTo(clipId, newIndex)` (from Task 3).
- Produces: no new globals — this file only wires DOM event listeners (mirrors `static/timeline-slice.js`'s shape: pure-ish internal helpers + one piece of DOM wiring, no exported API).

- [ ] **Step 1: Create the gesture file**

Create `static/timeline-clip-drag.js`:

```javascript
// Drag-to-reorder for VIDEO-row clip blocks: mousedown + horizontal drag past a small
// threshold on a .timeline-block in #row-video moves that clip to a new sequence position via
// VideoPanel.moveClipTo. Below the threshold it's left alone — the block's own click listener
// (wired in timeline.js's addBlock) still fires the normal select behavior on mouseup.
// Delegated on #row-video itself (the container persists across renders; only its children
// are rebuilt by Timeline.render, so one listener added at load time keeps working forever —
// same reasoning as timeline.js's own scrollEl.dataset.sliceBound guard).
// Reaches into editor.js's `project` global and VideoPanel.moveClipTo; depends on
// window.Timeline (PX_PER_SEC) already existing, so this file must load after timeline.js.
(() => {
  const THRESHOLD_PX = 4;

  function clipDuration(c) {
    return (c.out_point - c.in_point) / (c.speed || 1);
  }

  function orderedClips() {
    return [...(project.clips || [])].sort((a, b) => a.order - b.order);
  }

  // Cumulative-time boundary positions (content-space px), among every clip except the one
  // being dragged. There are n+1 boundaries for n remaining clips (before the first, between
  // each pair, after the last) — the index of the nearest one is exactly the drop index
  // VideoPanel.moveClipTo expects.
  function reorderBoundaries(excludeClipId) {
    const px = Timeline.PX_PER_SEC;
    const rest = orderedClips().filter((c) => c.id !== excludeClipId);
    const bounds = [0];
    let acc = 0;
    for (const c of rest) {
      acc += clipDuration(c);
      bounds.push(acc * px);
    }
    return bounds;
  }

  function nearestReorderIndex(contentX, excludeClipId) {
    const bounds = reorderBoundaries(excludeClipId);
    let bestIndex = 0, bestDist = Infinity, bestX = bounds[0];
    bounds.forEach((b, i) => {
      const dist = Math.abs(b - contentX);
      if (dist < bestDist) { bestDist = dist; bestIndex = i; bestX = b; }
    });
    return { index: bestIndex, x: bestX };
  }

  function getIndicator(row) {
    let el = document.getElementById("clip-drop-indicator");
    if (!el) {
      el = document.createElement("div");
      el.id = "clip-drop-indicator";
      el.className = "clip-drop-indicator";
      row.appendChild(el);
    }
    return el;
  }

  const row = document.getElementById("row-video");

  row.addEventListener("mousedown", (e) => {
    const blockEl = e.target.closest(".timeline-block");
    if (!blockEl || !blockEl.dataset.clipId) return;
    const clipId = blockEl.dataset.clipId;
    const startX = e.clientX;
    let dragging = false;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!dragging && Math.abs(dx) > THRESHOLD_PX) {
        dragging = true;
        blockEl.classList.add("dragging");
      }
      if (!dragging) return;
      blockEl.style.transform = `translateX(${dx}px)`;
      const rowRect = row.getBoundingClientRect();
      const contentX = moveEvent.clientX - rowRect.left;
      const { x: snapX } = nearestReorderIndex(contentX, clipId);
      const indicator = getIndicator(row);
      indicator.style.left = `${snapX}px`;
      indicator.style.display = "block";
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      blockEl.classList.remove("dragging");
      blockEl.style.transform = "";
      const indicator = document.getElementById("clip-drop-indicator");
      if (indicator) indicator.style.display = "none";
      if (!dragging) return;
      const rowRect = row.getBoundingClientRect();
      const contentX = upEvent.clientX - rowRect.left;
      const { index } = nearestReorderIndex(contentX, clipId);
      VideoPanel.moveClipTo(clipId, index);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
```

- [ ] **Step 2: Add the drop-indicator and dragging-state CSS**

Append to `static/css/components/timeline.css`:

```css
/* Drag-to-reorder (static/timeline-clip-drag.js): the dragged block follows the pointer via
   `transform`, and a thin vertical line shows the snap-to-boundary drop target. */
.timeline-row[data-row="video"] .timeline-block.dragging {
  z-index: 5;
  opacity: 0.85;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
  cursor: grabbing;
}

.clip-drop-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent);
  display: none;
  pointer-events: none;
  z-index: 4;
}
```

- [ ] **Step 3: Load the new file after `timeline.js` (and after `timeline-slice.js`, for tidiness — order between the two doesn't matter functionally)**

In `static/index.html`, change:

```html
<script src="/static/timeline-slice.js"></script>
<script src="/static/undo-history.js"></script>
```

to:

```html
<script src="/static/timeline-slice.js"></script>
<script src="/static/timeline-clip-drag.js"></script>
<script src="/static/undo-history.js"></script>
```

- [ ] **Step 4: Update `CLAUDE.md`'s codebase map**

In the "File structure" tree in `CLAUDE.md`, add a line right after the existing `timeline-slice.js` entry:

```
  timeline-clip-drag.js  # Drag-to-reorder for VIDEO-row clip blocks: mousedown+threshold-classify+transform-follow+snap-to-boundary drop indicator, calling VideoPanel.moveClipTo(clipId, newIndex) on drop
```

In the "Timeline" section of the Inventory, add a bullet after the `static/timeline-slice.js` bullet:

```
- `static/timeline-clip-drag.js` — drag-to-reorder gesture for VIDEO-row blocks (mousedown + horizontal drag past a 4px threshold, below which the block's existing click-to-select still fires): follows the pointer via CSS transform, snaps the drop target to the nearest clip boundary (`nearestReorderIndex`), and calls `VideoPanel.moveClipTo(clipId, newIndex)` (`static/panel-video.js`) on drop. Delegated on the persistent `#row-video` container so it survives `Timeline.render()` rebuilding its children.
```

- [ ] **Step 5: Manual verification**

In the browser (throwaway project, 3+ clips, zoomed in enough via `+` that blocks are comfortably wide), drag the middle clip block left past the first clip's start. Confirm:
- A thin vertical drop-indicator line appears and snaps between clip boundaries as you drag.
- On release, the clip moves to the new position — verify by scrubbing playback through the new order.
- A small drag (a few px, below threshold) still just selects the clip (opens the VIDEO panel), it does not reorder.
- Dragging back to the original position is a no-op (order unchanged).
- The new order survives a page reload.

- [ ] **Step 6: Commit**

```bash
git add static/timeline-clip-drag.js static/index.html static/css/components/timeline.css CLAUDE.md
git commit -m "feat: drag a VIDEO-row clip block to reorder the sequence"
```

---

## Task 5: Slice-button disabled visual state

**Files:**
- Modify: `static/timeline-slice.js` (add `Timeline.isSliceDisabled`)
- Modify: `static/timeline.js` (track last-rendered project/time; toggle `.disabled` on `#slice-action`)
- Modify: `static/css/components/timeline.css` (append one rule)

**Interfaces:**
- Consumes: `Preview.locate(clips, t)` (existing).
- Produces: `Timeline.isSliceDisabled(clips, t, eps = 0.05) -> boolean` — true when slicing at `t` would be a no-op (playhead outside every clip, or within `eps` source-seconds of a clip boundary — including the empty-timeline case, since `Preview.locate` returns `null` when `clips` is empty).

- [ ] **Step 1: Add the pure predicate, reused by the existing click handler**

In `static/timeline-slice.js`, replace:

```javascript
// Splits the clip under timeline-time t at that point. Mutates `clips` in place; returns { clips, newId }.
// No-op (newId null) when t is in no clip or within eps (source-seconds) of a boundary.
Timeline.sliceClip = function (clips, t, eps = 0.05) {
  const loc = Preview.locate(clips, t);
  if (!loc) return { clips, newId: null };
  const c = loc.clip, s = loc.src;
  if (Math.abs(s - c.in_point) < eps || Math.abs(c.out_point - s) < eps) return { clips, newId: null };
```

with:

```javascript
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
```

- [ ] **Step 2: Track the last-rendered project and timeline time in `static/timeline.js`**

Add a module var alongside `lastDuration` (from Task 1 Step 1):

```javascript
  let lastDuration = 1;
  let lastProject = null;
  let lastTimelineTime = 0;
```

In `tick(timelineTime)` (from Task 2), add the tracking line at the top:

```javascript
  function tick(timelineTime) {
    lastTimelineTime = timelineTime;
    document.getElementById("playhead").style.left = `${timelineTime * currentPxPerSecond()}px`;
    document.getElementById("timeline-time").textContent =
      `${formatTimeDeci(timelineTime)} / ${formatTimeDeci(lastDuration)}`;
    autoScrollToPlayhead(timelineTime);
    updateSliceButton();
  }
```

In `render(project, timelineTime, selected, onSelect, actions = {})` (from Task 1 Step 3), add both tracking lines right after `lastDuration = duration;`:

```javascript
    lastDuration = duration;
    lastProject = project;
    lastTimelineTime = timelineTime;
    const px = currentPxPerSecond();
```

- [ ] **Step 3: Toggle the `.disabled` class in `updateSliceButton()`**

Replace:

```javascript
  function updateSliceButton() {
    const btn = document.getElementById("slice-btn");
    const scrollEl = document.getElementById("timeline-scroll");
    const playhead = document.getElementById("playhead");
    const left = parseFloat(playhead.style.left) || 0;
    btn.style.left = `${LABEL_WIDTH + left - scrollEl.scrollLeft}px`;
  }
```

with:

```javascript
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

(By the time `updateSliceButton` is ever called — always from a render/tick triggered by user interaction after full page load — `static/timeline-slice.js` has already run and attached `isSliceDisabled` onto this same `Timeline` object, so the bare `Timeline` reference here resolves correctly.)

- [ ] **Step 4: Add the disabled-state CSS**

Append to `static/css/components/timeline.css`:

```css
/* Visual-only disabled state at clip boundaries / empty timeline (static/timeline.js's
   updateSliceButton) — the click handler in timeline-slice.js already no-ops safely either
   way, this just communicates it. */
.slice-icon-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.slice-icon-btn.disabled:hover { background: none; }
```

- [ ] **Step 5: Manual verification**

In the browser (throwaway project): with the playhead in the middle of a clip, confirm the scissors icon looks normal (not dimmed) and clicking it slices. Seek the playhead exactly to a clip boundary (e.g. click right at a block edge, or use step buttons to land within ~0.05s of one) and confirm the icon dims and clicking does nothing. Delete all clips (or open a brand-new empty throwaway project) and confirm the icon is dimmed the whole time.

- [ ] **Step 6: Commit**

```bash
git add static/timeline-slice.js static/timeline.js static/css/components/timeline.css
git commit -m "feat: dim the slice button at clip boundaries and on an empty timeline"
```

---

## Task 6: Final integrated verification + backlog note

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-slice-timeline-editing-design.md` (mark complete) — or wherever the backlog tracks this item's status, matching the existing commit style (`e353cad docs: record slice increment done, note zoom+drag-reorder remain`).

**Interfaces:** none — this task only verifies and documents.

- [ ] **Step 1: Run the full pytest suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all pass (this plan touches no `app/*.py` files, so this should be unaffected — run it anyway as the required final full-suite pass per `CLAUDE.md`).

- [ ] **Step 2: Full manual walkthrough on one throwaway project**

Using `Api.createProject()` (or the "+ NEW PROJECT" picker button) to create a fresh throwaway project with 3-4 short clips, a text block, and captions (if convenient) — walk the design doc's full manual checklist in one pass:
- Slice at mid-clip yields two independently trimmable/reorderable clips that play back seamlessly.
- Slice is disabled (dimmed, no-op) at clip boundaries and on an empty timeline.
- Zoom in/out re-lays-out all rows (TEXT/CAPTIONS/VIDEO BOX/VIDEO/AUDIO) consistently, ruler included.
- Zoom scroll-follows the playhead during playback.
- Drag-reorder in the VIDEO row updates playback order and survives a page reload.
- Export still works end-to-end (`EXPORT` panel → run export → confirm the output file's clip order/content matches the on-screen sequence) — this plan didn't touch `app/ffmpeg_cmd.py`, but a full-pipeline smoke check is cheap insurance since clip `order` values were mutated by new code paths this cycle.

Delete the throwaway project via the PROJECTS panel afterward: `Api.deleteProject(<id>)`.

- [ ] **Step 3: Update the backlog note**

In whatever file currently tracks "Slice + Timeline Editing" as an open backlog item (check `docs/superpowers/specs/2026-07-20-slice-timeline-editing-design.md`'s status line, or a backlog/TODO file referenced by recent commits like `e353cad`), update its status to reflect that zoom, drag-to-reorder, and the slice-button disabled state are all now shipped alongside the already-done slice feature.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: record zoom + drag-reorder + slice-disabled-state increments done"
```

- [ ] **Step 5: Merge and push**

Per session habits: once tests pass and the throwaway-project walkthrough is clean, tell the user it's ready to merge into `main` and push to `origin` — but only proceed with their explicit go-ahead.
