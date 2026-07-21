// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Fetches the current state of a background export job started by Api.exportProject.
// Returns { status: "running"|"done"|"failed", percent, output_path, error }. Throws on a
// non-2xx response (e.g. unknown job id).
window.Api.exportStatus = async function exportStatus(jobId) {
  const res = await fetch(`/api/exports/${jobId}`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
};
