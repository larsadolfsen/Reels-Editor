# Font-Weight Picker — Design

## Task list

- [ ] `app/font_metrics.py`: weight-availability registry (reads generated static font files) + `pil_font_measurer` gains a `weight` param
- [ ] One-off script `scripts/generate_font_weights.py`: instances static per-weight files from the vendored variable fonts via `fontTools.varLib.instancer`, renamed to distinct family names; run once now, output committed to `static/fonts/`
- [ ] `app/models.py`: `TextPreset.bold: bool` → `TextPreset.weight: int = 400`, with a migration for old saved projects
- [ ] New route `GET /api/fonts/{name}/weights` in `app/main.py`
- [ ] `app/ass_render.py`: weight-aware `Fontname` in `_style()`, `Bold` column unconditionally `0`
- [ ] `app/ffmpeg_cmd.py`: add `fontsdir=static/fonts` to the `ass` filter
- [ ] Frontend: Weight `UI.settingsRow` + drill-down in the FONT accordion (mirrors Font Family), replacing the Bold icon-button
- [ ] `preview.js`: `font-weight` CSS reads `preset.weight` directly
- [ ] Snap-to-nearest-available-weight when the font changes
- [ ] Tests: `test_models.py` (default/migration), `test_ass_render.py` (Fontname/Bold column), `test_ffmpeg_cmd.py` (fontsdir)
- [ ] `CLAUDE.md` inventory update

## Background

