// Right-panel navigation: which context-panel section is open, the left icon-rail definition,
// timeline-click -> panel routing, and the after-undo/redo re-render. Extracted from editor.js
// (2026-07-21). Classic script — reaches into editor.js's project/selected/saveProject/renderTimeline
// globals at call time; loaded immediately before editor.js so its openXPanel() functions exist
// when editor.js's cold-start IIFE runs. Exposes showPanel/onTimelineSelect/openXPanel/
// reRenderAfterRestore/PANEL_NAV_ITEMS/PANEL_NAV_HANDLERS as call-time globals.

function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  if (type !== "video-box") VideoBoxPreview.setSelectedVideoBox(null, null);
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "video-box", "layers", "settings", "export", "projects"].forEach((t) => {
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
  }
  renderTimeline();
}

const PANEL_NAV_ITEMS = [
  {
    value: "files",
    label: "FILES",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
  },
  {
    value: "text",
    label: "TEXT",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/></svg>`,
  },
  {
    value: "captions",
    label: "CAPTIONS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 9.17a3 3 0 1 0 0 5.66"/><path d="M17 9.17a3 3 0 1 0 0 5.66"/><rect x="2" y="5" width="20" height="14" rx="2"/></svg>`,
  },
  {
    value: "video-box",
    label: "VIDEO BOX",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>`,
  },
  {
    value: "layers",
    label: "LAYERS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="1"/><rect x="7" y="7" width="14" height="14" rx="1"/></svg>`,
  },
  {
    value: "settings",
    label: "SETTINGS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  },
  {
    value: "export",
    label: "EXPORT",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>`,
  },
  {
    value: "projects",
    label: "PROJECTS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
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

function openLayersPanel() {
  selected = { type: "layers" };
  showPanel("layers");
  LayersPanel.render();
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

const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, layers: openLayersPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel };

UI.iconRail(document.getElementById("panel-nav"), PANEL_NAV_ITEMS, "files", (value) => PANEL_NAV_HANDLERS[value]());
