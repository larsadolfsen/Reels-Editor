// FillerWords.detectRanges: pure JS mirror of app/auto_slice.py's normalize_word/detect_filler_ranges
// — finds each caption word matching the project's filler-word list and returns its (start, end)
// timeline range. No DOM/fetch; consumed by caption-panel-filler-words.js's auto-remove button.
window.FillerWords = window.FillerWords || {};

// Unicode-aware equivalent of Python's `\w` (letters/digits/underscore under any script), so
// non-ASCII filler words (e.g. Danish "øh") normalize the same way on both sides.
const FILLER_PUNCT_RE = /^[^\p{L}\p{N}_']+|[^\p{L}\p{N}_']+$/gu;

FillerWords.normalizeWord = function (text) {
  return text.replace(FILLER_PUNCT_RE, "").toLowerCase();
};

FillerWords.detectRanges = function (words, fillerWords) {
  const normalizedFillers = new Set((fillerWords || []).map(FillerWords.normalizeWord));
  return (words || [])
    .filter((w) => normalizedFillers.has(FillerWords.normalizeWord(w.text)))
    .map((w) => ({ start: w.t_start, end: w.t_end }));
};
