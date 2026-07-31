// AUDIO context-panel section: import a single background-music MediaItem (kind="audio") onto
// Project.music, edit its volume/mute, replace or remove it. Exposes window.AudioPanel.render().
// One music track only (v1) — mirrors panel-video-box.js's add-picker/detail-view shape but with
// no picker list (a single "ADD MUSIC" button goes straight through the native file picker,
// since there's no existing media-library browsing step for music the way video boxes reuse
// already-imported clips).
window.AudioPanel = window.AudioPanel || {};

(() => {
  const AUDIO_HEADER_ICON = UI.icon("music", { size: 18 });

  async function importMusicFile() {
    const path = await Api.pickFile("audio");
    if (!path) return null;
    const probeResult = await Api.probeMedia(path);
    if (!probeResult) { alert("probe failed"); return null; }
    const { duration, has_audio } = probeResult;
    const mediaId = crypto.randomUUID().replaceAll("-", "");
    project.media_library.push({ id: mediaId, file_path: path, duration, has_audio, kind: "audio" });
    return mediaId;
  }

  async function addMusic() {
    const mediaId = await importMusicFile();
    if (!mediaId) return;
    project.music = { id: crypto.randomUUID().replaceAll("-", ""), media_id: mediaId, volume: 0.3, muted: false };
    await saveProject();
    // PreviewAudio's module-level `music` state (static/preview-audio.js) is only ever set inside
    // PreviewAudio.load(project) — without this, PreviewAudio.play() silently no-ops even though
    // Project.music is now correctly set (bug found in final review).
    Preview.load(project);
    renderTimeline();
    render();
  }

  async function replaceMusic() {
    const mediaId = await importMusicFile();
    if (!mediaId) return;
    project.music.media_id = mediaId;
    await saveProject();
    Preview.load(project); // same PreviewAudio-state gap as addMusic() above
    renderTimeline();
    render();
  }

  async function removeMusic() {
    project.music = null;
    await saveProject();
    Preview.load(project); // same PreviewAudio-state gap as addMusic() above — otherwise the removed track keeps playing until reload
    renderTimeline();
    render();
  }

  function render() {
    const music = project.music;
    const media = music ? project.media_library.find((m) => m.id === music.media_id) : null;
    UI.contextPanelHeader(document.getElementById("audio-header"), {
      icon: AUDIO_HEADER_ICON,
      label: music ? ((media && (media.name || media.file_path.split(/[\\/]/).pop())) || "Unknown file") : "Audio",
    });
    document.getElementById("audio-empty-state").hidden = !!music;
    document.getElementById("audio-detail").hidden = !music;
    document.getElementById("audio-add-music").onclick = addMusic;
    if (!music) return;

    UI.numberField(document.getElementById("audio-volume-field"),
      { label: "VOLUME", unit: "%", value: Math.round(music.volume * 100), step: 5, min: 0, max: 200, decimals: 0, span: 6,
        onChange: async (v) => {
          music.volume = Math.max(0, Math.min(2, v / 100));
          await saveProject();
        } });

    const muteBtn = document.getElementById("audio-mute-btn");
    const iconVolume = muteBtn.querySelector(".icon-volume");
    const iconMuted = muteBtn.querySelector(".icon-volume-muted");
    function updateMuteIcon() {
      iconVolume.classList.toggle("icon-hidden", music.muted);
      iconMuted.classList.toggle("icon-hidden", !music.muted);
      muteBtn.setAttribute("aria-pressed", String(!!music.muted));
    }
    updateMuteIcon();
    muteBtn.onclick = async () => {
      music.muted = !music.muted;
      updateMuteIcon();
      await saveProject();
    };

    document.getElementById("audio-replace").onclick = replaceMusic;
    document.getElementById("audio-remove").onclick = removeMusic;
  }

  window.AudioPanel.render = render;
})();
