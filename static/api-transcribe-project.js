// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Starts a background transcription job for `projectId`. Returns { job_id }. Throws on a non-2xx
// response. Poll progress/result via Api.transcribeStatus(job_id).
window.Api.transcribeProject = async function transcribeProject(projectId) {
  const res = await fetch(`/api/projects/${projectId}/transcribe`, { method: "POST" });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
};
