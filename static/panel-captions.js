// CAPTIONS context-panel section: caption track/preset creation (defaultCaptionPreset,
// ensureCaptionPreset, ensureCaptionTrack), the main renderCaptionPanel orchestrator, and its
// tab-bar/divider wiring (UI.tabBar; Design tab groups the FONT + HIGHLIGHT bodies together)
// + the #caption-auto-btn transcribe listener. Plain globals shared with caption-panel-*.js;
// reaches into editor.js's `project`/`saveProject`/`renderTimeline` globals.

function defaultCaptionPreset(id) {
  return {
    id, name: "Caption", font: "Public Sans", size_px: 72, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, weight: 400, italic: false, underline: false,
    shadow: false, shadow_color: "#000000", shadow_offset_x: 4, shadow_offset_y: 4, shadow_blur: 0,
    box_width_mode: "fit", box_height_mode: "fit", box_width: 0, box_height: 0,
    box_background: false, box_background_color: "#000000", box_background_opacity: 100,
    box_border_width: 0, box_border_color: "#FFFFFF", box_border_radius: 0,
    align: "center", x: 540, y: 1520, entrance: "none",
    highlight_color: "#FFD400", highlight_mode: "current_word", max_words_per_line: 4,
  };
}

function ensureCaptionPreset(id) {
  if (!project.text_presets[id]) {
    project.text_presets[id] = defaultCaptionPreset(id);
  }
  return project.text_presets[id];
}

function ensureCaptionTrack() {
  let track = project.captions;
  if (!track) {
    track = {
      id: crypto.randomUUID().replaceAll("-", ""), words: [], z_index: 0,
      preset_id: crypto.randomUUID().replaceAll("-", ""), language: "",
    };
    project.captions = track;
  }
  ensureCaptionPreset(track.preset_id);
  return track;
}

function renderCaptionPreview() {
  if (window.Preview && Preview.renderCaptions) {
    Preview.renderCaptions(project, project.text_presets, Preview.currentTimelineTime());
  }
}

async function renderCaptionPanel() {
  document.getElementById("panel-captions-font").hidden = true;
  document.getElementById("panel-captions-weight").hidden = true;
  document.getElementById("panel-captions-style").hidden = true;
  document.getElementById("panel-captions-language").hidden = true;
  document.getElementById("panel-captions-main").hidden = false;

  const track = ensureCaptionTrack();
  document.getElementById("caption-empty-state").hidden = track.words.length > 0;

  CaptionPanel.renderLanguage();
  CaptionPanel.renderStyle();
  CaptionPanel.renderFontFamily();
  await CaptionPanel.renderFontWeight();
  CaptionPanel.renderFontStyle();
  CaptionPanel.renderOutline();
  CaptionPanel.renderShadow();
  CaptionPanel.renderBox();
  CaptionPanel.renderHighlight();
  CaptionPanel.renderFillerWords();
  CaptionPanel.renderWords();

  renderCaptionPreview();
}

const CAPTION_TAB_ICON_STYLE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.622 17.897-10.68-2.913"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"/></svg>';
const CAPTION_TAB_ICON_DESIGN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
const CAPTION_TAB_ICON_BOX = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 7a24 24 0 0 1 0 10"/><path d="M4.5 7a24 24 0 0 0 0 10"/><path d="M7 19.5a24 24 0 0 0 10 0"/><path d="M7 4.5a24 24 0 0 1 10 0"/><rect x="17" y="17" width="5" height="5" rx="1"/><rect x="17" y="2" width="5" height="5" rx="1"/><rect x="2" y="17" width="5" height="5" rx="1"/><rect x="2" y="2" width="5" height="5" rx="1"/></svg>';
const CAPTION_TAB_ICON_CLOSED_CAPTION = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2" ry="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/></svg>';

const CAPTION_TABS = [
  { value: "style", icon: CAPTION_TAB_ICON_STYLE, label: "Style" },
  { value: "design", icon: CAPTION_TAB_ICON_DESIGN, label: "Design" },
  { value: "box", icon: CAPTION_TAB_ICON_BOX, label: "Box" },
  { value: "closed-caption", icon: CAPTION_TAB_ICON_CLOSED_CAPTION, label: "Closed captions" },
];
// Design groups two existing bodies (FONT + HIGHLIGHT) — both show/hide together.
const captionTabPanes = {
  style: [document.getElementById("caption-style-body")],
  design: [document.getElementById("caption-font-body"), document.getElementById("caption-highlight-body")],
  box: [document.getElementById("caption-box-body")],
  "closed-caption": [document.getElementById("caption-words-body")],
};
let activeCaptionTab = "style";
function showCaptionTab(value) {
  activeCaptionTab = value;
  Object.entries(captionTabPanes).forEach(([k, els]) => els.forEach((el) => { el.hidden = k !== value; }));
}
UI.tabBar(document.getElementById("caption-tab-bar"), CAPTION_TABS, activeCaptionTab, showCaptionTab);
showCaptionTab(activeCaptionTab);

UI.divider(document.getElementById("caption-box-width-height-divider"));
UI.divider(document.getElementById("caption-box-background-border-divider"));
UI.divider(document.getElementById("caption-box-border-position-divider"));

document.getElementById("caption-auto-btn").addEventListener("click", async () => {
  ensureCaptionTrack();
  const btn = document.getElementById("caption-auto-btn");
  const label = btn.querySelector(".label");
  btn.disabled = true;
  label.textContent = "Transcribing…";
  try {
    const res = await fetch(`/api/projects/${project.id}/transcribe`, { method: "POST" });
    project = await res.json();
    await renderCaptionPanel();
    renderTimeline();
  } finally {
    btn.disabled = false;
    label.textContent = "Auto-caption";
  }
});
