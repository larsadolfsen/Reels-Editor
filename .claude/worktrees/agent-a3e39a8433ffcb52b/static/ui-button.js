// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .button CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Wires an existing <button> (already in the DOM, incl. its hand-inlined icon SVGs) into the
// shared button component: applies the .button sizing (42px tall) plus one color variant.
// variant: "accent" (solid, e.g. Export) | "outline" (bordered, e.g. Safe Zones) | "icon" (square 42x42, e.g. theme toggle).
window.UI.button = function button(btn, { variant = "outline" } = {}) {
  btn.classList.add("button", `button-${variant}`);
  return btn;
};
