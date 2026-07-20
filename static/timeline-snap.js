// Playhead snapping: pure helpers added onto the existing window.Timeline object.
// Depends on window.Timeline already existing (load after timeline.js, before editor.js).
(() => {
  function snapTime(t, boundaries, tolerancePx, pxPerSecond) {
    if (!boundaries || boundaries.length === 0) return t;
    let nearest = boundaries[0];
    let nearestDist = Math.abs(t - nearest);
    for (const b of boundaries) {
      const dist = Math.abs(t - b);
      if (dist < nearestDist) {
        nearest = b;
        nearestDist = dist;
      }
    }
    const toleranceSeconds = tolerancePx / pxPerSecond;
    return nearestDist <= toleranceSeconds ? nearest : t;
  }

  function collectBoundaries(project) {
    const boundaries = [];
    const clips = [...(project.clips || [])].sort((a, b) => a.order - b.order);
    let acc = 0;
    for (const c of clips) {
      const dur = c.out_point - c.in_point;
      boundaries.push(acc, acc + dur);
      acc += dur;
    }
    for (const b of project.text_blocks || []) boundaries.push(b.start, b.end);
    if (project.captions) {
      for (const g of Timeline.groupWords(project.captions.words)) boundaries.push(g[0].t_start);
    }
    return boundaries;
  }

  Object.assign(window.Timeline, { snapTime, collectBoundaries });
})();
