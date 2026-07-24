// Pixel-space mirror of static/css/components/safe-zones.css's zone percentages, on the
// 1080x1920 export canvas. Single source of truth for default text/caption insert positions
// (panel-text.js, panel-captions.js) and the position anchor grid's horizontal margin
// (panel-text.js's anchorPositionX). Kept in sync with safe-zones.css by hand — no build step
// generates one from the other.
window.SafeZoneGeometry = {
  CANVAS_W: 1080,
  CANVAS_H: 1920,
  TOP_ZONE_BOTTOM: 115.2,       // 6% of 1920 - bottom edge of the top-nav safe zone
  CAPTION_ZONE_TOP: 1401.6,     // 73% of 1920 - top edge of the caption-area safe zone
  CAPTION_ZONE_BOTTOM: 1785.6,  // 93% of 1920 - bottom edge of the caption-area safe zone
  HORIZONTAL_MARGIN: 162,       // 15% of 1080 - width of the right icon-rail safe zone, mirrored on the left
};
