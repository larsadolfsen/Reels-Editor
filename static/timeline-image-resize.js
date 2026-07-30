// Drag-to-resize for IMAGE BOX lanes in the merged overlays row: mousedown on a block's
// right-edge `.timeline-resize-handle` (rendered by timeline.js's addBlock when
// { resizable: true }) changes that ImageBoxLayer's `duration`, extending or shrinking it,
// clamped to a 0.1s minimum (matching panel-image-box.js's DURATION field). Mirrors
// timeline-text-resize.js exactly except it targets project.image_boxes and writes
// `duration` directly instead of deriving it from `start`/`end`.
// Delegated on #row-overlays itself (persists across renders; only its children are rebuilt
// by Timeline.render), same pattern as timeline-text-resize.js/timeline-clip-drag.js.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-image-box.js's `ImageBoxPanel.render`; depends on window.Timeline (PX_PER_SEC)
// already existing, so this file must load after timeline.js.
(() => {
  const MIN_DURATION = 0.1;

  const row = document.getElementById("row-overlays");

  row.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".timeline-resize-handle");
    if (!handle) return;
    e.stopPropagation();
    const blockEl = handle.closest(".timeline-block");
    const blockId = blockEl.dataset.blockId;
    const box = (project.image_boxes || []).find((b) => b.id === blockId);
    if (!box) return;

    const startX = e.clientX;
    const startDuration = box.duration;
    const px = Timeline.PX_PER_SEC;

    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / px;
      const newDuration = Math.max(MIN_DURATION, startDuration + dx);
      blockEl.style.width = `${newDuration * px}px`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const dx = (upEvent.clientX - startX) / px;
      box.duration = Math.max(MIN_DURATION, startDuration + dx);
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
