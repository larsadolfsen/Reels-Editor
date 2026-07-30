// Right-panel navigation: which context-panel section is open, the left icon-rail definition,
// timeline-click -> panel routing, and the after-undo/redo re-render. Extracted from editor.js
// (2026-07-21). Classic script — reaches into editor.js's project/selected/saveProject/renderTimeline
// globals at call time; loaded immediately before editor.js so its openXPanel() functions exist
// when editor.js's cold-start IIFE runs. Exposes showPanel/onTimelineSelect/openXPanel/
// reRenderAfterRestore/PANEL_NAV_ITEMS/PANEL_NAV_HANDLERS as call-time globals.

function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  if (type !== "video-box") VideoBoxPreview.setSelectedVideoBox(null, null);
  if (type !== "image-box") ImageBoxPreview.setSelectedImageBox(null, null);
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "video-box", "image-box", "settings", "export", "projects", "audio"].forEach((t) => {
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
  }
  renderTimeline();
}

const PANEL_NAV_ITEMS = [
  {
    value: "projects",
    label: "PROJECTS",
    icon: UI.icon("layout-grid", { size: 20 }),
  },
  {
    value: "files",
    label: "FILES",
    icon: UI.icon("file", { size: 20 }),
  },
  {
    value: "text",
    label: "TEXT",
    icon: UI.icon("type", { size: 20 }),
  },
  {
    value: "captions",
    label: "CAPTIONS",
    icon: UI.icon("captions", { size: 20 }),
  },
  {
    value: "settings",
    label: "SETTINGS",
    icon: UI.icon("settings", { size: 20 }),
  },
  {
    value: "export",
    label: "EXPORT",
    icon: UI.icon("upload", { size: 20 }),
  },
];

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

// Rail = insert (creation). TEXT inserts a new block and drops into on-stage edit; the other
// rail buttons open their panel (CAPTIONS's openCaptionsPanel already create-or-opens the track).
// Opening an *existing* text block still happens via a timeline/stage click (onTimelineSelect).
UI.iconRail(document.getElementById("panel-nav"), PANEL_NAV_ITEMS, "files", (value) => {
  if (value === "text") { addTextBlockAndEdit(); return; }
  PANEL_NAV_HANDLERS[value]();
});
