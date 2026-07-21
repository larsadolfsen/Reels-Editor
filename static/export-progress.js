// Polls a background export job (Api.exportStatus) every 500ms and drives the EXPORT panel's
// progress bar. Exposes window.ExportProgress.start(jobId, { onDone, onFailed }).
window.ExportProgress = window.ExportProgress || {};

(() => {
  const POLL_MS = 500;
  let pollHandle = null;

  function setPercent(percent) {
    const bar = document.getElementById("export-progress");
    const fill = document.getElementById("export-progress-fill");
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = `${percent}%`;
  }

  function hideBar() {
    const bar = document.getElementById("export-progress");
    if (bar) bar.hidden = true;
  }

  async function poll(jobId, callbacks) {
    let job;
    try {
      job = await Api.exportStatus(jobId);
    } catch (err) {
      hideBar();
      callbacks.onFailed(err.message);
      return;
    }
    if (job.status === "running") {
      setPercent(job.percent);
      pollHandle = setTimeout(() => poll(jobId, callbacks), POLL_MS);
      return;
    }
    hideBar();
    if (job.status === "done") {
      callbacks.onDone(job.output_path);
    } else {
      callbacks.onFailed(job.error);
    }
  }

  function start(jobId, callbacks) {
    clearTimeout(pollHandle);
    setPercent(0);
    poll(jobId, callbacks);
  }

  window.ExportProgress.start = start;
})();
