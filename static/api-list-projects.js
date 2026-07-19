// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// GET /api/projects -> lightweight ProjectSummary[] (id, name, created_at, updated_at),
// sorted newest-updated-first by the server.
window.Api.listProjects = async function listProjects() {
  const res = await fetch("/api/projects");
  return res.json();
};
