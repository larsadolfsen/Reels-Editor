// Pure geometry for two-ended timeline duration resize (start-edge + end-edge), shared by
// timeline-text-resize.js/timeline-image-resize.js/timeline-shape-resize.js so the drag math
// isn't tripled across lane types x two edges. No DOM; exposes window.TimelineEdgeResize in
// the browser and the same object via module.exports for node --test.
(() => {
  // edge: "start" pulls the left edge (start moves, end fixed); "end" pulls the right edge
  // (end moves, start fixed). dx is the drag delta in seconds (already divided by px/sec by
  // the caller). Clamps start to >= 0 and duration to >= minDuration, measured from whichever
  // edge is fixed for this drag.
  function computeEdgeResize(edge, dx, initialStart, initialEnd, minDuration) {
    if (edge === "start") {
      const newStart = Math.min(Math.max(initialStart + dx, 0), initialEnd - minDuration);
      return { start: newStart, end: initialEnd };
    }
    const newEnd = Math.max(initialStart + minDuration, initialEnd + dx);
    return { start: initialStart, end: newEnd };
  }

  const api = { computeEdgeResize };
  if (typeof window !== "undefined") window.TimelineEdgeResize = api;
  if (typeof module !== "undefined") module.exports = api;
})();
