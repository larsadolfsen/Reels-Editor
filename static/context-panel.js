// Right-side contextual panel: renders the selected timeline block's editable fields.
// Exposes window.ContextPanel.{show, hide}. Depends on DOM id #context-panel from index.html.
window.ContextPanel = (() => {
  const panel = document.getElementById("context-panel");

  function clear() {
    panel.innerHTML = "";
  }

  function heading(text) {
    const h = document.createElement("h3");
    h.textContent = text;
    panel.appendChild(h);
  }

  function textField(labelText, value, onCommit) {
    const label = document.createElement("label");
    label.textContent = labelText;
    panel.appendChild(label);
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.addEventListener("change", () => onCommit(input.value));
    panel.appendChild(input);
    return input;
  }

  function showVideo(clip, clipDuration, onChange) {
    heading("VIDEO CLIP");
    const path = document.createElement("div");
    path.className = "readonly-text";
    path.textContent = clip.file_path;
    panel.appendChild(path);

    const row = document.createElement("div");
    row.className = "field-row";
    panel.appendChild(row);

    const inWrap = document.createElement("div");
    const outWrap = document.createElement("div");
    row.appendChild(inWrap);
    row.appendChild(outWrap);

    const dur = clipDuration;
    const inInput = document.createElement("input");
    inInput.type = "number"; inInput.step = "0.1"; inInput.value = clip.in_point.toFixed(1);
    const outInput = document.createElement("input");
    outInput.type = "number"; outInput.step = "0.1"; outInput.value = clip.out_point.toFixed(1);

    const inLabel = document.createElement("label"); inLabel.textContent = "IN"; inWrap.appendChild(inLabel);
    inWrap.appendChild(inInput);
    const outLabel = document.createElement("label"); outLabel.textContent = "OUT"; outWrap.appendChild(outLabel);
    outWrap.appendChild(outInput);

    function apply() {
      const t = clampTrim(parseFloat(inInput.value), parseFloat(outInput.value), dur);
      clip.in_point = t.in_point; clip.out_point = t.out_point;
      inInput.value = t.in_point.toFixed(1); outInput.value = t.out_point.toFixed(1);
      onChange();
    }
    inInput.addEventListener("change", apply);
    outInput.addEventListener("change", apply);

    const setIn = document.createElement("button");
    setIn.textContent = "Set in from playhead";
    setIn.addEventListener("click", () => { inInput.value = player.currentTime.toFixed(1); apply(); });
    const setOut = document.createElement("button");
    setOut.textContent = "Set out from playhead";
    setOut.addEventListener("click", () => { outInput.value = player.currentTime.toFixed(1); apply(); });
    panel.appendChild(setIn);
    panel.appendChild(setOut);
  }

  function showText(block, onChange) {
    heading("TEXT BLOCK");
    textField("HEADING", block.heading, (v) => { block.heading = v; onChange(); });
    textField("SUBHEADING", block.subheading || "", (v) => { block.subheading = v; onChange(); });
    const row = document.createElement("div");
    row.className = "field-row";
    panel.appendChild(row);
    const startWrap = document.createElement("div"); row.appendChild(startWrap);
    const endWrap = document.createElement("div"); row.appendChild(endWrap);
    const startLabel = document.createElement("label"); startLabel.textContent = "START"; startWrap.appendChild(startLabel);
    const startInput = document.createElement("input");
    startInput.type = "number"; startInput.step = "0.1"; startInput.value = block.start.toFixed(1);
    startInput.addEventListener("change", () => { block.start = parseFloat(startInput.value); onChange(); });
    startWrap.appendChild(startInput);
    const endLabel = document.createElement("label"); endLabel.textContent = "END"; endWrap.appendChild(endLabel);
    const endInput = document.createElement("input");
    endInput.type = "number"; endInput.step = "0.1"; endInput.value = block.end.toFixed(1);
    endInput.addEventListener("change", () => { block.end = parseFloat(endInput.value); onChange(); });
    endWrap.appendChild(endInput);
  }

  function showCaption(group) {
    heading(`CAPTION · ${group[0].t_start.toFixed(1)}–${group[group.length - 1].t_end.toFixed(1)}`);
    const text = document.createElement("div");
    text.className = "readonly-text";
    text.textContent = group.map((w) => w.text).join(" ");
    panel.appendChild(text);
    const note = document.createElement("div");
    note.className = "readonly-text";
    note.style.marginTop = "8px";
    note.textContent = "Word-level editing and re-transcription land in a later task.";
    panel.appendChild(note);
  }

  function show(selection, { onChange }) {
    clear();
    panel.hidden = false;
    if (selection.type === "video") {
      showVideo(selection.item, selection.clipDuration, onChange);
    } else if (selection.type === "text") {
      showText(selection.item, onChange);
    } else if (selection.type === "caption") {
      showCaption(selection.item);
    }
  }

  function hide() {
    panel.hidden = true;
    clear();
  }

  return { show, hide };
})();
