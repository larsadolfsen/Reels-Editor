// API service, framework-free. Attaches to window.Api. No app state — caller owns the data.
window.Api = window.Api || {};

// Fetches the weights (400/500/600/700, only those the font actually supports) available
// for the given font family, as [{value, label}], from GET /api/fonts/{name}/weights.
window.Api.listFontWeights = async function listFontWeights(fontName) {
  const res = await fetch(`/api/fonts/${encodeURIComponent(fontName)}/weights`);
  return res.json();
};
