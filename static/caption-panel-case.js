// CAPTIONS panel Design tab: case-style button group (lowercase / UPPERCASE / As-typed) writing
// the caption track preset's text_case. Mirrors text-panel-case.js's UI, targets the caption
// track's preset instead of a text block's.
window.CaptionPanel = window.CaptionPanel || {};

window.CaptionPanel.renderCase = function renderCase() {
  const preset = ensureCaptionPreset(ensureCaptionTrack().preset_id);
  UI.buttonGroup(document.getElementById("caption-case-group"),
    [
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
    ],
    preset.text_case || "none",
    (value) => { preset.text_case = value; saveProject(); renderCaptionPreview(); });
};
