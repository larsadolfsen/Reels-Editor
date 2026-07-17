// Editor state + DOM wiring. Thin — logic lives in app/*.py; API calls live in window.Api (api-*.js).
// Exposes nothing (page script); persists project via PUT after every mutation.
let project = null;
let selected = null; // currently selected clip/text/caption; drives which right-panel section (VIDEO/TEXT/CAPTIONS) is open
const clipDurations = {}; // clip.id -> source duration (seconds), populated on add-clip
let selectedMediaId = null; // MEDIA panel row highlight only — independent of timeline `selected`
const player = document.getElementById("player");

const AVAILABLE_FONTS = ["Public Sans", "JetBrains Mono"]; // the only vendored font families (static/fonts/)
let fontRowSetValue = null; // updater returned by UI.settingsRow, set once renderFontRow() runs

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

async function updateTextBlock() {
  const block = ensureTextBlock();
  block.heading = document.getElementById("text-heading").value;
  await saveProject();
  renderTextPreview();
}

async function updateTextStyle() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  preset.box = document.getElementById("text-box").checked;
  await saveProject();
  renderTextPreview();
}

function renderTextPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-main").hidden = false;

  const block = ensureTextBlock();
  const preset = ensureTextPreset(block.preset_id);
  document.getElementById("text-heading").value = block.heading;
  renderFontRow();
  document.getElementById("text-box").checked = preset.box;
  document.getElementById("text-bold").setAttribute("aria-pressed", String(preset.bold));
  document.getElementById("text-italic").setAttribute("aria-pressed", String(preset.italic));
  document.getElementById("text-underline").setAttribute("aria-pressed", String(preset.underline));

  UI.numberField(document.getElementById("text-size-field"),
    { label: "SIZE", unit: "PX", value: preset.size_px, min: 24, max: 200,
      onChange: (v) => { preset.size_px = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-color-field"),
    { label: "Color", value: preset.color,
      onChange: (v) => { preset.color = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-outline-color-field"),
    { label: "Outline", value: preset.outline_color,
      onChange: (v) => { preset.outline_color = v; saveProject(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-box-color-field"),
    { label: "Box Color", value: preset.box_color,
      onChange: (v) => { preset.box_color = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-start-field"),
    { label: "START", unit: "SEC", value: block.start, step: 0.1,
      onChange: (v) => { block.start = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-end-field"),
    { label: "END", unit: "SEC", value: block.end, step: 0.1,
      onChange: (v) => { block.end = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-outline-px-field"),
    { label: "WIDTH", unit: "PX", value: preset.outline_px, min: 0, max: 20,
      onChange: (v) => { preset.outline_px = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-x-field"),
    { label: "OFFSET H", unit: "PX", value: preset.offset_x, step: 1,
      onChange: (v) => { preset.offset_x = v; computeXY(preset); saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-y-field"),
    { label: "OFFSET V", unit: "PX", value: preset.offset_y, step: 1,
      onChange: (v) => { preset.offset_y = v; computeXY(preset); saveProject(); renderTextPreview(); } });

  UI.buttonGroup(document.getElementById("text-align-group"),
    [{ value: "left", label: "LEFT" }, { value: "center", label: "CENTER" }, { value: "right", label: "RIGHT" }],
    preset.align, (value) => { preset.align = value; saveProject(); renderTextPreview(); });

  UI.buttonGroup(document.getElementById("position-row-group"),
    [{ value: "top", label: "TOP" }, { value: "mid", label: "MID" }, { value: "btm", label: "BTM" }],
    preset.pos_row, (value) => { preset.pos_row = value; computeXY(preset); saveProject(); renderTextPreview(); });

  UI.buttonGroup(document.getElementById("position-col-group"),
    [{ value: "left", label: "LEFT" }, { value: "mid", label: "MID" }, { value: "right", label: "RIGHT" }],
    preset.pos_col, (value) => { preset.pos_col = value; computeXY(preset); saveProject(); renderTextPreview(); });

  renderTextPreview();
}

document.getElementById("text-heading").addEventListener("input", updateTextBlock);
document.getElementById("text-box").addEventListener("input", updateTextStyle);

function wireTextStyleToggle(id, prop) {
  const btn = document.getElementById(id);
  btn.addEventListener("click", async () => {
    const preset = ensureTextPreset(ensureTextBlock().preset_id);
    preset[prop] = !preset[prop];
    btn.setAttribute("aria-pressed", String(preset[prop]));
    await saveProject();
    renderTextPreview();
  });
}
wireTextStyleToggle("text-bold", "bold");
wireTextStyleToggle("text-italic", "italic");
wireTextStyleToggle("text-underline", "underline");

UI.accordionSection(document.getElementById("text-font-accordion"), document.getElementById("text-font-body"), { title: "FONT", expanded: false });
UI.accordionSection(document.getElementById("text-misc-accordion"), document.getElementById("text-misc-body"), { title: "MISC", expanded: false });

function renderFontRow() {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  if (fontRowSetValue) {
    fontRowSetValue(preset.font, preset.font);
  } else {
    fontRowSetValue = UI.settingsRow(document.getElementById("text-font-row"), {
      label: "Font Family", value: preset.font, valueFontFamily: preset.font,
      onClick: openFontPanel,
    });
  }
}

function openFontPanel() {
  renderFontList();
  document.getElementById("panel-text-main").hidden = true;
  document.getElementById("panel-text-font").hidden = false;
}

function closeFontPanel() {
  document.getElementById("panel-text-font").hidden = true;
  document.getElementById("panel-text-main").hidden = false;
  renderTextPreview();
}

function hoverPreviewFont(fontName) {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  const previewPresets = { ...project.text_presets, [preset.id]: { ...preset, font: fontName } };
  Preview.renderText(project, previewPresets, Preview.currentTimelineTime());
}

async function selectFont(fontName) {
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  preset.font = fontName;
  await saveProject();
  renderFontRow();
  renderFontList();
  closeFontPanel();
}

function renderFontList() {
  const listEl = document.getElementById("text-font-list");
  listEl.innerHTML = "";
  const preset = ensureTextPreset(ensureTextBlock().preset_id);
  const orderedFonts = [preset.font, ...AVAILABLE_FONTS.filter((f) => f !== preset.font)];
  for (const fontName of orderedFonts) {
    const li = document.createElement("li");
    li.className = "font-list-row";
    li.addEventListener("mouseenter", () => hoverPreviewFont(fontName));
    li.addEventListener("mouseleave", () => renderTextPreview());
    li.addEventListener("click", () => selectFont(fontName));

    const nameEl = document.createElement("span");
    nameEl.className = "font-list-row-name";
    nameEl.style.fontFamily = fontName;
    nameEl.textContent = fontName;
    li.appendChild(nameEl);

    if (fontName === preset.font) {
      const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      check.setAttribute("class", "font-list-checkmark");
      check.setAttribute("viewBox", "0 0 24 24");
      check.setAttribute("fill", "none");
      check.setAttribute("stroke", "currentColor");
      check.setAttribute("stroke-width", "2");
      check.setAttribute("stroke-linecap", "round");
      check.setAttribute("stroke-linejoin", "round");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M20 6 9 17l-5-5");
      check.appendChild(path);
      li.appendChild(check);
    }

    listEl.appendChild(li);
  }
}

UI.subPanelHeader(document.getElementById("text-font-subpanel-header"), { title: "Font Family", onBack: closeFontPanel });

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
  document.getElementById("style-panel").hidden = false;
  ["files", "video", "text", "captions"].forEach((t) => {
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
    document.getElementById("text-heading").focus();
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
  document.getElementById("text-heading").focus();
  renderTimeline();
}

function openCaptionsPanel() {
  selected = { type: "captions" };
  showPanel("captions");
  renderTimeline();
}

const PANEL_NAV_HANDLERS = { files: openFilesPanel, text: openTextPanel, captions: openCaptionsPanel };

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
UI.button(document.getElementById("safe-zones-toggle"), { variant: "outline" });
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
  document.getElementById("project-name").textContent = project.name;
  renderMediaList();
  Preview.load(project);
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
