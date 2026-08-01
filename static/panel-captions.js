// CAPTIONS context-panel section: caption track/preset creation (defaultCaptionPreset,
// ensureCaptionPreset, ensureCaptionTrack), the main renderCaptionPanel orchestrator, and its
// tab-bar/divider wiring (UI.tabBar; Design tab is one body (`#caption-font-body`)).
// Plain globals shared with caption-panel-*.js; reaches into editor.js's
// `project`/`saveProject`/`renderTimeline` globals. Transcription itself (the Auto-caption button
// and the Language row) lives in this panel's own Auto tab as of 2026-07-31 — see
// static/caption-panel-auto-caption.js/caption-panel-language.js. Stage drag-to-move/resize
// (selectCaptionBoxOnStage, handleCaptionBoxMove/MoveEnd/Resize/ResizeEnd, added
// overlay-lane-caption-drag) selects the caption box on PreviewCaptions whenever this panel is
// open, mirroring panel-text.js's handleBoxMove/handleBoxResize.

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
    spotlight_color: "#FFD400",
    spotlight_outline_color: "#000000", spotlight_outline_px: 0,
    spotlight_shadow: false, spotlight_shadow_color: "#000000", spotlight_shadow_offset_x: 4, spotlight_shadow_offset_y: 4, spotlight_shadow_blur: 0,
    spotlight_highlight: false, spotlight_highlight_color: "#FFD400", spotlight_highlight_border_radius: 4,
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
  // Self-heal presets saved before "Background" mode was folded into the spotlight_highlight
  // toggle (2026-07-30, spotlight per-word styles) — see docs/superpowers/specs/2026-07-30-spotlight-word-styles-design.md.
  if (preset.highlight_mode === "background") {
    preset.highlight_mode = "current_word";
    preset.spotlight_highlight = true;
    preset.spotlight_highlight_color = preset.highlight_color;
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
  if (window.TranscriptSidebar) TranscriptSidebar.render(project);
}

// Stage drag-to-move/resize for the caption box (overlay-lane-caption-drag), mirroring
// panel-text.js's handleBoxMove/handleBoxResize: live-preview against a cloned preset during the
// drag (no save), commit + persist only on mouseup. stageScale() is panel-text.js's global helper.
function handleCaptionBoxMove(preset, { dx, dy }) {
  const scale = stageScale();
  const previewPreset = { ...preset, x: preset.x + dx * scale, y: preset.y + dy * scale };
  Preview.renderCaptions(project, { ...project.text_presets, [preset.id]: previewPreset }, Preview.currentTimelineTime());
}

async function handleCaptionBoxMoveEnd(preset, { dx, dy }) {
  const scale = stageScale();
  preset.x = Math.round(preset.x + dx * scale);
  preset.y = Math.round(preset.y + dy * scale);
  await saveProject();
  renderCaptionPreview();
  renderCaptionBoxTab();
}

function handleCaptionBoxResize(preset, { width, height }) {
  const scale = stageScale();
  const previewPreset = { ...preset, box_width: Math.round(width * scale), box_height: Math.round(height * scale) };
  Preview.renderCaptions(project, { ...project.text_presets, [preset.id]: previewPreset }, Preview.currentTimelineTime());
}

async function handleCaptionBoxResizeEnd(preset, { width, height }) {
  const scale = stageScale();
  preset.box_width = Math.round(width * scale);
  preset.box_height = Math.round(height * scale);
  await saveProject();
  renderCaptionPreview();
  renderCaptionBoxTab();
}

// Selects the caption box on stage (drag/resize handles) for as long as the CAPTIONS panel is
// open — there's only ever one caption track, so unlike VIDEO BOX/IMAGE BOX/SHAPE there's no
// per-item selection to make; opening the panel always means "this is the active box".
function selectCaptionBoxOnStage() {
  const preset = project.text_presets[project.captions.preset_id];
  PreviewCaptions.setSelectedCaption(true, {
    onMove: (delta) => handleCaptionBoxMove(preset, delta),
    onMoveEnd: (delta) => handleCaptionBoxMoveEnd(preset, delta),
    onResize: (size) => handleCaptionBoxResize(preset, size),
    onDragEnd: (size) => handleCaptionBoxResizeEnd(preset, size),
  });
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
  CaptionPanel.renderLanguage();
  CaptionPanel.renderFillerWords();
  CaptionPanel.renderWords();

  selectCaptionBoxOnStage();
  renderCaptionPreview();
}

const CAPTION_TAB_ICON_STYLE = UI.icon("paintbrush", { size: 18 });
const CAPTION_TAB_ICON_DESIGN = UI.icon("pencil", { size: 18 });
const CAPTION_TAB_ICON_BOX = UI.icon("square-dashed", { size: 18 });
const CAPTION_TAB_ICON_CLOSED_CAPTION = UI.icon("closed-captioning", { size: 18 });
// Same icon as VIDEO panel's own Auto tab (static/panel-video.js's VIDEO_TAB_ICON_AUTO), for
// visual consistency between the two "Auto" tabs across panels.
const CAPTION_TAB_ICON_AUTO = UI.icon("sparkles", { size: 18 });

const CAPTION_TABS = [
  { value: "closed-caption", icon: CAPTION_TAB_ICON_CLOSED_CAPTION, label: "Closed captions" },
  { value: "auto", icon: CAPTION_TAB_ICON_AUTO, label: "Auto" },
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
  auto: [document.getElementById("caption-auto-body")],
};
let activeCaptionTab = "closed-caption";
function showCaptionTab(value) {
  activeCaptionTab = value;
  Object.entries(captionTabPanes).forEach(([k, els]) => els.forEach((el) => { el.hidden = k !== value; }));
}
UI.tabBar(document.getElementById("caption-tab-bar"), CAPTION_TABS, activeCaptionTab, showCaptionTab);
showCaptionTab(activeCaptionTab);

UI.contextPanelHeader(document.getElementById("captions-header"), { icon: UI.icon("captions", { size: 18 }), label: "Captions" });

// Built ONCE, mirroring panel-text.js — the sections are re-rendered afterwards, never rebuilt.
const captionStyleTarget = StyleTarget.forCaptionTrack();
const captionStyleHost = SubpanelHost(
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
