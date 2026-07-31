// Shared Box-tab SIZE + POSITION fields for the video-box and image-box panels (picture-in-
// picture layers) — WIDTH/HEIGHT (aspect-ratio-locked) + X/Y number fields, extracted from
// panel-video-box.js/panel-image-box.js where this markup+logic was duplicated verbatim. Also
// hosts SIZE's two one-shot action icons: Maximize (scales the box up to the largest size that
// fits the 1080x1920 canvas at its current aspect ratio, centered) and Minimize (shrinks the box
// to the source media's native pixel size, scaled down to fit the canvas if larger — never
// scaled up). Neither is a persistent mode; each just writes a new width/height/x/y once.
//
// window.BoxSizePositionPanel.render(container, box, {onChange, getNaturalSize}) rebuilds
// `container` fresh each call — callers invoke it once per box selection, not per keystroke.
// Each field's own onChange handler mutates `box` in place and calls `onChange()` (expected to
// save + re-render the stage preview/timeline only) — it must never itself rebuild this
// component, or the input being typed into is torn down and recreated mid-keystroke, kicking
// the user out of the field. When WIDTH/HEIGHT's aspect lock updates the other dimension, this
// component refreshes that field's own displayed value directly via its captured setter
// (no rebuild needed). `getNaturalSize()` is an async () => {w, h} probe of the source media's
// native pixel size, supplied by the caller since video vs. image probing differs.
window.BoxSizePositionPanel = window.BoxSizePositionPanel || {};

window.BoxSizePositionPanel.render = function render(container, box, { onChange, getNaturalSize }) {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;

  container.innerHTML = "";

  function styleRow(children) {
    const group = document.createElement("div");
    group.className = "style-group";
    const row = document.createElement("div");
    row.className = "style-row";
    children.forEach((c) => row.appendChild(c));
    group.appendChild(row);
    container.appendChild(group);
    return row;
  }

  // Locks aspect ratio to the box's own current width/height: whichever dimension actually
  // changed drives, the other is derived — so both corner drags (width changes) and the rare
  // pure vertical-edge drag (height changes) each still work under a strict lock.
  function applyAspectLock(size) {
    const ratio = box.width / box.height;
    if (size.width !== box.width) {
      return { width: size.width, height: Math.round(size.width / ratio) };
    }
    return { width: Math.round(size.height * ratio), height: size.height };
  }

  // ---- SIZE heading + Maximize/Minimize one-shot actions ---------------------------------
  const sizeLabelEl = document.createElement("div");
  sizeLabelEl.className = "col-6";
  UI.text(sizeLabelEl, { variant: "eyebrow", content: "SIZE" });
  const sizeHeaderRow = styleRow([sizeLabelEl]);

  const minimizeBtn = UI.button(sizeHeaderRow, {
    icon: "minimize", size: "sm", intent: "neutral",
    onClick: async () => {
      const native = await getNaturalSize();
      const scale = Math.min(1, CANVAS_W / native.w, CANVAS_H / native.h);
      box.width = Math.max(1, Math.round(native.w * scale));
      box.height = Math.max(1, Math.round(native.h * scale));
      setWidth(box.width);
      setHeight(box.height);
      onChange();
    },
  });
  minimizeBtn.classList.add("col-1");
  minimizeBtn.title = "Fit to content";

  const maximizeBtn = UI.button(sizeHeaderRow, {
    icon: "maximize", size: "sm", intent: "neutral",
    onClick: () => {
      const ratio = box.width / box.height;
      if (CANVAS_W / ratio <= CANVAS_H) {
        box.width = CANVAS_W;
        box.height = Math.round(CANVAS_W / ratio);
      } else {
        box.height = CANVAS_H;
        box.width = Math.round(CANVAS_H * ratio);
      }
      box.x = Math.round((CANVAS_W - box.width) / 2);
      box.y = Math.round((CANVAS_H - box.height) / 2);
      setWidth(box.width);
      setHeight(box.height);
      setX(box.x);
      setY(box.y);
      onChange();
    },
  });
  maximizeBtn.classList.add("col-1");
  maximizeBtn.title = "Fill canvas";

  const widthEl = document.createElement("label");
  const heightEl = document.createElement("label");
  styleRow([widthEl, heightEl]);

  // ---- POSITION heading -------------------------------------------------------------------
  const posLabelEl = document.createElement("div");
  posLabelEl.className = "section-label-spacer";
  UI.text(posLabelEl, { variant: "eyebrow", content: "POSITION" });
  container.appendChild(posLabelEl);

  const xEl = document.createElement("label");
  const yEl = document.createElement("label");
  styleRow([xEl, yEl]);

  const setWidth = UI.numberField(widthEl,
    { label: "WIDTH", unit: "PX", value: box.width, min: 1, max: CANVAS_W, span: 4,
      onChange: (v) => {
        Object.assign(box, applyAspectLock({ width: v, height: box.height }));
        setHeight(box.height);
        onChange();
      } });
  const setHeight = UI.numberField(heightEl,
    { label: "HEIGHT", unit: "PX", value: box.height, min: 1, max: CANVAS_H, span: 4,
      onChange: (v) => {
        Object.assign(box, applyAspectLock({ width: box.width, height: v }));
        setWidth(box.width);
        onChange();
      } });
  const setX = UI.numberField(xEl,
    { label: "X", unit: "PX", value: box.x, min: 0, max: CANVAS_W, span: 4,
      onChange: (v) => { box.x = v; onChange(); } });
  const setY = UI.numberField(yEl,
    { label: "Y", unit: "PX", value: box.y, min: 0, max: CANVAS_H, span: 4,
      onChange: (v) => { box.y = v; onChange(); } });
};
