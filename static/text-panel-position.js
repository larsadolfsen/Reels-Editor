// TEXT panel Box tab: absolute HORIZONTAL/VERTICAL pixel fields (TextPreset.x/y) +
// a stateless single-row icon anchor shortcut. Exposes window.TextPanel.renderPosition(). Reaches into
// editor.js's globals (currentTextBlock, ensureTextPreset, saveProject, renderTextPreview,
// renderTextPanel, anchorPositionX, anchorPositionY, Preview.getTextBoxSize).
window.TextPanel = window.TextPanel || {};

window.TextPanel.renderPosition = function renderPosition() {
  const block = currentTextBlock();
  const preset = ensureTextPreset(block.preset_id);

  UI.numberField(document.getElementById("text-offset-x-field"),
    { label: "HORIZONTAL", unit: "PX", value: preset.x, step: 1, min: 1, max: 1080, span: 4,
      onChange: (v) => { preset.x = Math.round(v); saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-y-field"),
    { label: "VERTICAL", unit: "PX", value: preset.y, step: 1, min: 1, max: 1920, span: 4,
      onChange: (v) => { preset.y = Math.round(v); saveProject(); renderTextPreview(); } });

  // Stateless shortcut — no persisted anchor selection, so no button stays "active"; clicking
  // an icon just writes a computed absolute pixel value straight into x/y and re-renders the
  // panel so the HORIZONTAL/VERTICAL fields above reflect the new value. The vertical anchors
  // (top/mid-v/btm) and horizontal ones (left/mid-h/right) share one row, so the two centering
  // buttons need distinct values; each maps back to the plain "mid" the anchor helpers expect.
  UI.buttonGroup(document.getElementById("position-group"),
    [
      {
        value: "top", label: "TOP", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14" /><path d="m18 13-6-6-6 6" /><path d="M12 7v14" /></svg>',
      },
      {
        value: "mid-h", label: "MID HORIZONTAL", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" /><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" /><path d="M12 20v2" /><path d="M12 14v2" /><path d="M12 8v2" /><path d="M12 2v2" /></svg>',
      },
      {
        value: "btm", label: "BTM", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" /></svg>',
      },
      {
        value: "left", label: "LEFT", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19V5" /><path d="m13 6-6 6 6 6" /><path d="M21 12H7" /></svg>',
      },
      {
        value: "mid-v", label: "MID VERTICAL", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" /><path d="M4 12H2" /><path d="M10 12H8" /><path d="M16 12h-2" /><path d="M22 12h-2" /></svg>',
      },
      {
        value: "right", label: "RIGHT", span: 1,
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 12H3" /><path d="m11 18 6-6-6-6" /><path d="M21 5v14" /></svg>',
      },
    ],
    null, (value) => {
      const size = Preview.getTextBoxSize(block.id);
      if (value === "top" || value === "mid-v" || value === "btm") {
        preset.y = Math.round(anchorPositionY(value === "mid-v" ? "mid" : value, size && size.height));
      } else {
        preset.x = Math.round(anchorPositionX(value === "mid-h" ? "mid" : value, size && size.width, preset.align));
      }
      saveProject(); renderTextPanel();
    });
};
