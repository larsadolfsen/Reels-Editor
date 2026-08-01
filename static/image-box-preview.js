// Stage preview for image-box (picture-in-picture) layers: mounts one <img> element per
// visible box into #overlay (a sibling of preview.js's text-block divs and
// video-box-preview.js's <video>s — all three set an explicit CSS z-index from their model's
// z_index so stacking follows the project's cross-layer z-order), keeps each element's
// position/size in sync with the timeline clock, and wires drag-to-move (UI.videoBoxDrag)/
// resize (UI.resizeHandles) onto the selected box. Exposes
// window.ImageBoxPreview.{render, setSelectedImageBox, setOnActivate, setActiveMaskShapeId}.
// No playback sync needed (static image) — simpler than video-box-preview.js's
// currentTime/play/pause handling.
// Shape-as-mask (layer-masking-system): a box with mask_shape_id set looks up that ShapeLayer
// in the (bare-global, classic-script-shared) project.shapes, computes its rect in the box's
// local coordinate space via ShapeMask.localRect, and applies it as a CSS mask-image
// (ShapeMask.cssMaskImage) — soft-alpha, respecting the shape's opacity and corner_radius,
// unlike the retired box-edge-mask's hard clip-path. While the masking shape is the currently
// selected layer (setActiveMaskShapeId, called by panel-shape.js), an additional translucent
// red "rubylith" overlay div is drawn over the box showing exactly what the mask cuts away
// (ShapeMask.cssInverseMaskImage), matching Photoshop's quick-mask convention.
window.ImageBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <img>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;
  let onActivate = null; // (boxId) => void, fired by a plain click on an unselected box in Select mode
  let activeMaskShapeId = null; // shape id currently being edited as a mask (rubylith view); set by panel-shape.js via setActiveMaskShapeId
  const rubylithOverlays = new Map(); // boxId -> <div>, the translucent red "what gets cut" overlay shown only while its mask shape is selected

  function boxEnd(b) {
    return b.start + b.duration;
  }

  function maskingShapeFor(b) {
    if (!b.mask_shape_id) return null;
    return (project.shapes || []).find((s) => s.id === b.mask_shape_id) || null;
  }

  function syncMaskRendering(b, img) {
    const shape = maskingShapeFor(b);
    if (!shape) {
      img.style.maskImage = "";
      img.style.webkitMaskImage = "";
      const existing = rubylithOverlays.get(b.id);
      if (existing) { existing.remove(); rubylithOverlays.delete(b.id); }
      return;
    }
    const rect = ShapeMask.localRect(b, shape);
    const maskCss = ShapeMask.cssMaskImage(b.width, b.height, rect);
    img.style.maskImage = maskCss;
    img.style.webkitMaskImage = maskCss;
    img.style.maskRepeat = "no-repeat";
    img.style.webkitMaskRepeat = "no-repeat";

    let overlay = rubylithOverlays.get(b.id);
    if (shape.id === activeMaskShapeId) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "mask-rubylith-overlay";
        overlay.style.pointerEvents = "none";
        document.getElementById("overlay").appendChild(overlay);
        rubylithOverlays.set(b.id, overlay);
      }
      overlay.style.left = img.style.left;
      overlay.style.top = img.style.top;
      overlay.style.width = img.style.width;
      overlay.style.height = img.style.height;
      overlay.style.zIndex = "9999";
      const inverseCss = ShapeMask.cssInverseMaskImage(b.width, b.height, rect);
      overlay.style.maskImage = inverseCss;
      overlay.style.webkitMaskImage = inverseCss;
      overlay.style.maskRepeat = "no-repeat";
      overlay.style.webkitMaskRepeat = "no-repeat";
    } else if (overlay) {
      overlay.remove();
      rubylithOverlays.delete(b.id);
    }
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
      syncMaskRendering(b, img);

      if (b.id === selectedBoxId && callbacks) mountHandles(b.id, img, b);
      else unmountHandles(b.id);
    }

    for (const [id, img] of mounted) {
      if (!activeIds.has(id)) {
        unmountHandles(id);
        img.remove();
        mounted.delete(id);
        const overlay = rubylithOverlays.get(id);
        if (overlay) { overlay.remove(); rubylithOverlays.delete(id); }
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
    activeMaskShapeId = shapeId || null;
  }

  return { render, setSelectedImageBox, setOnActivate, setActiveMaskShapeId };
})();
