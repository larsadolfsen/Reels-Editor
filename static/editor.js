// Editor state + DOM wiring. Thin — logic lives in app/*.py; API calls live in window.Api (api-*.js).
// Exposes nothing (page script); persists project via PUT after every mutation.
let project = null;
let selected = null; // currently selected clip/text/caption; drives which right-panel section (VIDEO/TEXT/CAPTIONS) is open
const clipDurations = {}; // clip.id -> source duration (seconds), populated on add-clip
const player = document.getElementById("player");

const AVAILABLE_FONTS = ["Public Sans", "JetBrains Mono"]; // the only vendored font families (static/fonts/)

function showEditorShell() {
  document.getElementById("project-picker").hidden = true;
  document.getElementById("app").hidden = false;
}

async function showPickerScreen() {
  // Clear the current project so a stale beforeunload PUT can't resurrect a project that was
  // just deleted (onDeletedCurrent routes here) or overwrite state after a fresh cold start.
  project = null;
  document.getElementById("app").hidden = true;
  const pickerEl = document.getElementById("project-picker");
  pickerEl.hidden = false;
  await UI.projectPicker(pickerEl, { onOpen: (p) => openProject(p) });
}

// Loads `target` (a ProjectSummary or full Project — only .id is used) as the current project
// and renders the full editor for it. Used by cold start, PROJECTS-panel switch, and after create.
async function openProject(target) {
  const res = await fetch(`/api/projects/${target.id}`);
  project = await res.json();
  UndoHistory.reset();
  lastSavedJson = JSON.stringify(project);
  localStorage.setItem("projectId", project.id);
  showEditorShell();
  document.title = project.name ? `${project.name} – Reels Editor` : "Reels Editor";
  MediaPanel.render();
  Preview.load(project);
  await renderTextPanel();
  renderTimeline();
  openFilesPanel();
}

const saveIndicator = UI.saveIndicator(document.getElementById("save-indicator"));

let lastSavedJson = null; // most recent persisted project JSON; the undo baseline

async function saveProject(recordHistory = true) {
  if (recordHistory && lastSavedJson !== null) UndoHistory.record(lastSavedJson);
  lastSavedJson = JSON.stringify(project);
  saveIndicator.setSaving();
  try {
    await Api.saveProject(project);
    saveIndicator.setSaved();
  } catch (err) {
    console.error("saveProject failed", err);
    // Retry re-attempts the network persist only — lastSavedJson already reflects the current
    // project from this failed attempt, so recording again would push a spurious undo entry
    // (record() dedupes against the undo-stack top, not this state), making the next Ctrl+Z a no-op.
    saveIndicator.setFailed(() => saveProject(false));
  }
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Leaving the current project (switching to another, or creating a new one) always flushes an
// explicit save first, then holds briefly on the "Saved" state as a deliberate moment against
// an accidental click, before actually navigating.
async function confirmFlushAndSwitch(action) {
  await saveProject();
  await delay(400);
  await action();
}

function renderTimeline() {
  const t = parseFloat(document.getElementById("time").textContent) || 0;
  Timeline.render(project, t, selected, onTimelineSelect,
    { onAddClip: () => addClip(), onAddText: () => addTextBlockAndEdit() });
}

function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  if (type !== "video-box") VideoBoxPreview.setSelectedVideoBox(null, null);
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "video-box", "layers", "settings", "export", "projects"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}

let stylePanelCollapsed = false;

function setStylePanelCollapsed(collapsed) {
  stylePanelCollapsed = collapsed;
  document.getElementById("style-panel").classList.toggle("collapsed", collapsed);
  const toggle = document.getElementById("style-panel-collapse-toggle");
  toggle.setAttribute("aria-pressed", String(collapsed));
  toggle.title = collapsed ? "Expand panel" : "Collapse panel";
  toggle.querySelector(".icon-panel-close").classList.toggle("icon-hidden", collapsed);
  toggle.querySelector(".icon-panel-open").classList.toggle("icon-hidden", !collapsed);
}

