// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .sub-panel-header CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a back-chevron button + title into `container`, for the header of any drill-down
// sub-panel view (a settings row's detail view). onBack() fires when the back button is clicked.
window.UI.subPanelHeader = function subPanelHeader(container, { title, onBack }) {
  container.innerHTML = "";
  container.classList.add("sub-panel-header");

  const back = document.createElement("button");
  back.type = "button";
  back.className = "sub-panel-back";
  back.setAttribute("aria-label", "Back");
  back.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  back.addEventListener("click", () => onBack());

  const titleEl = document.createElement("span");
  titleEl.className = "sub-panel-title";
  titleEl.textContent = title;

  container.append(back, titleEl);
};
