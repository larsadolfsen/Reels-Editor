// AUDIO context-panel section: the timeline's audio track. Owns the panel's tab bar and
// render() orchestration, sequencing ensureCaptionTrack(), AudioTrackPanel.renderLanguage()
// (language settings row, audio-panel-language.js) and AutoSlicePanel.render() (the auto-slice
// flow, panel-auto-slice.js); audio-panel-auto-caption.js wires its own button directly and
// calls back into AudioTrackPanel.render() on success. Exposes window.AudioTrackPanel.render().
window.AudioTrackPanel = window.AudioTrackPanel || {};

(() => {
  const TAB_ICON_AUTO = UI.icon("sparkles", { size: 18 });

  // One tab today. The bar exists so adding a second tab later is a pure content change.
  const AUDIO_TRACK_TABS = [{ value: "auto", icon: TAB_ICON_AUTO, label: "Auto" }];
  const audioTrackTabPanes = { auto: [document.getElementById("audio-track-auto-body")] };
  let activeAudioTrackTab = "auto";

  function showAudioTrackTab(value) {
    activeAudioTrackTab = value;
    Object.entries(audioTrackTabPanes).forEach(([k, els]) => els.forEach((el) => { el.hidden = k !== value; }));
  }

  UI.tabBar(document.getElementById("audio-track-tab-bar"), AUDIO_TRACK_TABS, activeAudioTrackTab, showAudioTrackTab);
  showAudioTrackTab(activeAudioTrackTab);

  function render() {
    document.getElementById("panel-audio-track-language").hidden = true;
    document.getElementById("panel-audio-track-main").hidden = false;
    document.getElementById("audio-transcribe-error").hidden = true;
    ensureCaptionTrack();
    AudioTrackPanel.renderLanguage();
    AutoSlicePanel.render();
  }

  window.AudioTrackPanel.render = render;
})();
