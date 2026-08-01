// Lock/unlock toggle + drag-to-reorder for the unified overlay z-order stack. A plain click
// (mousedown+mouseup with no vertical movement past THRESHOLD_PX) on a lane's
// .overlay-lane-handle (static/timeline.js's renderOverlaysRow) toggles that entry's `locked`
// field and re-renders. When unlocked, mousedown+vertical drag past the threshold instead
// reorders that entry (a text block, video box, or image box) among all overlay lanes,
// showing a thin horizontal .overlay-drop-indicator line (added layer-drag-insertion-indicator,
// same recipe as timeline-clip-drag.js's .clip-drop-indicator) snapped to the nearest lane
// boundary so the drop target is unambiguous while dragging. A locked entry's drag-follow
// visuals (including the indicator) are skipped entirely, but movement is still tracked
// independently (the `moved` flag) so that dragging a locked lane past the threshold and
// releasing does nothing at all — no unlock, no reorder — instead of the click-to-toggle path
// incorrectly firing on any non-dragging release. Releasing a real (unlocked) drag renumbers
// every entry's z_index to match the new order (OverlayLayers.renumber), saves, and re-renders.
// Delegated on #label-overlays itself (persists across renders; its children are rebuilt by
// Timeline.render). Depends on window.OverlayLayers (timeline-overlay-layers.js) and editor.js's
// project/saveProject/renderTimeline globals. Boundary Y positions are read from the actual
// rendered lane labels (collectBoundaries) rather than a fixed LANE_HEIGHT grid.
(() => {
  const THRESHOLD_PX = 4;

  const labelCol = document.getElementById("label-overlays");

  // Boundary Y positions (relative to labelCol's own top) are read from the actual rendered
  // top-level entry labels rather than assumed as a uniform LANE_HEIGHT grid, since a lane's
  // rendered height can vary (e.g. a resizable text/image-box/shape lane's own chrome).
  // Computed once at drag start (mousedown) — the DOM doesn't reflow during the drag itself,
  // only the dragged lane's own CSS transform changes, same reasoning as
  // timeline-clip-drag.js's sequenceBoundaries.
  function collectBoundaries() {
    const colRect = labelCol.getBoundingClientRect();
    const laneLabels = [...labelCol.querySelectorAll(".overlay-lane-label")];
    if (!laneLabels.length) return [0];
    const boundaries = laneLabels.map((el) => el.getBoundingClientRect().top - colRect.top);
    const last = laneLabels[laneLabels.length - 1];
    boundaries.push(last.getBoundingClientRect().bottom - colRect.top);
    return boundaries;
  }

  // `boundaries` holds entries.length+1 possible drop lines (before the first lane, between
  // each pair, after the last), in on-screen order. Returns the nearest boundary's own
  // position (`y`, for the indicator) plus the drop index adjusted for the dragged entry's
  // removal (`index`, for the actual splice on drop) — any boundary at or before the dragged
  // entry's own position needs no adjustment; any boundary after it shifts down by one, since
  // removing the dragged entry closes that gap.
  function nearestBoundary(contentY, boundaries, fromIndex) {
    let bestBoundaryIndex = 0, bestDist = Infinity;
    for (let i = 0; i < boundaries.length; i++) {
      const dist = Math.abs(boundaries[i] - contentY);
      if (dist < bestDist) { bestDist = dist; bestBoundaryIndex = i; }
    }
    const index = bestBoundaryIndex > fromIndex ? bestBoundaryIndex - 1 : bestBoundaryIndex;
    return { index, y: boundaries[bestBoundaryIndex] };
  }

  function getIndicator() {
    let el = document.getElementById("overlay-drop-indicator");
    if (!el) {
      el = document.createElement("div");
      el.id = "overlay-drop-indicator";
      el.className = "overlay-drop-indicator";
      labelCol.appendChild(el);
    }
    return el;
  }

  labelCol.addEventListener("mousedown", (e) => {
    const handle = e.target.closest(".overlay-lane-handle");
    if (!handle) return;
    const laneLabel = handle.closest(".overlay-lane-label");
    const entryId = laneLabel.dataset.entryId;

    const entries = OverlayLayers.mergedEntries(project);
    const entry = entries.find((en) => en.id === entryId);
    if (!entry) return;
    const wasLocked = !!entry.item.locked;
    const fromIndex = entries.findIndex((en) => en.id === entryId);
    // Read once, before any drag transform is applied — the dragged lane's own transform
    // never triggers reflow (it's a visual-only CSS transform), so these positions stay valid
    // for the whole gesture, including any expanded mask sub-lane heights baked into them.
    const boundaries = collectBoundaries();

    const startY = e.clientY;
    let dragging = false;
    let moved = false;

    const onMove = (moveEvent) => {
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dy) > THRESHOLD_PX) moved = true;
      if (wasLocked) return;
      if (!dragging && moved) {
        dragging = true;
        laneLabel.classList.add("dragging");
      }
      if (!dragging) return;
      laneLabel.style.transform = `translateY(${dy}px)`;

      const colRect = labelCol.getBoundingClientRect();
      const contentY = moveEvent.clientY - colRect.top;
      const { y: snapY } = nearestBoundary(contentY, boundaries, fromIndex);
      const indicator = getIndicator();
      indicator.style.top = `${snapY}px`;
      indicator.style.display = "block";
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      laneLabel.classList.remove("dragging");
      laneLabel.style.transform = "";
      const indicator = document.getElementById("overlay-drop-indicator");
      if (indicator) indicator.style.display = "none";

      if (!moved) {
        // Plain click (no drag movement): toggle the lock, regardless of prior state.
        entry.item.locked = !wasLocked;
        saveProject();
        renderTimeline();
        return;
      }
      if (!dragging) return;

      const freshEntries = OverlayLayers.mergedEntries(project);
      const freshFromIndex = freshEntries.findIndex((en) => en.id === entryId);
      if (freshFromIndex === -1) return;
      const colRect = labelCol.getBoundingClientRect();
      const contentY = upEvent.clientY - colRect.top;
      const { index: toIndex } = nearestBoundary(contentY, boundaries, freshFromIndex);
      if (toIndex === freshFromIndex) return;

      const reordered = [...freshEntries];
      const [movedEntry] = reordered.splice(freshFromIndex, 1);
      reordered.splice(toIndex, 0, movedEntry);
      OverlayLayers.renumber(reordered);
      saveProject();
      renderTimeline();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
