// Shared canvas-based text measurer, used by caption pagination (preview-captions.js via
// app/caption_layout.py's paginate_words) to measure rendered glyph widths without a DOM
// text node. Mirrors app/font_metrics.py's pil_font_measurer.
// Exposes window.FontFit.{canvasMeasurer}.
window.FontFit = (() => {
  let sharedCanvas = null;
  function canvasMeasurer(fontFamily, sizePx, { weight = 400, italic = false } = {}) {
    if (!sharedCanvas) sharedCanvas = document.createElement("canvas");
    const ctx = sharedCanvas.getContext("2d");
    const style = italic ? "italic " : "";
    ctx.font = `${style}${weight} ${sizePx}px "${fontFamily}"`;
    return (text) => ctx.measureText(text).width;
  }

  return { canvasMeasurer };
})();
