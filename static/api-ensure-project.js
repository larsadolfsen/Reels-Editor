// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Returns the project pointed at by localStorage.projectId if it still exists on disk,
// otherwise null — never auto-creates. Caller (editor.js) shows the full-screen picker on null.
window.Api.ensureProject = async function ensureProject() {
  const savedId = localStorage.getItem("projectId");
  if (savedId) {
    const res = await fetch(`/api/projects/${savedId}`);
    if (res.ok) return res.json();
  }
  return null;
};
