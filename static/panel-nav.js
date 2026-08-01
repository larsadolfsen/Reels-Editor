// Right-panel navigation: which context-panel section is open, the left icon-rail definition,
// timeline-click -> panel routing, and the after-undo/redo re-render. Extracted from editor.js
// (2026-07-21). Classic script — reaches into editor.js's project/selected/saveProject/renderTimeline
// globals at call time; loaded immediately before editor.js so its openXPanel() functions exist
// when editor.js's cold-start IIFE runs. Exposes showPanel/onTimelineSelect/openXPanel/
// reRenderAfterRestore/PANEL_NAV_ITEMS/PANEL_NAV_HANDLERS as call-time globals.

function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  if (type !== "captions") PreviewCaptions.setSelectedCaption(false, null);
  if (type !== "video-box") VideoBoxPreview.setSelectedVideoBox(null, null);
  if (type !== "image-box") ImageBoxPreview.setSelectedImageBox(null, null);
  if (type !== "shape") {
    ShapePreview.setSelectedShape(null, null);
    // Switching away from the SHAPE panel by any path (stage click, timeline select) must also
    // clear the rubylith mask-preview state — panel-shape.js is the only place that sets it, so
    // without this a mask selected there stays visually tinted red after the user selects a
    // different layer entirely, until some unrelated future render happens to redraw it away.
    VideoBoxPreview.setActiveMaskShapeId(null);
    ImageBoxPreview.setActiveMaskShapeId(null);
    VideoBoxPreview.render(project.video_boxes, Preview.currentTimelineTime());
    ImageBoxPreview.render(project.image_boxes, Preview.currentTimelineTime());
  }
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "video-box", "image-box", "settings", "export", "projects", "audio", "shape"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}

async function onTimelineSelect({ type, item, groupIndex }) {
  selected = { type, item, groupIndex };
  if (type === "video") {
    const ordered = [...project.clips].sort((a, b) => a.order - b.order);
    let start = 0;
    for (const c of ordered) {
      if (c.id === item.id) break;
      start += (c.out_point - c.in_point) / (c.speed || 1);
    }
    Preview.seek(start);
    showPanel("video");
    VideoPanel.render(item);
  } else if (type === "text") {
    selectTextBlock(item.id);
    showPanel("text");
    await renderTextPanel();
  } else if (type === "caption") {
    showPanel("captions");
    await renderCaptionPanel();
  } else if (type === "video-box") {
    showPanel("video-box");
    VideoBoxPanel.render(item.id);
  } else if (type === "image-box") {
    showPanel("image-box");
    ImageBoxPanel.render(item.id);
  } else if (type === "shape") {
    showPanel("shape");
    ShapePanel.render(item.id);
  }
  renderTimeline();
}

// Split across #panel-nav-top/#panel-nav-bottom so the tool-mode buttons (#rail-tool: Select,
// Text) can sit between FILES and TEXT in the rail's visual order (selector-tool-rail-placement
// feature).
const PANEL_NAV_TOP_ITEMS = [
  {
    value: "projects",
    label: "PROJECTS",
    icon: UI.icon("layout-grid", { size: 20 }),
    title: "Projects",
    shortcut: "P",
  },
  {
    value: "files",
    label: "FILES",
    icon: UI.icon("file", { size: 20 }),
    title: "Files",
    shortcut: "F",
  },
];

const PANEL_NAV_BOTTOM_ITEMS = [
  {
    value: "text",
    label: "TEXT",
    icon: UI.icon("type", { size: 20 }),
    title: "Text tool",
    shortcut: "T",
  },
  {
    value: "shape",
    label: "SHAPE",
    icon: UI.icon("square", { size: 20 }),
  },
  {
    value: "captions",
    label: "CAPTIONS",
    icon: UI.icon("captions", { size: 20 }),
    title: "Captions",
    shortcut: "C",
  },
  {
    value: "settings",
    label: "SETTINGS",
    icon: UI.icon("settings", { size: 20 }),
    title: "Settings",
    shortcut: "S",
  },
  {
    value: "export",
    label: "EXPORT",
    icon: UI.icon("upload", { size: 20 }),
    title: "Export",
    shortcut: "E",
  },
];

const PANEL_NAV_ITEMS = [...PANEL_NAV_TOP_ITEMS, ...PANEL_NAV_BOTTOM_ITEMS];

function openFilesPanel() {
  selected = { type: "files" };
  showPanel("files");
  renderTimeline();
}

async function openTextPanel() {
  selected = { type: "text" };
  showPanel("text");
  await renderTextPanel();
  renderTimeline();
}

async function openCaptionsPanel() {
  selected = { type: "captions" };
  showPanel("captions");
  await renderCaptionPanel();
  renderTimeline();
}

function openSettingsPanel() {
  selected = { type: "settings" };
  showPanel("settings");
  renderTimeline();
}

function openExportPanel() {
  selected = { type: "export" };
  showPanel("export");
  ExportPanel.render();
  renderTimeline();
}

function openVideoBoxPanel() {
  selected = { type: "video-box", item: null };
  showPanel("video-box");
  VideoBoxPanel.render(null);
  renderTimeline();
}

function openImageBoxPanel() {
  selected = { type: "image-box", item: null };
  showPanel("image-box");
  ImageBoxPanel.render(null);
  renderTimeline();
}

function openAudioPanel() {
  selected = { type: "audio" };
  showPanel("audio");
  AudioPanel.render();
  renderTimeline();
}

