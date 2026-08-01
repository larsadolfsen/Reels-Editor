// Pure helpers for the timeline's unified overlay z-order stack: merges every text block,
// video box, image box, and shape into one list ordered by z_index descending (top =
// frontmost, mirrors the removed Layers panel's convention), and renumbers z_index after a
// drag reorder. No DOM/fetch. Consumed by static/timeline.js (rendering) and
// static/timeline-overlay-layer-drag.js (drag-to-reorder).
// A shape referenced by some box's mask_shape_id is a mask source, not an overlay layer, and
// is excluded from mergedEntries — see the layer-masking-system feature.
// Exposes window.OverlayLayers.{mergedEntries, renumber}.
(() => {
  function mergedEntries(project) {
    const maskShapeIds = new Set(
      [...(project.video_boxes || []), ...(project.image_boxes || [])]
        .map((b) => b.mask_shape_id)
        .filter(Boolean),
    );
    const text = (project.text_blocks || []).map((b) => ({ id: b.id, kind: "text", item: b }));
    const boxes = (project.video_boxes || []).map((v) => ({ id: v.id, kind: "video_box", item: v }));
    const imageBoxes = (project.image_boxes || []).map((i) => ({ id: i.id, kind: "image_box", item: i }));
    const shapes = (project.shapes || [])
      .filter((s) => !maskShapeIds.has(s.id))
      .map((s) => ({ id: s.id, kind: "shape", item: s }));
    return [...text, ...boxes, ...imageBoxes, ...shapes].sort((a, b) => (b.item.z_index ?? 0) - (a.item.z_index ?? 0));
  }

  // `entries` is already in the desired top-to-bottom (front-to-back) order; assign z_index
  // by position so a drag-drop reorder becomes the new persisted stacking order.
  function renumber(entries) {
    const n = entries.length;
    entries.forEach((e, i) => { e.item.z_index = n - 1 - i; });
  }

  const api = { mergedEntries, renumber };
  if (typeof window !== "undefined") window.OverlayLayers = api;
  if (typeof module !== "undefined") module.exports = api;
})();
