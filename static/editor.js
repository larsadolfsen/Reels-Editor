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
  for (const c of project.clips) {
    const li = document.createElement("li");
    li.textContent = `${c.file_path} (${c.in_point.toFixed(1)}-${c.out_point.toFixed(1)})`;
    list.appendChild(li);
  }
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

(async () => {
  project = await ensureProject();
  renderClipList();
  Preview.load(project);
})();
