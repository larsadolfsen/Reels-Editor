// CAPTIONS panel Filler words tab: the project-wide filler-word list (Project.filler_words)
// that Auto Slice's filler detection matches against — add a new word, see/remove existing ones —
// plus a one-click "Auto-remove filler words" button that cuts every transcribed word matching
// that list straight out of the timeline (via FillerWords.detectRanges + the same
// /auto-slice/apply endpoint AUTO SLICE uses), no silence detection and no review step. Each list
// entry that actually occurs in the current transcript gets a warning icon next to it, so the
// user can tell at a glance which words the button would remove.
// Not language-specific in storage (plain strings); user builds whatever list fits their
// transcript's language (e.g. Danish "øh"/"øhm"/"altså" instead of the English default).
// Exposes window.CaptionPanel.renderFillerWords(). Reaches into editor.js's
// project/saveProject/renderTimeline globals.
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  async function addFillerWord() {
    const input = document.getElementById("caption-filler-word-input");
    const value = input.value.trim().toLowerCase();
    input.value = "";
    if (!value) return;
    if (!project.filler_words.includes(value)) {
      project.filler_words.push(value);
      await saveProject();
    }
    renderFillerWords();
  }

  async function removeFillerWord(word) {
    project.filler_words = project.filler_words.filter((w) => w !== word);
    await saveProject();
    renderFillerWords();
  }

  // True when `word` (normalized the same way as detection) occurs anywhere in the current
  // transcript, so the FILLER WORDS list can flag which entries Auto-remove would actually cut.
  function wordFoundInTranscript(word) {
    const words = (project.captions && project.captions.words) || [];
    const normalized = FillerWords.normalizeWord(word);
    return words.some((w) => FillerWords.normalizeWord(w.text) === normalized);
  }

  function renderFillerWords() {
    const listEl = document.getElementById("caption-filler-words-list");
    listEl.innerHTML = "";
    (project.filler_words || []).forEach((word) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });

      const nameGroup = document.createElement("span");
      nameGroup.className = "font-list-row-name-group";

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      nameEl.textContent = word;
      nameGroup.appendChild(nameEl);

      if (wordFoundInTranscript(word)) {
        // Decorative status icon, not a clickable control — no onClick, so it stays a plain
        // <span> rather than a UI.button, same convention as panel-media.js's
        // .clip-audio-muted-icon indicator.
        const warnIcon = document.createElement("span");
        warnIcon.className = "filler-word-warning-icon";
        warnIcon.title = "Found in transcript";
        warnIcon.innerHTML = UI.icon("message-circle-warning", { size: 14 });
        nameGroup.appendChild(warnIcon);
      }

      li.appendChild(nameGroup);

      const trashBtn = UI.button(li, {
        icon: "trash",
        size: "sm",
        onClick: () => removeFillerWord(word),
      });
      trashBtn.title = "Remove";

      listEl.appendChild(li);
    });
  }

  document.getElementById("caption-filler-word-add").addEventListener("click", addFillerWord);
  document.getElementById("caption-filler-word-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addFillerWord(); }
  });

  async function autoRemoveFillerWords() {
    const track = ensureCaptionTrack();
    const ranges = FillerWords.detectRanges(track.words, project.filler_words);
    if (!ranges.length) return;
    const btn = document.getElementById("caption-filler-auto-remove-btn");
    btn.disabled = true;
    const updated = await Api.applyAutoSlice(project.id, ranges);
    btn.disabled = false;
    if (!updated) return;
    project = updated;
    renderTimeline();
    await renderCaptionPanel();
  }

  document.getElementById("caption-filler-auto-remove-btn").addEventListener("click", autoRemoveFillerWords);

  window.CaptionPanel.renderFillerWords = renderFillerWords;
})();