`TextPreset.bold: bool` today drives a plain Bold icon-button toggle (alongside Italic/Underline). The backlog wants this replaced with a real weight picker — 400 Regular / 500 Medium / 600 SemiBold / 700 Bold — offering only the weights the current font actually supports (some vendored fonts don't have every named instance; see below).

The wrinkle: ASS/SSA (the subtitle format burned into exports via libass) has no numeric font-weight concept — its `Style` line's `Bold` column is a plain boolean, and libass selects fonts purely by family-name lookup. There's no way to ask libass to render "weight 500" the way a browser can interpolate a variable font via CSS. The live preview (a `<div>` styled with CSS) already handles this correctly today with zero extra work — browsers apply `font-weight: 500` to a variable font natively. Export is the side that needs new infrastructure.

Investigated the two vendored variable fonts directly (`fontTools`, `fvar` table):

| Font | Axis range | Named instances |
|---|---|---|
| Public Sans | wght 100–900 | Thin(100), ExtraLight(200), Light(300), Regular(400), Medium(500), SemiBold(600), Bold(700), ExtraBold(800), Black(900) |
| JetBrains Mono | wght 400–800 | Regular(400), Medium(500), Bold(700), ExtraBold(800) — **no SemiBold(600)** |

So "hide 600 for a font that doesn't have SemiBold" is a real, present-day case (JetBrains Mono), not a hypothetical.

**Real, pre-existing bug found while investigating this** (2026-07-19): `app/ffmpeg_cmd.py` passes no `fontsdir` to the `ass` filter today, so on this Windows dev machine libass falls back to its `directwrite` (with GDI) font provider — not fontconfig, despite ffmpeg being built with fontconfig support. Since "Public Sans"/"JetBrains Mono" aren't installed as real Windows system fonts, DirectWrite silently substitutes the nearest system font it can find with zero warning or error — confirmed via a real `ffmpeg`+`ass` filter run, whose stderr showed:
```
fontselect: (Public Sans, 400, 0) -> ArialMT, 0, ArialMT
fontselect: (Public Sans, 700, 0) -> Arial-BoldMT, 0, Arial-BoldMT
```
**Every export today silently renders in Arial, not the vendored fonts at all** — Bold only "works" today because Arial (the silent substitute) happens to ship a genuine separate Bold face already. This is unrelated to the weight-picker ask but was invisible until this investigation; the `fontsdir` fix this spec already calls for happens to fix it as a side effect.

**Empirically validated the `fontsdir` + static-instancing approach works on this exact environment** before committing to it: generated a real static instance at weight 400 via `fontTools.varLib.instancer.instantiateVariableFont`, renamed its family to plain "Public Sans", pointed `fontsdir` at the containing folder, and reran the same export — libass correctly found and used it (`fontselect: (Public Sans, 400, 0) -> PublicSans-Regular, 0, PublicSans-Regular`), confirming DirectWrite's font provider does respect `fontsdir` for exact family-name matches (the first attempt at this failed for an unrelated reason — using the raw variable font file un-instanced picks up its *default* named instance, which for Public Sans is axis-default 100/"Thin", not "Regular" — a naming mismatch, not a provider limitation).

## Goals

- A "Weight" settings row (mirroring the existing Font Family row/drill-down pattern exactly) replaces the Bold toggle, listing only 400/500/600/700 the current font actually has a named instance for.
- The exported video visually matches the live preview's chosen weight — real fidelity, not an approximation collapsed to bold/not-bold.
- Adding a new vendored font later requires running the generation script and adding it to `AVAILABLE_FONTS` — no other code changes, since weight availability is read from the generated files at request time rather than hand-maintained in two places.

## Non-goals

- Arbitrary/continuous weight values (e.g. a slider) — only the four standard named weights, matching the backlog's stated scope.
- Any change to Italic/Underline handling.
- Making `AVAILABLE_FONTS` itself dynamic (still a hardcoded JS array) — out of scope for this item.

## Data model

`app/models.py`, `TextPreset`:

```python
weight: int = 400   # 400 | 500 | 600 | 700 — replaces `bold: bool`
```

**Migration** (same `model_validator(mode="before")` pattern already used for `box`→`box_background`): if a loaded preset has `bold` but not `weight`, set `weight = 700 if bold else 400`.

## Font asset generation

`scripts/generate_font_weights.py` (new, one-off/dev script, not part of the request-serving app):

- For each `(font_name, path)` in `font_metrics._FONT_PATHS`, load the variable font with `fontTools`, read its `fvar` instances.
- For each of the four standard weights `{400, 500, 600, 700}` present as a named instance, use `fontTools.varLib.instancer.instantiateVariableFont` to produce a static instance, rename the `name` table's family/subfamily so it has a distinct, unique family name (e.g. `"Public Sans Medium"`), and save as a plain `.ttf` (not `.woff2`) to `static/fonts/{FontName}-{WeightLabel}.ttf` — `.ttf` avoids the same decompress-to-sfnt workaround `pil_font_measurer` already needs for the vendored `.woff2` originals, and sidesteps any uncertainty about whether the installed libass/ffmpeg build handles woff2 directly.
- Weight 400 still gets its own generated "Regular" file (rather than special-casing the original variable file) so all four weights are handled uniformly by the rest of the pipeline.
- Run once now for the two current fonts; re-run whenever a new font is vendored.

## Backend

`app/font_metrics.py`:
- A hardcoded `{font_name: [400, 500, ...]}` registry, colocated with `_FONT_PATHS` (same pattern — both are updated together whenever a font is added, so there's no new drift risk versus today), exposing `available_weights(font_name) -> list[int]`.
- `pil_font_measurer(font_name, size_px, weight=400)`: loads the weight-specific static file instead of always the base variable file, so word-wrap measures the actual selected weight (heavier weights are wider).

`app/main.py`: new route `GET /api/fonts/{name}/weights` → `[{"value": 400, "label": "Regular"}, ...]`, backed by `font_metrics.available_weights()`.

`app/ass_render.py`, `_style()`:
- `Fontname` becomes `f"{p.font} {WEIGHT_LABELS[p.weight]}"` (a small `{400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}` label map, colocated wherever makes sense — `font_metrics.py` or `ass_render.py` itself).
- The `Bold` style column becomes unconditionally `0` — bold-ness now lives entirely in which font face is selected, not in ASS's synthetic-bold flag (setting both would double-bold a 700-weight face).

`app/ffmpeg_cmd.py`, `build_export_cmd`: append `:fontsdir={escape_filter_path("static/fonts")}` to the `ass` filter string, so libass resolves these exact family names from our generated files rather than depending on system-installed fonts (incidentally hardens today's export, which currently has no explicit fontsdir at all).

## Frontend

- New `static/text-panel-font-weight.js` (this project's convention is one component per file — a new file, not an addition to `text-panel-font-style.js`), following the exact Font Family pattern: `UI.settingsRow` showing the current weight's label, opening a drill-down (`UI.subPanelHeader`) that lists only the weights `GET /api/fonts/{font}/weights` returns for the currently-selected font, checkmark + pinned-to-top for the current selection, click-to-apply (no hover-preview needed — keep it simple, matching the Style-preset list's click-only pattern rather than Font Family's hover-to-preview).
- Remove the `#text-bold` icon-button; Italic/Underline stay as their own row.
- If the font changes (via the Font Family drill-down) and the current `weight` isn't in the new font's available list, snap to the nearest available weight by absolute numeric distance (same "snap to nearest" precedent as the font-size step buttons).
- `static/preview.js`: `div.style.fontWeight = preset.bold ? "700" : "400";` → `div.style.fontWeight = String(preset.weight);`.

## Testing

- `tests/test_models.py`: `weight` defaults to 400; a saved preset with legacy `bold: true`/`false` migrates to `weight: 700`/`400`.
- `tests/test_ass_render.py`: `Fontname` includes the weight suffix for a non-400 weight; the `Bold` column is always `0` regardless of `weight`.
- `tests/test_ffmpeg_cmd.py`: `fontsdir=` appears in the `ass` filter when `ass_path` is given.
- The generation script itself isn't part of the pytest suite (it's a one-off asset-producing dev tool, like the vendored fonts themselves aren't) — verify its output manually (load each generated file with `fontTools`/Pillow, confirm the family name and weight) when it's written.
