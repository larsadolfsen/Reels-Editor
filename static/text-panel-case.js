// TEXT panel Design tab: case-style button group (lowercase / UPPERCASE / As-typed) writing
// preset.text_case. Exposes window.TextPanel.renderCase(). Same pattern as text-panel-align.js.
window.TextPanel = window.TextPanel || {};

(() => {
  const CASE_OPTIONS = [
    {
      value: "lower", label: "LOWERCASE", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3" /><path d="M10 9v6" /><circle cx="17" cy="12" r="3" /><path d="M14 7v8" /></svg>',
    },
    {
      value: "upper", label: "UPPERCASE", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><path d="M15 11h4.5a2 2 0 0 1 0 4H15V7h4a2 2 0 0 1 0 4" /></svg>',
    },
    {
      value: "none", label: "AS TYPED", span: 1,
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 15 4-8 4 8" /><path d="M4 13h6" /><circle cx="18" cy="12" r="3" /><path d="M21 9v6" /></svg>',
    },
  ];
  window.TextPanel.renderCase = function renderCase() {
    const preset = ensureTextPreset(currentTextBlock().preset_id);
    UI.buttonGroup(document.getElementById("text-case-group"), CASE_OPTIONS,
      preset.text_case || "none",
      (value) => { preset.text_case = value; saveProject(); renderTextPreview(); });
  };
})();
