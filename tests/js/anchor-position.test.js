// Pins AnchorPosition.positionX/positionY against SafeZoneGeometry's derived safe rects for both
// kinds. Requires ui-safe-zones.js + safe-zone-geometry.js first (same pattern as
// ui-safe-zones.test.js) so SafeZoneGeometry is populated on `global` before anchor-position.js
// reads it.
const test = require("node:test");
const assert = require("node:assert");

delete require.cache[require.resolve("../../static/ui-safe-zones.js")];
delete require.cache[require.resolve("../../static/safe-zone-geometry.js")];
delete require.cache[require.resolve("../../static/anchor-position.js")];
require("../../static/ui-safe-zones.js");
require("../../static/safe-zone-geometry.js");
const { positionX, positionY } = require("../../static/anchor-position.js");

// Every caller (static/style-section-position.js) does Math.round(...) on the result before
// writing it to TextPreset.x/y, so these assertions round too — that also sidesteps binary
// floating-point drift from summing decimals like 115.2 + 1401.6 (e.g. 1516.7999999999997
// instead of 1516.8), which a plain strictEqual on the raw float would flake on.
function r(n) { return Math.round(n); }

test("positionX: text kind snaps LEFT/RIGHT to the mirrored margin", () => {
  assert.strictEqual(r(positionX("left", 100, "left", "text")), 162);
  assert.strictEqual(r(positionX("right", 100, "left", "text")), 818);
});

test("positionX: text kind centers MID on the canvas (symmetric margins)", () => {
  assert.strictEqual(r(positionX("mid", 500, "center", "text")), 540);
});

test("positionX: caption kind snaps LEFT/RIGHT to the same mirrored margin as text", () => {
  assert.strictEqual(r(positionX("left", 100, "left", "caption")), 162);
  assert.strictEqual(r(positionX("right", 100, "left", "caption")), 818);
});

test("positionX: caption kind centers MID on the canvas (symmetric margins)", () => {
  assert.strictEqual(r(positionX("mid", 500, "center", "caption")), 540);
});

test("positionX: defaults to text kind when omitted", () => {
  assert.strictEqual(r(positionX("left", 100, "left")), 162);
});

test("positionY: text kind snaps TOP/BTM to the top-nav/caption-zone bounds", () => {
  assert.strictEqual(r(positionY("top", 300, "text")), 115);
  assert.strictEqual(r(positionY("btm", 300, "text")), 1102);
});

test("positionY: text kind centers MID within [TOP_ZONE_BOTTOM, CAPTION_ZONE_TOP]", () => {
  assert.strictEqual(r(positionY("mid", 300, "text")), 608);
});

test("positionY: caption kind snaps TOP/BTM to the caption-zone bounds", () => {
  assert.strictEqual(r(positionY("top", 100, "caption")), 1402);
  assert.strictEqual(r(positionY("btm", 100, "caption")), 1686);
});

test("positionY: caption kind centers MID within [CAPTION_ZONE_TOP, CAPTION_ZONE_BOTTOM]", () => {
  assert.strictEqual(r(positionY("mid", 100, "caption")), 1544);
});
