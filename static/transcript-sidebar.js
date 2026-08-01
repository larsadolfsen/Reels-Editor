// Renders the transcript sidebar (#transcript-sidebar, static/css/components/transcript-sidebar.css):
// one <div class="transcript-sentence"> per sentence (static/transcript-sentences.js), one
// <span class="transcript-word"> per word. Self-registers onto Preview.onTimeUpdate to toggle
// .active/.active-word classes and auto-scroll every playback tick, so no caller has to drive a
// render loop. render(project) does the structural rebuild and is called from preview.js's load()
// and panel-captions.js's renderCaptionPreview() — the two places captions already get re-rendered
// on every structural change (project load/restore, word add/edit/delete, clip delete/reorder
// resync via caption-clip-sync.js, auto-caption completion).
window.TranscriptSidebar = (() => {
  const container = document.getElementById("transcript-sidebar");
  let sentenceEls = []; // [{ sentence, el }], aligned with the current sentence list
  let wordEls = [];     // [{ word, el }], flat across all sentences
  let activeSentenceIndex = -1;

  function render(project) {
    const words = (project.captions && project.captions.words) || [];
    // Sort a copy before grouping so out-of-order timestamps (e.g. from a bad manual edit)
    // can't produce a sentence whose end precedes its start — groupBySentence itself stays a
    // simple, sort-free pure function (see its own header/tests).
    const sortedWords = [...words].sort((a, b) => a.t_start - b.t_start);
    const sentences = TranscriptSentences.groupBySentence(sortedWords);

    // A caption STYLE change (color, border-radius, ...) calls render() just as much as a real
    // word-list change does, tearing down and rebuilding every sentence/word div. Remember which
    // sentence was active *before* the rebuild so updateHighlight can skip the scroll-into-view
    // when the active sentence didn't actually change — otherwise activeSentenceIndex always
    // resets to -1 below, updateHighlight's change-detection always fires on the very next call,
    // and the sidebar scroll-jumps back to whatever sentence happens to be first even when a
    // later sentence was the one actually showing.
    const prevActiveIndex = activeSentenceIndex;

    container.innerHTML = "";
    sentenceEls = [];
    wordEls = [];
    activeSentenceIndex = -1;

    if (sentences.length === 0) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    sentences.forEach((sentence) => {
      const sentenceDiv = document.createElement("div");
      sentenceDiv.className = "transcript-sentence";
      sentence.words.forEach((word, i) => {
        const span = document.createElement("span");
        span.className = "transcript-word";
        span.dataset.tStart = word.t_start;
        span.textContent = word.text + (i < sentence.words.length - 1 ? " " : "");
        span.addEventListener("click", () => Preview.seek(word.t_start));
        sentenceDiv.appendChild(span);
        wordEls.push({ word, el: span });
      });
      container.appendChild(sentenceDiv);
      sentenceEls.push({ sentence, el: sentenceDiv });
    });

    updateHighlight(Preview.currentTimelineTime(), { skipScrollIfIndex: prevActiveIndex });
  }

  function updateHighlight(timelineTime, opts) {
    if (sentenceEls.length === 0) return;

    const newIndex = sentenceEls.findIndex(
      ({ sentence }) => timelineTime >= sentence.start && timelineTime < sentence.end);
    if (newIndex !== activeSentenceIndex) {
      sentenceEls.forEach(({ el }, i) => el.classList.toggle("active", i === newIndex));
      activeSentenceIndex = newIndex;
      const skipScroll = !!opts && opts.skipScrollIfIndex === newIndex;
      if (newIndex >= 0 && !skipScroll) {
        sentenceEls[newIndex].el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    wordEls.forEach(({ word, el }) => {
      const isActive = timelineTime >= word.t_start && timelineTime < word.t_end;
      el.classList.toggle("active-word", isActive);
    });
  }

  Preview.onTimeUpdate(updateHighlight);

  return { render };
})();
