// Editor state + API calls + DOM wiring. Thin — logic lives in app/*.py.
// Exposes nothing (page script); persists project via PUT after every mutation.
let project = null;
let textPreset = null; // client-side TextPreset stand-in until Task 8 adds the presets API
let selected = null; // currently selected clip/text/caption; drives which right-panel section (VIDEO/TEXT/CAPTIONS) is open
const clipDurations = {}; // clip.id -> source duration (seconds), populated on add-clip
const player = document.getElementById("player");

function formatClipDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

// Position grid anchors (thirds of the 1080x1920 canvas) + a pixel offset on top.
// posRow/posCol/offsetX/offsetY are UI-only conveniences layered over TextPreset.x/y.
const POSITION_ANCHORS_X = { left: 162, mid: 540, right: 918 };
const POSITION_ANCHORS_Y = { top: 288, mid: 960, btm: 1632 };

function defaultTextPreset() {
  return {
    id: crypto.randomUUID().replaceAll("-", ""),
    name: "Default", font: "Public Sans", size_px: 96, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, bold: false, italic: false, underline: false,
    box: false, box_color: "#000000",
    align: "center", x: 540, y: 700, entrance: "fade_pop",
    posRow: "mid", posCol: "mid", offsetX: 0, offsetY: 0,
  };
}

function computeXY() {
  textPreset.x = POSITION_ANCHORS_X[textPreset.posCol] + textPreset.offsetX;
  textPreset.y = POSITION_ANCHORS_Y[textPreset.posRow] + textPreset.offsetY;
}

function loadTextPreset(projectId) {
  const raw = localStorage.getItem("textPreset:" + projectId);
  return raw ? { ...defaultTextPreset(), ...JSON.parse(raw) } : defaultTextPreset();
}

function saveTextPreset() {
  localStorage.setItem("textPreset:" + project.id, JSON.stringify(textPreset));
}

function ensureTextBlock() {
  let block = project.text_blocks[0];
  if (!block) {
    block = {
      id: crypto.randomUUID().replaceAll("-", ""),
      heading: "", preset_id: textPreset.id, start: 0, end: 3,
    };
    project.text_blocks.push(block);
  }
  return block;
}

function renderTextPreview() {
  Preview.renderText(project, { [textPreset.id]: textPreset }, Preview.currentTimelineTime());
}

async function updateTextBlock() {
  const block = ensureTextBlock();
  block.heading = document.getElementById("text-heading").value;
  await saveProject();
  renderTextPreview();
}

async function updateTextStyle() {
  textPreset.box = document.getElementById("text-box").checked;
  saveTextPreset();
  renderTextPreview();
}

