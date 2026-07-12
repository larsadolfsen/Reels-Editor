// Editor state + API calls + DOM wiring. Thin — logic lives in app/*.py.
// Exposes nothing (page script); persists project via PUT after every mutation.
let project = null;
let textPreset = null; // client-side TextPreset stand-in until Task 8 adds the presets API
const clipDurations = {}; // clip.id -> source duration (seconds), populated on add-clip
const player = document.getElementById("player");

// Position grid anchors (thirds of the 1080x1920 canvas) + a pixel offset on top.
// posRow/posCol/offsetX/offsetY are UI-only conveniences layered over TextPreset.x/y.
const POSITION_ANCHORS_X = { left: 162, mid: 540, right: 918 };
const POSITION_ANCHORS_Y = { top: 288, mid: 960, btm: 1632 };

function defaultTextPreset() {
  return {
    id: crypto.randomUUID().replaceAll("-", ""),
    name: "Default", font: "Arial", size_px: 96, color: "#FFFFFF",
    outline_color: "#000000", outline_px: 4, box: false, box_color: "#000000",
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
  textPreset.size_px = parseInt(document.getElementById("text-size").value, 10);
  textPreset.box = document.getElementById("text-box").checked;
  saveTextPreset();
  renderTextPreview();
}

function renderTextPanel() {
  const block = ensureTextBlock();
  document.getElementById("text-heading").value = block.heading;
  document.getElementById("text-size").value = textPreset.size_px;
  document.getElementById("text-box").checked = textPreset.box;

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
["text-size", "text-box"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateTextStyle);
});

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

function renderClipList() {
  const list = document.getElementById("clip-list");
  list.innerHTML = "";
  const ordered = [...project.clips].sort((a, b) => a.order - b.order);
  ordered.forEach((c, i) => {
    const li = document.createElement("li");

    const head = document.createElement("div");
    head.className = "clip-row-head";

    const thumb = document.createElement("div");
    thumb.className = "clip-thumb";
    head.appendChild(thumb);

    const info = document.createElement("div");
    info.className = "clip-info";
    const name = document.createElement("span");
    name.className = "clip-name";
    name.textContent = c.file_path;
    const duration = document.createElement("span");
    duration.className = "clip-duration";
    duration.textContent = `${c.in_point.toFixed(1)}s – ${c.out_point.toFixed(1)}s`;
    info.appendChild(name);
    info.appendChild(duration);
    head.appendChild(info);

    const up = document.createElement("button");
    up.textContent = "▲";
    up.disabled = i === 0;
    up.addEventListener("click", () => moveClip(c, ordered[i - 1]));
    const down = document.createElement("button");
    down.textContent = "▼";
    down.disabled = i === ordered.length - 1;
    down.addEventListener("click", () => moveClip(c, ordered[i + 1]));
    head.appendChild(up);
    head.appendChild(down);
    li.appendChild(head);

    const dur = clipDurations[c.id] ?? c.out_point;
    const inField = document.createElement("input");
    inField.type = "number"; inField.step = "0.1"; inField.style.width = "5em";
    inField.value = c.in_point.toFixed(1);
    const outField = document.createElement("input");
    outField.type = "number"; outField.step = "0.1"; outField.style.width = "5em";
    outField.value = c.out_point.toFixed(1);

    async function applyTrim() {
      const t = clampTrim(parseFloat(inField.value), parseFloat(outField.value), dur);
      c.in_point = t.in_point; c.out_point = t.out_point;
      inField.value = t.in_point.toFixed(1); outField.value = t.out_point.toFixed(1);
      duration.textContent = `${t.in_point.toFixed(1)}s – ${t.out_point.toFixed(1)}s`;
      await saveProject();
      Preview.load(project);
    }
    inField.addEventListener("change", applyTrim);
    outField.addEventListener("change", applyTrim);

    const setIn = document.createElement("button");
    setIn.textContent = "Set in";
    setIn.addEventListener("click", () => { inField.value = player.currentTime.toFixed(1); applyTrim(); });
    const setOut = document.createElement("button");
    setOut.textContent = "Set out";
    setOut.addEventListener("click", () => { outField.value = player.currentTime.toFixed(1); applyTrim(); });

    const br = document.createElement("div");
    br.append("in: ", inField, setIn, " out: ", outField, setOut);
    li.appendChild(br);
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
}

async function addClip() {
  const pickRes = await fetch("/api/pick-file");
  const { path: pickedPath } = await pickRes.json();
  if (pickedPath) {
    document.getElementById("clip-path").value = pickedPath;
  }
  const path = document.getElementById("clip-path").value.trim();
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
  document.getElementById("clip-path").value = "";
  await saveProject();
  renderClipList();
  Preview.load(project);
}

document.getElementById("add-clip").addEventListener("click", addClip);

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
  project = await ensureProject();
  document.getElementById("project-name").textContent = project.name;
  textPreset = loadTextPreset(project.id);
  computeXY();
  renderClipList();
  Preview.load(project);
  renderTextPanel();
})();
