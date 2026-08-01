// Shared shape-as-mask rendering (layer-masking-system) for video/image PiP boxes: a box with
// mask_shape_id set looks up that ShapeLayer in the (bare-global, classic-script-shared)
// project.shapes, computes its rect in the box's local coordinate space via ShapeMask.localRect,
// and applies it as a CSS mask-image (ShapeMask.cssMaskImage) — soft-alpha, respecting the
// shape's opacity and corner_radius. While the masking shape is the currently selected layer
// (setActiveMaskShapeId, called by panel-shape.js), an additional translucent red "rubylith"
// overlay div is drawn over the box showing exactly what the mask cuts away
// (ShapeMask.cssInverseMaskImage), matching Photoshop's quick-mask convention. Box-agnostic —
// works for a <video> (video-box-preview.js) or <img> (image-box-preview.js) element, keyed by
// the box's own id. Exposes window.BoxMaskRender.{sync, release, setActiveMaskShapeId}; both
// VideoBoxPreview and ImageBoxPreview re-export setActiveMaskShapeId so their public API is
// unchanged for existing callers (panel-shape.js, panel-nav.js).
window.BoxMaskRender = (() => {
  const overlayRoot = document.getElementById("overlay");
  let activeMaskShapeId = null; // shape id currently being edited as a mask (rubylith view)
  const rubylithOverlays = new Map(); // boxId -> <div>, the translucent red "what gets cut" overlay shown only while its mask shape is selected

  function maskingShapeFor(box) {
    if (!box.mask_shape_id) return null;
    return (project.shapes || []).find((s) => s.id === box.mask_shape_id) || null;
  }

  // Applies (or clears) `box`'s shape mask onto `el`, and shows/hides its rubylith overlay.
  function sync(box, el) {
    const shape = maskingShapeFor(box);
    if (!shape) {
      el.style.maskImage = "";
      el.style.webkitMaskImage = "";
      const existing = rubylithOverlays.get(box.id);
      if (existing) { existing.remove(); rubylithOverlays.delete(box.id); }
      return;
    }
    const rect = ShapeMask.localRect(box, shape);
    const maskCss = ShapeMask.cssMaskImage(box.width, box.height, rect);
    el.style.maskImage = maskCss;
    el.style.webkitMaskImage = maskCss;
    el.style.maskRepeat = "no-repeat";
    el.style.webkitMaskRepeat = "no-repeat";

    let overlay = rubylithOverlays.get(box.id);
    if (shape.id === activeMaskShapeId) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "mask-rubylith-overlay";
        overlay.style.pointerEvents = "none";
        overlayRoot.appendChild(overlay);
        rubylithOverlays.set(box.id, overlay);
      }
      overlay.style.left = el.style.left;
      overlay.style.top = el.style.top;
      overlay.style.width = el.style.width;
      overlay.style.height = el.style.height;
      const inverseCss = ShapeMask.cssInverseMaskImage(box.width, box.height, rect);
      overlay.style.maskImage = inverseCss;
      overlay.style.webkitMaskImage = inverseCss;
      overlay.style.maskRepeat = "no-repeat";
      overlay.style.webkitMaskRepeat = "no-repeat";
    } else if (overlay) {
      overlay.remove();
      rubylithOverlays.delete(box.id);
    }
  }

  // Cleans up a box's rubylith overlay once its element leaves the DOM (box no longer visible).
  function release(boxId) {
    const overlay = rubylithOverlays.get(boxId);
    if (overlay) { overlay.remove(); rubylithOverlays.delete(boxId); }
  }

  function setActiveMaskShapeId(shapeId) {
    activeMaskShapeId = shapeId || null;
  }

  return { sync, release, setActiveMaskShapeId };
})();
