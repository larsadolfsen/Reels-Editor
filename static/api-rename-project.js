// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Loads the current project by id, patches its name, PUTs it back. Fetches fresh from the
// server rather than trusting any in-memory copy, since the renamed project may not be the
// one currently open in the editor.
window.Api.renameProject = async function renameProject(id, name) {
  const res = await fetch(`/api/projects/${id}`);
  const project = await res.json();
  project.name = name;
  await fetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  return project;
};
