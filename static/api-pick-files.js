// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Opens a native OS file-open dialog (multi-select) on the server. Returns the chosen paths
// (empty array if cancelled).
window.Api.pickFiles = async function pickFiles() {
  const res = await fetch("/api/pick-files");
  const { paths } = await res.json();
  return paths;
};
