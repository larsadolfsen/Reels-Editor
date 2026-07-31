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
    const sentences = TranscriptSentences.groupBySentence(words);

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
        span.textContent = word.text + (i < sentence.words.length - 1 ? " " : "");
        span.addEventListener("click", () => Preview.seek(word.t_start));
        sentenceDiv.appendChild(span);
        wordEls.push({ word, el: span });
      });
      container.appendChild(sentenceDiv);
      sentenceEls.push({ sentence, el: sentenceDiv });
    });

    updateHighlight(Preview.currentTimelineTime());
  }

  function updateHighlight(timelineTime) {
    if (sentenceEls.length === 0) return;

    const newIndex = sentenceEls.findIndex(
      ({ sentence }) => timelineTime >= sentence.start && timelineTime < sentence.end);
    if (newIndex !== activeSentenceIndex) {
      sentenceEls.forEach(({ el }, i) => el.classList.toggle("active", i === newIndex));
      activeSentenceIndex = newIndex;
      if (newIndex >= 0) {
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
