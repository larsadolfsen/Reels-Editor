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
// An option is always marked active (falls back to the first one if activeValue matches
// none), and a ResizeObserver re-syncs the indicator once the container gets a real size —
// several callers build a group while its panel is still `hidden`, where offsetLeft/Width
// read as 0 and the indicator would otherwise stay collapsed until the user's first click.
window.UI.buttonGroup = function buttonGroup(container, options, activeValue, onSelect, { containerSpan = 8 } = {}) {
  container.innerHTML = "";
  container.classList.add("btn-group", `col-${containerSpan}`);
  const sliding = !container.classList.contains("btn-group-inline");

  let indicator = null;
  let currentActive = null;

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
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      currentActive = btn;
      moveIndicator(btn);
      onSelect(value);
    });
    container.appendChild(btn);
    return btn;
  });

  currentActive = buttons.find((b) => b.dataset.value === activeValue) || buttons[0];
  buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === currentActive)));
  moveIndicator(currentActive, true);

  if (sliding && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => moveIndicator(currentActive, true));
    ro.observe(container);
  }

  return (value) => {
    const btn = buttons.find((b) => b.dataset.value === value) || buttons[0];
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    currentActive = btn;
    moveIndicator(btn);
  };
};
