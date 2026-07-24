// Pure text-case helpers for TextPreset.text_case ("none" | "upper" | "lower"): apply() transforms
// a string for measurement paths; cssValue() maps to a CSS text-transform value for display paths.
// Missing/unknown values behave as "none". Consumed by preview-text.js and preview-captions.js.
window.TextCase = {
  apply(text, textCase) {
    if (textCase === "upper") return text.toUpperCase();
    if (textCase === "lower") return text.toLowerCase();
    return text;
  },
  cssValue(textCase) {
    if (textCase === "upper") return "uppercase";
    if (textCase === "lower") return "lowercase";
    return "none";
  },
};
