// Pure timeline-splice + per-clip-delta helpers keeping caption words aligned with the MAIN
// clip they overlap: shiftCaptionsAfterEdit() handles a clip delete/insert as one splice point,
// resyncCaptionsAfterReorder() handles drag-reorder (a non-monotonic permutation) via per-clip
// deltas. Pure: exposes window.CaptionClipSync in the browser and module.exports for node --test.
(() => {
  // Mirrors app/timeline.py's clip_starts: one {id, start, end} per clip, in .order, using each
  // clip's speed-scaled timeline duration (out_point - in_point) / speed.
  function clipRanges(clips) {
    const ordered = [...clips].sort((a, b) => a.order - b.order);
    let acc = 0;
    return ordered.map((c) => {
      const duration = (c.out_point - c.in_point) / (c.speed || 1);
      const range = { id: c.id, start: acc, end: acc + duration };
      acc += duration;
      return range;
    });
  }

  const api = { clipRanges };
  if (typeof window !== "undefined") window.CaptionClipSync = api;
  if (typeof module !== "undefined") module.exports = api;
})();
