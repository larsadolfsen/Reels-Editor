// UI.tooltip(el, {label, shortcut, delay}): wires a hover/focus-triggered custom tooltip on el.
// UI.tooltip.observe(root): auto-rebinds every element with a native `title` attribute under root
// (present now or added/changed later) onto this component instead, so no call site needs editing.
(function () {
  const SHOW_DELAY = 400;
  let tooltipEl = null;
  let showTimer = null;

  function ensureTooltipEl() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "ui-tooltip";
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function position(el, tip) {
    const rect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - tipRect.width - 6));
    let top = rect.top - tipRect.height - 8;
    if (top < 6) top = rect.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function show(el, label, shortcut) {
    const tip = ensureTooltipEl();
    tip.innerHTML = "";
    const labelSpan = document.createElement("span");
    labelSpan.className = "ui-tooltip-label";
    labelSpan.textContent = label;
    tip.appendChild(labelSpan);
    if (shortcut) {
      const kbd = document.createElement("span");
      kbd.className = "ui-tooltip-shortcut";
      kbd.textContent = shortcut;
      tip.appendChild(kbd);
    }
    tip.classList.remove("ui-tooltip-visible");
    position(el, tip);
    requestAnimationFrame(() => {
      position(el, tip);
      tip.classList.add("ui-tooltip-visible");
    });
  }

  function hide() {
    clearTimeout(showTimer);
    if (tooltipEl) tooltipEl.classList.remove("ui-tooltip-visible");
  }

  function tooltip(el, { label, shortcut, delay = SHOW_DELAY } = {}) {
    if (el.dataset.tooltipBound) return;
    el.dataset.tooltipBound = "true";
    const getLabel = () => (typeof label === "function" ? label() : label);
    const getShortcut = () => (typeof shortcut === "function" ? shortcut() : shortcut);
    el.addEventListener("mouseenter", () => {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(el, getLabel(), getShortcut()), delay);
    });
    el.addEventListener("mouseleave", hide);
    el.addEventListener("mousedown", hide);
    el.addEventListener("focus", () => show(el, getLabel(), getShortcut()));
    el.addEventListener("blur", hide);
  }

  function titledElementsIn(node) {
    if (!node.querySelectorAll) return [];
    const descendants = Array.from(node.querySelectorAll("[title]"));
    return node.hasAttribute && node.hasAttribute("title") ? [node, ...descendants] : descendants;
  }

  function autoEnhance(node) {
    titledElementsIn(node).forEach((el) => {
      if (el.dataset.tooltipBound) return;
      const label = el.getAttribute("title");
      if (!label) return;
      const shortcut = el.getAttribute("data-tooltip-shortcut") || "";
      el.removeAttribute("title");
      if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", label);
      tooltip(el, { label, shortcut });
    });
  }

  let observer = null;
  function observe(root) {
    if (observer) return;
    const target = root || document.body;
    autoEnhance(target);
    observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === "attributes") {
          autoEnhance(m.target);
        } else if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) autoEnhance(n);
          });
        }
      });
    });
    observer.observe(target, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["title"],
    });
  }

  window.UI = window.UI || {};
  window.UI.tooltip = tooltip;
  window.UI.tooltip.observe = observe;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => observe(document.body));
  } else {
    observe(document.body);
  }
})();
