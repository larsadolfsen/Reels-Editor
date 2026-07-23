// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Cuts the given approved (start, end) timeline-time ranges out of a project's clip sequence.
// Returns the updated Project, or null on failure.
window.Api.applyAutoSlice = async function applyAutoSlice(projectId, ranges) {
  const res = await fetch(`/api/projects/${projectId}/auto-slice/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ranges }),
  });
  if (!res.ok) return null;
  return res.json();
};
