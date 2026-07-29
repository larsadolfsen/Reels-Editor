// AUDIO context-panel section: the timeline's audio track. A single "Auto" tab holds the two
// audio-derived automations — AUTO CAPTION (language + transcribe) and AUTO SILENCE (detect
// silence/filler words and cut them out). Owns the tab bar and delegates rendering to
// panel-auto-slice.js. Exposes window.AudioTrackPanel.render().
window.AudioTrackPanel = window.AudioTrackPanel || {};

(() => {
  // Lucide "sparkles".
  const TAB_ICON_AUTO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>';

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
    document.getElementById("panel-audio-track-main").hidden = false;
    ensureCaptionTrack();
    AutoSlicePanel.render();
  }

  window.AudioTrackPanel.render = render;
})();
