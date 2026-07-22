// Music-track playback: one <audio> element kept in sync with the timeline clock for
// Project.music. Exposes window.PreviewAudio.{load, play, pause, seek}. HTML5 audio's own
// end-of-file behavior stops playback at the music file's end (no looping in v1); volume/mute
// come from MusicTrack, clamped to <=1.0 for the same HTML5-volume-cap reason preview.js
// clamps clip volume (export applies the exact value via ffmpeg's volume filter instead).
window.PreviewAudio = (() => {
  const audioEl = document.createElement("audio");
  audioEl.preload = "auto";
  document.body.appendChild(audioEl);
  let music = null;

  function load(project) {
    music = project.music || null;
    if (!music) {
      audioEl.pause();
      audioEl.removeAttribute("src");
      return;
    }
    const media = (project.media_library || []).find((m) => m.id === music.media_id);
    if (!media) {
      audioEl.pause();
      audioEl.removeAttribute("src");
      music = null;
      return;
    }
    audioEl.src = "/media?path=" + encodeURIComponent(media.file_path);
    audioEl.volume = Math.max(0, Math.min(music.volume, 1));
    audioEl.muted = !!music.muted;
    audioEl.currentTime = 0;
  }

  function play() {
    if (music) audioEl.play().catch(() => {});
  }

  function pause() {
    if (music) audioEl.pause();
  }

  function seek(t) {
    if (music) audioEl.currentTime = Math.max(0, t);
  }

  return { load, play, pause, seek };
})();
