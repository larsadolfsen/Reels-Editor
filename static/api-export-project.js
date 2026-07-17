// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Triggers export for `projectId`. Returns { ok: true, out_path } on success, or
// { ok: false, error } (error is the response body text) on failure.
window.Api.exportProject = async function exportProject(projectId) {
  const res = await fetch(`/api/projects/${projectId}/export`, { method: "POST" });
  if (!res.ok) {
    return { ok: false, error: await res.text() };
  }
  const { out_path } = await res.json();
  return { ok: true, out_path };
};
