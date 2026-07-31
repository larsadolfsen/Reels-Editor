const test = require("node:test");
const assert = require("node:assert");
const { mergedEntries, renumber } = require("../../static/timeline-overlay-layers.js");

test("mergedEntries sorts text, video_box, image_box, and shape by z_index descending", () => {
  const project = {
    text_blocks: [{ id: "t1", z_index: 0 }],
    video_boxes: [{ id: "v1", z_index: 2 }],
    image_boxes: [{ id: "i1", z_index: -1 }],
    shapes: [{ id: "s1", z_index: 1 }],
  };
  const entries = mergedEntries(project);
  assert.deepStrictEqual(entries.map((e) => e.id), ["v1", "s1", "t1", "i1"]);
  assert.deepStrictEqual(entries.map((e) => e.kind), ["video_box", "shape", "text", "image_box"]);
});

test("mergedEntries handles a project with no shapes", () => {
  const project = { text_blocks: [{ id: "t1", z_index: 0 }], video_boxes: [], image_boxes: [] };
  const entries = mergedEntries(project);
  assert.deepStrictEqual(entries.map((e) => e.id), ["t1"]);
});

test("renumber reassigns z_index by position, including shape entries", () => {
  const shapeItem = { z_index: 1 };
  const textItem = { z_index: 0 };
  const entries = [{ id: "s1", kind: "shape", item: shapeItem }, { id: "t1", kind: "text", item: textItem }];
  renumber(entries);
  assert.strictEqual(shapeItem.z_index, 1);
  assert.strictEqual(textItem.z_index, 0);
});
