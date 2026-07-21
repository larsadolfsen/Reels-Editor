// Drag-to-reorder for VIDEO-row clip blocks: mousedown + horizontal drag past a small
// threshold on a .timeline-block in #row-video moves that clip to a new sequence position via
// VideoPanel.moveClipTo. Below the threshold it's left alone — the block's own click listener
// (wired in timeline.js's addBlock) still fires the normal select behavior on mouseup.
// Delegated on #row-video itself (the container persists across renders; only its children
// are rebuilt by Timeline.render, so one listener added at load time keeps working forever —
// same reasoning as timeline.js's own scrollEl.dataset.sliceBound guard).
// Reaches into editor.js's `project` global and VideoPanel.moveClipTo; depends on
// window.Timeline (PX_PER_SEC) already existing, so this file must load after timeline.js.
(() => {
  const THRESHOLD_PX = 4;

  function clipDuration(c) {
    return (c.out_point - c.in_point) / (c.speed || 1);
  }

  function orderedClips() {
    return [...(project.clips || [])].sort((a, b) => a.order - b.order);
  }

  // Real on-screen boundary positions (content-space px) for the FULL clip sequence,
  // dragged clip included — sibling blocks never reflow during the drag (only the dragged
  // block itself moves, via CSS transform), so snapping must happen in that same, un-reflowed
  // coordinate space. There are n+1 boundaries for n clips (before the first, between each
  // pair, after the last).
  function sequenceBoundaries() {
    const px = Timeline.PX_PER_SEC;
    const bounds = [0];
    let acc = 0;
    for (const c of orderedClips()) {
      acc += clipDuration(c);
      bounds.push(acc * px);
    }
    return bounds;
  }

  // Finds the nearest full-sequence boundary to contentX, then translates its position among
  // all n+1 boundaries into a drop index among the n-1 clips VideoPanel.moveClipTo will see
  // once the dragged clip is removed (any boundary at or before the dragged clip's own start
  // needs no adjustment; any boundary at or after its end shifts down by one, since removing
  // the dragged clip closes that gap).
  function nearestReorderIndex(contentX, excludeClipId) {
    const bounds = sequenceBoundaries();
    let bestBoundaryIndex = 0, bestDist = Infinity, bestX = bounds[0];
    bounds.forEach((b, i) => {
      const dist = Math.abs(b - contentX);
      if (dist < bestDist) { bestDist = dist; bestBoundaryIndex = i; bestX = b; }
    });
    const draggedIndex = orderedClips().findIndex((c) => c.id === excludeClipId);
    const index = (draggedIndex !== -1 && bestBoundaryIndex > draggedIndex)
      ? bestBoundaryIndex - 1
      : bestBoundaryIndex;
    return { index, x: bestX };
  }

  function getIndicator(row) {
    let el = document.getElementById("clip-drop-indicator");
    if (!el) {
      el = document.createElement("div");
      el.id = "clip-drop-indicator";
      el.className = "clip-drop-indicator";
      row.appendChild(el);
    }
    return el;
  }

  const row = document.getElementById("row-video");

  row.addEventListener("mousedown", (e) => {
    const blockEl = e.target.closest(".timeline-block");
    if (!blockEl || !blockEl.dataset.clipId) return;
    const clipId = blockEl.dataset.clipId;
    const startX = e.clientX;
    let dragging = false;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!dragging && Math.abs(dx) > THRESHOLD_PX) {
        dragging = true;
        blockEl.classList.add("dragging");
      }
      if (!dragging) return;
      blockEl.style.transform = `translateX(${dx}px)`;
      const rowRect = row.getBoundingClientRect();
      const contentX = moveEvent.clientX - rowRect.left;
      const { x: snapX } = nearestReorderIndex(contentX, clipId);
      const indicator = getIndicator(row);
      indicator.style.left = `${snapX}px`;
      indicator.style.display = "block";
    };

    const onUp = (upEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      blockEl.classList.remove("dragging");
      blockEl.style.transform = "";
      const indicator = document.getElementById("clip-drop-indicator");
      if (indicator) indicator.style.display = "none";
      if (!dragging) return;
      const rowRect = row.getBoundingClientRect();
      const contentX = upEvent.clientX - rowRect.left;
      const { index } = nearestReorderIndex(contentX, clipId);
      VideoPanel.moveClipTo(clipId, index);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
})();
