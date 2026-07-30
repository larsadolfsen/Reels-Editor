// VIDEO panel's Auto tab content (timeline audio-track automations): sequences
// ensureCaptionTrack(), AudioTrackPanel.renderLanguage() (language settings row,
// audio-panel-language.js) and AutoSlicePanel.render() (the auto-slice flow,
// panel-auto-slice.js); audio-panel-auto-caption.js wires its own button directly and calls back
// into AudioTrackPanel.render() on success. Exposes window.AudioTrackPanel.render(), called by
// panel-video.js on every VIDEO-panel render (moved 2026-07-30 from a standalone AUTO rail entry
// into a third VIDEO tab — see panel-video.js).
window.AudioTrackPanel = window.AudioTrackPanel || {};

(() => {
  function render() {
    document.getElementById("video-audio-language").hidden = true;
    document.getElementById("video-main").hidden = false;
    document.getElementById("audio-transcribe-error").hidden = true;
    ensureCaptionTrack();
    AudioTrackPanel.renderLanguage();
    AutoSlicePanel.render();
  }

  window.AudioTrackPanel.render = render;
})();
