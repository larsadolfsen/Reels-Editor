// Drag-to-resize for SHAPE lanes in the merged overlays row: mousedown on a block's
// left- or right-edge `.timeline-resize-handle-start`/`-end` (rendered by timeline.js's
// addBlock when { resizable: true }) changes that ShapeLayer's `start`/`duration`, clamped
// to a 0.1s minimum duration and start clamped to >= 0 (as of 2026-08-01, two-ended overlay
// resize, via the shared static/timeline-edge-resize.js). Mirrors
// timeline-image-resize.js exactly, targeting project.shapes instead of
// project.image_boxes.
// Delegated on #row-overlays itself (persists across renders; only its children are rebuilt
// by Timeline.render), same pattern as timeline-image-resize.js/timeline-clip-drag.js.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-shape.js's `ShapePanel.render`; depends on window.Timeline (PX_PER_SEC) and
// window.TimelineEdgeResize already existing, so this file must load after timeline.js and
// timeline-edge-resize.js.
(() => {
  const MIN_DURATION = 0.1;

  const row = document.getElementById("row-overlays");

  row.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".timeline-resize-handle");
    if (!handle) return;
    e.stopPropagation();
    const edge = handle.classList.contains("timeline-resize-handle-start") ? "start" : "end";
    const blockEl = handle.closest(".timeline-block");
    const blockId = blockEl.dataset.blockId;
    const shape = (project.shapes || []).find((s) => s.id === blockId);
    if (!shape) return;

    const startX = e.clientX;
    const initialStart = shape.start;
    const initialEnd = shape.start + shape.duration;
    const px = Timeline.PX_PER_SEC;

    const applyResize = (clientX) => {
      const dx = (clientX - startX) / px;
      return TimelineEdgeResize.computeEdgeResize(edge, dx, initialStart, initialEnd, MIN_DURATION);
    };

    const onMove = (moveEvent) => {
      const { start, end } = applyResize(moveEvent.clientX);
      blockEl.style.left = `${start * px}px`;
      blockEl.style.width = `${(end - start) * px}px`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const { start, end } = applyResize(upEvent.clientX);
      shape.start = start;
      shape.duration = end - start;
      saveProject();
      renderTimeline();
      if (selected && selected.type === "shape" && selected.item && selected.item.id === blockId) {
        ShapePanel.render(blockId);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
