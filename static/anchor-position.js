// Pure edge-flush anchor math for the TEXT/CAPTIONS POSITION shortcut buttons (TOP/BTM/LEFT/
// RIGHT/MID). Extracted from panel-text.js (safe-zone-darkening-alignment feature) so it can run
// under node --test without a DOM. Snaps to SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT (kind="text",
// default) or CAPTION_SAFE_RECT (kind="caption") instead of the raw canvas edges — using the
// box's own actual rendered width/height (from Preview.getTextBoxSize/getCaptionBoxSize) so
// TOP/BTM/LEFT/RIGHT place the box's edge (not its top-left corner) flush with the safe rect's
// edge, and MID centers it within the safe rect. Exposes window.AnchorPosition.{positionX,
// positionY} in the browser and the same object via module.exports for node --test.
(() => {
  function rectFor(kind) {
    return kind === "caption"
      ? SafeZoneGeometry.CAPTION_SAFE_RECT
      : SafeZoneGeometry.TEXT_IMAGE_SAFE_RECT;
  }

  // The box's rendered left edge is offset from `x` by a CSS transform keyed on text align
  // (stage.css's .text-block--align-*: 0 for left, -50% for center, -100% for right), so the
  // same edge-flush x must be shifted by that same fraction of the box width to compensate.
  function positionX(value, boxWidth, align, kind = "text") {
    const w = boxWidth || 0;
    const offsetFactor = align === "center" ? 0.5 : align === "right" ? 1 : 0;
    const rect = rectFor(kind);
    let visualLeft;
    if (value === "left") visualLeft = rect.left;
    else if (value === "right") visualLeft = Math.max(rect.left, rect.right - w);
    else visualLeft = Math.max(rect.left, (rect.left + rect.right - w) / 2);
    return visualLeft + offsetFactor * w;
  }

  function positionY(value, boxHeight, kind = "text") {
    const h = boxHeight || 0;
    const rect = rectFor(kind);
    if (value === "top") return rect.top;
    if (value === "btm") return Math.max(rect.top, rect.bottom - h);
    return Math.max(rect.top, (rect.top + rect.bottom - h) / 2);
  }

  const api = { positionX, positionY };
  if (typeof window !== "undefined") window.AnchorPosition = api;
  if (typeof module !== "undefined") module.exports = api;
})();