document.getElementById("style-panel-collapse-toggle").addEventListener("click", () => {
  setStylePanelCollapsed(!stylePanelCollapsed);
});

async function onTimelineSelect({ type, item, groupIndex }) {
  selected = { type, item, groupIndex };
  if (type === "video") {
    const ordered = [...project.clips].sort((a, b) => a.order - b.order);
    let start = 0;
    for (const c of ordered) {
      if (c.id === item.id) break;
      start += c.out_point - c.in_point;
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
  } else if (t === "captions") {
    openCaptionsPanel();
  } else if (t && PANEL_NAV_HANDLERS[t]) {
    PANEL_NAV_HANDLERS[t]();
  } else {
    openFilesPanel();
  }
}

// Parse a restored snapshot into `project`, persist it WITHOUT recording (the two-stack
// bookkeeping already moved the current state to the opposite stack), then full re-render.
function applyRestore(json) {
  if (json == null) return;              // nothing to undo/redo — no-op
  project = JSON.parse(json);
  reRenderAfterRestore();
  saveProject(false);                    // persist restored state, do not record into history
}

function undoEdit() { applyRestore(UndoHistory.undo(JSON.stringify(project))); }
function redoEdit() { applyRestore(UndoHistory.redo(JSON.stringify(project))); }

const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, "video-box": openVideoBoxPanel, layers: openLayersPanel, settings: openSettingsPanel, export: openExportPanel, projects: openProjectsPanel };

UI.iconRail(document.getElementById("panel-nav"), PANEL_NAV_ITEMS, "files", (value) => PANEL_NAV_HANDLERS[value]());

// Clicking stage text while some other right-panel section is open (FILES/VIDEO/CAPTIONS/...)
// should switch to TEXT and fully select the block, in the same click that entered edit mode.
Preview.setOnStageTextActivate((blockId) => {
  selectTextBlock(blockId);
  openTextPanel();
});

UI.button(document.getElementById("theme-toggle"), { variant: "icon" });
UI.button(document.getElementById("export"), { variant: "accent" });

function setSafeZonesVisible(visible) {
  document.getElementById("safe-zones").hidden = !visible;
  document.getElementById("safe-zones-toggle").setAttribute("aria-pressed", String(visible));
  localStorage.setItem("safeZonesVisible", visible ? "1" : "");
}

document.getElementById("safe-zones-toggle").addEventListener("click", () => {
  setSafeZonesVisible(document.getElementById("safe-zones").hidden);
});

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector("#theme-toggle .icon-sun").classList.toggle("icon-hidden", theme === "light");
  document.querySelector("#theme-toggle .icon-moon").classList.toggle("icon-hidden", theme !== "light");
  document.getElementById("theme-toggle").setAttribute("aria-pressed", String(theme === "light"));
  localStorage.setItem("theme", theme);
}

document.getElementById("theme-toggle").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});

async function exportProject() {
  const resultEl = document.getElementById("export-result");
  resultEl.textContent = "Exporting...";
  const result = await Api.exportProject(project.id);
  if (!result.ok) {
    resultEl.textContent = "Export failed: " + result.error;
    return;
  }
  resultEl.innerHTML = `Exported: <a href="/media?path=${encodeURIComponent(result.out_path)}">download</a>`;
}

document.getElementById("export").addEventListener("click", exportProject);

(async () => {
  setSafeZonesVisible(localStorage.getItem("safeZonesVisible") === "1");
  const storedTheme = localStorage.getItem("theme");
  setTheme(storedTheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  await TextPanel.loadSavedPresets();

  window.addEventListener("beforeunload", () => {
    if (!project) return;
    fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
      keepalive: true,
    });
  });

  const existing = await Api.ensureProject();
  if (existing) {
    await openProject(existing);
    setTimeout(() => renderTextPreview(), 100);
  } else {
    await showPickerScreen();
  }
})();

player.addEventListener("timeupdate", renderTimeline);

