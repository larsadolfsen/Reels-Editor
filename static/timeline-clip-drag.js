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

  // Cumulative-time boundary positions (content-space px), among every clip except the one
  // being dragged. There are n+1 boundaries for n remaining clips (before the first, between
  // each pair, after the last) — the index of the nearest one is exactly the drop index
  // VideoPanel.moveClipTo expects.
  function reorderBoundaries(excludeClipId) {
    const px = Timeline.PX_PER_SEC;
    const rest = orderedClips().filter((c) => c.id !== excludeClipId);
    const bounds = [0];
    let acc = 0;
    for (const c of rest) {
      acc += clipDuration(c);
      bounds.push(acc * px);
    }
    return bounds;
  }

  function nearestReorderIndex(contentX, excludeClipId) {
    const bounds = reorderBoundaries(excludeClipId);
    let bestIndex = 0, bestDist = Infinity, bestX = bounds[0];
    bounds.forEach((b, i) => {
      const dist = Math.abs(b - contentX);
      if (dist < bestDist) { bestDist = dist; bestIndex = i; bestX = b; }
    });
    return { index: bestIndex, x: bestX };
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
