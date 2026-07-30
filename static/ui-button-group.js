// Reusable presentational UI helper, framework-free. Attaches to window.UI.
// Depends on the .btn-group CSS component. No app state — callers own data.
window.UI = window.UI || {};

// Renders a row of toggle buttons into `container`; exactly one active at a time.
// options: [{value, label, icon, span}]; icon (optional raw SVG markup string) renders instead of the text
// label, with `label` kept as the button's aria-label so screen readers still get a name.
// span (default 1) applied as .col-{span} to each button; containerSpan (default 8) applied to container.
// onSelect(value) fires on click. Returns a setActive(value) updater.
//
// Renders a sliding `.btn-group-indicator` behind the active button (skipped for
// .btn-group-inline, which has no single track to slide within — see button-group.css)
// positioned in px from the button's own rendered box, so it works for any mix of spans.
window.UI.buttonGroup = function buttonGroup(container, options, activeValue, onSelect, { containerSpan = 8 } = {}) {
  container.innerHTML = "";
  container.classList.add("btn-group", `col-${containerSpan}`);
  const sliding = !container.classList.contains("btn-group-inline");

  let indicator = null;
  if (sliding) {
    indicator = document.createElement("div");
    indicator.className = "btn-group-indicator";
    container.appendChild(indicator);
  }

  function moveIndicator(btn, instant) {
    if (!indicator || !btn) return;
    if (instant) indicator.style.transitionDuration = "0s";
    indicator.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
    indicator.style.width = `${btn.offsetWidth}px`;
    indicator.style.height = `${btn.offsetHeight}px`;
    if (instant) {
      void indicator.offsetHeight;
      indicator.style.transitionDuration = "";
    }
  }

  const buttons = options.map(({ value, label, icon, span = 1 }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `col-${span}`;
    if (icon) {
      btn.innerHTML = icon;
      btn.setAttribute("aria-label", label);
    } else {
      btn.textContent = label;
    }
    btn.dataset.value = value;
    btn.setAttribute("aria-pressed", String(value === activeValue));
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
      moveIndicator(btn);
      onSelect(value);
    });
    container.appendChild(btn);
    return btn;
  });

  moveIndicator(buttons.find((b) => b.dataset.value === activeValue) || buttons[0], true);

  return (value) => {
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value)));
    moveIndicator(buttons.find((b) => b.dataset.value === value));
  };
};
