// The one font-size step scale shared by the TEXT and CAPTIONS SIZE controls.
// Pure: exposes window.FontSizeScale.{FONT_SIZE_PRESETS, stepFontSizePreset} in the
// browser and the same object via module.exports for node --test.
(() => {
  const FONT_SIZE_PRESETS = [12, 14, 16, 18, 21, 24, 36, 45, 56, 72, 96];

  // direction: -1 = down, +1 = up. Snaps to the nearest preset in that direction first
  // if currentSize isn't exactly on the scale, then clamps at the ends rather than
  // wrapping — a value past either end steps to that end, never across to the far side.
  function stepFontSizePreset(currentSize, direction) {
    if (direction < 0) {
      const lower = FONT_SIZE_PRESETS.filter((p) => p < currentSize);
      return lower.length ? lower[lower.length - 1] : FONT_SIZE_PRESETS[0];
    }
    const higher = FONT_SIZE_PRESETS.filter((p) => p > currentSize);
    return higher.length ? higher[0] : FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];
  }

  const api = { FONT_SIZE_PRESETS, stepFontSizePreset };
  if (typeof window !== "undefined") window.FontSizeScale = api;
  if (typeof module !== "undefined") module.exports = api;
})();
