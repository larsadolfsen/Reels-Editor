// Drag-to-reorder for the unified overlay z-order stack: mousedown on a lane's hover-reveal
// grip handle (.overlay-lane-handle, static/timeline.js's renderOverlaysRow) + vertical drag
// past a threshold reorders that entry (a text block, video box, or image box) among all overlay lanes.
// Releasing renumbers every entry's z_index to match the new order (OverlayLayers.renumber),
// saves, and re-renders — this replaces the removed #panel-layers side-panel's drag-and-drop
// list with the same mergedEntries/renumber logic, moved onto the timeline. Delegated on
// #label-overlays itself (persists across renders; its children are rebuilt by
// Timeline.render). Depends on window.OverlayLayers (timeline-overlay-layers.js) and
// editor.js's project/saveProject/renderTimeline globals.
(() => {
  const THRESHOLD_PX = 4;
  const LANE_HEIGHT = 44;

  const labelCol = document.getElementById("label-overlays");

  labelCol.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".overlay-lane-handle");
    if (!handle) return;
    const laneLabel = handle.closest(".overlay-lane-label");
    const entryId = laneLabel.dataset.entryId;

    const startY = e.clientY;
    let dragging = false;

    const onMove = (moveEvent) => {
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.abs(dy) > THRESHOLD_PX) {
        dragging = true;
        laneLabel.classList.add("dragging");
      }
      if (!dragging) return;
      laneLabel.style.transform = `translateY(${dy}px)`;
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      laneLabel.classList.remove("dragging");
      laneLabel.style.transform = "";
      if (!dragging) return;

      const entries = OverlayLayers.mergedEntries(project);
      const fromIndex = entries.findIndex((entry) => entry.id === entryId);
      if (fromIndex === -1) return;
      const colRect = labelCol.getBoundingClientRect();
      const contentY = upEvent.clientY - colRect.top;
      const toIndex = Math.max(0, Math.min(entries.length - 1, Math.floor(contentY / LANE_HEIGHT)));
      if (toIndex === fromIndex) return;

      const reordered = [...entries];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      OverlayLayers.renumber(reordered);
      saveProject();
      renderTimeline();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
