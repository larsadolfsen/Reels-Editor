// Shared value formatter for UI.settingsRow rows whose effect can be switched off
// (Outline, Shadow, Highlight, Background, Border). Single definition of the "None" label.
window.SettingsRowValue = {
  orNone(isOn, text) { return isOn ? text : "None"; },
};
