// Pure word-wrap + pagination for the CAPTIONS box: packs caption words onto lines by measured
// pixel width, then paginates lines by box height. JS mirror of app/caption_layout.py's
// paginate_words — same algorithm, same page/line/word output shape. Depends on
// window.Timeline.estimateWordTimings (load after caption-word-estimate.js).
// Exposes window.CaptionLayout.paginateWords.
window.CaptionLayout = (() => {
  function paginateWords(words, measureFn, boxWidthPx, boxHeightPx, fontSizePx, lineHeightEm = 1.15) {
    const expanded = words.flatMap((word) => Timeline.estimateWordTimings(word));
    const sorted = expanded.sort((a, b) => a.t_start - b.t_start);
    if (sorted.length === 0) return [];

    const maxLines = Math.max(1, Math.floor(boxHeightPx / (fontSizePx * lineHeightEm)));
    const pages = [];
    let currentPage = [];
    let currentLine = [];
    let currentLineText = "";

    for (const word of sorted) {
      const candidate = currentLineText ? `${currentLineText} ${word.text}` : word.text;
      if (currentLine.length > 0 && measureFn(candidate) > boxWidthPx) {
        currentPage.push(currentLine);
        if (currentPage.length >= maxLines) {
          pages.push(currentPage);
          currentPage = [];
        }
        currentLine = [word];
        currentLineText = word.text;
      } else {
        currentLine.push(word);
        currentLineText = candidate;
      }
    }
    if (currentLine.length > 0) currentPage.push(currentLine);
    if (currentPage.length > 0) pages.push(currentPage);
    return pages;
  }

  return { paginateWords };
})();
