// Drag-to-create for the Shape stage tool (window.ToolMode === "shape", shape-tool feature). On
// #stage mousedown with the Shape tool armed, tracks the drag, shows a live preview box (reusing
// the .shape-box CSS class), and on mouseup either creates a ShapeLayer sized to the drawn rect
// (if the drag was at least MIN_SHAPE_DRAG_PX in both dimensions) or does nothing (a plain click,
// or a drag too small to be intentional). On creation: selects the new shape, opens the Shape
// panel, and reverts ToolMode to "select" — mirrors stage-click-router.js's Text-tool "insert
// once, then select" pattern. Depends on window.ToolMode, window.CanvasPoint (canvas-point.js),
// window.ShapeDragRect (shape-draw-rect.js), ShapePanel.createShapeAt()/panel-shape.js,
// ShapePreview.render()/shape-preview.js, and editor.js's project/saveProject/panel-nav.js's
// onTimelineSelect — all classic-script globals resolved at event time, not at this script's
// load time, so load order relative to those files doesn't matter (same reasoning as
// stage-click-router.js).
(() => {
  const MIN_SHAPE_DRAG_PX = 8; // canvas px (of 1080 width / 1920 height); below this in either
                                // dimension, a drag is treated as an accidental/no-op click

  const stageEl = document.getElementById("stage");
  const overlayEl = document.getElementById("overlay");
  let previewDiv = null;
  let startPoint = null;

  function overlayRect() {
    return overlayEl.getBoundingClientRect();
  }

  function applyRectToPreview(rect) {
    const stageW = overlayEl.clientWidth || 1;
    const stageH = overlayEl.clientHeight || 1;
    previewDiv.style.left = (rect.x / 1080 * stageW) + "px";
    previewDiv.style.top = (rect.y / 1920 * stageH) + "px";
    previewDiv.style.width = (rect.width / 1080 * stageW) + "px";
    previewDiv.style.height = (rect.height / 1920 * stageH) + "px";
  }

  function onMouseMove(e) {
    const point = CanvasPoint.fromClient(e.clientX, e.clientY, overlayRect());
    applyRectToPreview(ShapeDragRect.fromPoints(startPoint, point));
  }

  async function onMouseUp(e) {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    const point = CanvasPoint.fromClient(e.clientX, e.clientY, overlayRect());
    const rect = ShapeDragRect.fromPoints(startPoint, point);
    previewDiv.remove();
    previewDiv = null;
    startPoint = null;

    if (rect.width < MIN_SHAPE_DRAG_PX || rect.height < MIN_SHAPE_DRAG_PX) return;

    const shape = ShapePanel.createShapeAt(rect);
    await saveProject();
    await onTimelineSelect({ type: "shape", item: shape });
    ShapePreview.render(project.shapes, Preview.currentTimelineTime());
    ToolMode.set("select");
  }

  stageEl.addEventListener("mousedown", (e) => {
    if (!window.ToolMode || ToolMode.get() !== "shape") return;
    if (e.button !== 0) return;
    e.preventDefault();
    startPoint = CanvasPoint.fromClient(e.clientX, e.clientY, overlayRect());

    previewDiv = document.createElement("div");
    previewDiv.className = "shape-box";
    previewDiv.style.pointerEvents = "none";
    previewDiv.style.zIndex = "9999";
    const defaults = ShapeDefaults.centeredShape();
    previewDiv.style.backgroundColor = ShapeColor.toRgba(defaults.fill_color, defaults.opacity);
    overlayEl.appendChild(previewDiv);
    applyRectToPreview({ x: startPoint.x, y: startPoint.y, width: 0, height: 0 });

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
})();
