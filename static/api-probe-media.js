// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.
window.Api = window.Api || {};

// Probes a media file's duration via ffprobe. Returns { duration, has_audio }, or null if the probe failed.
window.Api.probeMedia = async function probeMedia(path) {
  const res = await fetch(`/api/probe?path=${encodeURIComponent(path)}`);
  if (!res.ok) return null;
  return res.json();
};
