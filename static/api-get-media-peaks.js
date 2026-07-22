// API service, framework-free. Attaches to window.Api. No app state — caller owns the result.

// Fetches real waveform peak data for a media item. Returns number[] (0..1 per bucket), or [] if
// the request failed (caller falls back to drawing a flat line, same as no-audio media).
window.Api.getMediaPeaks = async function getMediaPeaks(mediaId, filePath) {
  const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/peaks?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) return [];
  return res.json();
};
