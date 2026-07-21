// CAPTIONS context-panel section: caption track/preset creation (defaultCaptionPreset,
// ensureCaptionPreset, ensureCaptionTrack), the main renderCaptionPanel orchestrator, and its
// accordion/divider wiring + the #caption-auto-btn transcribe listener. Plain globals shared
// with caption-panel-*.js; reaches into editor.js's `project`/`saveProject`/`renderTimeline` globals.

function defaultCaptionPreset(id) {
  return {
    id, name: "Caption", font: "Public Sans", size_px: 72, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, weight: 400, italic: false, underline: false,
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
      preset_id: crypto.randomUUID().replaceAll("-", ""),
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
  document.getElementById("panel-captions-words").hidden = true;
  document.getElementById("panel-captions-main").hidden = false;

  const track = ensureCaptionTrack();
  document.getElementById("caption-empty-state").hidden = track.words.length > 0;

  CaptionPanel.renderStyle();
  CaptionPanel.renderFontFamily();
  await CaptionPanel.renderFontWeight();
  CaptionPanel.renderFontStyle();
  CaptionPanel.renderBox();
  CaptionPanel.renderHighlight();
  CaptionPanel.renderWords();

  renderCaptionPreview();
}

UI.accordionSection(document.getElementById("caption-style-accordion"), document.getElementById("caption-style-body"), { title: "STYLE", expanded: false });
UI.accordionSection(document.getElementById("caption-font-accordion"), document.getElementById("caption-font-body"), { title: "FONT", expanded: false });
UI.accordionSection(document.getElementById("caption-box-accordion"), document.getElementById("caption-box-body"), { title: "BOX", expanded: false });
UI.accordionSection(document.getElementById("caption-highlight-accordion"), document.getElementById("caption-highlight-body"), { title: "HIGHLIGHT", expanded: false });

UI.divider(document.getElementById("caption-box-width-height-divider"));
UI.divider(document.getElementById("caption-box-background-border-divider"));
UI.divider(document.getElementById("caption-box-border-position-divider"));

document.getElementById("caption-auto-btn").addEventListener("click", async () => {
  ensureCaptionTrack();
  const btn = document.getElementById("caption-auto-btn");
  btn.disabled = true;
  btn.textContent = "Transcribing…";
  try {
    const res = await fetch(`/api/projects/${project.id}/transcribe`, { method: "POST" });
    project = await res.json();
    await renderCaptionPanel();
    renderTimeline();
  } finally {
    btn.disabled = false;
    btn.textContent = "Auto-caption";
  }
});
