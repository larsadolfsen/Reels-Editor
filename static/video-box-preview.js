// Stage preview for video-box (picture-in-picture) layers: mounts one <video> element per
// visible box into #overlay (a sibling of preview.js's text-block divs — both set an explicit
// CSS z-index from their model's z_index so stacking follows the project's cross-layer
// z-order), keeps each element's position/size/currentTime in sync with the timeline clock,
// and wires drag-to-move (UI.videoBoxDrag)/resize (UI.resizeHandles) onto the selected box.
// Exposes window.VideoBoxPreview.{render, setSelectedVideoBox, setOnActivate,
// setActiveMaskShapeId}. Muted always (no PiP audio).
// Shape-as-mask (layer-masking-system): a box with mask_shape_id set looks up that ShapeLayer
// in the (bare-global, classic-script-shared) project.shapes, computes its rect in the box's
// local coordinate space via ShapeMask.localRect, and applies it as a CSS mask-image
// (ShapeMask.cssMaskImage) — soft-alpha, respecting the shape's opacity and corner_radius,
// unlike the retired box-edge-mask's hard clip-path. While the masking shape is the currently
// selected layer (setActiveMaskShapeId, called by panel-shape.js), an additional translucent
// red "rubylith" overlay div is drawn over the box showing exactly what the mask cuts away
// (ShapeMask.cssInverseMaskImage), matching Photoshop's quick-mask convention.
window.VideoBoxPreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // boxId -> <video>
  const handlesDestroyers = new Map(); // boxId -> () => void, for resize/drag cleanup
  let selectedBoxId = null;
  let callbacks = null;
  let onActivate = null; // (boxId) => void, fired by a plain click on an unselected box in Select mode
  let activeMaskShapeId = null; // shape id currently being edited as a mask (rubylith view); set by panel-shape.js via setActiveMaskShapeId
  const rubylithOverlays = new Map(); // boxId -> <div>, the translucent red "what gets cut" overlay shown only while its mask shape is selected

  function boxEnd(v) {
    return v.start + (v.out_point - v.in_point);
  }

  function maskingShapeFor(v) {
    if (!v.mask_shape_id) return null;
    return (project.shapes || []).find((s) => s.id === v.mask_shape_id) || null;
  }

  function syncMaskRendering(v, video) {
    const shape = maskingShapeFor(v);
    if (!shape) {
      video.style.maskImage = "";
      video.style.webkitMaskImage = "";
      const existing = rubylithOverlays.get(v.id);
      if (existing) { existing.remove(); rubylithOverlays.delete(v.id); }
      return;
    }
    const rect = ShapeMask.localRect(v, shape);
    const maskCss = ShapeMask.cssMaskImage(v.width, v.height, rect);
    video.style.maskImage = maskCss;
    video.style.webkitMaskImage = maskCss;
    video.style.maskRepeat = "no-repeat";
    video.style.webkitMaskRepeat = "no-repeat";

    let overlay = rubylithOverlays.get(v.id);
    if (shape.id === activeMaskShapeId) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "mask-rubylith-overlay";
        overlay.style.pointerEvents = "none";
        document.getElementById("overlay").appendChild(overlay);
        rubylithOverlays.set(v.id, overlay);
      }
      overlay.style.left = video.style.left;
      overlay.style.top = video.style.top;
      overlay.style.width = video.style.width;
      overlay.style.height = video.style.height;
      overlay.style.zIndex = "9999";
      const inverseCss = ShapeMask.cssInverseMaskImage(v.width, v.height, rect);
      overlay.style.maskImage = inverseCss;
      overlay.style.webkitMaskImage = inverseCss;
      overlay.style.maskRepeat = "no-repeat";
      overlay.style.webkitMaskRepeat = "no-repeat";
    } else if (overlay) {
      overlay.remove();
      rubylithOverlays.delete(v.id);
    }
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
      // Visible only within its own start/trim window, selected or not — panel-video-box.js
      // seeks the playhead into that window when a box is selected, so it's still editable.
      const visible = v.start <= timelineTime && timelineTime < boxEnd(v);
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
      syncMaskRendering(v, video);

      const inWindow = v.start <= timelineTime && timelineTime < boxEnd(v);
      if (inWindow) {
        const srcTime = v.in_point + (timelineTime - v.start);
        if (Math.abs(video.currentTime - srcTime) > 0.15) video.currentTime = srcTime;
      }
      // Only actually play while the main stage preview is playing (window.Preview.isPaused()) —
      // render() is also called on every scrub/seek and after edits while the stage is paused, and
      // used to call video.play() unconditionally whenever inWindow, which made a PiP box's video
      // run on its own regardless of the main play/pause state and jump back to its trimmed
      // in-point (looking like a "restart") the moment it was selected.
      const shouldPlay = inWindow && (!window.Preview || !window.Preview.isPaused());
      if (shouldPlay) {
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
        const overlay = rubylithOverlays.get(id);
        if (overlay) { overlay.remove(); rubylithOverlays.delete(id); }
      }
    }
  }

  function setSelectedVideoBox(boxId, cb) {
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

  return { render, setSelectedVideoBox, setOnActivate, setActiveMaskShapeId };
})();