async function openProjectsPanel() {
  selected = { type: "projects" };
  showPanel("projects");
  await ProjectsPanel.render(project.id, {
    onSwitch: (p) => confirmFlushAndSwitch(() => openProject(p)),
    onCreateRequested: (name) => confirmFlushAndSwitch(async () => {
      const created = await Api.createProject(name);
      await openProject(created);
    }),
    onDeletedCurrent: () => showPickerScreen(),
    onRenamedCurrent: (name) => {
      // panel-projects.js's Api.renameProject call already persisted the rename to disk against
      // a fresh server-fetched copy — it never touches this in-memory `project`. Without this,
      // the next saveProject() (any subsequent edit, a switch-away flush, or beforeunload) would
      // overwrite the on-disk rename with the still-stale in-memory name.
      project.name = name;
      document.title = `${project.name} – Reels Editor`;
    },
  });
  renderTimeline();
}

// Re-render everything from the current in-memory `project` after an undo/redo swap.
// Rebuilds the stage, timeline, and media list, then re-opens the panel that was showing —
// falling back to FILES when the previously-selected entity no longer exists in the restored state.
function reRenderAfterRestore() {
  MediaPanel.render();
  Preview.load(project);
  renderTimeline();
  const t = selected && selected.type;
  if (t === "video") {
    const clip = project.clips.find((c) => selected.item && c.id === selected.item.id);
    if (clip) onTimelineSelect({ type: "video", item: clip }); else openFilesPanel();
  } else if (t === "video-box") {
    const box = project.video_boxes.find((v) => selected.item && v.id === selected.item.id);
    if (box) onTimelineSelect({ type: "video-box", item: box }); else openFilesPanel();
  } else if (t === "image-box") {
    const box = project.image_boxes.find((b) => selected.item && b.id === selected.item.id);
    if (box) onTimelineSelect({ type: "image-box", item: box }); else openFilesPanel();
  } else if (t === "shape") {
    const shape = project.shapes.find((s) => selected.item && s.id === selected.item.id);
    if (shape) onTimelineSelect({ type: "shape", item: shape }); else openFilesPanel();
  } else if (t === "text") {
    openTextPanel();      // renderTextPanel()/currentTextBlock() self-heal to first block or empty state
  } else if (t === "captions" || t === "caption") {
    // "caption" (singular) is a selected caption group from a timeline click (onTimelineSelect);
    // "captions" (plural) is the panel-nav CAPTIONS entry with nothing specific selected.
    openCaptionsPanel();
  } else if (t && PANEL_NAV_HANDLERS[t]) {
    PANEL_NAV_HANDLERS[t]();
  } else {
    openFilesPanel();
  }
}

const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, "image-box": openImageBoxPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel, audio: openAudioPanel };

// TEXT and SHAPE arm their stage tools (window.ToolMode = "text"/"shape") instead of opening a
// panel or inserting directly: the stage cursor changes (stage.css), a click/drag on the stage
// does the tool's thing (stage-click-router.js for Text, stage-shape-draw.js for Shape), and each
// reverts ToolMode to "select" once its one-shot action lands. The other rail buttons open their
// panel (CAPTIONS's openCaptionsPanel already create-or-opens the track). Opening an *existing*
// text block or shape still happens via a timeline/stage click (onTimelineSelect). Split into two
// iconRail calls (top/bottom, see PANEL_NAV_TOP_ITEMS/PANEL_NAV_BOTTOM_ITEMS) so #rail-tool's
// Select button can sit between them; both share one active value via navSetActive.
//
// armedTool tracks which of TEXT/SHAPE is the currently-highlighted tool (or null). It exists so
// the highlight can be cleared correctly when ToolMode reverts to "select" from ANY source — not
// just a rail click, but also stage-click-router.js's/stage-shape-draw.js's own auto-revert after
// a one-shot insert/draw completes. Before this, only a click on another nav item could clear a
// stale TEXT/SHAPE highlight (the Select rail button's own highlight already synced correctly via
// ui-rail-tool-button.js's ToolMode.onChange subscription — this brings TEXT/SHAPE in line with
// it, so Select/Text/Shape are a genuinely mutually-exclusive set under any transition).
let armedTool = null; // "text" | "shape" | null
function navOnSelect(value) {
  if (value === "text" || value === "shape") {
    armedTool = value;
    navSetActive(value);
    ToolMode.set(value);
    return;
  }
  armedTool = null;
  navSetActive(value);
  PANEL_NAV_HANDLERS[value]();
}
const setNavTopActive = UI.iconRail(document.getElementById("panel-nav-top"), PANEL_NAV_TOP_ITEMS, "files", navOnSelect);
const setNavBottomActive = UI.iconRail(document.getElementById("panel-nav-bottom"), PANEL_NAV_BOTTOM_ITEMS, "files", navOnSelect);
function navSetActive(value) {
  setNavTopActive(value);
  setNavBottomActive(value);
}
ToolMode.onChange((mode) => {
  if (mode === "select" && armedTool) {
    armedTool = null;
    navSetActive(null);
  }
});

// Select tool-mode button, sits between FILES and TEXT (selector-tool-rail-placement feature).
// Text/Shape have no counterpart here — they're armed via the TEXT/SHAPE entries above
// (navOnSelect).
UI.railToolButton(document.getElementById("rail-tool"));
