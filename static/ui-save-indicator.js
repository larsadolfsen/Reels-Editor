// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .save-indicator CSS component. No app state beyond in-flight-save
// counting (so overlapping saveProject() calls don't flicker Saved/Saving) and the
// "Saved" fade-to-icon timeout. Caller drives setSaving()/setSaved()/setFailed().
window.UI = window.UI || {};

window.UI.saveIndicator = function saveIndicator(container) {
  container.classList.add("save-indicator");
  container.innerHTML = "";

  const dot = document.createElement("span");
  dot.className = "save-indicator-dot";
  const label = document.createElement("span");
  label.className = "save-indicator-label";
  container.append(dot, label);

  let pending = 0;
  let fadeTimer = null;
  let retryFn = null;

  function clearFadeTimer() {
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
  }

  function setSaving() {
    pending += 1;
    clearFadeTimer();
    container.classList.remove("is-failed", "is-faded");
    container.classList.add("is-saving");
    retryFn = null;
    label.textContent = "Saving…";
  }

  function setSaved() {
    pending = Math.max(0, pending - 1);
    if (pending > 0) return;
    clearFadeTimer();
    container.classList.remove("is-saving", "is-failed", "is-faded");
    retryFn = null;
    label.textContent = "Saved";
    fadeTimer = setTimeout(() => {
      container.classList.add("is-faded");
      fadeTimer = null;
    }, 2000);
  }

  function setFailed(onRetry) {
    pending = 0;
    clearFadeTimer();
    container.classList.remove("is-saving", "is-faded");
    container.classList.add("is-failed");
    retryFn = onRetry;
    label.textContent = "Save failed — retry";
  }

  container.addEventListener("click", () => {
    if (retryFn) retryFn();
  });

  setSaved();
  return { setSaving, setSaved, setFailed };
};
