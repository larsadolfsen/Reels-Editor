// #panel-projects context-panel section: project list (open/rename/delete/duplicate) + "+ New
// Project". Exposes window.ProjectsPanel.render(currentProjectId, callbacks). Depends on Api
// (listProjects/renameProject/deleteProject/duplicateProject/createProject via callbacks.onCreateRequested)
// and UI.projectListRow. Never navigates or saves the currently-open project itself — that's
// editor.js's job (confirm+flush-save wraps onSwitch/onCreateRequested there). Renaming the
// currently-open row calls callbacks.onRenamedCurrent(name) so editor.js can update its
// in-memory project — Api.renameProject persists against a fresh server-fetched copy and never
// touches that in-memory object, so without this the next autosave would revert the rename.
window.ProjectsPanel = window.ProjectsPanel || {};

(() => {
  async function render(currentProjectId, callbacks) {
    const listEl = document.getElementById("project-list");
    listEl.innerHTML = "";
    const projects = await Api.listProjects();

    projects.forEach((p) => {
      const row = UI.projectListRow(p, {
        onOpen: () => { if (p.id !== currentProjectId) callbacks.onSwitch(p); },
        onRename: async (name) => {
          await Api.renameProject(p.id, name);
          if (p.id === currentProjectId) callbacks.onRenamedCurrent(name);
          await render(currentProjectId, callbacks);
        },
        onDelete: async () => {
          if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
          await Api.deleteProject(p.id);
          if (p.id === currentProjectId) callbacks.onDeletedCurrent();
          else await render(currentProjectId, callbacks);
        },
        onDuplicate: async () => {
          await Api.duplicateProject(p.id);
          await render(currentProjectId, callbacks);
        },
      });
      if (p.id === currentProjectId) row.classList.add("selected");
      listEl.appendChild(row);
    });

    document.getElementById("project-create").onclick = () => {
      const name = prompt("Project name:");
      if (!name) return;
      callbacks.onCreateRequested(name);
    };
  }

  window.ProjectsPanel.render = render;
})();
