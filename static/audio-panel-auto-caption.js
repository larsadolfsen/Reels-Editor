// AUDIO panel, Auto tab: the Auto-caption button — runs transcription and merges the result into
// `project`. Exposes the global runAutoCaption(), also called by clip-sequence.js and editor.js
// when an audible clip is added (auto-caption-on-clip-add). Reaches into editor.js's
// project/renderTimeline and panel-captions.js's ensureCaptionTrack/renderCaptionPanel globals.

// The button's disabled/label state only has a visible effect when the AUDIO panel happens to be
// open; otherwise this just quietly updates captions/timeline once done, same "background
// enhancement, no loading UI" pattern as thumbnail/waveform/filmstrip fetches elsewhere in this
// app. Failures (e.g. 503 when the `ml` extra isn't installed) surface in #audio-transcribe-error.
async function runAutoCaption() {
  ensureCaptionTrack();
  const btn = document.getElementById("audio-auto-caption-btn");
  const label = btn.querySelector(".label");
  const errorEl = document.getElementById("audio-transcribe-error");
  errorEl.hidden = true;
  btn.disabled = true;
  label.textContent = "Transcribing…";
  try {
    const res = await fetch(`/api/projects/${project.id}/transcribe`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      errorEl.textContent = (body && body.detail) || `Transcription failed (${res.status}).`;
      errorEl.hidden = false;
      return;
    }
    project = await res.json();
    await renderCaptionPanel();   // repopulates the CAPTIONS transcript list, even while hidden
    AudioTrackPanel.render();     // refreshes this panel's no-transcript hint
    renderTimeline();
  } catch {
    errorEl.textContent = "Transcription failed: could not reach the server.";
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    label.textContent = "Auto-caption";
  }
}

document.getElementById("audio-auto-caption-btn").addEventListener("click", runAutoCaption);
