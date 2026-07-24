// Pure helpers for the timeline's unified overlay z-order stack: merges every text block,
// video box, and image box into one list ordered by z_index descending (top = frontmost,
// mirrors the removed Layers panel's convention), and renumbers z_index after a drag reorder.
// No DOM/fetch. Consumed by static/timeline.js (rendering) and
// static/timeline-overlay-layer-drag.js (drag-to-reorder).
// Exposes window.OverlayLayers.{mergedEntries, renumber}.
window.OverlayLayers = (() => {
  function mergedEntries(project) {
    const text = (project.text_blocks || []).map((b) => ({ id: b.id, kind: "text", item: b }));
    const boxes = (project.video_boxes || []).map((v) => ({ id: v.id, kind: "video_box", item: v }));
    const imageBoxes = (project.image_boxes || []).map((i) => ({ id: i.id, kind: "image_box", item: i }));
    return [...text, ...boxes, ...imageBoxes].sort((a, b) => (b.item.z_index ?? 0) - (a.item.z_index ?? 0));
  }

  // `entries` is already in the desired top-to-bottom (front-to-back) order; assign z_index
  // by position so a drag-drop reorder becomes the new persisted stacking order.
  function renumber(entries) {
    const n = entries.length;
    entries.forEach((e, i) => { e.item.z_index = n - 1 - i; });
  }

  return { mergedEntries, renumber };
})();
