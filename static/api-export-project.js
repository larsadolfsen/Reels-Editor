// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Starts a background export job for `projectId`. Returns { ok: true, job_id } on success, or
// { ok: false, error } (error is the response body text) on failure. Poll progress/result via
// Api.exportStatus(job_id).
window.Api.exportProject = async function exportProject(projectId) {
  const res = await fetch(`/api/projects/${projectId}/export`, { method: "POST" });
  if (!res.ok) {
    return { ok: false, error: await res.text() };
  }
  const { job_id } = await res.json();
  return { ok: true, job_id };
};
