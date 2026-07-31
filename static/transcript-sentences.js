// Pure sentence-grouping over a flat CaptionWord[] list: splits into groups ending at any word
// whose text ends in ".", "!", or "?" — a trailing run with no terminal punctuation still forms
// a final group so no words are dropped. Consumed by static/transcript-sidebar.js. No Python
// mirror: editor-display-only, not part of export/ASS rendering.
(() => {
  function buildSentence(words) {
    return { start: words[0].t_start, end: words[words.length - 1].t_end, words };
  }

  function groupBySentence(words) {
    const sentences = [];
    let current = [];
    for (const word of words) {
      current.push(word);
      if (/[.!?]$/.test(word.text.trim())) {
        sentences.push(buildSentence(current));
        current = [];
      }
    }
    if (current.length > 0) sentences.push(buildSentence(current));
    return sentences;
  }

  const api = { groupBySentence };
  if (typeof window !== "undefined") window.TranscriptSentences = api;
  if (typeof module !== "undefined") module.exports = api;
})();
