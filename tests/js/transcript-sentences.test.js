// Pure sentence-grouping over a flat CaptionWord[] list, used by the transcript sidebar
// (static/transcript-sidebar.js) to render paragraph-style captions instead of raw word lists.
const test = require("node:test");
const assert = require("node:assert");
const { groupBySentence } = require("../../static/transcript-sentences.js");

function w(text, t_start, t_end) {
  return { id: text, text, t_start, t_end };
}

test("groupBySentence: splits into groups ending at ./!/?", () => {
  const words = [
    w("Hello", 0, 0.3), w("there.", 0.3, 0.6),
    w("How", 0.6, 0.8), w("are", 0.8, 1.0), w("you?", 1.0, 1.3),
  ];
  const result = groupBySentence(words);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result[0].words.map((x) => x.text), ["Hello", "there."]);
  assert.deepStrictEqual(result[1].words.map((x) => x.text), ["How", "are", "you?"]);
});

test("groupBySentence: sets start/end from the first/last word in each group", () => {
  const words = [w("Hi.", 1.5, 2.0), w("Bye.", 3.0, 3.5)];
  const result = groupBySentence(words);
  assert.deepStrictEqual(result, [
    { start: 1.5, end: 2.0, words: [words[0]] },
    { start: 3.0, end: 3.5, words: [words[1]] },
  ]);
});

test("groupBySentence: a trailing run with no terminal punctuation still forms a final group", () => {
  const words = [w("Done.", 0, 0.5), w("but", 0.5, 0.7), w("trailing", 0.7, 1.0)];
  const result = groupBySentence(words);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result[1].words.map((x) => x.text), ["but", "trailing"]);
  assert.strictEqual(result[1].start, 0.5);
  assert.strictEqual(result[1].end, 1.0);
});

test("groupBySentence: exclamation and question marks also end a sentence", () => {
  const words = [w("Wait!", 0, 0.3), w("Really?", 0.3, 0.6)];
  const result = groupBySentence(words);
  assert.strictEqual(result.length, 2);
});

test("groupBySentence: empty word list returns an empty array", () => {
  assert.deepStrictEqual(groupBySentence([]), []);
});

test("groupBySentence: one long run-on sentence with no punctuation is a single group", () => {
  const words = [w("one", 0, 0.2), w("two", 0.2, 0.4), w("three", 0.4, 0.6)];
  const result = groupBySentence(words);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].words.length, 3);
});

test("groupBySentence: does not mutate the input array or its words", () => {
  const words = [w("Hi.", 0, 0.5)];
  const snapshot = JSON.stringify(words);
  groupBySentence(words);
  assert.strictEqual(JSON.stringify(words), snapshot);
});
