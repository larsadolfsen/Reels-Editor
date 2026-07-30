// Pixel-space mirror of static/ui-safe-zones.js's SAFE_ZONES percentages, on the 1080x1920
// export canvas. Single source of truth for default text/caption insert positions
// (panel-text.js, panel-captions.js) and the position anchor grid's horizontal margin
// (panel-text.js's anchorPositionX). Derived from SAFE_ZONES, not hand-mirrored, since 2026-07-29.
const safeZoneGeometryGlobal = typeof window !== "undefined" ? window : global;

safeZoneGeometryGlobal.SafeZoneGeometry = (function deriveSafeZoneGeometry() {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const zoneByKey = Object.fromEntries(safeZoneGeometryGlobal.SAFE_ZONES.map((z) => [z.key, z]));
  // Percent-of-canvas math (e.g. 0.06 * 1920) lands on values like 115.19999999999999 due to
  // binary floating point — round to squash that drift back to the clean decimal.
  const round = (n) => Math.round(n * 1e6) / 1e6;

  return {
    CANVAS_W,
    CANVAS_H,
    // Bottom edge of the top-nav safe zone.
    TOP_ZONE_BOTTOM: round((zoneByKey.top.inset.height / 100) * CANVAS_H),
    // Top edge of the caption-area safe zone.
    CAPTION_ZONE_TOP: round((1 - zoneByKey.caption.inset.bottom / 100 - zoneByKey.caption.inset.height / 100) * CANVAS_H),
    // Bottom edge of the caption-area safe zone.
    CAPTION_ZONE_BOTTOM: round((1 - zoneByKey.caption.inset.bottom / 100) * CANVAS_H),
    // Width of the right icon-rail safe zone, mirrored on the left.
    HORIZONTAL_MARGIN: round((zoneByKey.right.inset.width / 100) * CANVAS_W),
  };
})();
