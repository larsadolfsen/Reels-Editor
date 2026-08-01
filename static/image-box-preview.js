// Stage preview for image-box (picture-in-picture) layers: mounts one <img> element per
// visible box into #overlay (a sibling of preview.js's text-block divs and
// video-box-preview.js's <video>s — all three set an explicit CSS z-index from their model's
// z_index so stacking follows the project's cross-layer z-order), keeps each element's
// position/size in sync with the timeline clock, and wires drag-to-move (UI.videoBoxDrag)/
// resize onto the selected box — the resize handles themselves are hosted in a sibling overlay
// div (static/box-resize-overlay.js), since a UI.resizeHandles container appended directly onto
// an <img> never paints (replaced elements don't render DOM children). Exposes
// window.ImageBoxPreview.{render, setSelectedImageBox, setOnActivate, setActiveMaskShapeId}.
// No playback sync needed (static image) — simpler than video-box-preview.js's
// currentTime/play/pause handling.
// Shape-as-mask (layer-masking-system): rendering of a box's mask_shape_id — CSS mask-image via
// ShapeMask, plus the rubylith "what gets cut" overlay shown while the mask shape is selected —
// is shared with video-box-preview.js via static/box-mask-render.js (BoxMaskRender.sync/release);
// setActiveMaskShapeId below just delegates to that shared module so this file's public API is
// unchanged for existing callers (panel-shape.js, panel-nav.js).
window.ImageBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <img>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;
  let onActivate = null; // (boxId) => void, fired by a plain click on an unselected box in Select mode

  function boxEnd(b) {
    return b.start + b.duration;
  }

  function mountHandles(boxId, img, b) {
    if (handlesDestroyers.has(boxId)) return; // already mounted for this element
    const destroyDrag = UI.videoBoxDrag(img, {
      onMove: (delta) => { if (callbacks && callbacks.onMove) callbacks.onMove(delta); },
      onMoveEnd: (delta) => { if (callbacks && callbacks.onMoveEnd) callbacks.onMoveEnd(delta); },
    });
    BoxResizeOverlay.mount(boxId, img, {
      onResize: (size) => { if (callbacks && callbacks.onResize) callbacks.onResize(size); },
      onDragEnd: (size) => { if (callbacks && callbacks.onDragEnd) callbacks.onDragEnd(size); },
    });
    handlesDestroyers.set(boxId, () => { destroyDrag(); BoxResizeOverlay.unmount(boxId); });
  }

  function unmountHandles(boxId) {
    const destroy = handlesDestroyers.get(boxId);
    if (destroy) { destroy(); handlesDestroyers.delete(boxId); }
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
          if (window.BoxMaskRender && BoxMaskRender.isActive()) return; // mask-page-selection fix
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
      BoxMaskRender.sync(b, img);

      if (b.id === selectedBoxId && callbacks) { mountHandles(b.id, img, b); BoxResizeOverlay.sync(b.id, img); }
      else unmountHandles(b.id);
    }

    for (const [id, img] of mounted) {
      if (!activeIds.has(id)) {
        unmountHandles(id);
        img.remove();
        mounted.delete(id);
        BoxMaskRender.release(id);
      }
    }
  }

  function setSelectedImageBox(boxId, cb) {
    if (selectedBoxId && selectedBoxId !== boxId) unmountHandles(selectedBoxId);
    selectedBoxId = boxId;
    callbacks = cb || null;
  }

  function setOnActivate(fn) {
    onActivate = fn || null;
  }

  function setActiveMaskShapeId(shapeId) {
    BoxMaskRender.setActiveMaskShapeId(shapeId);
  }

  return { render, setSelectedImageBox, setOnActivate, setActiveMaskShapeId };
})();
