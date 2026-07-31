// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Copies each path into the project's own local media folder (data/media/), probes it, and
// appends a MediaItem to the project — a path already referenced by an existing MediaItem's
// source_path is skipped (dedup). Returns { project, imported }, or null on failure. imported
// holds only the newly-added MediaItems, in input order (added 2026-07-31, copy-on-import).
// `kind` is optional — pass it when the caller's picker already restricted file selection to
// one type (e.g. "audio" for the AUDIO panel's music import); omitted, the server auto-detects
// image vs. video from the file extension.
window.Api.importMedia = async function importMedia(projectId, paths, kind) {
  const res = await fetch(`/api/projects/${projectId}/import-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kind ? { paths, kind } : { paths }),
  });
  if (!res.ok) return null;
  return res.json();
};
