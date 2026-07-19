### Task 6: Video-box stage preview + z-index compositing

**Status:** not started

**Depends on:** Task 1 (merged, for the `VideoBoxLayer` shape). Codes against Task 5's `UI.videoBoxDrag(div, {onMove, onMoveEnd})` signature (agreed contract; reconcile at merge if dispatched before Task 5 lands) and the existing `UI.resizeHandles(container, {getSize, onResize, onDragEnd})`. Independent of Tasks 2–4, 7–9.

**Why this task also edits `static/preview.js`:** `preview.js`'s `renderText()` currently does `overlay.innerHTML = ""` at the top of every call (on every `timeupdate`, scrub, and playback tick) to rebuild the text-block divs. Video-box `<video>` elements must persist across those re-renders (recreating a `<video>` element every frame would restart playback and flicker), so they need to survive that wipe. This task narrows the wipe to only `.text-block` children, and adds every overlay element's `z-index` inline style (both text blocks and video boxes need it — z-order is meaningless unless every sibling in `#overlay` sets it) so CSS stacking follows each layer's `z_index`.

**Files:**
- Create: `static/video-box-preview.js`
- Modify: `static/preview.js`

**Interfaces:**
- Consumes: `UI.videoBoxDrag` (Task 5), `UI.resizeHandles` (existing, `static/ui-resize-handles.js`).
- Produces: `window.VideoBoxPreview.render(videoBoxes, timelineTime) -> void`, `window.VideoBoxPreview.setSelectedVideoBox(boxId, callbacks) -> void` where `callbacks` is `{onResize({width,height}), onDragEnd({width,height}), onMove({dx,dy}), onMoveEnd({dx,dy})}` or `null`. Consumed by Task 10's `editor.js` wiring.

- [ ] **Step 1: Narrow preview.js's overlay wipe to .text-block elements only**

In `static/preview.js`'s `renderText()`, change:

```js
    const keepEditingDiv = editingDiv && overlay.contains(editingDiv);
    overlay.innerHTML = "";
```

to:

```js
    const keepEditingDiv = editingDiv && overlay.contains(editingDiv);
    overlay.querySelectorAll(".text-block").forEach((el) => { if (el !== editingDiv) el.remove(); });
```

- [ ] **Step 2: Set z-index on each text-block div**

In `static/preview.js`'s `renderText()`, in the per-block loop, add one line right after `div.className = ...` is set:

```js
      div.className = `text-block text-block--align-${preset.align}`;
      div.style.zIndex = String(block.z_index ?? 0);
```

- [ ] **Step 3: Update preview.js's header comment**

Update line 1 of `static/preview.js` to note the shared stacking-order contract: `// Preview stage playback: plays a project's clips back-to-back in timeline order, and composites` / `// the text-block overlay on top (renderText). Text divs and video-box <video> elements (see` / `// video-box-preview.js) are siblings inside #overlay and each set an explicit CSS z-index from` / `// their model's z_index field, so browser stacking follows the project's cross-layer z-order.`

- [ ] **Step 4: Create static/video-box-preview.js**

Create `static/video-box-preview.js`:

```js
// Stage preview for video-box (picture-in-picture) layers: mounts one <video> element per
// visible box into #overlay (a sibling of preview.js's text-block divs — both set an explicit
// CSS z-index from their model's z_index so stacking follows the project's cross-layer
// z-order), keeps each element's position/size/currentTime in sync with the timeline clock,
// and wires drag-to-move (UI.videoBoxDrag)/resize (UI.resizeHandles) onto the selected box.
// Exposes window.VideoBoxPreview.{render, setSelectedVideoBox}. Muted always (no PiP audio).
window.VideoBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <video>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;

  function boxEnd(v) {
    return v.start + (v.out_point - v.in_point);
  }

  function mountHandles(boxId, video, v) {
    if (handlesDestroyers.has(boxId)) return; // already mounted for this element
    const destroyDrag = UI.videoBoxDrag(video, {
      onMove: (delta) => { if (callbacks && callbacks.onMove) callbacks.onMove(delta); },
      onMoveEnd: (delta) => { if (callbacks && callbacks.onMoveEnd) callbacks.onMoveEnd(delta); },
    });
    const destroyResize = UI.resizeHandles(video, {
      getSize: () => ({ width: video.offsetWidth, height: video.offsetHeight }),
      onResize: (size) => { if (callbacks && callbacks.onResize) callbacks.onResize(size); },
      onDragEnd: (size) => { if (callbacks && callbacks.onDragEnd) callbacks.onDragEnd(size); },
    });
    handlesDestroyers.set(boxId, () => { destroyDrag(); destroyResize(); });
  }

  function unmountHandles(boxId) {
    const destroy = handlesDestroyers.get(boxId);
    if (destroy) { destroy(); handlesDestroyers.delete(boxId); }
  }

  function render(videoBoxes, timelineTime) {
    const activeIds = new Set();
    const stageW = overlay.clientWidth || 1;
    const stageH = overlay.clientHeight || 1;

    for (const v of videoBoxes) {
      // The selected box always renders (even outside its time window) so it stays clickable
      // to reposition/resize, matching how preview.js treats the selected text block.
      const visible = (v.start <= timelineTime && timelineTime < boxEnd(v)) || v.id === selectedBoxId;
      if (!visible) continue;
      activeIds.add(v.id);

      let video = mounted.get(v.id);
      if (!video) {
        video = document.createElement("video");
        video.className = "video-box";
        video.muted = true;
        video.src = "/media?path=" + encodeURIComponent(v.file_path);
        video.style.pointerEvents = "auto";
        overlay.appendChild(video);
        mounted.set(v.id, video);
      }

      video.style.left = (v.x / 1080 * stageW) + "px";
      video.style.top = (v.y / 1920 * stageH) + "px";
      video.style.width = (v.width / 1080 * stageW) + "px";
      video.style.height = (v.height / 1920 * stageH) + "px";
      video.style.zIndex = String(v.z_index);

      const inWindow = v.start <= timelineTime && timelineTime < boxEnd(v);
      if (inWindow) {
        const srcTime = v.in_point + (timelineTime - v.start);
        if (Math.abs(video.currentTime - srcTime) > 0.15) video.currentTime = srcTime;
        if (video.paused) video.play().catch(() => {});
      } else {
        if (!video.paused) video.pause();
      }

      if (v.id === selectedBoxId && callbacks) mountHandles(v.id, video, v);
      else unmountHandles(v.id);
    }

    for (const [id, video] of mounted) {
      if (!activeIds.has(id)) {
        unmountHandles(id);
        video.remove();
        mounted.delete(id);
      }
    }
  }

  function setSelectedVideoBox(boxId, cb) {
    if (selectedBoxId && selectedBoxId !== boxId) unmountHandles(selectedBoxId);
    selectedBoxId = boxId;
    callbacks = cb || null;
  }

  return { render, setSelectedVideoBox };
})();
```

- [ ] **Step 5: Add the .video-box CSS class**

Add to `static/css/components/stage.css` (it already owns `.text-block`, the equivalent styling for the other overlay element type):

```css
.video-box {
  position: absolute;
  object-fit: cover;
}
```

- [ ] **Step 6: Wire VideoBoxPreview.render into preview.js's three render call sites**

In `static/preview.js`, add a call to `VideoBoxPreview.render` alongside each existing `renderText(...)` call so video boxes stay in sync with every timeline-time update. In the `player`'s `timeupdate` listener:

```js
    if (textProject) renderText(textProject, textPresets, timelineTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], timelineTime);
```

In `virtualTick(now)`:

```js
    if (textProject) renderText(textProject, textPresets, virtualTime);
    if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], virtualTime);
```

In `seek(t)` (the non-zero-clips branch):

```js
    } else {
      player.currentTime = loc.src;
    }
```

stays as-is (that branch doesn't call `renderText` directly — timeupdate fires from the `currentTime` assignment and handles both calls above). In the zero-clips branch of `seek(t)`:

```js
    if (clips.length === 0) {
      virtualTime = Math.max(0, Math.min(t, zeroClipDuration()));
      timeEl.textContent = virtualTime.toFixed(1);
      if (textProject) renderText(textProject, textPresets, virtualTime);
      if (textProject) VideoBoxPreview.render(textProject.video_boxes || [], virtualTime);
      return;
    }
```

- [ ] **Step 7: Manual verification**

Full end-to-end verification (adding a real video box, seeing it play/drag/resize) needs Tasks 8/10's UI — defer full manual testing to the Task 10 integration checkpoint. For this task alone, confirm in the browser console after starting the dev server: `typeof VideoBoxPreview.render === "function"` and `typeof VideoBoxPreview.setSelectedVideoBox === "function"` both return `true`, and that loading the editor with an existing project (no video boxes yet) shows no new console errors.

- [ ] **Step 8: Commit**

```bash
git add static/video-box-preview.js static/preview.js static/css/components/stage.css
git commit -m "feat: video-box stage preview with cross-layer z-index compositing"
```

**Next session:** This task is independent and complete on its own (full behavior verified at Task 10). If continuing in the same session, move to Task 7 (`docs/superpowers/plans/2026-07-19-phase-3-video-box/task-7-timeline-row.md`), which is unrelated/independent. If dispatching separately, this should be subagent-driven with the same prompt shape as the other Batch 2 tasks.