// Smooth playhead motion: timeupdate only fires a few times a second, which reads as
// choppy. While playing, nudge just the playhead/SLICE button/time readout every
// animation frame instead; the heavier renderTimeline() above still runs on each
// timeupdate for correctness (track rebuilds, clip transitions).
let tickRaf = null;
function tickLoop() {
  Timeline.tick(Preview.currentTimelineTime());
  tickRaf = requestAnimationFrame(tickLoop);
}
player.addEventListener("play", () => { if (!tickRaf) tickRaf = requestAnimationFrame(tickLoop); });
player.addEventListener("pause", () => { cancelAnimationFrame(tickRaf); tickRaf = null; });

document.getElementById("timeline-ruler").addEventListener("click", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  let t = Timeline.timeAtX(project.clips, rect, e.clientX);
  if (!e.altKey) t = Timeline.snapTime(t, Timeline.collectBoundaries(project), 8, Timeline.PX_PER_SEC);
  Preview.seek(t);
});

// Dragging the grip-vertical handle live-scrubs the playhead, same seek as a ruler click
// but re-invoked continuously; Timeline.tick keeps the handle box anchored during the drag.
document.getElementById("playhead-grip").addEventListener("mousedown", (e) => {
  e.preventDefault();
  const seekFromEvent = (evt) => {
    const rect = document.getElementById("timeline-ruler").getBoundingClientRect();
    let t = Timeline.timeAtX(project.clips, rect, evt.clientX);
    if (!evt.altKey) t = Timeline.snapTime(t, Timeline.collectBoundaries(project), 8, Timeline.PX_PER_SEC);
    Preview.seek(t);
    Timeline.tick(Preview.currentTimelineTime());
  };
  seekFromEvent(e);
  const onMouseMove = (moveEvent) => seekFromEvent(moveEvent);
  const onMouseUp = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});

document.getElementById("row-video").addEventListener("dragover", (e) => e.preventDefault());
document.getElementById("row-video").addEventListener("drop", async (e) => {
  e.preventDefault();
  const rect = document.getElementById("row-video").getBoundingClientRect();
  const dropTime = Timeline.timeAtX(project.clips, rect, e.clientX);
  const mediaId = e.dataTransfer.getData("text/media-id");
  const boxId = e.dataTransfer.getData("text/video-box-id");
  if (mediaId) {
    const m = project.media_library.find((x) => x.id === mediaId);
    if (!m) return;
    const clip = insertClipIntoSequence(
      { media_id: m.id, file_path: m.file_path, in_point: 0, out_point: m.duration },
      dropTime,
    );
    clipDurations[clip.id] = m.duration;
  } else if (boxId) {
    const box = project.video_boxes.find((v) => v.id === boxId);
    if (!box) return;
    stitchVideoBoxIntoSequence(box, dropTime);
  } else {
    return;
  }
  await saveProject();
  Preview.load(project);
  renderTimeline();
  if (boxId && selected && selected.type === "video-box" && selected.item && selected.item.id === boxId) {
    openFilesPanel(); // the selected box no longer exists — fall back to a safe default panel
  }
});

function nudgeTime(delta) {
  const cur = parseFloat(document.getElementById("time").textContent) || 0;
  const t = Math.max(0, cur + delta);
  Preview.seek(t);
  renderTimeline();
}

document.getElementById("step-back").addEventListener("click", () => nudgeTime(-0.1));
document.getElementById("step-forward").addEventListener("click", () => nudgeTime(0.1));

document.addEventListener("keydown", (e) => {
  const el = document.activeElement;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) { e.preventDefault(); undoEdit(); return; }
  if (mod && ((e.key === "z" || e.key === "Z") && e.shiftKey || e.key === "y" || e.key === "Y")) { e.preventDefault(); redoEdit(); return; }
  if (e.key === "ArrowLeft") { e.preventDefault(); nudgeTime(-0.1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); nudgeTime(0.1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); if (Preview.isPaused()) Preview.play(); else Preview.pause(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); Preview.restart(); }
  else if (e.key === "Delete" && selected && selected.type === "video") { e.preventDefault(); VideoPanel.deleteClip(selected.item.id); }
  else if (e.key === "Delete" && selected && selected.type === "text") { e.preventDefault(); deleteSelectedTextBlock(); }
});
