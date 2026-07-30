// Full-screen project picker, framework-free. Attaches to window.UI. Shown at cold start when
// no valid localStorage.projectId is found — see api-ensure-project.js and editor.js.
// Depends on the #project-picker CSS component, UI.projectListRow, UI.button, and window.Api
// (listProjects/createProject/deleteProject). No app state of its own — always re-fetches the
// list on mount, including after a hover-revealed row delete.
window.UI = window.UI || {};

window.UI.projectPicker = async function projectPicker(container, { onOpen }) {
  const projects = await Api.listProjects();

  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "project-picker-inner";

  const heading = document.createElement("div");
  heading.className = "project-picker-heading";
  heading.textContent = "Your Projects";
  wrap.appendChild(heading);

  UI.button(wrap, {
    label: "NEW PROJECT",
    icon: "plus",
    intent: "dashed",
    onClick: async () => {
      const name = prompt("Project name:");
      if (!name) return;
      const created = await Api.createProject(name);
      onOpen(created);
    },
  });

  if (projects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "project-picker-empty";
    empty.textContent = "No projects yet.";
    wrap.appendChild(empty);
  } else {
    const list = document.createElement("ul");
    list.className = "project-picker-list project-list-row-list";
    projects.forEach((p) => list.appendChild(UI.projectListRow(p, {
      onOpen: () => onOpen(p),
      onDelete: async () => {
        if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
        await Api.deleteProject(p.id);
        await window.UI.projectPicker(container, { onOpen });
      },
    })));
    wrap.appendChild(list);
  }

  container.appendChild(wrap);
};
