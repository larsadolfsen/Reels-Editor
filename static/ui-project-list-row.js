// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .project-list-row CSS component and .icon-btn (button-group.css). No app
// state — callers own the project data and own persisting any change the callbacks report.
// Reused by both the full-screen picker (open-only) and the in-editor PROJECTS panel
// (open + inline rename + delete + duplicate) — pass only the callbacks each context needs.
window.UI = window.UI || {};

function formatRelativeProjectTime(isoString) {
  const then = new Date(isoString).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

window.UI.projectListRow = function projectListRow(project, { onOpen, onRename, onDelete, onDuplicate } = {}) {
  const li = document.createElement("li");
  li.className = "project-list-row";

  const nameEl = document.createElement("span");
  nameEl.className = "project-list-row-name";
  nameEl.textContent = project.name;
  if (onRename) {
    nameEl.contentEditable = "true";
    nameEl.addEventListener("click", (e) => e.stopPropagation());
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nameEl.blur(); }
    });
    nameEl.addEventListener("blur", () => {
      const next = nameEl.textContent.trim();
      if (!next) { nameEl.textContent = project.name; return; } // empty rename rejected client-side
      if (next !== project.name) onRename(next);
      else nameEl.textContent = project.name;
    });
  }

  const metaEl = document.createElement("span");
  metaEl.className = "project-list-row-meta";
  metaEl.textContent = formatRelativeProjectTime(project.updated_at);

  li.append(nameEl, metaEl);

  if (onDuplicate) {
    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.className = "icon-btn project-list-row-action";
    dupBtn.title = "Duplicate";
    dupBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    dupBtn.addEventListener("click", (e) => { e.stopPropagation(); onDuplicate(); });
    li.appendChild(dupBtn);
  }

  if (onDelete) {
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn project-list-row-action";
    delBtn.title = "Delete";
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    delBtn.addEventListener("click", (e) => { e.stopPropagation(); onDelete(); });
    li.appendChild(delBtn);
  }

  if (onOpen) li.addEventListener("click", () => onOpen());

  return li;
};
