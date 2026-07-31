// Polls a background transcription job (Api.transcribeStatus) every 500ms and writes the live
// percentage into the Auto-caption button's label. Exposes window.CaptionTranscribeProgress.start.
window.CaptionTranscribeProgress = window.CaptionTranscribeProgress || {};

(() => {
  const POLL_MS = 500;

  function setLabel(text) {
    const btn = document.getElementById("caption-auto-caption-btn");
    const label = btn && btn.querySelector(".button-label");
    if (label) label.textContent = text;
  }

  async function poll(jobId, callbacks, token) {
    let job;
    try {
      job = await Api.transcribeStatus(jobId);
    } catch (err) {
      callbacks.onFailed(err.message);
      return;
    }
    if (token.cancelled) return;
    if (job.status === "running") {
      setLabel(`Transcribing… ${Math.round(job.percent)}%`);
      setTimeout(() => poll(jobId, callbacks, token), POLL_MS);
      return;
    }
    if (job.status === "done") {
      callbacks.onDone();
    } else {
      callbacks.onFailed(job.error);
    }
  }

  function start(jobId, callbacks) {
    const token = { cancelled: false };
    setLabel("Transcribing… 0%");
    poll(jobId, callbacks, token);
    return token;
  }

  window.CaptionTranscribeProgress.start = start;
})();
