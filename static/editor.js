// Editor state + API calls + DOM wiring. Thin — logic lives in app/*.py.
// Exposes nothing (page script); persists project via PUT after every mutation.
let project = null;

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
    li.textContent = `${c.file_path} (${c.in_point.toFixed(1)}-${c.out_point.toFixed(1)}) `;
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
  const path = document.getElementById("clip-path").value.trim();
  if (!path) return;
  const res = await fetch(`/api/probe?path=${encodeURIComponent(path)}`);
  if (!res.ok) { alert("probe failed"); return; }
  const { duration } = await res.json();
  project.clips.push({
    id: crypto.randomUUID().replaceAll("-", ""),
    file_path: path,
    in_point: 0,
    out_point: duration,
    order: project.clips.length,
  });
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
  renderClipList();
  Preview.load(project);
})();
