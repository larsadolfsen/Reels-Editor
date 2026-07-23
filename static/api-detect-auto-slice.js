// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Detects candidate silence + filler-word ranges to cut from a project's clip sequence.
// Returns { ranges: [{start, end, kind, label}] }, or null on failure.
window.Api.detectAutoSlice = async function detectAutoSlice(projectId) {
  const res = await fetch(`/api/projects/${projectId}/auto-slice/detect`, { method: "POST" });
  if (!res.ok) return null;
  return res.json();
};
