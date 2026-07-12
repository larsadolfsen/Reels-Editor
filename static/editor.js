// Editor state + API calls + DOM wiring. Thin — logic lives in app/*.py.
// Exposes nothing (page script); persists project via PUT after every mutation.
let project = null;
const clipDurations = {}; // clip.id -> source duration (seconds), populated on add-clip
const player = document.getElementById("player");

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
  Timeline.render(project, t, null, () => {});
}

function renderClipList() {
  const list = document.getElementById("clip-list");
  list.innerHTML = "";
  const ordered = [...project.clips].sort((a, b) => a.order - b.order);
  ordered.forEach((c, i) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = c.file_path + " ";
    li.appendChild(label);

    const up = document.createElement("button");
    up.textContent = "▲";
    up.disabled = i === 0;
    up.addEventListener("click", () => moveClip(c, ordered[i - 1]));
    const down = document.createElement("button");
    down.textContent = "▼";
    down.disabled = i === ordered.length - 1;
    down.addEventListener("click", () => moveClip(c, ordered[i + 1]));
    li.appendChild(up);
    li.appendChild(down);

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
      await saveProject();
      Preview.load(project);
      renderTimeline();
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
  renderTimeline();
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
  renderTimeline();
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
  const before = JSON.stringify(project);
  seedDefaults(project);
  if (JSON.stringify(project) !== before) await saveProject();
  document.getElementById("project-name").textContent = project.name;
  renderClipList();
  Preview.load(project);
  renderTimeline();
})();

player.addEventListener("timeupdate", renderTimeline);

document.getElementById("timeline-ruler").addEventListener("click", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const t = Timeline.timeAtX(project.clips, rect, e.clientX);
  Preview.seek(t);
});
