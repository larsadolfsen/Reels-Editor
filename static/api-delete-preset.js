// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// DELETE /api/presets/{id}.
window.Api.deletePreset = async function deletePreset(id) {
  await fetch(`/api/presets/${id}`, { method: "DELETE" });
};
