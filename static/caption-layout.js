// Pure word-wrap + pagination for the CAPTIONS box: packs caption words onto lines by measured
// pixel width, then paginates lines by box height. JS mirror of app/caption_layout.py's
// paginate_words — same algorithm, same page/line/word output shape. Depends on
// window.Timeline.estimateWordTimings (load after caption-word-estimate.js).
// Exposes window.CaptionLayout.paginateWords.
window.CaptionLayout = (() => {
  // A page is "active" on stage for its whole [firstWord.t_start, lastWord.t_end) span (see
  // preview-captions.js's activeCaptionPage). Without a gap-aware break, two sentences separated
  // by a real pause could still land on the same page purely because they fit the box visually,
  // leaving the caption visibly frozen on screen through the silence between them. A gap this
  // long forces a fresh page instead. Mirrors app/caption_layout.py's GAP_BREAK_SECONDS.
  const GAP_BREAK_SECONDS = 1.0;

  function paginateWords(words, measureFn, boxWidthPx, boxHeightPx, fontSizePx, lineHeightEm = 1.15) {
    const expanded = words.flatMap((word) => Timeline.estimateWordTimings(word));
    const sorted = expanded.sort((a, b) => a.t_start - b.t_start);
    if (sorted.length === 0) return [];

    const maxLines = Math.max(1, Math.floor(boxHeightPx / (fontSizePx * lineHeightEm)));
    const pages = [];
    let currentPage = [];
    let currentLine = [];
    let currentLineText = "";
    let prevEnd = null;

    for (const word of sorted) {
      if (prevEnd !== null && word.t_start - prevEnd > GAP_BREAK_SECONDS) {
        if (currentLine.length > 0) {
          currentPage.push(currentLine);
          currentLine = [];
          currentLineText = "";
        }
        if (currentPage.length > 0) {
          pages.push(currentPage);
          currentPage = [];
        }
      }
      prevEnd = word.t_end;

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
