// CAPTIONS context-panel section: caption track/preset creation (defaultCaptionPreset,
// ensureCaptionPreset, ensureCaptionTrack), the main renderCaptionPanel orchestrator, and its
// tab-bar/divider wiring (UI.tabBar; Design tab is one body (`#caption-font-body`)).
// Plain globals shared with caption-panel-*.js; reaches into editor.js's
// `project`/`saveProject`/`renderTimeline` globals. Transcription itself (the Auto-caption button
// and the Language row) lives in the AUDIO panel — see static/audio-panel-auto-caption.js.

function defaultCaptionPreset(id) {
  return {
    id, name: "Caption", font: "Public Sans", size_px: 72, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, weight: 400, italic: false, underline: false,
    text_case: "none",
    shadow: false, shadow_color: "#000000", shadow_offset_x: 4, shadow_offset_y: 4, shadow_blur: 0,
    box_width_mode: "fixed", box_height_mode: "fixed", box_width: 900, box_height: 350,
    box_background: false, box_background_color: "#000000", box_background_opacity: 100,
    box_border_width: 0, box_border_color: "#FFFFFF", box_border_radius: 0,
    align: "center", x: 540, y: Math.round(SafeZoneGeometry.CAPTION_ZONE_TOP), entrance: "none",
    highlight: false, highlight_color: "#FFD400", highlight_mode: "current_word", highlight_border_radius: 4,
  };
}

function ensureCaptionPreset(id) {
  if (!project.text_presets[id]) {
    project.text_presets[id] = defaultCaptionPreset(id);
  }
  const preset = project.text_presets[id];
  // Self-heal presets saved before captions always used a fixed-size box.
  if (preset.box_width_mode !== "fixed" || preset.box_height_mode !== "fixed" ||
      !(preset.box_width > 0) || !(preset.box_height > 0)) {
    preset.box_width_mode = "fixed";
    preset.box_height_mode = "fixed";
    preset.box_width = preset.box_width > 0 ? preset.box_width : 900;
    preset.box_height = preset.box_height > 0 ? preset.box_height : 350;
  }
  return preset;
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

// Box tab: existing Background/Border settings-row + subpage UI (unchanged), then the shared
// StyleTab.box sections mounted into #caption-box-shared-body. sizeModes is false — a caption
// box is always a fixed size (word-wrap/pagination adapts to it, see preview-captions.js /
// app/ass_render.py), so WIDTH/HEIGHT are unconditionally visible, no FIT/FREE/FILL group.
let captionBoxTab = null;

function renderCaptionBoxTab() {
  CaptionPanel.renderBackground();
  CaptionPanel.renderBorder();
  if (!captionBoxTab) {
    captionBoxTab = StyleTab.box(document.getElementById("caption-box-shared-body"), captionStyleTarget, { sizeModes: false });
  }
  captionBoxTab.render();
}

async function renderCaptionPanel() {
  // closeAll() hides every host subpage and un-hides #panel-captions-main.
  captionStyleHost.closeAll();

  ensureCaptionTrack();

  captionStyleTab.render();
  await captionDesignTab.render();
  renderCaptionBoxTab();
  CaptionPanel.renderFillerWords();
  CaptionPanel.renderWords();

  renderCaptionPreview();
}

const CAPTION_TAB_ICON_STYLE = UI.icon("paintbrush", { size: 18 });
const CAPTION_TAB_ICON_DESIGN = UI.icon("pencil", { size: 18 });
const CAPTION_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
const CAPTION_TAB_ICON_CLOSED_CAPTION = UI.icon("closed-captioning", { size: 18 });
const CAPTION_TAB_ICON_FILLER = UI.icon("slice", { size: 18 });

const CAPTION_TABS = [
  { value: "closed-caption", icon: CAPTION_TAB_ICON_CLOSED_CAPTION, label: "Closed captions" },
  { value: "filler", icon: CAPTION_TAB_ICON_FILLER, label: "Filler words" },
  { value: "style", icon: CAPTION_TAB_ICON_STYLE, label: "Style" },
  { value: "design", icon: CAPTION_TAB_ICON_DESIGN, label: "Design" },
  { value: "box", icon: CAPTION_TAB_ICON_BOX, label: "Box" },
];
// Each tab maps to one body; the array shape is kept because showCaptionTab iterates it.
const captionTabPanes = {
  style: [document.getElementById("caption-style-body")],
  design: [document.getElementById("caption-font-body")],
  box: [document.getElementById("caption-box-body")],
  "closed-caption": [document.getElementById("caption-words-body")],
  filler: [document.getElementById("caption-filler-body")],
};
let activeCaptionTab = "closed-caption";
function showCaptionTab(value) {
  activeCaptionTab = value;
  Object.entries(captionTabPanes).forEach(([k, els]) => els.forEach((el) => { el.hidden = k !== value; }));
}
UI.tabBar(document.getElementById("caption-tab-bar"), CAPTION_TABS, activeCaptionTab, showCaptionTab);
showCaptionTab(activeCaptionTab);

// Built ONCE, mirroring panel-text.js — the sections are re-rendered afterwards, never rebuilt.
const captionStyleTarget = StyleTarget.forCaptionTrack();
const captionStyleHost = StylePanelHost(
  document.getElementById("panel-captions-main"),
  document.getElementById("panel-captions"),
);
const captionDesignTab = StyleTab.design(
  document.getElementById("caption-design-mount"),
  captionStyleTarget,
  {
    host: captionStyleHost,
    // A caption track has no single heading to preview — its text is a per-word transcript spread
    // across pages — so the Weight list shows the fixed sample caption-panel-font-weight.js used.
    sampleText: () => "kind of insane",
    // CAPTIONS gets an extra Spotlight section (per-word karaoke mode) after Highlight; TEXT
    // has no per-word karaoke, so it doesn't render one at all.
    spotlight: true,
  },
);

// Style tab: built once against the same caption style target the Design/Box tabs use, then
// re-rendered on every renderCaptionPanel() call. Same file as the TEXT panel's Style tab.
const captionStyleTab = StyleTab.styleLibrary(document.getElementById("caption-style-body"), captionStyleTarget, {});
