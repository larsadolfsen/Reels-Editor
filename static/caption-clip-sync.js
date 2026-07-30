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

  function findOwningRange(ranges, t) {
    return ranges.find((r) => t >= r.start && t < r.end) || null;
  }

  // Drag-reorder is a non-monotonic permutation (unlike delete/insert's single splice point):
  // each word is shifted by its own owning clip's start delta, found by matching clip id between
  // the pre- and post-reorder clipRanges() snapshots.
  function resyncCaptionsAfterReorder(words, oldRanges, newRanges) {
    const newById = new Map(newRanges.map((r) => [r.id, r]));
    return words.map((w) => {
      const oldRange = findOwningRange(oldRanges, w.t_start);
      if (!oldRange) return w;
      const newRange = newById.get(oldRange.id);
      if (!newRange) return w;
      const delta = newRange.start - oldRange.start;
      if (delta === 0) return w;
      // Round to avoid floating-point precision errors when applying negative deltas.
      const newStart = Math.round((w.t_start + delta) * 1e10) / 1e10;
      const newEnd = Math.round((w.t_end + delta) * 1e10) / 1e10;
      return { ...w, t_start: newStart, t_end: newEnd };
    });
  }

  const api = { clipRanges, shiftCaptionsAfterEdit, resyncCaptionsAfterReorder };
  if (typeof window !== "undefined") window.CaptionClipSync = api;
  if (typeof module !== "undefined") module.exports = api;
})();
