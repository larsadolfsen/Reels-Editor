// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Fetches the current state of a background transcription job started by Api.transcribeProject.
// Returns { status: "running"|"done"|"failed", percent, output_path, error }. Throws on a
// non-2xx response (e.g. unknown job id).
window.Api.transcribeStatus = async function transcribeStatus(jobId) {
  const res = await fetch(`/api/transcribe-jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
};
