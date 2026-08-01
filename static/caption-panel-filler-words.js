// CAPTIONS panel's Auto tab: the project-wide filler-word list (Project.filler_words) that Auto
// Slice's filler detection matches against — add a new word, see/remove existing ones — plus a
// one-click "Auto-remove filler words" button that cuts every transcribed word matching that list
// straight out of the timeline (via FillerWords.detectRanges + the same /auto-slice/apply
// endpoint AUTO SLICE uses), no silence detection and no review step. Each list entry that
// actually occurs in the current transcript gets a warning icon next to it, so the user can tell
// at a glance which words the button would remove. The whole FILLER WORDS section (button +
// settings row) stays hidden until a transcript exists — matching this list against no transcript
// is meaningless. Not language-specific in storage (plain strings); user builds whatever list
// fits their transcript's language (e.g. Danish "øh"/"øhm"/"altså" instead of the English
// default). Exposes window.CaptionPanel.renderFillerWords(). Reaches into editor.js's
// project/saveProject/renderTimeline globals, and CAPTIONS' shared captionStyleHost
// (panel-captions.js) for its drill-down list subpage (2026-08-01, subpanel-host convergence —
// replaces the old hand-rolled #panel-captions-filler open/close toggle).
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  let fillerWordsRowSetValue = null;

  // True when `word` (normalized the same way as detection) occurs anywhere in the current
  // transcript, so the FILLER WORDS list can flag which entries Auto-remove would actually cut.
  function wordFoundInTranscript(word) {
    const words = (project.captions && project.captions.words) || [];
    const normalized = FillerWords.normalizeWord(word);
    return words.some((w) => FillerWords.normalizeWord(w.text) === normalized);
  }

  async function addFillerWord(input) {
    const value = input.value.trim().toLowerCase();
    input.value = "";
    if (!value) return;
    if (!project.filler_words.includes(value)) {
      project.filler_words.push(value);
      await saveProject();
    }
    refreshFillerWordsPage();
    renderFillerWordsRow();
  }

  async function removeFillerWord(word) {
    project.filler_words = project.filler_words.filter((w) => w !== word);
    await saveProject();
    refreshFillerWordsPage();
    renderFillerWordsRow();
  }

  // Builds the drill-down's whole body (add-field row + list) fresh into bodyEl — the
  // SubpanelHost contract: a subpage's body is rebuilt on every open(), same as the shared
  // style-section-*.js files' own drill-downs.
  function buildFillerWordsBody(bodyEl) {
    const fieldGroup = document.createElement("div");
    fieldGroup.className = "style-group";
    const fieldRow = document.createElement("div");
    fieldRow.className = "style-row";
    fieldGroup.appendChild(fieldRow);
    bodyEl.appendChild(fieldGroup);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "col-6";
    input.placeholder = "e.g. øh";
    fieldRow.appendChild(input);

    const addBtn = UI.button(fieldRow, {
      icon: "plus",
      size: "sm",
      onClick: () => addFillerWord(input),
    });
    addBtn.classList.add("col-2");
    addBtn.title = "Add filler word";

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addFillerWord(input); }
    });

    const listEl = document.createElement("ul");
    listEl.className = "font-list";
    bodyEl.appendChild(listEl);

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

  // Registered once, at module scope, against the panel-wide captionStyleHost (panel-captions.js)
  // — mirrors how style-section-*.js files register their own drill-downs.
  const fillerWordsPage = captionStyleHost.page("Filler words", buildFillerWordsBody);

  // Refreshes the list in place when it's already open (an add/delete inside the open page),
  // without a full close/reopen — open() already rebuilds the body fresh, so calling it again
  // is the same "clear + rebuild" the host does on a genuine open.
  function refreshFillerWordsPage() {
    fillerWordsPage.open();
  }

  function renderFillerWordsRow() {
    const count = (project.filler_words || []).length;
    const value = `${count} word${count === 1 ? "" : "s"}`;
    if (fillerWordsRowSetValue) {
      fillerWordsRowSetValue(value);
    } else {
      fillerWordsRowSetValue = UI.settingsRow(document.getElementById("caption-filler-words-row"), {
        label: "Filler words", value,
        onClick: fillerWordsPage.open,
      });
    }
  }

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

  window.CaptionPanel.renderFillerWords = function renderFillerWords() {
    document.getElementById("caption-filler-section").hidden = !(project.captions && project.captions.words.length);
    renderFillerWordsRow();
  };
})();
