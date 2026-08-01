// Pure geometry shared by every panel that wires UI.resizeHandles onto a positioned box (VIDEO
// BOX, IMAGE BOX, SHAPE, TEXT). UI.resizeHandles anchors a resize at the box's own top-left corner
// — a west/north drag only changes width/height, leaving x/y untouched, which makes the box grow
// rightward/downward regardless of which handle was grabbed. anchoredPosition shifts x/y by the
// size delta on the w/n axes so the OPPOSITE edge stays fixed and the box visibly grows in the
// direction the user is dragging. Extracted after the same edge.includes("w")/"n" check was
// hand-copied into panel-video-box.js/panel-image-box.js/panel-shape.js and the fourth caller,
// panel-text.js, was missed entirely — see resize-anchor.test.js.
(() => {
  function anchoredPosition(x, y, width, height, newWidth, newHeight, edge) {
    return {
      x: edge.includes("w") ? x + (width - newWidth) : x,
      y: edge.includes("n") ? y + (height - newHeight) : y,
    };
  }

  const api = { anchoredPosition };
  if (typeof window !== "undefined") window.ResizeAnchor = api;
  if (typeof module !== "undefined") module.exports = api;
})();
