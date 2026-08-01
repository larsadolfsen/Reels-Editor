// Pins that safe-zone-geometry.js's exported pixel constants match the values it hardcodes
// today (115.2 / 162 / 1401.6 / 1785.6), proving the derivation refactor is behavior-preserving.
const test = require("node:test");
const assert = require("node:assert");

delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
delete require.cache[require.resolve("../../static/safe-zone-geometry.js")];
require("../../static/ui-safe-zones.js");
require("../../static/safe-zone-geometry.js");

test("SAFE_ZONES defines exactly the 4 existing bands", () => {
  const keys = global.SAFE_ZONES.map((z) => z.key).sort();
  assert.deepStrictEqual(keys, ["caption", "nav", "right", "top"]);
});

test("SafeZoneGeometry derives the same pixel values it hardcodes today", () => {
  const g = global.SafeZoneGeometry;
  assert.strictEqual(g.CANVAS_W, 1080);
  assert.strictEqual(g.CANVAS_H, 1920);
  assert.strictEqual(g.TOP_ZONE_BOTTOM, 115.2);
  assert.strictEqual(g.CAPTION_ZONE_TOP, 1401.6);
  assert.strictEqual(g.CAPTION_ZONE_BOTTOM, 1785.6);
  assert.strictEqual(g.HORIZONTAL_MARGIN, 162);
});

test("SafeZoneGeometry derives TEXT_IMAGE_SAFE_RECT: mirrored margin, top-zone-to-caption-zone", () => {
  const g = global.SafeZoneGeometry;
  assert.deepStrictEqual(g.TEXT_IMAGE_SAFE_RECT, {
    left: 162,
    right: 918,
    top: 115.2,
    bottom: 1401.6,
  });
});

test("SafeZoneGeometry derives CAPTION_SAFE_RECT: today's existing caption band bounds", () => {
  const g = global.SafeZoneGeometry;
  assert.deepStrictEqual(g.CAPTION_SAFE_RECT, {
    left: 0,
    right: 918,
    top: 1401.6,
    bottom: 1785.6,
  });
});
