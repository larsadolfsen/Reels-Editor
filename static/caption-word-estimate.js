// Splits a multi-word CaptionWord-shaped object into per-word estimated sub-ranges by
// character offset within its own [t_start, t_end]; mirrors app/caption_word_estimate.py exactly.
// Exposes Timeline.estimateWordTimings. Depends on window.Timeline (load after timeline.js).
(() => {
  function estimateWordTimings(word) {
    const tokens = word.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const normalized = tokens.join(" ");
    const totalLen = normalized.length;
    const duration = word.t_end - word.t_start;
    const result = [];
    let offset = 0;
    tokens.forEach((token, i) => {
      const startFrac = offset / totalLen;
      const endFrac = (offset + token.length) / totalLen;
      result.push({
        id: `${word.id}-${i}`,
        text: token,
        t_start: word.t_start + startFrac * duration,
        t_end: word.t_start + endFrac * duration,
      });
      offset += token.length + 1;
    });
    return result;
  }

  Object.assign(window.Timeline, { estimateWordTimings });
})();
