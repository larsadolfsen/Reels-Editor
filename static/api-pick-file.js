// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Opens a native OS file-open dialog on the server. kind="video" (default) filters to video
// files; kind="audio" filters to music files (mp3/wav/m4a/aac/ogg/flac) for the AUDIO panel's
// music import. Returns the chosen path, or null if cancelled.
window.Api.pickFile = async function pickFile(kind = "video") {
  const res = await fetch(`/api/pick-file?kind=${encodeURIComponent(kind)}`);
  const { path } = await res.json();
  return path;
};
