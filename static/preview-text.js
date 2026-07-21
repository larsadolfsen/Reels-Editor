// Stage text-block overlay rendering + selection state: composites one .text-block div per
// visible text block into #overlay (rich-text runs, box background/border, BOX FILL auto-sizing),
// and owns click-to-edit/drag-to-move/drag-to-select wiring plus the active format-range selection
// consumed by the FONT accordion. Also tracks the per-block UI.textInteraction() handle (keyed by
// block id, cleared/rebuilt each renderText() call) so a newly-created block can be dropped
// straight into on-stage edit mode via enterEditMode(blockId). Exposes window.PreviewText.
// {renderText, setSelectedTextBlock, getActiveFormatSelection, setOnStageTextActivate, enterEditMode}.
window.PreviewText = (() => {
  let textProject = null;
  let textPresets = {};
  let selectedTextBlockId = null;
  let boxResizeCallbacks = null;
  let editingBlockId = null;
  let editingDiv = null;
  let onStageTextActivate = null;
  let activeFormatSelection = null;
  const fitCache = new Map(); // blockId -> { key: string, size: number }
  const interactionHandles = new Map(); // blockId -> UI.textInteraction() return handle
  const overlay = document.getElementById("overlay");
  const stage = document.getElementById("stage");

  function hexToRgba(hex, opacityPercent) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`;
  }

  function fitCacheKey(preset, heading) {
    return JSON.stringify([heading, preset.box_width, preset.box_height, preset.font, preset.weight, preset.italic]);
  }

  function maybeRefitFillText(block, preset) {
    if (preset.box_width_mode !== "fill") return;
    const key = fitCacheKey(preset, block.heading || "");
    const cached = fitCache.get(block.id);
    if (cached && cached.key === key) {
      preset.size_px = cached.size;
      return;
    }
    const measurerFactory = (size) =>
      FontFit.canvasMeasurer(preset.font, size, { weight: preset.weight, italic: preset.italic });
    const { size } = FontFit.fitFontSize(block.heading || "", measurerFactory, preset.box_width, preset.box_height);
    preset.size_px = size;
    fitCache.set(block.id, { key, size });
  }

  function renderText(project, presets, timelineTime) {
    textProject = project;
    textPresets = presets;
    interactionHandles.clear();
    const keepEditingDiv = editingDiv && overlay.contains(editingDiv);
    overlay.querySelectorAll(".text-block").forEach((el) => { if (el !== editingDiv) el.remove(); });
    if (keepEditingDiv) {
      overlay.appendChild(editingDiv); // preserve focus/caret across re-renders while typing
      // Re-appending a node (even the same one) drops browser focus silently — no blur event,
      // contentEditable stays "true", but document.activeElement falls back to <body>. This bites
      // whenever a re-render happens synchronously inside onEditStart itself (e.g. clicking an
      // unselected block also opens the TEXT panel, which re-renders before the click finishes) —
      // without this, the block looks editable but the caret/keyboard focus never actually lands.
      if (document.activeElement !== editingDiv && editingDiv.isContentEditable) {
        editingDiv.focus();
        const range = document.createRange();
        range.selectNodeContents(editingDiv);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    let stageW = overlay.clientWidth || stage.clientWidth;
    let stageH = overlay.clientHeight || stage.clientHeight;
    if ((stageW === 0 || stageH === 0) && stageW !== 0) {
      stageH = stageW * 16 / 9;
    }
    for (const block of (project.text_blocks || [])) {
      const isSelected = block.id === selectedTextBlockId;
      // An empty heading normally means "nothing to show" — but the selected block must still
      // render (even empty) so there's something on the stage to click into and start typing;
      // this is the only way to enter a heading now that the side-panel textarea is gone.
      if (!block.heading && !isSelected) continue;
      if (!(block.start <= timelineTime && timelineTime < block.end)) continue;
      const preset = presets[block.preset_id];
      if (!preset) continue;
      if (keepEditingDiv && block.id === editingBlockId) continue; // already re-attached above, leave untouched

      maybeRefitFillText(block, preset);

      const div = document.createElement("div");
      div.className = `text-block text-block--align-${preset.align}`;
      div.style.zIndex = String(block.z_index ?? 0);
      div.style.left = (preset.x / 1080 * stageW) + "px";
      div.style.top = (preset.y / 1920 * stageH) + "px";
      div.style.textAlign = preset.align;

      const sizePx = preset.size_px / 1920 * stageH;
      div.style.fontSize = sizePx + "px";

      div.style.padding = "0.15em 0.35em";

      div.style.backgroundColor = preset.box_background ? hexToRgba(preset.box_background_color, preset.box_background_opacity) : "transparent";
      div.style.borderWidth = (preset.box_border_width / 1080 * stageW) + "px";
      div.style.borderStyle = preset.box_border_width > 0 ? "solid" : "none";
      div.style.borderColor = preset.box_border_color;
      div.style.borderRadius = (preset.box_border_radius / 1080 * stageW) + "px";

      const widthIsBoxed = preset.box_width_mode === "fixed" || preset.box_width_mode === "fill";
      const heightIsBoxed = preset.box_height_mode === "fixed" || preset.box_height_mode === "fill";
      const boxW = widthIsBoxed ? (preset.box_width / 1080 * stageW) + "px" : "";
      const boxH = heightIsBoxed ? (preset.box_height / 1920 * stageH) + "px" : "";
      div.style.width = boxW;
      div.style.height = boxH;
      div.style.whiteSpace = widthIsBoxed ? "pre-wrap" : "pre";
      div.style.boxSizing = "border-box";

      const runs = (block.formatting_runs && block.formatting_runs.length) ? block.formatting_runs : [];
      const heading = block.heading || "";
      const boundaries = [...new Set([0, heading.length, ...runs.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b);
      div.textContent = "";
      for (let i = 0; i < boundaries.length - 1; i++) {
        const segStart = boundaries[i], segEnd = boundaries[i + 1];
        if (segStart >= segEnd) continue;
        const run = runs.find((r) => r.start <= segStart && segEnd <= r.end);
        const span = document.createElement("span");
        span.className = "text-run";
        span.textContent = heading.slice(segStart, segEnd);
        span.style.color = (run && run.color) || preset.color;
        span.style.fontFamily = `"${(run && run.font) || preset.font}", sans-serif`;
        span.style.fontSize = ((run && run.size_px) || preset.size_px) / 1920 * stageH + "px";
        span.style.fontWeight = String((run && run.weight) || preset.weight);
        span.style.fontStyle = (run && run.italic != null ? run.italic : preset.italic) ? "italic" : "normal";
        span.style.textDecoration = (run && run.underline != null ? run.underline : preset.underline) ? "underline" : "none";
        const runOutlinePx = (run && run.outline_px != null ? run.outline_px : preset.outline_px) / 1920 * stageH;
        span.style.webkitTextStroke = `${runOutlinePx}px ${(run && run.outline_color) || preset.outline_color}`;
        const highlighted = run && run.highlight != null ? run.highlight : preset.highlight;
        span.style.backgroundColor = highlighted ? ((run && run.highlight_color) || preset.highlight_color) : "transparent";
        div.appendChild(span);
      }
      if (!heading) { div.style.minWidth = "40px"; div.style.minHeight = "1em"; } // stay clickable while empty
      overlay.appendChild(div);

      // Always clickable/editable, regardless of which right-panel section is open (not just
      // when this block is the "selected" one) — a stage text block should always show a text
      // cursor and always be one click away from edit mode.
      div.style.pointerEvents = "auto";
      div.style.cursor = "text";
      interactionHandles.set(block.id, UI.textInteraction(div, {
        onEditStart: () => {
          editingBlockId = block.id;
          editingDiv = div;
          // Entering edit mode only happens on a plain (non-drag) click, which collapses any
          // prior text selection — clear the tracked format-range selection so FONT accordion
          // controls fall back to editing the base preset again (matches getActiveFormatSelection's
          // documented "cleared ... or the selection collapses" contract).
          if (activeFormatSelection && activeFormatSelection.blockId === block.id) activeFormatSelection = null;
          // If this block isn't the currently-selected one, ask the caller (editor.js) to
          // switch the right panel to TEXT and fully select it, on this same click.
          if (block.id !== selectedTextBlockId && onStageTextActivate) onStageTextActivate(block.id);
        },
        onInput: (text) => {
          block.heading = text;
          if (boxResizeCallbacks && boxResizeCallbacks.onEdit) boxResizeCallbacks.onEdit(text);
        },
        onEditEnd: (text) => {
          block.heading = text;
          editingBlockId = null;
          editingDiv = null;
          if (boxResizeCallbacks && boxResizeCallbacks.onEditEnd) boxResizeCallbacks.onEditEnd(text);
        },
        onMove: (delta) => { if (boxResizeCallbacks && boxResizeCallbacks.onMove) boxResizeCallbacks.onMove(delta); },
        onMoveEnd: (delta) => { if (boxResizeCallbacks && boxResizeCallbacks.onMoveEnd) boxResizeCallbacks.onMoveEnd(delta); },
        onSelectionChange: (offsets) => {
          activeFormatSelection = { blockId: block.id, start: offsets.start, end: offsets.end };
          if (boxResizeCallbacks && boxResizeCallbacks.onSelectionChange) boxResizeCallbacks.onSelectionChange(activeFormatSelection);
        },
      }));
      if (block.id === selectedTextBlockId && boxResizeCallbacks) {
        UI.resizeHandles(div, {
          getSize: () => ({ width: div.offsetWidth, height: div.offsetHeight }),
          onResize: (size) => boxResizeCallbacks.onResize(size),
          onDragEnd: (size) => boxResizeCallbacks.onDragEnd(size),
        });
      }
    }
  }

  function setOnStageTextActivate(fn) {
    onStageTextActivate = fn || null;
  }

  function setSelectedTextBlock(blockId, callbacks) {
    if (blockId !== selectedTextBlockId) activeFormatSelection = null;
    selectedTextBlockId = blockId;
    boxResizeCallbacks = callbacks || null;
    if (textProject) renderText(textProject, textPresets, Preview.currentTimelineTime());
  }

  function getActiveFormatSelection() {
    return activeFormatSelection;
  }

  function enterEditMode(blockId) {
    const h = interactionHandles.get(blockId);
    if (h) h.enterEditMode();
  }

  return { renderText, setSelectedTextBlock, getActiveFormatSelection, setOnStageTextActivate, enterEditMode };
})();