function renderTextPanel() {
  const block = ensureTextBlock();
  document.getElementById("text-heading").value = block.heading;
  document.getElementById("text-font").value = textPreset.font;
  document.getElementById("text-box").checked = textPreset.box;
  document.getElementById("text-bold").setAttribute("aria-pressed", String(textPreset.bold));
  document.getElementById("text-italic").setAttribute("aria-pressed", String(textPreset.italic));
  document.getElementById("text-underline").setAttribute("aria-pressed", String(textPreset.underline));

  UI.numberField(document.getElementById("text-size-field"),
    { label: "SIZE", unit: "PX", value: textPreset.size_px, min: 24, max: 200,
      onChange: (v) => { textPreset.size_px = v; saveTextPreset(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-color-field"),
    { label: "Color", value: textPreset.color,
      onChange: (v) => { textPreset.color = v; saveTextPreset(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-outline-color-field"),
    { label: "Outline", value: textPreset.outline_color,
      onChange: (v) => { textPreset.outline_color = v; saveTextPreset(); renderTextPreview(); } });

  UI.colorSwatch(document.getElementById("text-box-color-field"),
    { label: "Box Color", value: textPreset.box_color,
      onChange: (v) => { textPreset.box_color = v; saveTextPreset(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-start-field"),
    { label: "START", unit: "SEC", value: block.start, step: 0.1,
      onChange: (v) => { block.start = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-end-field"),
    { label: "END", unit: "SEC", value: block.end, step: 0.1,
      onChange: (v) => { block.end = v; saveProject(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-outline-px-field"),
    { label: "WIDTH", unit: "PX", value: textPreset.outline_px, min: 0, max: 20,
      onChange: (v) => { textPreset.outline_px = v; saveTextPreset(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-x-field"),
    { label: "OFFSET H", unit: "PX", value: textPreset.offsetX, step: 1,
      onChange: (v) => { textPreset.offsetX = v; computeXY(); saveTextPreset(); renderTextPreview(); } });

  UI.numberField(document.getElementById("text-offset-y-field"),
    { label: "OFFSET V", unit: "PX", value: textPreset.offsetY, step: 1,
      onChange: (v) => { textPreset.offsetY = v; computeXY(); saveTextPreset(); renderTextPreview(); } });

  UI.buttonGroup(document.getElementById("text-align-group"),
    [{ value: "left", label: "LEFT" }, { value: "center", label: "CENTER" }, { value: "right", label: "RIGHT" }],
    textPreset.align, (value) => { textPreset.align = value; saveTextPreset(); renderTextPreview(); });

  UI.buttonGroup(document.getElementById("position-row-group"),
    [{ value: "top", label: "TOP" }, { value: "mid", label: "MID" }, { value: "btm", label: "BTM" }],
    textPreset.posRow, (value) => { textPreset.posRow = value; computeXY(); saveTextPreset(); renderTextPreview(); });

  UI.buttonGroup(document.getElementById("position-col-group"),
    [{ value: "left", label: "LEFT" }, { value: "mid", label: "MID" }, { value: "right", label: "RIGHT" }],
    textPreset.posCol, (value) => { textPreset.posCol = value; computeXY(); saveTextPreset(); renderTextPreview(); });

  renderTextPreview();
}

document.getElementById("text-heading").addEventListener("input", updateTextBlock);
document.getElementById("text-box").addEventListener("input", updateTextStyle);

document.getElementById("text-font").addEventListener("change", () => {
  textPreset.font = document.getElementById("text-font").value;
  saveTextPreset();
  renderTextPreview();
});

function wireTextStyleToggle(id, prop) {
  const btn = document.getElementById(id);
  btn.addEventListener("click", () => {
    textPreset[prop] = !textPreset[prop];
    btn.setAttribute("aria-pressed", String(textPreset[prop]));
    saveTextPreset();
    renderTextPreview();
  });
}
wireTextStyleToggle("text-bold", "bold");
wireTextStyleToggle("text-italic", "italic");
wireTextStyleToggle("text-underline", "underline");

function clampTrim(inP, outP, dur) {
  inP = Math.max(0, Math.min(inP, dur));
  outP = Math.max(0, Math.min(outP, dur));
  if (outP <= inP) outP = Math.min(dur, inP + 0.1);
  return { in_point: inP, out_point: outP };
}

async function ensureProject() {
  const savedId = localStorage.getItem("projectId");
  if (savedId) {
    const res = await fetch(`/api/projects/${savedId}`);
    if (res.ok) return res.json();
  }
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "reel" }),
  });
  const p = await res.json();
  localStorage.setItem("projectId", p.id);
  return p;
}

async function saveProject() {
  await fetch(`/api/projects/${project.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
}

function renderTimeline() {
  const t = parseFloat(document.getElementById("time").textContent) || 0;
  Timeline.render(project, t, selected, onTimelineSelect);
}

function showPanel(type) {
  document.getElementById("style-panel").hidden = false;
  ["video", "text", "captions"].forEach((t) => {
    document.getElementById(`panel-${t}`).hidden = t !== type;
  });
}

function closePanel() {
  document.getElementById("style-panel").hidden = true;
  selected = null;
  renderClipList();
  renderTimeline();
}

document.getElementById("style-panel-close").addEventListener("click", closePanel);

function renderVideoPanel(c) {
  const dur = clipDurations[c.id] ?? c.out_point;
  document.getElementById("video-name").textContent = c.file_path.split(/[\\/]/).pop();

  async function applyTrim(inP, outP) {
    const t = clampTrim(inP, outP, dur);
    c.in_point = t.in_point; c.out_point = t.out_point;
    await saveProject();
    Preview.load(project);
    renderClipList();
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
  renderClipList();
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
    document.getElementById("text-heading").focus();
  } else if (type === "caption") {
    document.querySelector(".caption-preview-box").textContent = item.map((w) => w.text).join(" ");
    showPanel("captions");
  }
  renderClipList();
  renderTimeline();
}

function renderClipList() {
  const list = document.getElementById("clip-list");
  list.innerHTML = "";
  const ordered = [...project.clips].sort((a, b) => a.order - b.order);
  ordered.forEach((c) => {
    const li = document.createElement("li");
    if (selected && selected.type === "video" && selected.item.id === c.id) {
      li.classList.add("selected");
    }

    const thumb = document.createElement("div");
    thumb.className = "clip-thumb";
    li.appendChild(thumb);

    const info = document.createElement("div");
    info.className = "clip-info";
    const name = document.createElement("span");
    name.className = "clip-name";
    name.textContent = c.file_path.split(/[\\/]/).pop();
    const duration = document.createElement("span");
    duration.className = "clip-duration";
    duration.textContent = formatClipDuration(c.out_point - c.in_point);
    info.appendChild(name);
    info.appendChild(duration);
    li.appendChild(info);

    li.addEventListener("click", () => selectClip(c));
    list.appendChild(li);
  });
}

async function moveClip(a, b) {
  const t = a.order;
  a.order = b.order;
  b.order = t;
  await saveProject();
  renderClipList();
  Preview.load(project);
  renderTimeline();
}

async function addClip() {
  const pickRes = await fetch("/api/pick-file");
  const { path } = await pickRes.json();
  if (!path) return;
  const res = await fetch(`/api/probe?path=${encodeURIComponent(path)}`);
  if (!res.ok) { alert("probe failed"); return; }
  const { duration } = await res.json();
  const id = crypto.randomUUID().replaceAll("-", "");
  clipDurations[id] = duration;
  project.clips.push({
    id,
    file_path: path,
    in_point: 0,
    out_point: duration,
    order: project.clips.length,
  });
  await saveProject();
  renderClipList();
  Preview.load(project);
  renderTimeline();
}

document.getElementById("add-clip").addEventListener("click", addClip);

function setPanelCollapsed(collapsed) {
  document.getElementById("panel").classList.toggle("collapsed", collapsed);
  localStorage.setItem("panelCollapsed", collapsed ? "1" : "");
}

document.getElementById("panel-collapse-toggle").addEventListener("click", () => {
  setPanelCollapsed(!document.getElementById("panel").classList.contains("collapsed"));
});

async function exportProject() {
  const resultEl = document.getElementById("export-result");
  resultEl.textContent = "Exporting...";
  const res = await fetch(`/api/projects/${project.id}/export`, { method: "POST" });
  if (!res.ok) {
    resultEl.textContent = "Export failed: " + (await res.text());
    return;
  }
  const { out_path } = await res.json();
  resultEl.innerHTML = `Exported: <a href="/media?path=${encodeURIComponent(out_path)}">download</a>`;
}

document.getElementById("export").addEventListener("click", exportProject);

(async () => {
  setPanelCollapsed(localStorage.getItem("panelCollapsed") === "1");
  project = await ensureProject();
  const before = JSON.stringify(project);
  seedDefaults(project);
  if (JSON.stringify(project) !== before) await saveProject();
  document.getElementById("project-name").textContent = project.name;
  textPreset = loadTextPreset(project.id);
  computeXY();
  renderClipList();
  Preview.load(project);
  renderTextPanel();
  renderTimeline();
})();

player.addEventListener("timeupdate", renderTimeline);

document.getElementById("timeline-ruler").addEventListener("click", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const t = Timeline.timeAtX(project.clips, rect, e.clientX);
  Preview.seek(t);
});
