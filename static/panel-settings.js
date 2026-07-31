// #panel-settings context-panel header wiring. The panel's one control (the dark/light theme
// toggle) is wired inline in editor.js — this file exists only so the header follows the same
// UI.contextPanelHeader pattern every other context panel uses.
UI.contextPanelHeader(document.getElementById("settings-header"), { icon: UI.icon("settings", { size: 18 }), label: "Settings" });
