// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Renders a saved TextPreset as a clickable grey card showing the preset's actual rendered
// styling (font/size/weight/italic/underline/color/outline/shadow) rather than just its name.
// Depends on the .list-row card recipe (UI.listRow) and the .style-preset-card CSS component.
window.UI = window.UI || {};

(() => {
  // Font size/outline/shadow fields on TextPreset are expressed in 1080x1920 canvas px
  // (see preview-text.js) — scale them down to a fixed reference width for the card preview.
  const CARD_PREVIEW_WIDTH = 240;

  function applyPresetPreviewStyle(span, preset) {
    const scale = CARD_PREVIEW_WIDTH / 1080;
    span.textContent = "Sample Text";
    span.style.fontFamily = `"${preset.font}", sans-serif`;
    span.style.fontWeight = String(preset.weight);
    span.style.fontStyle = preset.italic ? "italic" : "normal";
    span.style.textDecoration = preset.underline ? "underline" : "none";
    span.style.color = preset.color;
    span.style.fontSize = Math.max(preset.size_px * scale, 10) + "px";
    const outlinePx = (preset.outline_px || 0) * scale;
    span.style.webkitTextStroke = outlinePx > 0 ? `${outlinePx}px ${preset.outline_color}` : "";
    span.style.textShadow = preset.shadow
      ? `${preset.shadow_offset_x * scale}px ${preset.shadow_offset_y * scale}px ${preset.shadow_blur * scale}px ${preset.shadow_color}`
      : "none";
  }

  // stylePresetCard(preset, {onClick}) -> <li class="style-preset-card list-row">
  window.UI.stylePresetCard = function stylePresetCard(preset, { onClick } = {}) {
    const li = document.createElement("li");
    li.className = "style-preset-card";
    UI.listRow(li);
    if (onClick) li.addEventListener("click", () => onClick(preset));

    const previewEl = document.createElement("span");
    previewEl.className = "style-preset-card-preview";
    applyPresetPreviewStyle(previewEl, preset);
    li.appendChild(previewEl);

    const nameEl = document.createElement("span");
    nameEl.className = "style-preset-card-name";
    nameEl.textContent = preset.name;
    li.appendChild(nameEl);

    return li;
  };
})();
