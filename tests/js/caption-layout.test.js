// CaptionLayout.paginateWords is a non-trivial pure word-wrap + pagination algorithm mirroring
// app/caption_layout.py's paginate_words (pinned there by tests/test_caption_layout.py), but had
// no JS-side test at all despite being exactly the kind of dependency-free logic the project's
// own convention says belongs under `node --test`.
const test = require("node:test");
const assert = require("node:assert");

global.window = global;
global.Timeline = {};
require("../../static/caption-word-estimate.js"); // CaptionLayout depends on Timeline.estimateWordTimings
require("../../static/caption-layout.js");
const { paginateWords } = window.CaptionLayout;

function w(text, a, b) {
  return { id: text, text, t_start: a, t_end: b };
}

function charWidthMeasurer(pxPerChar) {
  return (text) => text.length * pxPerChar;
}

test("empty input returns no pages", () => {
  assert.deepStrictEqual(paginateWords([], charWidthMeasurer(10), 1000, 1000, 20), []);
});

test("words are sorted by start time before layout", () => {
  const words = [w("b", 1.0, 1.5), w("a", 0.0, 0.5)];
  const pages = paginateWords(words, charWidthMeasurer(10), 1000, 1000, 20);
  assert.deepStrictEqual(pages[0][0].map((x) => x.text), ["a", "b"]);
});

test("a multi-word entry expands into one sub-word per token", () => {
  const words = [w("talks about this", 0.0, 3.0)];
  const pages = paginateWords(words, charWidthMeasurer(10), 1000, 1000, 20);
  assert.strictEqual(pages.length, 1);
  assert.strictEqual(pages[0].length, 1);
  assert.deepStrictEqual(pages[0][0].map((x) => x.text), ["talks", "about", "this"]);
});

test("words that fit within the box width pack onto one line", () => {
  // "one" + " " + "two" = 7 chars = 70px at 10px/char, fits an 80px-wide box
  const words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0)];
  const pages = paginateWords(words, charWidthMeasurer(10), 80, 1000, 20);
  assert.strictEqual(pages[0].length, 1);
  assert.deepStrictEqual(pages[0][0].map((x) => x.text), ["one", "two"]);
});

test("a line breaks onto a new line once the box width is exceeded", () => {
  // "one" + " " + "two" = 70px > 60px box width -> two separate lines, same page
  const words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0)];
  const pages = paginateWords(words, charWidthMeasurer(10), 60, 1000, 20);
  assert.strictEqual(pages.length, 1);
  assert.deepStrictEqual(pages[0].map((line) => line.map((x) => x.text)), [["one"], ["two"]]);
});

test("pagination starts a new page once the box height is exceeded", () => {
  // font_size=20, line_height=1.15 -> one line is 23px tall; box_height=30 fits only 1 line/page
  const words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0), w("three", 1.0, 1.5)];
  const pages = paginateWords(words, charWidthMeasurer(10), 10, 30, 20, 1.15);
  assert.deepStrictEqual(pages.map((page) => page.length), [1, 1, 1]);
});

test("multiple lines share one page when the box is tall enough", () => {
  // box_height=60 fits 2 lines (2 * 23px = 46px <= 60px, 3 * 23px = 69px > 60px)
  const words = [w("one", 0.0, 0.5), w("two", 0.5, 1.0), w("three", 1.0, 1.5)];
  const pages = paginateWords(words, charWidthMeasurer(10), 10, 60, 20, 1.15);
  assert.deepStrictEqual(pages.map((page) => page.length), [2, 1]);
});

test("a long silence forces a new page even though both words would still fit", () => {
  // "one"/"two" would easily fit one page together (box is huge), but a >1s gap between them
  // must still force a fresh page so the caption doesn't linger on screen through the silence.
  const words = [w("one", 0.0, 0.5), w("two", 2.0, 2.5)];
  const pages = paginateWords(words, charWidthMeasurer(10), 1000, 1000, 20);
  assert.deepStrictEqual(pages.map((page) => page.flatMap((line) => line.map((x) => x.text))), [["one"], ["two"]]);
});

test("a short natural gap between words does not break the page", () => {
  const words = [w("one", 0.0, 0.5), w("two", 0.7, 1.2)];
  const pages = paginateWords(words, charWidthMeasurer(10), 1000, 1000, 20);
  assert.strictEqual(pages.length, 1);
  assert.deepStrictEqual(pages[0][0].map((x) => x.text), ["one", "two"]);
});
