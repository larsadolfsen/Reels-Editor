// Selection <-> character-offset mapping for one contenteditable .text-block element, plus a
// glyph hit-test used to distinguish "drag over text = select" from "drag over box padding = move".
// Exposes window.UI.{textSelectionOffsets, rangeContainsPoint}. Pure DOM reads, no state.
window.UI = window.UI || {};

window.UI.textSelectionOffsets = function textSelectionOffsets(div) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  if (!div.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== div) return null;

  const pre = range.cloneRange();
  pre.selectNodeContents(div);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const end = start + range.toString().length;
  return { start, end };
};

window.UI.rangeContainsPoint = function rangeContainsPoint(div, clientX, clientY) {
  // Deliberately walks only Text nodes rather than range.selectNodeContents(div) directly: the
  // stage mounts non-text children into this same div (e.g. ui-resize-handles.js's absolutely
  // positioned, inset:0 .resize-handles wrapper), and selectNodeContents's rects would include
  // that wrapper's box — which spans the *entire* element — turning every point in the box into
  // a "glyph hit" and defeating the empty-padding/move case entirely.
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    for (const r of rects) {
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return true;
    }
  }
  return false;
};
