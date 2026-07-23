// CAPTIONS panel Closed-caption tab: the project-wide filler-word list (Project.filler_words)
// that Auto Slice's filler detection matches against — add a new word, see/remove existing ones.
// Not language-specific in storage (plain strings); user builds whatever list fits their
// transcript's language (e.g. Danish "øh"/"øhm"/"altså" instead of the English default).
// Exposes window.CaptionPanel.renderFillerWords(). Reaches into editor.js's project/saveProject globals.
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

  function renderFillerWords() {
    const listEl = document.getElementById("caption-filler-words-list");
    listEl.innerHTML = "";
    (project.filler_words || []).forEach((word) => {
      const li = document.createElement("li");
      li.className = "font-list-row";
      UI.listRow(li, { subtle: true });

      const nameEl = document.createElement("span");
      nameEl.className = "font-list-row-name";
      nameEl.textContent = word;
      li.appendChild(nameEl);

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

  window.CaptionPanel.renderFillerWords = renderFillerWords;
})();
