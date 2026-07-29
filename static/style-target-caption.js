// Style target for the caption track: the adapter every shared style section writes
// through when the CAPTIONS panel is open. Same shape as style-target-text.js, but a
// caption track has no per-range FormatRun overrides, so every write is whole-preset.
// Guarded dual export like style-target-text.js — see that file's header for why.
(() => {
function forCaptionTrack(deps) {
  // Collaborators are injected so this is testable outside a browser; in the app it is
  // called with no argument and falls back to panel-captions.js's globals.
  const d = deps || {
    getPreset: () => ensureCaptionPreset(ensureCaptionTrack().preset_id),
    getSelection: () => null,
    save: () => saveProject(),
    rerenderPreview: () => renderCaptionPreview(),
    rerenderPanel: () => renderCaptionPanel(),
    getBoxSize: () => Preview.getCaptionBoxSize(),
    renderPreviewWith: (presets) => {
      if (window.Preview && Preview.renderCaptions) Preview.renderCaptions(project, presets, Preview.currentTimelineTime());
    },
    allPresets: () => project.text_presets,
  };

  function writePreset(field, value) {
    d.getPreset()[field] = value;
    d.save();
    d.rerenderPreview();
  }

  return {
    kind: "caption",
    supportsFormatRuns: false,

    getPreset: () => d.getPreset(),
    getFieldValue: (field) => d.getPreset()[field],

    // Identical by design: with no format runs there is nothing for setField to target
    // other than the preset. Both exist so sections can be written once for both panels.
    setField: writePreset,
    setPresetField: writePreset,

    // No selection routing needed — every key just lands on the preset, one save/re-render
    // for the whole batch, same as the TEXT target's setFields.
    setFields(fields) {
      const p = d.getPreset();
      Object.keys(fields).forEach((field) => { p[field] = fields[field]; });
      d.save();
      d.rerenderPreview();
    },

    previewField(field, value) {
      const p = d.getPreset();
      d.renderPreviewWith({ ...d.allPresets(), [p.id]: { ...p, [field]: value } });
    },

    cancelPreview() { d.rerenderPreview(); },

    clearFormatRuns() { /* captions have no per-range overrides */ },

    rerenderPreview() { d.rerenderPreview(); },
    rerenderPanel() { return d.rerenderPanel(); },
    getBoxSize() { return d.getBoxSize(); },
  };
}

const api = { forCaptionTrack };
if (typeof window !== "undefined") window.StyleTarget = Object.assign(window.StyleTarget || {}, api);
if (typeof module !== "undefined") module.exports = api;
})();
