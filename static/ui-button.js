// Reusable button component, framework-free. Attaches to window.UI (and window.buttonClasses
// for testing). Depends on the .button CSS component (button.css) and UI.icon for icon buttons.
// Builds the whole <button> — callers no longer hand-write markup and stamp a variant onto it.
const uiButtonGlobal = typeof window !== "undefined" ? window : global;
uiButtonGlobal.UI = uiButtonGlobal.UI || {};

// Pure: computes the class list for a button's current size/intent/pressed/disabled state.
// Exported on window so tests can call it without going through full DOM button creation.
uiButtonGlobal.buttonClasses = function buttonClasses({ size = "md", intent = "neutral", pressed = false, disabled = false } = {}) {
  const classes = ["button", `button-${size}`, `button-${intent}`];
  if (pressed) classes.push("button-pressed");
  if (disabled) classes.push("button-disabled");
  return classes;
};

// size: "sm" (28px square, icon-only) | "md" (33px, full-width, label + optional leading icon).
// intent: "neutral" | "accent" (the app's one primary action, e.g. Export) | "danger" | "dashed".
uiButtonGlobal.UI.button = function button(container, {
  label = "",
  icon,
  size = "md",
  intent = "neutral",
  pressed = false,
  disabled = false,
  onClick,
} = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add(...uiButtonGlobal.buttonClasses({ size, intent, pressed, disabled }));
  btn.disabled = disabled;
  if (pressed) btn.setAttribute("aria-pressed", "true");
  if (icon) {
    btn.innerHTML = uiButtonGlobal.UI.icon(icon, { size: size === "sm" ? 14 : 16 });
  }
  if (label) {
    const span = document.createElement("span");
    span.textContent = label;
    btn.appendChild(span);
  }
  if (onClick) btn.addEventListener("click", onClick);
  container.appendChild(btn);
  return btn;
};
