// Get a media item's thumbnail image — returns a data URL or null on error.
window.Api = window.Api || {};
window.Api.getMediaThumbnail = async (mediaId, filePath) => {
  try {
    const resp = await fetch(`/api/media/${encodeURIComponent(mediaId)}/thumbnail?path=${encodeURIComponent(filePath)}`);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
};
