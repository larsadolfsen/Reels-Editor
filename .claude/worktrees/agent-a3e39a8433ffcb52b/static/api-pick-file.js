// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Opens a native OS file-open dialog on the server. Returns the chosen path, or null if cancelled.
window.Api.pickFile = async function pickFile() {
  const res = await fetch("/api/pick-file");
  const { path } = await res.json();
  return path;
};
