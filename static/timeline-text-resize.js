// Drag-to-resize for TEXT-row blocks: mousedown on a block's right-edge
// `.timeline-resize-handle` (rendered by timeline.js's addBlock when { resizable: true })
// changes that TextBlockLayer's `end`, extending or shrinking its duration, clamped to a
// 0.3s minimum. Delegated on #row-overlays itself (the merged overlay stack; persists across
// renders; only its children are rebuilt by Timeline.render), same pattern as
// timeline-clip-drag.js. Video box lanes in the same container have no resize handle, so
// this delegation is unaffected by the TEXT/VIDEO BOX merge.
// Reaches into editor.js's `project`/`selected`/`saveProject`/`renderTimeline` globals and
// panel-text.js's `renderTextPanel`; depends on window.Timeline (PX_PER_SEC) already
// existing, so this file must load after timeline.js.
(() => {
  const MIN_DURATION = 0.3;

  const row = document.getElementById("row-overlays");

  row.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".timeline-resize-handle");
    if (!handle) return;
    e.stopPropagation();
    const blockEl = handle.closest(".timeline-block");
    const blockId = blockEl.dataset.blockId;
    const block = (project.text_blocks || []).find((b) => b.id === blockId);
    if (!block) return;

    const startX = e.clientX;
    const startEnd = block.end;
    const px = Timeline.PX_PER_SEC;

    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / px;
      const newEnd = Math.max(block.start + MIN_DURATION, startEnd + dx);
      blockEl.style.width = `${(newEnd - block.start) * px}px`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const dx = (upEvent.clientX - startX) / px;
      const newEnd = Math.max(block.start + MIN_DURATION, startEnd + dx);
      block.end = newEnd;
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
