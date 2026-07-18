// API service, framework-free. Attaches to window.Api. No app state — caller owns the data.
window.Api = window.Api || {};

// Saves `preset` to the server's global preset library (same id updates, new id creates).
window.Api.savePreset = async function savePreset(preset) {
  const res = await fetch("/api/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preset),
  });
  return res.json();
};
