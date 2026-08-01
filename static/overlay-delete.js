// Pure delete-in-place helper for the timeline's unified overlay stack (text block/video
// box/image box/shape lanes in #row-overlays, static/timeline-overlay-copy-toolbar.js's Delete
// button). No DOM/fetch — mutates the given project's arrays directly, mirroring
// overlay-copy.js's duplicate() convention. Replicates each panel's own delete-button cascade
// (panel-text.js's deleteSelectedTextBlock, panel-video-box.js/panel-image-box.js's mask-shape
// cleanup, panel-shape.js's mask-reference cleanup on the boxes it masks) so deleting from the
// timeline behaves identically to deleting from the side panel. Exposes
// window.OverlayDelete.delete, plus module.exports for node --test.
(() => {
  function del(project, entry) {
    if (entry.kind === "text") {
      project.text_blocks = project.text_blocks.filter((b) => b.id !== entry.item.id);
      delete project.text_presets[entry.item.preset_id];
    } else if (entry.kind === "video_box") {
      if (entry.item.mask_shape_id) {
        project.shapes = project.shapes.filter((s) => s.id !== entry.item.mask_shape_id);
      }
      project.video_boxes = project.video_boxes.filter((b) => b.id !== entry.item.id);
    } else if (entry.kind === "image_box") {
      if (entry.item.mask_shape_id) {
        project.shapes = project.shapes.filter((s) => s.id !== entry.item.mask_shape_id);
      }
      project.image_boxes = project.image_boxes.filter((b) => b.id !== entry.item.id);
    } else {
      project.shapes = project.shapes.filter((s) => s.id !== entry.item.id);
      (project.video_boxes || []).forEach((v) => { if (v.mask_shape_id === entry.item.id) v.mask_shape_id = null; });
      (project.image_boxes || []).forEach((b) => { if (b.mask_shape_id === entry.item.id) b.mask_shape_id = null; });
    }
  }

  const api = { delete: del };
  if (typeof window !== "undefined") window.OverlayDelete = api;
  if (typeof module !== "undefined") module.exports = api;
})();
