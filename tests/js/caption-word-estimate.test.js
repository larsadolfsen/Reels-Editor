// Timeline.estimateWordTimings is a pure JS mirror of app/caption_word_estimate.py's
// estimate_word_timings (pinned there by tests/test_caption_word_estimate.py) but had no
// JS-side test, so a drift between the two languages' interpolation could go unnoticed.
const test = require("node:test");
const assert = require("node:assert");

global.window = global;
global.Timeline = {}; // caption-word-estimate.js does Object.assign(window.Timeline, ...)
require("../../static/caption-word-estimate.js");
const { estimateWordTimings } = window.Timeline;

test("a single-word entry passes through as one sub-range spanning the whole duration", () => {
  const out = estimateWordTimings({ id: "w1", text: "hi", t_start: 1.0, t_end: 1.5 });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].text, "hi");
  assert.strictEqual(out[0].t_start, 1.0);
  assert.strictEqual(out[0].t_end, 1.5);
});

test("a multi-word entry splits proportionally by character offset (including the space)", () => {
  // "hi there" = 8 chars total (h,i,space,t,h,e,r,e); "hi" is chars 0-2 of 8 -> [0, 0.25) of duration,
  // "there" starts after the space at char 3 -> [0.375, 1.0) of duration
  const out = estimateWordTimings({ id: "w1", text: "hi there", t_start: 0.0, t_end: 4.0 });
  assert.deepStrictEqual(out.map((w) => w.text), ["hi", "there"]);
  assert.strictEqual(out[0].t_start, 0.0);
  assert.strictEqual(out[0].t_end, 1.0);
  assert.strictEqual(out[1].t_start, 1.5);
  assert.strictEqual(out[1].t_end, 4.0);
});

test("sub-ranges are sequential and non-overlapping", () => {
  const out = estimateWordTimings({ id: "w1", text: "one two three", t_start: 0.0, t_end: 3.0 });
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].t_start >= out[i - 1].t_end);
  }
});

test("empty text produces no sub-ranges", () => {
  assert.deepStrictEqual(estimateWordTimings({ id: "w1", text: "   ", t_start: 0, t_end: 1 }), []);
});
