// Stage caption overlay rendering: paginates project.captions.words via CaptionLayout.paginateWords
// (word-wrap by the caption box's fixed width, line-pagination by its fixed height), finds the
// page active at a given timelineTime, and renders it as one .caption-block div containing one
// .caption-line div per line, each with per-word highlight color per preset.highlight_mode.
// Memoizes the paginated pages per (words, box size, font) so a full re-measure only happens when
// something relevant actually changed — mirrors preview-text.js's fitCache pattern. Case styling
// (preset.text_case): displayed via CSS text-transform, paginated using a measurer wrapped through
// TextCase.apply so line-wrapping matches what CSS actually draws.
// getBoxSizeCanvasPx() reads the caption block's live on-stage rendered size (in 1080x1920 canvas
// px) for the POSITION anchor-grid shortcut. Exposes window.PreviewCaptions.
// {renderCaptions(project, presets, timelineTime), getBoxSizeCanvasPx}.
window.PreviewCaptions = (() => {
  const overlay = document.getElementById("overlay");
  const stage = document.getElementById("stage");
  let paginationCache = null; // { key, pages }

  function hexToRgba(hex, opacityPercent) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`;
  }

  function paginationKey(track, preset) {
    return JSON.stringify([
      track.words.map((w) => [w.id, w.text, w.t_start, w.t_end]),
      preset.box_width, preset.box_height, preset.size_px, preset.font, preset.weight, preset.italic, preset.text_case,
    ]);
  }

  function getPaginatedPages(track, preset) {
    const key = paginationKey(track, preset);
    if (paginationCache && paginationCache.key === key) return paginationCache.pages;
    const rawMeasure = FontFit.canvasMeasurer(preset.font, preset.size_px, { weight: preset.weight, italic: preset.italic });
    const measure = (s) => rawMeasure(TextCase.apply(s, preset.text_case));
    const padX = 0.35 * preset.size_px * 2;
    const padY = 0.15 * preset.size_px * 2;
    const pages = CaptionLayout.paginateWords(track.words, measure,
      Math.max(1, preset.box_width - padX), Math.max(1, preset.box_height - padY), preset.size_px);
    paginationCache = { key, pages };
    return pages;
  }

  function activeCaptionPage(track, preset, timelineTime) {
    const pages = getPaginatedPages(track, preset);
    return pages.find((page) => {
      const words = page.flat();
      return timelineTime >= words[0].t_start && timelineTime < words[words.length - 1].t_end;
    }) || null;
  }

  function renderCaptions(project, presets, timelineTime) {
    overlay.querySelectorAll(".caption-block").forEach((el) => el.remove());
    const track = project.captions;
    if (!track || !track.words.length) return;
    const preset = presets[track.preset_id];
    if (!preset) return;

    const page = activeCaptionPage(track, preset, timelineTime);
    if (!page) return;

    let stageW = overlay.clientWidth || stage.clientWidth;
    let stageH = overlay.clientHeight || stage.clientHeight;
    if ((stageW === 0 || stageH === 0) && stageW !== 0) stageH = stageW * 16 / 9;

    const div = document.createElement("div");
    div.className = `caption-block text-block--align-${preset.align}`;
    div.style.zIndex = String(track.z_index ?? 0);
    div.style.left = (preset.x / 1080 * stageW) + "px";
    div.style.top = (preset.y / 1920 * stageH) + "px";
    div.style.width = (preset.box_width / 1080 * stageW) + "px";
    div.style.height = (preset.box_height / 1920 * stageH) + "px";
    div.style.textAlign = preset.align;
    div.style.textTransform = TextCase.cssValue(preset.text_case);
    div.style.fontFamily = `"${preset.font}", sans-serif`;
    div.style.fontWeight = String(preset.weight);
    div.style.fontStyle = preset.italic ? "italic" : "normal";
    div.style.textDecoration = preset.underline ? "underline" : "none";
    div.style.fontSize = (preset.size_px / 1920 * stageH) + "px";
    div.style.webkitTextStroke = `${preset.outline_px / 1920 * stageH}px ${preset.outline_color}`;
    div.style.padding = "0.15em 0.35em";
    div.style.backgroundColor = preset.box_background ? hexToRgba(preset.box_background_color, preset.box_background_opacity) : "transparent";
    div.style.borderWidth = (preset.box_border_width / 1080 * stageW) + "px";
    div.style.borderStyle = preset.box_border_width > 0 ? "solid" : "none";
    div.style.borderColor = preset.box_border_color;
    div.style.textShadow = preset.shadow
      ? `${preset.shadow_offset_x / 1920 * stageH}px ${preset.shadow_offset_y / 1920 * stageH}px ${preset.shadow_blur / 1920 * stageH}px ${preset.shadow_color}`
      : "none";
    div.style.borderRadius = (preset.box_border_radius / 1080 * stageW) + "px";
    div.style.pointerEvents = "none";

    page.forEach((line) => {
      const lineDiv = document.createElement("div");
      lineDiv.className = "caption-line";
      line.forEach((word, i) => {
        const span = document.createElement("span");
        let isHighlighted;
        if (preset.highlight_mode === "progressive_fill") {
          isHighlighted = timelineTime >= word.t_start;
        } else {
          isHighlighted = timelineTime >= word.t_start && timelineTime < word.t_end;
        }
        span.style.color = isHighlighted ? preset.highlight_color : preset.color;
        span.textContent = word.text + (i < line.length - 1 ? " " : "");
        lineDiv.appendChild(span);
      });
      div.appendChild(lineDiv);
    });

    overlay.appendChild(div);
  }

  function getBoxSizeCanvasPx() {
    const div = overlay.querySelector(".caption-block");
    if (!div) return null;
    const stageW = overlay.clientWidth || stage.clientWidth;
    const stageH = overlay.clientHeight || stage.clientHeight;
    if (!stageW || !stageH) return null;
    return { width: div.offsetWidth / stageW * 1080, height: div.offsetHeight / stageH * 1920 };
  }

  return { renderCaptions, getBoxSizeCanvasPx };
})();
