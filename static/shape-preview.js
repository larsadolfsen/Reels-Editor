// Stage preview for shape (vector rectangle) overlay layers: mounts one <div class="shape-box">
// per visible shape into #overlay (a sibling of preview.js's text-block divs and
// video-box-preview.js's/image-box-preview.js's elements — all set an explicit CSS z-index from
// their model's z_index so stacking follows the project's cross-layer z-order), keeps each
// element's position/size/fill/opacity/corner-radius in sync with the timeline clock, and wires
// drag-to-move (UI.videoBoxDrag) / resize (UI.resizeHandles) onto the selected shape. Unlike
// video/image boxes, resize is free-form (no aspect lock) — a shape has no source media aspect
// ratio to preserve. A shape referenced by some box's mask_shape_id only renders here while it
// is itself the selected shape (mask-edit mode) — otherwise it's a hidden mask source,
// composited via video-box-preview.js/image-box-preview.js instead.
// Exposes window.ShapePreview.{render, setSelectedShape, setOnActivate}.
window.ShapePreview = (() => {
  const overlay = document.getElementById("overlay");
  const mounted = new Map(); // shapeId -> <div>
  const handlesDestroyers = new Map(); // shapeId -> () => void, for resize/drag cleanup
  let selectedShapeId = null;
  let callbacks = null;
  let onActivate = null; // (shapeId) => void, fired by a plain click on an unselected shape in Select mode

  function shapeEnd(s) {
    return s.start + s.duration;
  }

  function mountHandles(shapeId, div) {
    if (handlesDestroyers.has(shapeId)) return; // already mounted for this element
    const destroyDrag = UI.videoBoxDrag(div, {
      onMove: (delta) => { if (callbacks && callbacks.onMove) callbacks.onMove(delta); },
      onMoveEnd: (delta) => { if (callbacks && callbacks.onMoveEnd) callbacks.onMoveEnd(delta); },
    });
    const destroyResize = UI.resizeHandles(div, {
      getSize: () => ({ width: div.offsetWidth, height: div.offsetHeight }),
      onResize: (size) => { if (callbacks && callbacks.onResize) callbacks.onResize(size); },
      onDragEnd: (size) => { if (callbacks && callbacks.onDragEnd) callbacks.onDragEnd(size); },
    });
    handlesDestroyers.set(shapeId, () => { destroyDrag(); destroyResize(); });
  }

  function unmountHandles(shapeId) {
    const destroy = handlesDestroyers.get(shapeId);
    if (destroy) { destroy(); handlesDestroyers.delete(shapeId); }
  }

  function render(shapes, timelineTime) {
    const activeIds = new Set();
    const stageW = overlay.clientWidth || 1;
    const stageH = overlay.clientHeight || 1;
    // Bare global `project` (classic-script sharing, mirrors video-box-preview.js's
    // maskingShapeFor/Task 7) — `shapes` here is just project.shapes, with no box context.
    const maskShapeIds = new Set(
      [...(project.video_boxes || []), ...(project.image_boxes || [])]
        .map((b) => b.mask_shape_id)
        .filter(Boolean),
    );

    for (const s of shapes) {
      if (maskShapeIds.has(s.id) && s.id !== selectedShapeId) continue;
      const visible = s.start <= timelineTime && timelineTime < shapeEnd(s);
      if (!visible) continue;
      activeIds.add(s.id);

      let div = mounted.get(s.id);
      if (!div) {
        div = document.createElement("div");
        div.className = "shape-box";
        div.style.pointerEvents = "auto";
        // Click-to-select (mirrors video-box-preview.js/image-box-preview.js): a plain click on
        // a not-yet-selected shape selects it, Select-tool only. In Text-tool mode this no-ops
        // so the click bubbles to #stage's click listener (stage-click-router.js) and is
        // treated as insert-text-here.
        div.addEventListener("click", () => {
          if (s.id === selectedShapeId) return;
          if (!window.ToolMode || ToolMode.get() !== "select") return;
          if (window.BoxMaskRender && BoxMaskRender.isActive()) return; // mask-page-selection fix
          if (onActivate) onActivate(s.id);
        });
        overlay.appendChild(div);
        mounted.set(s.id, div);
      }

      div.style.left = (s.x / 1080 * stageW) + "px";
      div.style.top = (s.y / 1920 * stageH) + "px";
      div.style.width = (s.width / 1080 * stageW) + "px";
      div.style.height = (s.height / 1920 * stageH) + "px";
      div.style.zIndex = String(s.z_index);
      // A shape being edited as a mask source (only ever rendered here while selected, see the
      // maskShapeIds skip above) isn't really "content" — its target box's own rubylith overlay
      // (box-mask-render.js) already shows what gets cut. Rendering it with its normal solid
      // fill/opacity paints a false rectangle of that color over the stage, so show only its
      // outline instead and leave the stage content beneath it visible.
      const isMask = maskShapeIds.has(s.id);
      div.classList.toggle("shape-box-mask-outline", isMask);
      div.style.backgroundColor = isMask ? "transparent" : ShapeColor.toRgba(s.fill_color, s.opacity);
      // Corner radius is stored in 1080x1920 canvas px; scale it the same way width/height are
      // scaled to the stage's actual rendered size, so it doesn't visually change with zoom.
      div.style.borderRadius = (s.corner_radius / 1080 * stageW) + "px";

      if (s.id === selectedShapeId && callbacks) mountHandles(s.id, div);
      else unmountHandles(s.id);
    }

    for (const [id, div] of mounted) {
      if (!activeIds.has(id)) {
        unmountHandles(id);
        div.remove();
        mounted.delete(id);
      }
    }
  }

  function setSelectedShape(shapeId, cb) {
    if (selectedShapeId && selectedShapeId !== shapeId) unmountHandles(selectedShapeId);
    selectedShapeId = shapeId;
    callbacks = cb || null;
  }

  function setOnActivate(fn) {
    onActivate = fn || null;
  }

  return { render, setSelectedShape, setOnActivate };
})();
