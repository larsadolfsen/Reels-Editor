// Lock/unlock toggle + drag-to-reorder for the unified overlay z-order stack. A plain click
// (mousedown+mouseup with no vertical movement) on a lane's .overlay-lane-handle
// (static/timeline.js's renderOverlaysRow) toggles that entry's `locked` field and re-renders.
// When unlocked, mousedown+vertical drag past a threshold instead reorders that entry (a text
// block, video box, or image box) among all overlay lanes; a locked entry's drag-follow logic
// is skipped entirely, so only the click-to-unlock path is reachable for it. Releasing a real
// drag renumbers every entry's z_index to match the new order (OverlayLayers.renumber), saves,
// and re-renders. Delegated on #label-overlays itself (persists across renders; its children
// are rebuilt by Timeline.render). Depends on window.OverlayLayers (timeline-overlay-layers.js)
// and editor.js's project/saveProject/renderTimeline globals.
(() => {
  const THRESHOLD_PX = 4;
  const LANE_HEIGHT = 44;

  const labelCol = document.getElementById("label-overlays");

  labelCol.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".overlay-lane-handle");
    if (!handle) return;
    const laneLabel = handle.closest(".overlay-lane-label");
    const entryId = laneLabel.dataset.entryId;

    const entries = OverlayLayers.mergedEntries(project);
    const entry = entries.find((en) => en.id === entryId);
    if (!entry) return;
    const wasLocked = !!entry.item.locked;

    const startY = e.clientY;
    let dragging = false;

    const onMove = (moveEvent) => {
      if (wasLocked) return;
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

      if (!dragging) {
        // Plain click (no drag movement): toggle the lock, regardless of prior state.
        entry.item.locked = !wasLocked;
        saveProject();
        renderTimeline();
        return;
      }

      const freshEntries = OverlayLayers.mergedEntries(project);
      const fromIndex = freshEntries.findIndex((en) => en.id === entryId);
      if (fromIndex === -1) return;
      const colRect = labelCol.getBoundingClientRect();
      const contentY = upEvent.clientY - colRect.top;
      const toIndex = Math.max(0, Math.min(freshEntries.length - 1, Math.floor(contentY / LANE_HEIGHT)));
      if (toIndex === fromIndex) return;

      const reordered = [...freshEntries];
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
