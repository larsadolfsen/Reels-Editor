// Stage caption overlay rendering: groups project.captions.words via Timeline.groupWords
// (max_words_per_line), finds the group active at a given timelineTime, and renders it as one
// .caption-block div with per-word highlight color per preset.highlight_mode. Stateless.
// getBoxSizeCanvasPx() reads the caption block's live on-stage rendered size (in 1080x1920 canvas
// px) for the POSITION anchor-grid shortcut. Exposes window.PreviewCaptions.
// {renderCaptions(project, presets, timelineTime), getBoxSizeCanvasPx}.
window.PreviewCaptions = (() => {
  const overlay = document.getElementById("overlay");
  const stage = document.getElementById("stage");

  function hexToRgba(hex, opacityPercent) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`;
  }

  function activeCaptionGroup(words, maxWords, timelineTime) {
    const groups = Timeline.groupWords(words, maxWords);
    return groups.find((g) => timelineTime >= g[0].t_start && timelineTime < g[g.length - 1].t_end) || null;
  }

  function renderCaptions(project, presets, timelineTime) {
    overlay.querySelectorAll(".caption-block").forEach((el) => el.remove());
    const track = project.captions;
    if (!track || !track.words.length) return;
    const preset = presets[track.preset_id];
    if (!preset) return;

    const group = activeCaptionGroup(track.words, preset.max_words_per_line, timelineTime);
    if (!group) return;

    let stageW = overlay.clientWidth || stage.clientWidth;
    let stageH = overlay.clientHeight || stage.clientHeight;
    if ((stageW === 0 || stageH === 0) && stageW !== 0) stageH = stageW * 16 / 9;

    const div = document.createElement("div");
    div.className = `caption-block text-block--align-${preset.align}`;
    div.style.zIndex = String(track.z_index ?? 0);
    div.style.left = (preset.x / 1080 * stageW) + "px";
    div.style.top = (preset.y / 1920 * stageH) + "px";
    div.style.textAlign = preset.align;
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

    group.forEach((word, i) => {
      const span = document.createElement("span");
      let isHighlighted;
      if (preset.highlight_mode === "progressive_fill") {
        isHighlighted = timelineTime >= word.t_start;
      } else {
        isHighlighted = timelineTime >= word.t_start && timelineTime < word.t_end;
      }
      span.style.color = isHighlighted ? preset.highlight_color : preset.color;
      span.textContent = word.text + (i < group.length - 1 ? " " : "");
      div.appendChild(span);
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
