// CAPTIONS panel: "Caption words" drill-down — every transcribed word, inline-editable text
// (empty text deletes the word), timing not editable (per the design spec's v1 scope).
// Exposes window.CaptionPanel.renderWords().
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  function openWordsPanel() {
    renderWordsList();
    document.getElementById("panel-captions-main").hidden = true;
    document.getElementById("panel-captions-words").hidden = false;
  }

  function closeWordsPanel() {
    document.getElementById("panel-captions-words").hidden = true;
    document.getElementById("panel-captions-main").hidden = false;
    renderCaptionPreview();
  }

  function formatWordTime(t) {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1).padStart(4, "0");
    return `${String(m).padStart(2, "0")}:${s}`;
  }

  async function commitWordEdit(word, newText) {
    const track = ensureCaptionTrack();
    if (!newText.trim()) {
      track.words = track.words.filter((w) => w.id !== word.id);
    } else {
      word.text = newText.trim();
    }
    await saveProject();
    renderCaptionPreview();
  }

  function renderWordsList() {
    const listEl = document.getElementById("caption-words-list");
    listEl.innerHTML = "";
    const track = ensureCaptionTrack();
    [...track.words].sort((a, b) => a.t_start - b.t_start).forEach((word) => {
      const li = document.createElement("li");
      li.className = "font-list-row";

      const timeEl = document.createElement("span");
      timeEl.className = "font-list-row-name";
      timeEl.textContent = formatWordTime(word.t_start);
      li.appendChild(timeEl);

      const input = document.createElement("input");
      input.type = "text";
      input.value = word.text;
      input.addEventListener("change", () => commitWordEdit(word, input.value).then(renderWordsList));
      li.appendChild(input);

      listEl.appendChild(li);
    });
  }

  UI.subPanelHeader(document.getElementById("caption-words-subpanel-header"), { title: "Caption words", onBack: closeWordsPanel });

  window.CaptionPanel.renderWords = function renderWords() {
    const track = ensureCaptionTrack();
    UI.settingsRow(document.getElementById("caption-words-row"), {
      label: "Caption words", value: String(track.words.length), onClick: openWordsPanel,
    });
  };
})();
