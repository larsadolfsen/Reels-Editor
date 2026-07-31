// VIDEO panel's Auto tab content (timeline audio-track automation): sequences
// ensureCaptionTrack() and AutoSlicePanel.render() (the auto-slice flow, panel-auto-slice.js).
// AUTO CAPTION (Language row + Auto-caption button) moved into the CAPTIONS panel's own Auto tab
// 2026-07-31 — see static/caption-panel-language.js/caption-panel-auto-caption.js — so this tab
// now holds only AUTO SILENCE. Exposes window.AudioTrackPanel.render(), called by panel-video.js
// on every VIDEO-panel render.
window.AudioTrackPanel = window.AudioTrackPanel || {};

(() => {
  function render() {
    ensureCaptionTrack();
    AutoSlicePanel.render();
  }

  window.AudioTrackPanel.render = render;
})();
