// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Copies each path into the project's own local media folder (data/media/), probes it, and
// appends a MediaItem to the project — a path already referenced by an existing MediaItem's
// source_path is skipped (dedup). Returns { project, imported }, or null on failure. imported
// holds only the newly-added MediaItems, in input order (added 2026-07-31, copy-on-import).
window.Api.importMedia = async function importMedia(projectId, paths) {
  const res = await fetch(`/api/projects/${projectId}/import-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) return null;
  return res.json();
};
