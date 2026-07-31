// Polls a background transcription job (Api.transcribeStatus) every 500ms and writes the live
// percentage into the Auto-caption button's label. Exposes window.CaptionTranscribeProgress.start.
window.CaptionTranscribeProgress = window.CaptionTranscribeProgress || {};

(() => {
  const POLL_MS = 500;
  let pollHandle = null;

  function setLabel(text) {
    const btn = document.getElementById("caption-auto-caption-btn");
    const label = btn && btn.querySelector(".button-label");
    if (label) label.textContent = text;
  }

  async function poll(jobId, callbacks) {
    let job;
    try {
      job = await Api.transcribeStatus(jobId);
    } catch (err) {
      callbacks.onFailed(err.message);
      return;
    }
    if (job.status === "running") {
      setLabel(`Transcribing… ${Math.round(job.percent)}%`);
      pollHandle = setTimeout(() => poll(jobId, callbacks), POLL_MS);
      return;
    }
    if (job.status === "done") {
      callbacks.onDone();
    } else {
      callbacks.onFailed(job.error);
    }
  }

  function start(jobId, callbacks) {
    clearTimeout(pollHandle);
    setLabel("Transcribing… 0%");
    poll(jobId, callbacks);
  }

  window.CaptionTranscribeProgress.start = start;
})();
