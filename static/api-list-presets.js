// API service, framework-free. Attaches to window.Api. No app state — caller owns the data.
window.Api = window.Api || {};

// Fetches every saved TextPreset from the server's global preset library.
window.Api.listPresets = async function listPresets() {
  const res = await fetch("/api/presets");
  return res.json();
};
