// Pure duplicate-in-place helper for the timeline's unified overlay stack (text block/video
// box/image box/shape lanes in #row-overlays, static/timeline-overlay-copy-toolbar.js's Copy
// button). No DOM/fetch — mutates the given project's arrays directly (matching
// timeline-slice.js's sliceClip/sliceVideoBox convention) and returns the newly created layer
// object. `deps.overlayLayers` (default window.OverlayLayers) is an injectable
// { mergedEntries, renumber } pair, mirroring style-target-text.js's injectable-deps pattern so
// this is unit-testable outside a browser. Exposes window.OverlayCopy.duplicate, plus
// module.exports for node --test.
(() => {
  function newId() {
    return crypto.randomUUID().replaceAll("-", "");
  }

  // Duplicates `entry` (one of OverlayLayers.mergedEntries(project)'s shape:
  // { id, kind, item }) into `project`, stacked one z-index step in front of the original, and
  // returns the new layer object. For a text block, also deep-clones its TextPreset under a new
  // id (project.text_presets[id]) and repoints the copy's preset_id at the clone — a text
  // block's preset is always 1:1 (see panel-text.js's addTextBlock/ensureTextPreset), so sharing
  // the original's preset would let restyling the copy silently restyle the original too.
  function duplicate(project, entry, deps = {}) {
    const OverlayLayers = deps.overlayLayers || (typeof window !== "undefined" ? window.OverlayLayers : undefined);
    const id = newId();
    let newItem;

    if (entry.kind === "text") {
      const presetId = newId();
      project.text_presets[presetId] = { ...project.text_presets[entry.item.preset_id], id: presetId };
      newItem = { ...entry.item, id, preset_id: presetId };
      project.text_blocks.push(newItem);
    } else if (entry.kind === "video_box") {
      newItem = { ...entry.item, id };
      project.video_boxes.push(newItem);
    } else if (entry.kind === "image_box") {
      newItem = { ...entry.item, id };
      project.image_boxes.push(newItem);
    } else {
      newItem = { ...entry.item, id };
      project.shapes.push(newItem);
    }

    // Place the new entry immediately in front of (one index before) the original, then
    // renumber so the persisted z_index reflects that order.
    const entries = OverlayLayers.mergedEntries(project);
    const newIndex = entries.findIndex((e) => e.id === id);
    const [newEntry] = entries.splice(newIndex, 1);
    const originalIndex = entries.findIndex((e) => e.id === entry.id);
    entries.splice(originalIndex, 0, newEntry);
    OverlayLayers.renumber(entries);

    return newItem;
  }

  const api = { duplicate };
  if (typeof window !== "undefined") window.OverlayCopy = api;
  if (typeof module !== "undefined") module.exports = api;
})();
