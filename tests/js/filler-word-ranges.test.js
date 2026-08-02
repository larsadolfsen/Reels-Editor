// FillerWords is a pure JS mirror of app/auto_slice.py's normalize_word/detect_filler_ranges
// (pinned there by tests/test_auto_slice.py) but had no JS-side test pinning it to that
// original, so the two could silently drift — including the Unicode-aware punctuation
// stripping this file was specifically built for (non-ASCII filler words like Danish "øh").
const test = require("node:test");
const assert = require("node:assert");

global.window = global; // filler-word-ranges.js assigns window.FillerWords unconditionally
require("../../static/filler-word-ranges.js");
const { normalizeWord, detectRanges } = window.FillerWords;

test("normalizeWord strips leading/trailing punctuation and lowercases", () => {
  assert.strictEqual(normalizeWord("Um,"), "um");
  assert.strictEqual(normalizeWord("\"Like\""), "like");
});

test("normalizeWord handles a non-ASCII filler word (Danish 'øh')", () => {
  assert.strictEqual(normalizeWord("øh,"), "øh");
});

test("normalizeWord leaves internal punctuation (e.g. apostrophes) untouched", () => {
  assert.strictEqual(normalizeWord("y'know"), "y'know");
});

test("detectRanges matches filler words case-insensitively and ignoring punctuation", () => {
  const words = [
    { text: "So,", t_start: 0.0, t_end: 0.3 },
    { text: "Um", t_start: 0.3, t_end: 0.6 },
    { text: "hello", t_start: 0.6, t_end: 1.0 },
  ];
  const ranges = detectRanges(words, ["um"]);
  assert.deepStrictEqual(ranges, [{ start: 0.3, end: 0.6 }]);
});

test("detectRanges returns one range per matching word, preserving order", () => {
  const words = [
    { text: "um", t_start: 0.0, t_end: 0.2 },
    { text: "hi", t_start: 0.2, t_end: 0.5 },
    { text: "um", t_start: 0.5, t_end: 0.7 },
  ];
  const ranges = detectRanges(words, ["um"]);
  assert.deepStrictEqual(ranges, [{ start: 0.0, end: 0.2 }, { start: 0.5, end: 0.7 }]);
});

test("detectRanges returns an empty array when no words or filler list is given", () => {
  assert.deepStrictEqual(detectRanges([], ["um"]), []);
  assert.deepStrictEqual(detectRanges([{ text: "um", t_start: 0, t_end: 1 }], []), []);
});
