// Drag-to-resize for TEXT-row blocks: mousedown on a block's left- or right-edge
// `.timeline-resize-handle-start`/`-end` (rendered by timeline.js's addBlock when
// { resizable: true }) changes that TextBlockLayer's `start` or `end`, clamped to a 0.3s
// minimum duration and start clamped to >= 0 (as of 2026-08-01, two-ended overlay resize,
// via the shared static/timeline-edge-resize.js). Delegated on #row-overlays itself (the
// merged overlay stack; persists across renders; only its children are rebuilt by
// Timeline.render), same pattern as timeline-clip-drag.js. Video box lanes in the same
// container have no resize handle, so this delegation is unaffected by the TEXT/VIDEO BOX
// merge.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-text.js's `renderTextPanel`; depends on window.Timeline (PX_PER_SEC) and
// window.TimelineEdgeResize already existing, so this file must load after timeline.js and
// timeline-edge-resize.js.
(() => {
  const MIN_DURATION = 0.3;

  const row = document.getElementById("row-overlays");

  row.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".timeline-resize-handle");
    if (!handle) return;
    e.stopPropagation();
    const edge = handle.classList.contains("timeline-resize-handle-start") ? "start" : "end";
    const blockEl = handle.closest(".timeline-block");
    const blockId = blockEl.dataset.blockId;
    const block = (project.text_blocks || []).find((b) => b.id === blockId);
    if (!block) return;

    const startX = e.clientX;
    const initialStart = block.start;
    const initialEnd = block.end;
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
      block.start = start;
      block.end = end;
      saveProject();
      renderTimeline();
      if (selected && selected.type === "text" && selected.item && selected.item.id === blockId) {
        renderTextPanel();
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
