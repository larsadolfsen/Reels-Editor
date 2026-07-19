// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// DELETE /api/projects/{id}.
window.Api.deleteProject = async function deleteProject(id) {
  await fetch(`/api/projects/${id}`, { method: "DELETE" });
};
