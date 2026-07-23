// Get a media item's timeline filmstrip sprite sheet — returns a data URL or null on error.
window.Api = window.Api || {};
window.Api.getMediaFilmstrip = async (mediaId, filePath) => {
  try {
    const resp = await fetch(`/api/media/${encodeURIComponent(mediaId)}/filmstrip?path=${encodeURIComponent(filePath)}`);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
};
