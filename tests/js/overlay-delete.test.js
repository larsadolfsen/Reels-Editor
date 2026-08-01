const test = require("node:test");
const assert = require("node:assert");
const { delete: del } = require("../../static/overlay-delete.js");

function baseProject() {
  return {
    text_blocks: [{ id: "t1", preset_id: "p1", heading: "Hi", start: 1, end: 3, z_index: 0 }],
    text_presets: { p1: { id: "p1", name: "", font: "Public Sans", size_px: 96, color: "#FFFFFF" } },
    video_boxes: [{ id: "v1", file_path: "/a.mp4", x: 10, y: 20, z_index: 1, mask_shape_id: "s1" }],
    image_boxes: [{ id: "i1", file_path: "/b.jpg", x: 5, y: 5, z_index: -1 }],
    shapes: [{ id: "s1", x: 0, y: 0, width: 300, height: 300, z_index: 2 }],
  };
}

test("delete removes a text block and its own TextPreset", () => {
  const project = baseProject();
  del(project, { id: "t1", kind: "text", item: project.text_blocks[0] });

  assert.strictEqual(project.text_blocks.length, 0);
  assert.strictEqual(project.text_presets.p1, undefined);
});

test("delete removes a video_box and cascade-deletes its mask shape", () => {
  const project = baseProject();
  del(project, { id: "v1", kind: "video_box", item: project.video_boxes[0] });

  assert.strictEqual(project.video_boxes.length, 0);
  assert.strictEqual(project.shapes.length, 0, "the box's mask shape should be deleted too");
});

test("delete removes an image_box and cascade-deletes its mask shape", () => {
  const project = baseProject();
  project.image_boxes[0].mask_shape_id = "s1";
  del(project, { id: "i1", kind: "image_box", item: project.image_boxes[0] });

  assert.strictEqual(project.image_boxes.length, 0);
  assert.strictEqual(project.shapes.length, 0, "the box's mask shape should be deleted too");
});

test("delete removes a shape and clears mask_shape_id on any box referencing it", () => {
  const project = baseProject();
  del(project, { id: "s1", kind: "shape", item: project.shapes[0] });

  assert.strictEqual(project.shapes.length, 0);
  assert.strictEqual(project.video_boxes[0].mask_shape_id, null);
});

test("delete leaves other layers untouched", () => {
  const project = baseProject();
  del(project, { id: "i1", kind: "image_box", item: project.image_boxes[0] });

  assert.strictEqual(project.text_blocks.length, 1);
  assert.strictEqual(project.video_boxes.length, 1);
  assert.strictEqual(project.shapes.length, 1);
});
