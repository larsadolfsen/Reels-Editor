// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// POST /api/projects/{id}/duplicate -> the new Project (new id, name = "<name> copy").
window.Api.duplicateProject = async function duplicateProject(id) {
  const res = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
  return res.json();
};
