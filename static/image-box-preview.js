// Stage preview for image-box (picture-in-picture) layers: mounts one <img> element per
// visible box into #overlay (a sibling of preview.js's text-block divs and
// video-box-preview.js's <video>s — all three set an explicit CSS z-index from their model's
// z_index so stacking follows the project's cross-layer z-order), keeps each element's
// position/size in sync with the timeline clock, and wires drag-to-move (UI.videoBoxDrag)/
// resize (UI.resizeHandles) onto the selected box. Exposes
// window.ImageBoxPreview.{render, setSelectedImageBox, setOnActivate}. No playback sync needed
// (static image) — simpler than video-box-preview.js's currentTime/play/pause handling.
// Applies BoxMask.clipPath(box) as the element's CSS clip-path so a mask_enabled box is cut
// along its straight line (added 2026-07-29, box edge mask); unmasked boxes get "" (no clipping).
// Also mounts the on-stage cut-line guide (UI.maskLineDrag, static/ui-mask-line-drag.js) for the
// selected box while its mask is on, reporting drags through setOnMaskChange(fn) as
// fn({angle, offset}, done) — done=false live during the drag, true once on mouseup.
window.ImageBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <img>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;
  let onActivate = null; // (boxId) => void, fired by a plain click on an unselected box in Select mode
  let onMaskChange = null;   // ({angle, offset}, done) => void, fired by the mask-line drag guide
  let maskGuide = null;      // the UI.maskLineDrag handle for the selected box, if it is masked
  let maskGuideBoxId = null; // which box the mounted guide belongs to
  let maskGuideBox = null;   // the box object the guide's getRect/getMask closures should read live
  let maskGuideEl = null;    // the <img> element the guide's getRect closure should read live

  function boxEnd(b) {
    return b.start + b.duration;
  }

  function mountHandles(boxId, img, b) {
    if (handlesDestroyers.has(boxId)) return; // already mounted for this element
    const destroyDrag = UI.videoBoxDrag(img, {
      onMove: (delta) => { if (callbacks && callbacks.onMove) callbacks.onMove(delta); },
      onMoveEnd: (delta) => { if (callbacks && callbacks.onMoveEnd) callbacks.onMoveEnd(delta); },
    });
    const destroyResize = UI.resizeHandles(img, {
      getSize: () => ({ width: img.offsetWidth, height: img.offsetHeight }),
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

  function render(imageBoxes, timelineTime) {
    const activeIds = new Set();
    const stageW = overlay.clientWidth || 1;
    const stageH = overlay.clientHeight || 1;

    for (const b of imageBoxes) {
      // Visible only within its own start/duration window, selected or not — panel-image-box.js
      // seeks the playhead into that window when a box is selected, so it's still editable.
      const visible = b.start <= timelineTime && timelineTime < boxEnd(b);
      if (!visible) continue;
      activeIds.add(b.id);

      let img = mounted.get(b.id);
      if (!img) {
        img = document.createElement("img");
        img.className = "image-box";
        img.src = "/media?path=" + encodeURIComponent(b.file_path);
        img.style.pointerEvents = "auto";
        // Click-to-select (mirrors video-box-preview.js): a plain click on a not-yet-selected
        // box selects it, Select-tool only. In Text-tool mode this no-ops so the click bubbles
        // to #stage's click listener (stage-click-router.js) and is treated as insert-text-here.
        img.addEventListener("click", () => {
          if (b.id === selectedBoxId) return;
          if (!window.ToolMode || ToolMode.get() !== "select") return;
          if (onActivate) onActivate(b.id);
        });
        overlay.appendChild(img);
        mounted.set(b.id, img);
      }

      img.style.left = (b.x / 1080 * stageW) + "px";
      img.style.top = (b.y / 1920 * stageH) + "px";
      img.style.width = (b.width / 1080 * stageW) + "px";
      img.style.height = (b.height / 1920 * stageH) + "px";
      img.style.zIndex = String(b.z_index);
      // Straight-edge mask (box-mask.js): a percentage polygon, so it survives stage resizes
      // untouched. "" when the box is unmasked, which is exactly the pre-feature rendering.
      img.style.clipPath = BoxMask.clipPath(b);
      syncMaskGuide(b, img);

      if (b.id === selectedBoxId && callbacks) mountHandles(b.id, img, b);
      else unmountHandles(b.id);
    }

    for (const [id, img] of mounted) {
      if (!activeIds.has(id)) {
        if (id === selectedBoxId) unmountMaskGuide();
        unmountHandles(id);
        img.remove();
        mounted.delete(id);
      }
    }
  }

  function setSelectedImageBox(boxId, cb) {
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

  return { render, setSelectedImageBox, setOnActivate, setOnMaskChange };
})();
