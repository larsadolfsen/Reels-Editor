// Stage preview for video-box (picture-in-picture) layers: mounts one <video> element per
// visible box into #overlay (a sibling of preview.js's text-block divs — both set an explicit
// CSS z-index from their model's z_index so stacking follows the project's cross-layer
// z-order), keeps each element's position/size/currentTime in sync with the timeline clock,
// and wires drag-to-move (UI.videoBoxDrag)/resize (UI.resizeHandles) onto the selected box.
// Exposes window.VideoBoxPreview.{render, setSelectedVideoBox, setOnActivate}. Muted always (no
// PiP audio). setOnActivate(fn) (added 2026-07-24, top-toolbar) fires fn(boxId) on a plain click
// on an unselected box while the Select tool is active — see the click listener below.
// Applies BoxMask.clipPath(box) as the element's CSS clip-path so a mask_enabled box is cut
// along its straight line (added 2026-07-29, box edge mask); unmasked boxes get "" (no clipping).
// Also mounts the on-stage cut-line guide (UI.maskLineDrag, static/ui-mask-line-drag.js) for the
// selected box while its mask is on, reporting drags through setOnMaskChange(fn) as
// fn({angle, offset}, done) — done=false live during the drag, true once on mouseup.
window.VideoBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <video>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;
  let onActivate = null; // (boxId) => void, fired by a plain click on an unselected box in Select mode
  let onMaskChange = null;   // ({angle, offset}, done) => void, fired by the mask-line drag guide
  let maskGuide = null;      // the UI.maskLineDrag handle for the selected box, if it is masked
  let maskGuideBoxId = null; // which box the mounted guide belongs to
  let maskGuideBox = null;   // the box object the guide's getRect/getMask closures should read live
  let maskGuideEl = null;    // the <video> element the guide's getRect closure should read live

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

  function unmountMaskGuide() {
    if (maskGuide) { maskGuide.destroy(); maskGuide = null; }
    maskGuideBoxId = null;
    maskGuideBox = null;
    maskGuideEl = null;
  }

  // The guide only exists for the selected box while its mask is on; every other case tears it
  // down, so switching selection or turning the mask off leaves no stray SVG in #overlay.
  // Only tears down the guide when THIS box owns it — render() calls this once per visible box,
  // so an unrelated box must not destroy the selected box's guide (it would never paint).
  //
  // maskGuideBox/maskGuideEl are refreshed on every call (before the `if (!maskGuide)` create
  // gate), and the guide's getRect/getMask closures read those module vars instead of closing
  // over this call's `box`/`el` arguments directly. Without that indirection, a later render
  // with a *different* box object for the same id — e.g. after undo/redo, where applyRestore()
  // reparses `project` into brand-new objects — would leave the guide's closures pinned to the
  // stale pre-restore box/element: `maskGuide` already exists, so the create gate is skipped and
  // the closures are never rebuilt, and the guide keeps drawing/dragging the superseded state.
  function syncMaskGuide(box, el) {
    if (!box.mask_enabled || box.id !== selectedBoxId) {
      if (maskGuideBoxId === box.id) unmountMaskGuide();
      return;
    }
    maskGuideBox = box;
    maskGuideEl = el;
    if (!maskGuide) {
      maskGuide = UI.maskLineDrag(overlay, {
        getRect: () => ({ left: maskGuideEl.offsetLeft, top: maskGuideEl.offsetTop,
                          width: maskGuideEl.offsetWidth, height: maskGuideEl.offsetHeight }),
        getMask: () => ({ angle: maskGuideBox.mask_angle || 0, offset: maskGuideBox.mask_offset || 0 }),
        onChange: (mask) => { if (onMaskChange) onMaskChange(mask, false); },
        onChangeEnd: (mask) => { if (onMaskChange) onMaskChange(mask, true); },
      });
      maskGuideBoxId = box.id;
    }
    maskGuide.render();
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
        // Click-to-select (added 2026-07-24, top-toolbar): a plain click on a not-yet-selected
        // box selects it, Select-tool only — once selected, mountHandles' own drag listener owns
        // clicks/drags on this element instead, so this returns early for the selected box. In
        // Text-tool mode this deliberately does nothing, so the click bubbles up to #stage's
        // click listener (stage-click-router.js) and is treated as "insert text on top" per the
        // top-toolbar design spec.
        video.addEventListener("click", () => {
          if (v.id === selectedBoxId) return;
          if (!window.ToolMode || ToolMode.get() !== "select") return;
          if (onActivate) onActivate(v.id);
        });
        overlay.appendChild(video);
        mounted.set(v.id, video);
      }

      video.style.left = (v.x / 1080 * stageW) + "px";
      video.style.top = (v.y / 1920 * stageH) + "px";
      video.style.width = (v.width / 1080 * stageW) + "px";
      video.style.height = (v.height / 1920 * stageH) + "px";
      video.style.zIndex = String(v.z_index);
      // Straight-edge mask (box-mask.js): a percentage polygon, so it survives stage resizes
      // untouched. "" when the box is unmasked, which is exactly the pre-feature rendering.
      video.style.clipPath = BoxMask.clipPath(v);
      syncMaskGuide(v, video);

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
        if (id === selectedBoxId) unmountMaskGuide();
        unmountHandles(id);
        video.remove();
        mounted.delete(id);
      }
    }
  }

  function setSelectedVideoBox(boxId, cb) {
    if (selectedBoxId && selectedBoxId !== boxId) unmountHandles(selectedBoxId);
    if (selectedBoxId !== boxId) unmountMaskGuide();
    selectedBoxId = boxId;
    callbacks = cb || null;
  }

  function setOnActivate(fn) {
    onActivate = fn || null;
  }

  function setOnMaskChange(fn) {
    onMaskChange = fn || null;
  }

  return { render, setSelectedVideoBox, setOnActivate, setOnMaskChange };
})();
