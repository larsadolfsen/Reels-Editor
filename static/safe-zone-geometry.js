// Pixel-space mirror of static/ui-safe-zones.js's SAFE_ZONES percentages, on the 1080x1920
// export canvas. Single source of truth for default text/caption insert positions
// (panel-text.js, panel-captions.js), the position anchor grid's horizontal margin
// (static/anchor-position.js), and the two safe-zone-darkening-alignment feature safe rects
// (TEXT_IMAGE_SAFE_RECT/CAPTION_SAFE_RECT, consumed by anchor-position.js and ui-safe-zones.js).
// Derived from SAFE_ZONES, not hand-mirrored, since 2026-07-29.
const safeZoneGeometryGlobal = typeof window !== "undefined" ? window : global;

safeZoneGeometryGlobal.SafeZoneGeometry = (function deriveSafeZoneGeometry() {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const zoneByKey = Object.fromEntries(safeZoneGeometryGlobal.SAFE_ZONES.map((z) => [z.key, z]));
  // Percent-of-canvas math (e.g. 0.06 * 1920) lands on values like 115.19999999999999 due to
  // binary floating point — round to squash that drift back to the clean decimal.
  const round = (n) => Math.round(n * 1e6) / 1e6;

  // Bottom edge of the top-nav safe zone.
  const TOP_ZONE_BOTTOM = round((zoneByKey.top.inset.height / 100) * CANVAS_H);
  // Top edge of the caption-area safe zone.
  const CAPTION_ZONE_TOP = round((1 - zoneByKey.caption.inset.bottom / 100 - zoneByKey.caption.inset.height / 100) * CANVAS_H);
  // Bottom edge of the caption-area safe zone.
  const CAPTION_ZONE_BOTTOM = round((1 - zoneByKey.caption.inset.bottom / 100) * CANVAS_H);
  // Width of the right icon-rail safe zone, mirrored on the left.
  const HORIZONTAL_MARGIN = round((zoneByKey.right.inset.width / 100) * CANVAS_W);

  // The centered text/image safe rectangle (safe-zone-darkening-alignment feature): the right
  // icon-rail's margin mirrored onto the left, spanning from below the top-nav zone to above the
  // caption zone. This is the rect static/ui-safe-zones.js darkens around for kind="text" (the
  // default) and static/anchor-position.js snaps TOP/BTM/LEFT/RIGHT/MID to for kind="text".
  const TEXT_IMAGE_SAFE_RECT = {
    left: HORIZONTAL_MARGIN,
    right: CANVAS_W - HORIZONTAL_MARGIN,
    top: TOP_ZONE_BOTTOM,
    bottom: CAPTION_ZONE_TOP,
  };

  // The caption-only safe rectangle: exactly today's existing caption band bounds (left 0, right
  // margin, caption zone top/bottom) — unchanged from the pre-existing caption geometry. Active
  // for kind="caption" in both ui-safe-zones.js and anchor-position.js.
  const CAPTION_SAFE_RECT = {
    left: 0,
    right: CANVAS_W - HORIZONTAL_MARGIN,
    top: CAPTION_ZONE_TOP,
    bottom: CAPTION_ZONE_BOTTOM,
  };

  return {
    CANVAS_W,
    CANVAS_H,
    TOP_ZONE_BOTTOM,
    CAPTION_ZONE_TOP,
    CAPTION_ZONE_BOTTOM,
    HORIZONTAL_MARGIN,
    TEXT_IMAGE_SAFE_RECT,
    CAPTION_SAFE_RECT,
  };
})();
