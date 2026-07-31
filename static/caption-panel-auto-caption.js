// CAPTIONS panel's Auto tab: the Auto-caption button — runs transcription as a background job and
// merges the result into `project`. Exposes the global runAutoCaption(), also called by
// clip-sequence.js and editor.js when an audible clip is added (auto-caption-on-clip-add). Reaches
// into editor.js's project/renderTimeline and panel-captions.js's ensureCaptionTrack/renderCaptionPanel
// globals. Transcription progress is shown as a live percentage via CaptionTranscribeProgress,
// which polls the job started here.

// The button's disabled/label state only has a visible effect when the CAPTIONS panel's Auto tab
// happens to be open; otherwise this just quietly updates captions/timeline once done, same
// "background enhancement, no loading UI" pattern as thumbnail/waveform/filmstrip fetches
// elsewhere in this app. Failures (e.g. the `ml` extra not installed, or no usable transcription
// backend) surface in #caption-transcribe-error.
async function runAutoCaption() {
  const btn = document.getElementById("caption-auto-caption-btn");
  if (btn.disabled) return;
  ensureCaptionTrack();
  const label = btn.querySelector(".button-label");
  const errorEl = document.getElementById("caption-transcribe-error");
  errorEl.hidden = true;
  btn.disabled = true;
  label.textContent = "Transcribing… 0%";
  try {
    const { job_id } = await Api.transcribeProject(project.id);
    await new Promise((resolve) => {
      CaptionTranscribeProgress.start(job_id, {
        onDone: async () => {
          try {
            const res = await fetch(`/api/projects/${project.id}`);
            if (!res.ok) throw new Error(`Could not reload project (${res.status}).`);
            project = await res.json();
            await renderCaptionPanel();   // repopulates the CAPTIONS transcript list, even while hidden
            AudioTrackPanel.render();     // refreshes VIDEO panel's AUTO SILENCE no-transcript hint
            renderTimeline();
          } catch (err) {
            errorEl.textContent = err.message || "Transcription finished, but reloading the project failed.";
            errorEl.hidden = false;
          } finally {
            resolve();
          }
        },
        onFailed: (message) => {
          errorEl.textContent = message || "Transcription failed.";
          errorEl.hidden = false;
          resolve();
        },
      });
    });
  } catch (err) {
    errorEl.textContent = (err && err.message) || "Transcription failed: could not reach the server.";
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    label.textContent = "Auto-caption";
  }
}

document.getElementById("caption-auto-caption-btn").addEventListener("click", runAutoCaption);
