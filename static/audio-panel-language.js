// VIDEO panel's Auto tab: the language passed to faster-whisper when transcribing
// (CaptionTrack.language, "" = auto-detect). Settings-row + drill-down subpanel, same pattern as
// caption-panel-font-family.js. Exposes window.AudioTrackPanel.renderLanguage(). Reaches into
// editor.js's project/saveProject/ensureCaptionTrack/AVAILABLE_LANGUAGES globals.
window.AudioTrackPanel = window.AudioTrackPanel || {};

(() => {
  let languageRowSetValue = null;

  function openLanguagePanel() {
    renderLanguageList();
    document.getElementById("video-main").hidden = true;
    document.getElementById("video-audio-language").hidden = false;
  }

  function closeLanguagePanel() {
    document.getElementById("video-audio-language").hidden = true;
    document.getElementById("video-main").hidden = false;
  }

  function labelFor(code) {
    const found = AVAILABLE_LANGUAGES.find((l) => l.code === code);
    return found ? found.label : AVAILABLE_LANGUAGES[0].label;
  }

  async function selectLanguage(code) {
    const track = ensureCaptionTrack();
    track.language = code;
    await saveProject();
    renderLanguage();
    closeLanguagePanel();
  }

  function renderLanguageList() {
    const listEl = document.getElementById("audio-language-list");
    listEl.innerHTML = "";
    const track = ensureCaptionTrack();
    AVAILABLE_LANGUAGES.forEach((lang) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });
      li.addEventListener("click", () => selectLanguage(lang.code));

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      nameEl.textContent = lang.label;
      li.appendChild(nameEl);

      if (lang.code === track.language) {
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("class", "font-list-checkmark");
        check.setAttribute("viewBox", "0 0 24 24");
        check.setAttribute("fill", "none");
        check.setAttribute("stroke", "currentColor");
        check.setAttribute("stroke-width", "2");
        check.setAttribute("stroke-linecap", "round");
        check.setAttribute("stroke-linejoin", "round");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M20 6 9 17l-5-5");
        check.appendChild(path);
        li.appendChild(check);
      }

      listEl.appendChild(li);
    });
  }

  UI.subPanelHeader(document.getElementById("audio-language-subpanel-header"), { title: "Language", onBack: closeLanguagePanel });

  function renderLanguage() {
    const track = ensureCaptionTrack();
    const label = labelFor(track.language);
    if (languageRowSetValue) {
      languageRowSetValue(label);
    } else {
      languageRowSetValue = UI.settingsRow(document.getElementById("audio-language-row"), {
        label: "Language", value: label,
        onClick: openLanguagePanel,
      });
    }
  }

  window.AudioTrackPanel.renderLanguage = renderLanguage;
})();
