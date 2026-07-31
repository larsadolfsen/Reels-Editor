const test = require("node:test");
const assert = require("node:assert");
const { centeredShape } = require("../../static/shape-defaults.js");

test("centeredShape returns a 300x300 box centered on the 1080x1920 canvas", () => {
  const s = centeredShape();
  assert.strictEqual(s.width, 300);
  assert.strictEqual(s.height, 300);
  assert.strictEqual(s.x, 390);   // (1080 - 300) / 2
  assert.strictEqual(s.y, 810);   // (1920 - 300) / 2
});

test("centeredShape returns the documented style/time defaults", () => {
  const s = centeredShape();
  assert.strictEqual(s.start, 0);
  assert.strictEqual(s.duration, 3.0);
  assert.strictEqual(s.fill_color, "#4C6FFF");
  assert.strictEqual(s.opacity, 1.0);
  assert.strictEqual(s.corner_radius, 0);
  assert.strictEqual(s.z_index, -1);
});
