// CAPTIONS panel's Auto tab: the language passed to faster-whisper when transcribing
// (CaptionTrack.language, "" = auto-detect). Settings-row + drill-down subpage, registered against
// the shared captionStyleHost (panel-captions.js) rather than hand-rolled markup toggling — mirrors
// style-section-font-family.js's page pattern. Exposes window.CaptionPanel.renderLanguage(). Reaches
// into editor.js's project/saveProject/ensureCaptionTrack/AVAILABLE_LANGUAGES globals and
// panel-captions.js's captionStyleHost.
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let languageRowSetValue = null;

  function labelFor(code) {
    const found = AVAILABLE_LANGUAGES.find((l) => l.code === code);
    return found ? found.label : AVAILABLE_LANGUAGES[0].label;
  }

  async function selectLanguage(code) {
    const track = ensureCaptionTrack();
    track.language = code;
    await saveProject();
    renderLanguage();
    languagePage.close();
  }

  function buildLanguageList(bodyEl) {
    const listEl = document.createElement("ul");
    listEl.className = "font-list";
    bodyEl.appendChild(listEl);

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

  const languagePage = captionStyleHost.page("Language", buildLanguageList);

  function renderLanguage() {
    const track = ensureCaptionTrack();
    const label = labelFor(track.language);
    if (languageRowSetValue) {
      languageRowSetValue(label);
    } else {
      languageRowSetValue = UI.settingsRow(document.getElementById("caption-language-row"), {
        label: "Language", value: label,
        onClick: languagePage.open,
      });
    }
  }

  window.CaptionPanel.renderLanguage = renderLanguage;
})();
