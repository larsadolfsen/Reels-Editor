// #panel-export context-panel section: FILENAME (text input) + QUALITY (HIGH/MEDIUM button
// group) rows above the existing export button. Exposes window.ExportPanel.render(). Mutates
// project.export_filename/export_quality and calls saveProject() (both globals from editor.js).
window.ExportPanel = window.ExportPanel || {};

(() => {
  function defaultFilename() {
    return `${project.name}-${project.id.slice(0, 8)}`;
  }

  function renderFilenameField() {
    const container = document.getElementById("export-filename-field");
    container.innerHTML = "";
    container.classList.add("style-field", "col-8");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = defaultFilename();
    input.value = project.export_filename || "";
    input.addEventListener("input", async () => {
      project.export_filename = input.value;
      await saveProject();
    });

    container.appendChild(input);
  }

  function renderQualityField() {
    UI.buttonGroup(document.getElementById("export-quality-group"), [
      { value: "high", label: "HIGH", span: 4 },
      { value: "medium", label: "MEDIUM", span: 4 },
    ], project.export_quality || "high", async (value) => {
      project.export_quality = value;
      await saveProject();
    });
  }

  function render() {
    renderFilenameField();
    renderQualityField();
  }

  window.ExportPanel.render = render;
})();
