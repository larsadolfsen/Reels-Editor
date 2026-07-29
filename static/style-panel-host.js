// Generic drill-down subpage manager for the TEXT and CAPTIONS panels: registers a
// subpage against a panel's main view, builds its back-arrow header, and toggles which
// of the two is visible. Replaces the per-control openXPanel/closeXPanel function pairs.
window.StylePanelHost = function StylePanelHost(mainEl, drillEl) {
  const pages = [];

  function closeAll() {
    pages.forEach((p) => { p.el.hidden = true; });
    mainEl.hidden = false;
  }

  function page(title, buildBody, options) {
    const opts = options || {};

    const el = document.createElement("div");
    el.className = "style-sub-panel";
    el.hidden = true;

    const header = document.createElement("div");
    el.appendChild(header);

    const bodyEl = document.createElement("div");
    el.appendChild(bodyEl);

    drillEl.appendChild(el);

    const handle = {
      el,
      bodyEl,
      open() {
        // The body is rebuilt on every open so a subpage always reflects the current
        // preset — the old per-control panels re-ran their list render for the same reason.
        bodyEl.innerHTML = "";
        buildBody(bodyEl);
        pages.forEach((p) => { p.el.hidden = true; });
        mainEl.hidden = true;
        el.hidden = false;
      },
      close() {
        el.hidden = true;
        mainEl.hidden = false;
        if (opts.onClose) opts.onClose();
      },
    };

    UI.subPanelHeader(header, { title, onBack: handle.close });

    pages.push(handle);
    return handle;
  }

  return { page, closeAll };
};
