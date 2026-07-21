// CAPTIONS panel Closed-caption tab: every transcribed word, inline-editable text (empty
// text deletes the word) and inline-editable start/end timing (seconds, one decimal).
// Exposes window.CaptionPanel.renderWords(). Was a settings-row + drill-down sub-panel;
// folded into a permanent tab pane (2026-07-21, right-panel-tabs item) — same list rendering,
// no more back-arrow/open-close wiring.
window.CaptionPanel = window.CaptionPanel || {};

(() => {
  // Pure validation: t_start clamped to >= 0, and t_start must be < t_end.
  // Returns the clamped {t_start, t_end} when valid, or null when invalid
  // (caller should revert the field to the previously-stored value).
  function clampWordTiming(t_start, t_end) {
    if (Number.isNaN(t_start) || Number.isNaN(t_end)) return null;
    const clampedStart = Math.max(0, t_start);
    if (!(clampedStart < t_end)) return null;
    return { t_start: clampedStart, t_end };
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

  async function commitWordTiming(word, newStart, newEnd) {
    word.t_start = newStart;
    word.t_end = newEnd;
    await saveProject();
    renderCaptionPreview();
    renderTimeline();
  }

  function renderWordsList() {
    const listEl = document.getElementById("caption-words-list");
    listEl.innerHTML = "";
    const track = ensureCaptionTrack();
    [...track.words].sort((a, b) => a.t_start - b.t_start).forEach((word) => {
      const li = document.createElement("li");
      li.className = "font-list-row";

      const startInput = document.createElement("input");
      startInput.type = "number";
      startInput.step = "0.1";
      startInput.className = "font-list-row-time";
      startInput.value = word.t_start.toFixed(1);
      startInput.addEventListener("change", () => {
        const result = clampWordTiming(parseFloat(startInput.value), word.t_end);
        if (!result) {
          startInput.value = word.t_start.toFixed(1);
          return;
        }
        commitWordTiming(word, result.t_start, result.t_end).then(renderWordsList);
      });
      li.appendChild(startInput);

      const endInput = document.createElement("input");
      endInput.type = "number";
      endInput.step = "0.1";
      endInput.className = "font-list-row-time";
      endInput.value = word.t_end.toFixed(1);
      endInput.addEventListener("change", () => {
        const result = clampWordTiming(word.t_start, parseFloat(endInput.value));
        if (!result) {
          endInput.value = word.t_end.toFixed(1);
          return;
        }
        commitWordTiming(word, result.t_start, result.t_end).then(renderWordsList);
      });
      li.appendChild(endInput);

      const input = document.createElement("input");
      input.type = "text";
      input.value = word.text;
      input.addEventListener("change", () => commitWordEdit(word, input.value).then(renderWordsList));
      li.appendChild(input);

      listEl.appendChild(li);
    });
  }

  window.CaptionPanel.renderWords = renderWordsList;
})();
