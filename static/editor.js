// Editor state + DOM wiring. Thin — logic lives in app/*.py; API calls live in window.Api (api-*.js).
// Exposes nothing (page script); persists project via PUT after every mutation.
let project = null;
let selected = null; // currently selected clip/text/caption; drives which right-panel section (VIDEO/TEXT/CAPTIONS) is open
const clipDurations = {}; // clip.id -> source duration (seconds), populated on add-clip
let selectedMediaId = null; // MEDIA panel row highlight only — independent of timeline `selected`
const player = document.getElementById("player");

const AVAILABLE_FONTS = ["Public Sans", "JetBrains Mono"]; // the only vendored font families (static/fonts/)

function formatClipDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

// Position grid anchors (thirds of the 1080x1920 canvas) + a pixel offset on top.
// pos_row/pos_col/offset_x/offset_y are UI-only conveniences layered over TextPreset.x/y,
// persisted on the preset itself so the grid choice round-trips with the rest of the project.
const POSITION_ANCHORS_X = { left: 162, mid: 540, right: 918 };
const POSITION_ANCHORS_Y = { top: 288, mid: 960, btm: 1632 };

function defaultTextPreset(id) {
  return {
    id,
    name: "Default", font: "Public Sans", size_px: 96, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, bold: false, italic: false, underline: false,
    box_width_mode: "fit", box_height_mode: "fit", box_width: 0, box_height: 0,
    box_background: false, box_background_color: "#000000",
    box_border_width: 0, box_border_color: "#FFFFFF", box_border_radius: 0,
    align: "center", x: 540, y: 700, entrance: "fade_pop",
    pos_row: "mid", pos_col: "mid", offset_x: 0, offset_y: 0,
  };
}

function computeXY(preset) {
  preset.x = POSITION_ANCHORS_X[preset.pos_col] + preset.offset_x;
  preset.y = POSITION_ANCHORS_Y[preset.pos_row] + preset.offset_y;
}

// Preset always lives at project.text_presets[id] — resolving through the same id used
// for lookup (block.preset_id) structurally prevents the two from drifting apart.
function ensureTextPreset(id) {
  if (!project.text_presets[id]) {
    project.text_presets[id] = defaultTextPreset(id);
  }
  return project.text_presets[id];
}

function ensureTextBlock() {
  let block = project.text_blocks[0];
  if (!block) {
    block = {
      id: crypto.randomUUID().replaceAll("-", ""),
      heading: "", preset_id: crypto.randomUUID().replaceAll("-", ""), start: 0, end: 3,
    };
    project.text_blocks.push(block);
  }
  ensureTextPreset(block.preset_id);
  return block;
}

function renderTextPreview() {
  Preview.renderText(project, project.text_presets, Preview.currentTimelineTime());
}

function renderTextPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-style").hidden = true;
  document.getElementById("panel-text-main").hidden = false;

  const block = ensureTextBlock();
  const preset = ensureTextPreset(block.preset_id);

  TextPanel.renderFontFamily();
  TextPanel.renderFontStyle();
  TextPanel.renderStyle();
  renderBoxPanel();
  TextPanel.renderAlign();
  TextPanel.renderPosition();
  TextPanel.renderTime();

  renderTextPreview();

  Preview.setSelectedTextBlock(block.id, {
    onResize: (size) => handleBoxResize(preset, size),
    onDragEnd: (size) => handleBoxResizeEnd(preset, size),
    onMove: (delta) => handleBoxMove(preset, delta),
    onMoveEnd: (delta) => handleBoxMoveEnd(preset, delta),
    onEdit: (heading) => { block.heading = heading; },
    onEditEnd: async (heading) => { block.heading = heading; await saveProject(); },
  });
}

