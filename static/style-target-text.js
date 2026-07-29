// Style target for a text block: the adapter every shared style section writes through.
// Absorbs the TEXT panel's selection-aware behaviour — setField writes a per-range
// FormatRun when a stage selection is active — so the sections above stay branch-free.
window.StyleTarget = window.StyleTarget || {};

window.StyleTarget.forTextBlock = function forTextBlock(deps) {
  // Collaborators are injected so this is testable outside a browser; in the app it is
  // called with no argument and falls back to editor.js's globals.
  const d = deps || {
    getBlock: () => currentTextBlock(),
    getPreset: (id) => ensureTextPreset(id),
    getSelection: () => Preview.getActiveFormatSelection(),
    save: () => saveProject(),
    rerenderPreview: () => renderTextPreview(),
    rerenderPanel: () => renderTextPanel(),
    getBoxSize: (id) => Preview.getTextBoxSize(id),
    renderPreviewWith: (presets) => Preview.renderText(project, presets, Preview.currentTimelineTime()),
    allPresets: () => project.text_presets,
    upsert: FormatRunWrite.upsertFormatRun,
  };

  function preset() { return d.getPreset(d.getBlock().preset_id); }

  // The selection only counts when it belongs to the block currently being edited — a
  // stale selection left on another block must never redirect this block's writes.
  function activeSelection() {
    const sel = d.getSelection();
    return sel && sel.blockId === d.getBlock().id ? sel : null;
  }

  return {
    kind: "text",
    supportsFormatRuns: true,

    getPreset: preset,

    getFieldValue(field) {
      const sel = activeSelection();
      if (sel) {
        const runs = d.getBlock().formatting_runs || [];
        const run = runs.find((r) => r.start === sel.start && r.end === sel.end);
        if (run && run[field] != null) return run[field];
      }
      return preset()[field];
    },

    setField(field, value) {
      const sel = activeSelection();
      if (sel) {
        d.upsert(d.getBlock(), sel.start, sel.end, field, value);
      } else {
        preset()[field] = value;
      }
      d.save();
      d.rerenderPreview();
    },

    // Same routing as setField, per key, but ONE save/re-render for the whole batch —
    // picking a font writes `font` plus a snapped `weight` in a single user action, and
    // two setField calls would mean two undo entries for one click.
    setFields(fields) {
      const sel = activeSelection();
      Object.keys(fields).forEach((field) => {
        if (sel) {
          d.upsert(d.getBlock(), sel.start, sel.end, field, fields[field]);
        } else {
          preset()[field] = fields[field];
        }
      });
      d.save();
      d.rerenderPreview();
    },

    setPresetField(field, value) {
      preset()[field] = value;
      d.save();
      d.rerenderPreview();
    },

    previewField(field, value) {
      const p = preset();
      d.renderPreviewWith({ ...d.allPresets(), [p.id]: { ...p, [field]: value } });
    },

    cancelPreview() { d.rerenderPreview(); },

    clearFormatRuns() { d.getBlock().formatting_runs = []; },

    rerenderPreview() { d.rerenderPreview(); },
    rerenderPanel() { return d.rerenderPanel(); },
    getBoxSize() { return d.getBoxSize(d.getBlock().id); },
  };
};
