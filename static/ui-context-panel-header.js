// UI.contextPanelHeader(container, {icon, label}): every context-panel's title row — a type icon
// beside a label. For static panels the label is fixed (e.g. "Settings"); for file-backed panels
// (VIDEO, VIDEO BOX, IMAGE BOX, AUDIO) it becomes the selected item's file name once one is
// picked. Idempotent, safe to call every render() (or just once, for static panels).
window.UI = window.UI || {};

UI.contextPanelHeader = function contextPanelHeader(container, { icon, label }) {
  let iconEl = container.querySelector(".context-panel-header-icon");
  let labelEl = container.querySelector(".context-panel-header-label");
  if (!iconEl) {
    iconEl = document.createElement("span");
    iconEl.className = "context-panel-header-icon";
    labelEl = document.createElement("span");
    labelEl.className = "context-panel-header-label";
    container.append(iconEl, labelEl);
  }
  iconEl.innerHTML = icon;
  labelEl.textContent = label;
};