function renderBoxPanel() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);

  UI.buttonGroup(document.getElementById("text-box-width-mode-group"),
    [{ value: "fit", label: "FIT" }, { value: "fixed", label: "FIXED" }],
    preset.box_width_mode,
    (value) => { preset.box_width_mode = value; saveProject(); renderTextPreview(); renderBoxPanel(); });

  document.getElementById("text-box-width-field").hidden = preset.box_width_mode !== "fixed";
  UI.numberField(document.getElementById("text-box-width-field"),
    { label: "WIDTH", unit: "PX", value: preset.box_width, min: 1, max: 1080,
      onChange: (v) => { preset.box_width = v; saveProject(); renderTextPreview(); } });

  UI.buttonGroup(document.getElementById("text-box-height-mode-group"),
    [{ value: "fit", label: "FIT" }, { value: "fixed", label: "FIXED" }],
    preset.box_height_mode,
    (value) => { preset.box_height_mode = value; saveProject(); renderTextPreview(); renderBoxPanel(); });

  document.getElementById("text-box-height-field").hidden = preset.box_height_mode !== "fixed";
  UI.numberField(document.getElementById("text-box-height-field"),
    { label: "HEIGHT", unit: "PX", value: preset.box_height, min: 1, max: 1920,
      onChange: (v) => { preset.box_height = v; saveProject(); renderTextPreview(); } });

  document.getElementById("text-box-background").checked = preset.box_background;
  document.getElementById("text-box-background").onchange = () => {
    preset.box_background = document.getElementById("text-box-background").checked;
    saveProject(); renderTextPreview();
  };

  UI.colorSwatch(document.getElementById("text-box-background-color-field"),
    { label: "Background", value: preset.box_background_color,
      onChange: (v) => { preset.box_background_color = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-border-width-field"),
    { label: "BORDER", unit: "PX", value: preset.box_border_width, min: 0, max: 40,
      onChange: (v) => { preset.box_border_width = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-box-border-radius-field"),
    { label: "RADIUS", unit: "PX", value: preset.box_border_radius, min: 0, max: 200,
      onChange: (v) => { preset.box_border_radius = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-box-border-color-field"),
    { label: "Border Color", value: preset.box_border_color,
      onChange: (v) => { preset.box_border_color = v; saveProject(); renderTextPreview(); } });
}

function stageScale() {
  const stageW = document.getElementById("overlay").clientWidth || 1;
  return 1080 / stageW;
}

function handleBoxResize(preset, { width, height }) {
  const scale = stageScale();
  const previewPreset = { ...preset, box_width_mode: "fixed", box_height_mode: "fixed",
    box_width: Math.round(width * scale), box_height: Math.round(height * scale) };
  const previewPresets = { ...project.text_presets, [preset.id]: previewPreset };
  Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
}

async function handleBoxResizeEnd(preset, { width, height }) {
  const scale = stageScale();
  preset.box_width_mode = "fixed";
  preset.box_height_mode = "fixed";
  preset.box_width = Math.round(width * scale);
  preset.box_height = Math.round(height * scale);
  await saveProject();
  renderBoxPanel();
}

function nearestAnchorKey(value, anchors) {
  return Object.keys(anchors).reduce((best, key) =>
    Math.abs(value - anchors[key]) < Math.abs(value - anchors[best]) ? key : best);
}

// Recomputes pos_row/pos_col from the preset's current x/y (after a free-pixel drag), then
// rebases offset_x/offset_y to the remaining distance from that anchor cell — keeps the
// anchor-grid model meaningful after a drag that isn't itself snapped.
function rebaseAnchorFromXY(preset) {
  preset.pos_row = nearestAnchorKey(preset.y, POSITION_ANCHORS_Y);
  preset.pos_col = nearestAnchorKey(preset.x, POSITION_ANCHORS_X);
  preset.offset_x = preset.x - POSITION_ANCHORS_X[preset.pos_col];
  preset.offset_y = preset.y - POSITION_ANCHORS_Y[preset.pos_row];
}

function handleBoxMove(preset, { dx, dy }) {
  const scale = stageScale();
  const previewPreset = { ...preset, offset_x: preset.offset_x + dx * scale, offset_y: preset.offset_y + dy * scale };
  computeXY(previewPreset);
  const previewPresets = { ...project.text_presets, [preset.id]: previewPreset };
  Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
}

async function handleBoxMoveEnd(preset, { dx, dy }) {
  const scale = stageScale();
  // TextPreset.offset_x/offset_y are int fields (app/models.py) — round before persisting,
  // else the PUT /api/projects/{id} save fails Pydantic validation (422) and the drag is lost.
  preset.offset_x += Math.round(dx * scale);
  preset.offset_y += Math.round(dy * scale);
  computeXY(preset);
  rebaseAnchorFromXY(preset);
  await saveProject();
  renderTextPanel();
}

UI.accordionSection(document.getElementById("text-style-accordion"), document.getElementById("text-style-body"), { title: "STYLES", expanded: false });
UI.accordionSection(document.getElementById("text-font-accordion"), document.getElementById("text-font-body"), { title: "FONT", expanded: false });
UI.accordionSection(document.getElementById("text-box-accordion"), document.getElementById("text-box-body"), { title: "BOX", expanded: false });
UI.accordionSection(document.getElementById("text-position-accordion"), document.getElementById("text-position-body"), { title: "POSITION", expanded: false });
UI.accordionSection(document.getElementById("text-time-accordion"), document.getElementById("text-time-body"), { title: "TIME", expanded: false });

UI.divider(document.getElementById("video-order-divider"));
UI.divider(document.getElementById("text-box-width-height-divider"));
UI.divider(document.getElementById("text-box-background-border-divider"));

function clampTrim(inP, outP, dur) {
  inP = Math.max(0, Math.min(inP, dur));
  outP = Math.max(0, Math.min(outP, dur));
  if (outP <= inP) outP = Math.min(dur, inP + 0.1);
  return { in_point: inP, out_point: outP };
}

async function saveProject() {
  await Api.saveProject(project);
}

function renderTimeline() {
  const t = parseFloat(document.getElementById("time").textContent) || 0;
  Timeline.render(project, t, selected, onTimelineSelect);
}

function showPanel(type) {
  if (type !== "text") Preview.setSelectedTextBlock(null, null);
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions", "settings", "export"].forEach((t) => {
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
  toggle.querySelector(".icon-panel-close").style.display = collapsed ? "none" : "";
  toggle.querySelector(".icon-panel-open").style.display = collapsed ? "" : "none";
}

document.getElementById("style-panel-collapse-toggle").addEventListener("click", () => {
  setStylePanelCollapsed(!stylePanelCollapsed);
});

function renderVideoPanel(c) {
  const dur = clipDurations[c.id] ?? c.out_point;
  document.getElementById("video-name").textContent = c.file_path.split(/[\\/]/).pop();

  async function applyTrim(inP, outP) {
    const t = clampTrim(inP, outP, dur);
    c.in_point = t.in_point; c.out_point = t.out_point;
    await saveProject();
    Preview.load(project);
    renderTimeline();
    renderVideoPanel(c);
  }

  UI.numberField(document.getElementById("video-in-field"),
    { label: "IN", unit: "SEC", value: c.in_point, step: 0.1,
      onChange: (v) => applyTrim(v, c.out_point) });

  UI.numberField(document.getElementById("video-out-field"),
    { label: "OUT", unit: "SEC", value: c.out_point, step: 0.1,
      onChange: (v) => applyTrim(c.in_point, v) });

  document.getElementById("video-set-in").onclick = () => applyTrim(player.currentTime, c.out_point);
  document.getElementById("video-set-out").onclick = () => applyTrim(c.in_point, player.currentTime);

  const ordered = [...project.clips].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((x) => x.id === c.id);
  const upBtn = document.getElementById("video-move-up");
  const downBtn = document.getElementById("video-move-down");
  upBtn.disabled = idx <= 0;
  downBtn.disabled = idx === -1 || idx === ordered.length - 1;
  upBtn.onclick = async () => { await moveClip(c, ordered[idx - 1]); renderVideoPanel(c); };
  downBtn.onclick = async () => { await moveClip(c, ordered[idx + 1]); renderVideoPanel(c); };
}

function selectClip(c) {
  selected = { type: "video", item: c };
  showPanel("video");
  renderVideoPanel(c);
  renderTimeline();
}

function onTimelineSelect({ type, item, groupIndex }) {
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
    renderVideoPanel(item);
  } else if (type === "text") {
    showPanel("text");
    renderTextPanel();
  } else if (type === "caption") {
    document.querySelector(".caption-preview-box").textContent = item.map((w) => w.text).join(" ");
    showPanel("captions");
  }
  renderTimeline();
}

function renderMediaList() {
  const list = document.getElementById("clip-list");
  list.innerHTML = "";
  project.media_library.forEach((m) => {
    const li = document.createElement("li");
    if (selectedMediaId === m.id) {
      li.classList.add("selected");
    }

    const thumb = document.createElement("div");
    thumb.className = "clip-thumb";
    li.appendChild(thumb);

    const info = document.createElement("div");
    info.className = "clip-info";
    const name = document.createElement("span");
    name.className = "clip-name";
    name.textContent = m.file_path.split(/[\\/]/).pop();
    const duration = document.createElement("span");
    duration.className = "clip-duration";
    duration.textContent = formatClipDuration(m.duration);
    info.appendChild(name);
    info.appendChild(duration);
    li.appendChild(info);

    li.addEventListener("click", () => {
      selectedMediaId = selectedMediaId === m.id ? null : m.id;
      renderMediaList();
    });
    list.appendChild(li);
  });
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
    value: "settings",
    label: "SETTINGS",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  },
  {
    value: "export",
    label: "EXPORT",
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>`,
  },
];

function openFilesPanel() {
  selected = { type: "files" };
  showPanel("files");
  renderTimeline();
}

function openTextPanel() {
  selected = { type: "text" };
  showPanel("text");
  renderTextPanel();
  renderTimeline();
}

function openCaptionsPanel() {
  selected = { type: "captions" };
  showPanel("captions");
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
  renderTimeline();
}

const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel, settings: openSettingsPanel, export: openExportPanel };

UI.iconRail(document.getElementById("panel-nav"), PANEL_NAV_ITEMS, "files", (value) => PANEL_NAV_HANDLERS[value]());

async function moveClip(a, b) {
  const t = a.order;
  a.order = b.order;
  b.order = t;
  await saveProject();
  Preview.load(project);
  renderTimeline();
}

async function addClip() {
  const path = await Api.pickFile();
  if (!path) return;
  const probeResult = await Api.probeMedia(path);
  if (!probeResult) { alert("probe failed"); return; }
  const { duration } = probeResult;
  const mediaId = crypto.randomUUID().replaceAll("-", "");
  project.media_library.push({ id: mediaId, file_path: path, duration });

  const id = crypto.randomUUID().replaceAll("-", "");
  clipDurations[id] = duration;
  project.clips.push({
    id,
    media_id: mediaId,
    file_path: path,
    in_point: 0,
    out_point: duration,
    order: project.clips.length,
  });
  await saveProject();
  renderMediaList();
  Preview.load(project);
  renderTimeline();
}

document.getElementById("add-clip").addEventListener("click", addClip);

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
  document.querySelector("#theme-toggle .icon-sun").style.display = theme === "light" ? "none" : "";
  document.querySelector("#theme-toggle .icon-moon").style.display = theme === "light" ? "" : "none";
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
  project = await Api.ensureProject();
  const before = JSON.stringify(project);
  seedDefaults(project);
  if (JSON.stringify(project) !== before) await saveProject();
  document.title = project.name ? `${project.name} – Reels Editor` : "Reels Editor";
  renderMediaList();
  Preview.load(project);
  await TextPanel.loadSavedPresets();
  renderTextPanel();
  renderTimeline();
  openFilesPanel();
  setTimeout(() => renderTextPreview(), 100);
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
  const t = Timeline.timeAtX(project.clips, rect, e.clientX);
  Preview.seek(t);
});

// Dragging the grip-vertical handle live-scrubs the playhead, same seek as a ruler click
// but re-invoked continuously; Timeline.tick keeps the handle box anchored during the drag.
document.getElementById("playhead-grip").addEventListener("mousedown", (e) => {
  e.preventDefault();
  const seekFromEvent = (clientX) => {
    const rect = document.getElementById("timeline-ruler").getBoundingClientRect();
    const t = Timeline.timeAtX(project.clips, rect, clientX);
    Preview.seek(t);
    Timeline.tick(Preview.currentTimelineTime());
  };
  seekFromEvent(e.clientX);
  const onMouseMove = (moveEvent) => seekFromEvent(moveEvent.clientX);
  const onMouseUp = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});

function nudgeTime(delta) {
  const cur = parseFloat(document.getElementById("time").textContent) || 0;
  const t = Math.max(0, cur + delta);
  Preview.seek(t);
  Timeline.render(project, t, selected, onTimelineSelect);
}

document.getElementById("step-back").addEventListener("click", () => nudgeTime(-0.1));
document.getElementById("step-forward").addEventListener("click", () => nudgeTime(0.1));

document.addEventListener("keydown", (e) => {
  const el = document.activeElement;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); nudgeTime(-0.1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); nudgeTime(0.1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); if (player.paused) Preview.play(); else Preview.pause(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); Preview.restart(); }
});
