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

test("SafeZoneGeometry derives CAPTION_SAFE_RECT: mirrored margin, caption zone top-to-bottom", () => {
  const g = global.SafeZoneGeometry;
  assert.deepStrictEqual(g.CAPTION_SAFE_RECT, {
    left: 162,
    right: 918,
    top: 1401.6,
    bottom: 1785.6,
  });
});

test("rectToPercent converts a px rect to percent-of-canvas bounds", () => {
  delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
  const { rectToPercent } = require("../../static/ui-safe-zones.js");
  const pct = rectToPercent({ left: 162, right: 918, top: 115.2, bottom: 1401.6 });
  assert.strictEqual(pct.left, 15);
  assert.strictEqual(pct.right, 85);
  assert.strictEqual(pct.top, 6);
  assert.strictEqual(pct.bottom, 73);
});

// guideCss now returns one .safe-zone-border rule positioning/sizing that border to exactly cover
// the active safe rect, in percent-of-container coordinates, rather than masking a hole in a
// darkening overlay.
test("guideCss('text') positions the border over TEXT_IMAGE_SAFE_RECT (percent coords)", () => {
  delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
  const { guideCss } = require("../../static/ui-safe-zones.js");
  const css = guideCss("text");
  assert.strictEqual(css, ".safe-zone-border { left: 15%; top: 6%; width: 70%; height: 67%; }");
});

test("guideCss('caption') positions the border over CAPTION_SAFE_RECT (percent coords)", () => {
  delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
  const { guideCss } = require("../../static/ui-safe-zones.js");
  const css = guideCss("caption");
  assert.strictEqual(css, ".safe-zone-border { left: 15%; top: 73%; width: 70%; height: 20%; }");
});
