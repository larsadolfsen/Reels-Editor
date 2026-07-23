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
        const warnIcon = document.createElement("span");
        warnIcon.className = "icon-btn";
        warnIcon.title = "Found in transcript";
        warnIcon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
        nameGroup.appendChild(warnIcon);
      }

      li.appendChild(nameGroup);

      const trashBtn = document.createElement("button");
      trashBtn.type = "button";
      trashBtn.className = "icon-btn";
      trashBtn.title = "Remove";
      trashBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      trashBtn.addEventListener("click", () => removeFillerWord(word));
      li.appendChild(trashBtn);

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
