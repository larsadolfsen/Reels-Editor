// Pure text-fit math for the BOX accordion's FILL mode: word-wrap plus a canvas-based
// font-size binary search. Mirrors app/font_metrics.py's wrap_text/pil_font_measurer.
// Exposes window.FontFit.{wrapText, canvasMeasurer, fitFontSize}.
window.FontFit = (() => {
  function wrapText(text, measureFn, maxWidthPx) {
    const outLines = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(" ");
      let line = words[0];
      for (const word of words.slice(1)) {
        const candidate = `${line} ${word}`;
        if (measureFn(candidate) <= maxWidthPx) {
          line = candidate;
        } else {
          outLines.push(line);
          line = word;
        }
      }
      outLines.push(line);
    }
    return outLines.join("\n");
  }

  let sharedCanvas = null;
  function canvasMeasurer(fontFamily, sizePx, { bold = false, italic = false } = {}) {
    if (!sharedCanvas) sharedCanvas = document.createElement("canvas");
    const ctx = sharedCanvas.getContext("2d");
    const weight = bold ? "bold " : "";
    const style = italic ? "italic " : "";
    ctx.font = `${style}${weight}${sizePx}px "${fontFamily}"`;
    return (text) => ctx.measureText(text).width;
  }

  function fitFontSize(text, measurerFactory, boxWidthPx, boxHeightPx,
      { minSize = 24, maxSize = 200, padXEm = 0.35, padYEm = 0.15, lineHeight = 1.15 } = {}) {
    function evalSize(size) {
      const measure = measurerFactory(size);
      const padX = padXEm * size * 2;
      const padY = padYEm * size * 2;
      const wrapped = wrapText(text, measure, Math.max(1, boxWidthPx - padX));
      const lines = wrapped.split("\n");
      const width = Math.max(...lines.map(measure)) + padX;
      const height = lines.length * size * lineHeight + padY;
      return { fits: width <= boxWidthPx && height <= boxHeightPx, wrapped };
    }
    let lo = minSize, hi = maxSize;
    let best = evalSize(minSize);
    let bestSize = minSize;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const result = evalSize(mid);
      if (result.fits) {
        best = result;
        bestSize = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return { size: bestSize, wrappedText: best.wrapped };
  }

  return { wrapText, canvasMeasurer, fitFontSize };
})();
