// AUTO SLICE context-panel section: detect silence + filler-word ranges (Api.detectAutoSlice)
// and cut approved ones out of the clip sequence (Api.applyAutoSlice). Three views toggled by
// module-local viewState: idle (run detection) -> results (approve which ranges to cut, step 1)
// -> confirm (final approval, step 2) -> back to idle. Exposes window.AutoSlicePanel.render().
window.AutoSlicePanel = window.AutoSlicePanel || {};

(() => {
  let viewState = "idle";  // "idle" | "results" | "confirm"
  let detectedRanges = []; // [{start, end, kind, label, approved}]

  function fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1).padStart(4, "0");
    return `${m}:${s}`;
  }

  function showView(name) {
    viewState = name;
    document.getElementById("auto-slice-idle").hidden = name !== "idle";
    document.getElementById("auto-slice-results").hidden = name !== "results";
    document.getElementById("auto-slice-confirm").hidden = name !== "confirm";
  }

  function approvedRanges() {
    return detectedRanges.filter((r) => r.approved);
  }

  function updateResultsSummary() {
    const approved = approvedRanges();
    const totalSeconds = approved.reduce((sum, r) => sum + (r.end - r.start), 0);
    document.getElementById("auto-slice-summary").textContent =
      `${approved.length} of ${detectedRanges.length} selected · ${totalSeconds.toFixed(1)}s to remove`;
    document.getElementById("auto-slice-continue").disabled = approved.length === 0;
  }

  function renderResultsList() {
    const listEl = document.getElementById("auto-slice-list");
    listEl.innerHTML = "";
    detectedRanges.forEach((range) => {
      const li = document.createElement("li");
      li.className = "auto-slice-row";
      UI.listRow(li, { subtle: true });

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = range.approved;
      checkbox.addEventListener("change", () => {
        range.approved = checkbox.checked;
        updateResultsSummary();
      });
      li.appendChild(checkbox);

      const badge = document.createElement("span");
      badge.className = `auto-slice-badge auto-slice-badge--${range.kind}`;
      badge.textContent = range.kind === "filler" ? "FILLER" : "SILENCE";
      li.appendChild(badge);

      const time = document.createElement("span");
      time.className = "auto-slice-row-time";
      time.textContent = `${fmtTime(range.start)}–${fmtTime(range.end)}`;
      li.appendChild(time);

      const label = document.createElement("span");
      label.className = "auto-slice-row-label";
      label.textContent = range.label;
      li.appendChild(label);

      listEl.appendChild(li);
    });
    updateResultsSummary();
  }

  async function runDetect() {
    const btn = document.getElementById("auto-slice-detect-btn");
    const label = btn.querySelector(".label");
    btn.disabled = true;
    label.textContent = "Detecting…";
    try {
      const result = await Api.detectAutoSlice(project.id);
      if (!result) return;
      detectedRanges = result.ranges.map((r) => ({ ...r, approved: true }));
      showView("results");
      renderResultsList();
    } finally {
      btn.disabled = false;
      label.textContent = "Detect Silence & Filler Words";
    }
  }

  function renderConfirmSummary() {
    const approved = approvedRanges();
    const totalSeconds = approved.reduce((sum, r) => sum + (r.end - r.start), 0);
    document.getElementById("auto-slice-confirm-summary").textContent =
      `This will remove ${approved.length} range${approved.length === 1 ? "" : "s"} ` +
      `(${totalSeconds.toFixed(1)}s total) from the timeline.`;
  }

  async function applyApproved() {
    const btn = document.getElementById("auto-slice-confirm-apply");
    btn.disabled = true;
    btn.textContent = "Applying…";
    try {
      const ranges = approvedRanges().map((r) => ({ start: r.start, end: r.end }));
      const result = await Api.applyAutoSlice(project.id, ranges);
      if (!result) return;
      project = result;
      Preview.load(project);
      renderTimeline();
      await saveProject();
      detectedRanges = [];
      showView("idle");
      render();
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirm & Apply";
    }
  }

  function render() {
    document.getElementById("auto-slice-no-transcript-hint").hidden =
      !!(project.captions && project.captions.words.length);
    showView(viewState);
    if (viewState === "results") renderResultsList();
    if (viewState === "confirm") renderConfirmSummary();
  }

  document.getElementById("auto-slice-detect-btn").addEventListener("click", runDetect);
  document.getElementById("auto-slice-redetect").addEventListener("click", runDetect);
  document.getElementById("auto-slice-continue").addEventListener("click", () => {
    showView("confirm");
    renderConfirmSummary();
  });
  document.getElementById("auto-slice-back").addEventListener("click", () => showView("results"));
  document.getElementById("auto-slice-confirm-apply").addEventListener("click", applyApproved);

  window.AutoSlicePanel.render = render;
})();
