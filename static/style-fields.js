// The saved-style field list: everything a TextPreset holds except identity (id/name)
// and usage stats. Pure: exposes window.StyleFields.{STYLE_FIELD_NAMES, styleFieldsOf}
// in the browser and the same object via module.exports for node --test.
(() => {
  // One list, used by both the TEXT and CAPTIONS Style tabs. Position (x/y) is included,
  // matching the pre-existing behaviour of saved styles carrying a position.
  const STYLE_FIELD_NAMES = [
    "font", "size_px", "color", "outline_color", "outline_px", "weight", "italic",
    "underline", "text_case",
    "box_width_mode", "box_height_mode", "box_width", "box_height",
    "box_background", "box_background_color",
    "box_border_width", "box_border_color", "box_border_radius",
    "align", "entrance",
    "shadow", "shadow_color", "shadow_offset_x", "shadow_offset_y", "shadow_blur",
    "highlight", "highlight_color", "highlight_mode", "highlight_border_radius",
    "x", "y",
  ];

  function styleFieldsOf(preset) {
    const out = {};
    STYLE_FIELD_NAMES.forEach((name) => { out[name] = preset[name]; });
    return out;
  }

  const api = { STYLE_FIELD_NAMES, styleFieldsOf };
  if (typeof window !== "undefined") window.StyleFields = api;
  if (typeof module !== "undefined") module.exports = api;
})();
