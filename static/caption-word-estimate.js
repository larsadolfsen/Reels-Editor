// Splits a multi-word CaptionWord-shaped object into per-word estimated sub-ranges by
// character offset within its own [t_start, t_end]; mirrors app/caption_word_estimate.py exactly,
// including counting by Unicode code point (not UTF-16 code unit) so astral-plane characters
// (emoji, etc.) don't drift the split between the JS preview and the Python ASS export.
// Exposes Timeline.estimateWordTimings. Depends on window.Timeline (load after timeline.js).
(() => {
  // Code-point length, matching Python's len() on a str (which counts code points, not
  // UTF-16 code units like JS's native .length would for astral-plane characters).
  function codePointLength(s) {
    return [...s].length;
  }

  function estimateWordTimings(word) {
    const tokens = word.text.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const normalized = tokens.join(" ");
    const totalLen = codePointLength(normalized);
    const duration = word.t_end - word.t_start;
    const result = [];
    let offset = 0;
    tokens.forEach((token, i) => {
      const tokenLen = codePointLength(token);
      const startFrac = offset / totalLen;
      const endFrac = (offset + tokenLen) / totalLen;
      result.push({
        id: `${word.id}-${i}`,
        text: token,
        t_start: word.t_start + startFrac * duration,
        t_end: word.t_start + endFrac * duration,
      });
      offset += tokenLen + 1;
    });
    return result;
  }

  Object.assign(window.Timeline, { estimateWordTimings });
})();
