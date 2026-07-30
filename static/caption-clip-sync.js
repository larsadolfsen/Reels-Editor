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

  // One splice-point edit on the flat caption timeline, covering both delete and insert:
  // delete passes newDuration=0 (removes the range, shifts what follows left by oldDuration);
  // insert passes oldDuration=0 (nothing to remove, shifts what follows right by newDuration).
  function shiftCaptionsAfterEdit(words, editStart, oldDuration, newDuration) {
    const editEnd = editStart + oldDuration;
    const delta = newDuration - oldDuration;
    return words
      .filter((w) => !(w.t_start >= editStart && w.t_start < editEnd))
      .map((w) => {
        if (w.t_start >= editEnd) {
          return { ...w, t_start: w.t_start + delta, t_end: w.t_end + delta };
        }
        return w;
      });
  }

  const api = { clipRanges, shiftCaptionsAfterEdit };
  if (typeof window !== "undefined") window.CaptionClipSync = api;
  if (typeof module !== "undefined") module.exports = api;
})();
