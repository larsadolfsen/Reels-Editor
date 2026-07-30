// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .project-list-row CSS component, UI.button (ui-button.js), and
// UI.listRow() (ui-list-row.js) for the shared card/hover/selected styling. No app
// state — callers own the project data and own persisting any change the callbacks report.
// Reused by both the full-screen picker (open + delete) and the in-editor PROJECTS panel
// (open + inline rename + delete + duplicate) — pass only the callbacks each context needs.
// Action buttons (duplicate/delete) are hidden until the row is hovered (project-list-row.css).
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
  UI.listRow(li);

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
    const dupBtn = UI.button(li, {
      icon: "copy",
      size: "sm",
      onClick: (e) => { e.stopPropagation(); onDuplicate(); },
    });
    dupBtn.title = "Duplicate";
    dupBtn.classList.add("project-list-row-action");
  }

  if (onDelete) {
    const delBtn = UI.button(li, {
      icon: "trash",
      size: "sm",
      onClick: (e) => { e.stopPropagation(); onDelete(); },
    });
    delBtn.title = "Delete";
    delBtn.classList.add("project-list-row-action");
  }

  if (onOpen) li.addEventListener("click", () => onOpen());

  return li;
};
