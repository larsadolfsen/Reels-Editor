const test = require("node:test");
const assert = require("node:assert");
const OverlayLayers = require("../../static/timeline-overlay-layers.js");
const { duplicate } = require("../../static/overlay-copy.js");

function baseProject() {
  return {
    text_blocks: [{ id: "t1", preset_id: "p1", heading: "Hi", start: 1, end: 3, z_index: 0 }],
    text_presets: { p1: { id: "p1", name: "", font: "Public Sans", size_px: 96, color: "#FFFFFF" } },
    video_boxes: [{ id: "v1", file_path: "/a.mp4", x: 10, y: 20, z_index: 1 }],
    image_boxes: [{ id: "i1", file_path: "/b.jpg", x: 5, y: 5, z_index: -1 }],
    shapes: [{ id: "s1", x: 0, y: 0, width: 300, height: 300, z_index: 2 }],
  };
}

const deps = { overlayLayers: OverlayLayers };

test("duplicate clones a video_box with a new id, preserving other fields", () => {
  const project = baseProject();
  const entry = { id: "v1", kind: "video_box", item: project.video_boxes[0] };
  const newItem = duplicate(project, entry, deps);

  assert.strictEqual(project.video_boxes.length, 2);
  assert.notStrictEqual(newItem.id, "v1");
  assert.strictEqual(newItem.file_path, "/a.mp4");
  assert.strictEqual(newItem.x, 10);
  assert.strictEqual(newItem.y, 20);
});

test("duplicate clones an image_box with a new id, preserving other fields", () => {
  const project = baseProject();
  const entry = { id: "i1", kind: "image_box", item: project.image_boxes[0] };
  const newItem = duplicate(project, entry, deps);

  assert.strictEqual(project.image_boxes.length, 2);
  assert.notStrictEqual(newItem.id, "i1");
  assert.strictEqual(newItem.file_path, "/b.jpg");
});

test("duplicate clones a shape with a new id, preserving other fields", () => {
  const project = baseProject();
  const entry = { id: "s1", kind: "shape", item: project.shapes[0] };
  const newItem = duplicate(project, entry, deps);

  assert.strictEqual(project.shapes.length, 2);
  assert.notStrictEqual(newItem.id, "s1");
  assert.strictEqual(newItem.width, 300);
  assert.strictEqual(newItem.height, 300);
});

test("duplicate clones a text block AND its own TextPreset under a new id", () => {
  const project = baseProject();
  const entry = { id: "t1", kind: "text", item: project.text_blocks[0] };
  const newItem = duplicate(project, entry, deps);

  assert.strictEqual(project.text_blocks.length, 2);
  assert.notStrictEqual(newItem.id, "t1");
  assert.strictEqual(newItem.heading, "Hi");
  assert.notStrictEqual(newItem.preset_id, "p1");

  const newPreset = project.text_presets[newItem.preset_id];
  assert.ok(newPreset, "new preset should exist under the new preset_id");
  assert.strictEqual(newPreset.font, "Public Sans");
  assert.strictEqual(newPreset.size_px, 96);
  // original preset is untouched
  assert.strictEqual(project.text_presets.p1.font, "Public Sans");
});

test("duplicate places the new layer immediately in front of (above) the original", () => {
  const project = baseProject();
  const entry = { id: "v1", kind: "video_box", item: project.video_boxes[0] };
  const newItem = duplicate(project, entry, deps);

  const entries = OverlayLayers.mergedEntries(project);
  const newIndex = entries.findIndex((e) => e.id === newItem.id);
  const originalIndex = entries.findIndex((e) => e.id === "v1");
  assert.strictEqual(newIndex, originalIndex - 1, "duplicate should sit one position in front of the original");
});
