// Drag-to-resize for IMAGE BOX lanes in the merged overlays row: mousedown on a block's
// left- or right-edge `.timeline-resize-handle-start`/`-end` (rendered by timeline.js's
// addBlock when { resizable: true }) changes that ImageBoxLayer's `start`/`duration`,
// clamped to a 0.1s minimum duration and start clamped to >= 0 (as of 2026-08-01, two-ended
// overlay resize, via the shared static/timeline-edge-resize.js). Mirrors
// timeline-text-resize.js except it targets project.image_boxes and derives `duration`
// from `end - start` instead of storing `end` directly.
// Delegated on #row-overlays itself (persists across renders; only its children are rebuilt
// by Timeline.render), same pattern as timeline-text-resize.js/timeline-clip-drag.js.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-image-box.js's `ImageBoxPanel.render`; depends on window.Timeline (PX_PER_SEC) and
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
    const box = (project.image_boxes || []).find((b) => b.id === blockId);
    if (!box) return;

    const startX = e.clientX;
    const initialStart = box.start;
    const initialEnd = box.start + box.duration;
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
      box.start = start;
      box.duration = end - start;
      saveProject();
      renderTimeline();
      if (selected && selected.type === "image-box" && selected.item && selected.item.id === blockId) {
        ImageBoxPanel.render(blockId);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
