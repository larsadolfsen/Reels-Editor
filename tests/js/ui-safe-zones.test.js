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

// guideCss now returns one .safe-zone-dim rule whose mask-image data URI punches a rectangular
// hole matching the active safe rect in percent-of-100 coordinates, rather than 4 separately-
// positioned bars.
function decodeMaskSvg(css) {
  const match = css.match(/data:image\/svg\+xml,([^)]+)"\)/);
  assert.ok(match, "mask-image data URI not found in guideCss output");
  return decodeURIComponent(match[1]);
}

test("guideCss('text') masks a hole matching TEXT_IMAGE_SAFE_RECT (percent coords)", () => {
  delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
  const { guideCss } = require("../../static/ui-safe-zones.js");
  const css = guideCss("text");
  assert.match(css, /^\.safe-zone-dim \{ mask-image: url\("data:image\/svg\+xml,/);
  assert.match(css, /mask-size: 100% 100%;/);
  const svg = decodeMaskSvg(css);
  assert.match(svg, /<path fill-rule="evenodd" fill="#fff" d="M0,0 H100 V100 H0 Z M15,6 H85 V73 H15 Z"\/>/);
});

test("guideCss('caption') masks a hole matching CAPTION_SAFE_RECT (percent coords)", () => {
  delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
  const { guideCss } = require("../../static/ui-safe-zones.js");
  const css = guideCss("caption");
  const svg = decodeMaskSvg(css);
  assert.match(svg, /<path fill-rule="evenodd" fill="#fff" d="M0,0 H100 V100 H0 Z M15,73 H85 V93 H15 Z"\/>/);
});

// Regression: an earlier version drew the hole as a second, separately-filled <rect> on top of a
// full-canvas <rect> (both fully opaque). CSS mask-image keys off the ALPHA channel for a bare
// image source (not luminance, which only applies to a referenced <mask> element), so that
// "hole" rect — despite being black — still had alpha=255, identical to the surrounding fill, and
// produced no visible cutout in any browser. The fix uses one evenodd-filled <path> instead, so
// the hole region is genuinely unpainted (alpha 0). Pin the single-<path>, zero-<rect> shape so
// this can't silently regress back to the broken two-<rect> version.
test("guideCss's mask SVG uses a single evenodd path, never a separate <rect> for the hole", () => {
  delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
  const { guideCss } = require("../../static/ui-safe-zones.js");
  const svg = decodeMaskSvg(guideCss("text"));
  assert.strictEqual((svg.match(/<rect/g) || []).length, 0);
  assert.strictEqual((svg.match(/<path/g) || []).length, 1);
  assert.match(svg, /fill-rule="evenodd"/);
});
