// Reusable presentational text component, framework-free. Attaches to window.UI.
// Depends on the .text-* CSS classes (text.css). No app state — callers own content.
const uiTextGlobal = typeof window !== 'undefined' ? window : global;
uiTextGlobal.UI = uiTextGlobal.UI || {};

const TEXT_VARIANT_CLASS = {
  eyebrow: "text-eyebrow",
  label: "text-label",
  hint: "text-hint",
  body: "text-body",
};

// Builds a <span> with the shared typography recipe for the given variant and appends it to
// container. variant: "eyebrow" (mono-caps section label) | "label" (form-field label) |
// "hint" (secondary/help text) | "body" (default content text).
uiTextGlobal.UI.text = function text(container, { variant, content = "" } = {}) {
  const className = TEXT_VARIANT_CLASS[variant];
  if (!className) {
    throw new Error(`UI.text: unknown variant "${variant}"`);
  }
  const el = document.createElement("span");
  el.classList.add(className);
  el.textContent = content;
  container.appendChild(el);
  return el;
};
