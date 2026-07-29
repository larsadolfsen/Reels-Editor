# UI component consistency — design

**Date:** 2026-07-29
**Status:** approved (architecture); per-component detail settled at the start of each task

## Problem

The frontend has grown three parallel button idioms, no icon component at all, and no
typography tokens. New UI gets built by pasting whichever nearby markup looks closest,
so every addition deepens the inconsistency.

Audited state:

**Icons — 95 hand-inlined SVGs, no component.** 27 in `static/index.html`, 68 across 21
`static/*.js` files. The same icon is re-pasted rather than reused:

| Icon | Pasted in |
| --- | --- |
| trash | `panel-media.js`, `caption-panel-filler-words.js`, `ui-project-list-row.js`, `ui-style-preset-card.js` |
| pencil | `panel-media.js`, `panel-captions.js`, `panel-text.js`, `panel-video.js` |
| volume | `index.html` ×4 (VIDEO panel ×2, AUDIO panel ×2) |
| box corners | `panel-video-box.js`, `panel-image-box.js` |
| position anchors | `text-panel-position.js`, `caption-panel-box.js` |
| case/bold | `text-panel-case.js`, `caption-panel-case.js` |
| wand / sparkles | `panel-captions.js`, `panel-text.js`, `index.html` ×2 |

**Buttons — three competing components plus one-offs.** Different heights, fonts and
radii, with no functional reason for the difference:

| Component | Height | Font | Radius | Sites |
| --- | --- | --- | --- | --- |
| `.button` (`ui-button.js`) | 42px | 11.5px | `4px` | 2 (`editor.js:151`, `:152`) |
| `.panel-button*` | 33px | 11px | `var(--radius)` = 0px | ~20 in `index.html` + 3 JS-created |
| `.icon-btn` | 28×28 | 12px | `4px` | ~20+ |

One-offs outside all three: `.row-add-btn`, `.zoom-btn`, `.number-field-step`. The
pressed-state recipe is duplicated across `.icon-btn[aria-pressed]` and
`.btn-group button[aria-pressed]`, with a hardcoded `rgba(108, 135, 163, 0.12)` that is
really `--accent` at 12%. The icon-only row-action buttons in `panel-media.js`,
`ui-project-list-row.js`, `ui-style-preset-card.js` and `caption-panel-filler-words.js`
are four hand-rolled `createElement` copies of each other.

**Typography — no tokens.** 51 hardcoded `font-size` literals across 21 stylesheets, 13
distinct values (8, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 16, 20px). This directly
violates the project's own rule that every recurring CSS value becomes a token.

**The "eyebrow label" recipe is independently reinvented six times.** `font-family:
var(--font-ui); font-size: 10.5px; letter-spacing: 0.06em;` (color alternating
`--text-dim`/`--text-muted`) appears, each as its own hand-rolled class, in:
`.style-group-label` (style-panel.css), `.style-panel-header` (style-panel.css),
`.clip-section-label` (style-panel.css), `.sub-panel-title` (sub-panel.css),
`.settings-row-label` (settings-row.css), and `.accordion-header` (accordion.css, same
font/size/spacing, different height/margin). `.safe-zone span` (safe-zones.css) is a
seventh, structurally different, copy of the same size/spacing values applied to a chip.

**No radius scale — 7 different hardcoded values with no logic.** `--radius` exists but is
`0px` and is consumed by almost nothing. Actual corners in use: `2px` (resize-handle,
clip-name-input), `3px` (timeline-block, clip-thumb, list-row, export-progress, safe-zone
chip, auto-slice-badge), `4px` (btn-group button, icon-btn, settings-row-swatch — hardcoded,
ignoring `--radius`), `6px` (color-swatch, number-field-stepper, style-field input,
caption-preview-box), and an 8px/pill shape (`.clip-usage-chip`).

**Chip/badge styling implemented three separate times.** `.clip-usage-chip` (pill shape,
`--bg-1` + `--border-soft`), `.auto-slice-badge` (rectangular, color-coded modifiers), and
the safe-zone label chip (rectangular, `--surface` + `--border` + drop shadow) are three
independent "small labeled chip" components with no shared base class.

**A hardcoded accent-tint color drifts across three files.** `rgba(108, 135, 163, 0.12)`
(≈`--accent` at 12%) is repeated verbatim for the "pressed/active" background in
`button-group.css`'s `.btn-group button[aria-pressed]` and `.icon-btn[aria-pressed]`, and
again in `icon-rail.css`'s `.icon-rail-btn[aria-pressed]`; `timeline.css`'s
`.timeline-block.selected` uses the same RGB at a drifted `0.16`.

**A "floating chip" shadow is copy-pasted three times.** `box-shadow: 0 4px 10px
rgba(0,0,0,0.4)` appears verbatim in `timeline.css`'s `.slice-btn` and
`.timeline-block.dragging`; `safe-zones.css`'s `.safe-zone span` uses the same purpose
(opaque chip floating over arbitrary video content) at a drifted `0 2px 8px rgba(0,0,0,0.45)`.

**A 320px scrollable-list recipe is copy-pasted three times**, once per panel that happens
to need a scrolling list: `video-box-panel.css`'s `#video-box-picker-list`,
`image-box-panel.css`'s `#image-box-picker-list`, and `auto-slice-panel.css`'s
`.auto-slice-list` all set `max-height: 320px; overflow-y: auto;` identically — the same
VIDEO BOX / IMAGE BOX mirrored-panel duplication the codebase map already calls out
elsewhere, here leaking into CSS.

**Safe zones — two hand-synced sources of truth.** The zone percentages live in
`static/css/components/safe-zones.css` (6% / 15% / 73% / 7%) and again as pixels in
`static/safe-zone-geometry.js` (115.2 / 162 / 1401.6 / 1785.6), whose header comment
admits they are "kept in sync by hand — no build step generates one from the other". The
four bands are also four near-identical hand-written `<div>` blocks in `index.html`.

**Checked and found legitimately distinct (not flagged for consolidation):** `list-row.css`
(already the correct centralized pattern — PROJECTS/FILES/auto-slice/style-preset-card
already share it properly); `tab-bar.css` / `icon-rail.css` / `button-group.css` (underline-tab
vs. vertical-nav vs. toggle-pill are different enough interaction idioms to justify separate
files); `resize-handles.css`, `mask-line-guide.css`, `login.css`, `save-indicator.css`,
`stage.css`'s `#stage` depth shadow (`0 20px 60px rgba(0,0,0,0.5)`, a different purpose from
the chip shadows above). Transition durations (only two instances, 0.15s/0.2s) are too few
to warrant a token yet — noted, not acted on.

**Two bugs found during the audit:**

1. `--danger` is defined only inside `:root[data-theme="light"]` ([tokens.css:57](../../../static/css/tokens.css)),
   not in the base `:root`. In dark mode — the default — every `var(--danger)` reference
   resolves to nothing, so delete buttons, the save-failure label and the transcribe error
   all silently lose their red.
2. `--radius` is `0px`, but `button.css` and `button-group.css` hardcode `border-radius: 4px`,
   so buttons ignore the radius token entirely.

## Goals

- One icon service. One button component. One text component. One type scale.
- Actively **reduce** the number of button recipes — today's three heights and six style
  variants are accidental, not designed. Merging them will visibly change some buttons;
  that is intended.
- Every recurring value becomes a token.
- Each component lands as its own task, ending in something visible and approvable.

## Non-goals

- No build step, bundler, or framework. Classic scripts sharing `window.*` globals, as today.
- No new icon set. Only the ~40 icons already in use get extracted; Lucide stays the source
  for any future addition.
- No redesign. Visual change is a consequence of merging duplicate recipes, not a goal in
  itself.
- No refactoring unrelated to icons, buttons, typography, or safe zones.

## Architecture

Five batches, in a forced order — everything consumes tokens, and the button component
takes an icon name, so icons must precede buttons.

### Batch 1 — Tokens & typography

`static/css/tokens.css` gains a type scale collapsing the 13 ad-hoc sizes into 7 steps:

| Token | Value | Absorbs |
| --- | --- | --- |
| `--fs-2xs` | 9px | 8, 9, 9.5 |
| `--fs-xs` | 10.5px | 10, 10.5 |
| `--fs-sm` | 11px | 11, 11.5 |
| `--fs-md` | 12.5px | 12, 12.5, 13 |
| `--fs-lg` | 14px | 14 |
| `--fs-xl` | 16px | 16 |
| `--fs-2xl` | 20px | 20 |

Plus `--ls-tight: 0.03em`, `--ls-wide: 0.05em`, `--ls-wider: 0.06em`.

A radius scale replaces the unused `--radius: 0`: `--radius-sm: 3px` (small surfaces:
timeline block, clip thumb, list row, export progress, chips), `--radius-md: 4px`
(buttons), `--radius-lg: 6px` (form controls: color swatch, number-field stepper, style
field input), `--radius-pill: 999px` (usage-chip pill shape). Every hardcoded corner value
found in the audit reconciles to one of these four.

Two more shared tokens close out the drift found in the audit: `--accent-tint: rgba(108,
135, 163, 0.12)` (replacing the three-file hardcoded copy — `timeline-block.selected`'s
drifted `0.16` reconciles to the same token, a deliberate visual fix) and `--shadow-chip:
0 4px 10px rgba(0,0,0,0.4)` (replacing `.slice-btn`, `.timeline-block.dragging`, and the
safe-zone chip's drifted `0.45`).

All 51 `font-size` literals and every hardcoded radius/tint/chip-shadow rewrite to these
tokens. The three chip/badge recipes (`.clip-usage-chip`, `.auto-slice-badge`, the
safe-zone label chip) collapse into one `.chip` base class with shape/color modifiers. The
triplicated 320px scroll-list rule becomes one `.scroll-list` utility class consumed by
`video-box-panel.css`, `image-box-panel.css`, and `auto-slice-panel.css`. Both bugs above
are fixed here: `--danger` moves into base `:root`, and every hardcoded radius reconciles
to the new scale.

### Batch 1b — `UI.text`

`static/ui-text.js` exposes `UI.text(container, { variant, content })`, which **builds**
the text element — consistent with `UI.icon`/`UI.button`, not the "stamp classes onto
existing markup" pattern `.panel-button` uses today. Four variants collapse the recipe
duplication found in the audit:

- `eyebrow` — the mono-caps section-label recipe, replacing six independent definitions:
  `.style-group-label`, `.style-panel-header`, `.clip-section-label`, `.sub-panel-title`,
  `.settings-row-label`, and `.accordion-header`'s label styling.
- `label` — form-field labels, replacing `.style-field`'s label styling.
- `hint` — secondary/help text, replacing `.auto-slice-hint` and sibling one-offs.
- `body` — default content text (caption preview, project names), for the sites that
  currently have no shared class at all.

Each variant is one CSS class (`.text-eyebrow`, `.text-label`, `.text-hint`, `.text-body`)
consuming batch 1's type-scale tokens; `UI.text` just picks the class and sets `textContent`.
Static markup in `index.html` that isn't rebuilt at runtime keeps the class applied directly
(same static/JS split as icons in batch 2).

Merging 13 font sizes into 7 shifts some text by up to 1px. Accepted. `.timeline-block.selected`
visibly changes tint slightly (0.16 → 0.12 alpha) and the safe-zone chip's shadow softens
slightly (0.45 → 0.4 alpha) — both are the drift being corrected, not incidental damage.

### Batch 2 — `UI.icon`

`static/ui-icon.js` exposes `UI.icon(name, { size })`, returning an inline SVG string using
the wrapper already standard in this codebase (`viewBox="0 0 24 24" fill="none"
stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`), so
icons keep inheriting color from their parent exactly as the pasted markup does now.

The ~40 in-use icons' path data lives inside that one file. It is the icon service's own
payload, not a grab-bag of unrelated helpers, so it does not violate the no-catch-all rule.
Only icons actually used today get extracted — no bulk Lucide import. Adding an icon later
is one entry.

All 95 sites migrate. `index.html`'s 27 static SVGs become `<svg class="icon" data-icon="trash">`
placeholders hydrated once at load, so static markup and JS-generated markup both route
through the one service.

An unknown name is a programming error, not a runtime condition: `UI.icon` throws rather
than silently rendering an empty box.

### Batch 3 — `UI.button`

One `UI.button(container, { label, icon, size, intent, pressed, disabled, onClick })` that
**builds** the button — a change in kind from today's `UI.button(btn, {variant})`, which only
stamps classes onto markup the caller already hand-wrote.

Deliberately minimal variant set:

- **2 sizes**, down from 3: `sm` = 28px square icon-only button; `md` = 33px full-width
  labeled panel action. The 42px size is retired — Export becomes `md` + `accent`, the theme
  toggle becomes `sm`.
- **4 intents**, down from ~6 recipes: `neutral`, `accent` (Export only — the app's single
  primary action), `danger`, `dashed` (add-actions).
- Shared `pressed` and `disabled` states, both on tokens.

`panel-button.css`, `.icon-btn`, `.button`, and the one-offs `.row-add-btn`, `.zoom-btn`,
`.number-field-step` all retire into it. `.btn-group` keeps its grid-layout role but its
buttons render through `UI.button`.

### Batch 4 — `UI.safeZones`

`static/ui-safe-zones.js` renders all four bands from a single `SAFE_ZONES` array of
`{ key, label, inset }`. `safe-zone-geometry.js` **derives** its pixel constants from that
same array instead of hand-mirroring the CSS, eliminating the two-source-of-truth problem.
The label chip consumes batch 1's tokens.

## Task breakdown

One component per task. Each ends with a commit and something visible in the running app for
review before the next task starts. Per-component detail — exact values, exact call
signature — is settled at the start of its own task, not pre-committed here.

**Batch 1**
1. Type scale + letter-spacing tokens; radius scale (`--radius-sm/-md/-lg/-pill`);
   `--accent-tint`; `--shadow-chip`; `--danger` into base `:root`
2. Migrate all 51 `font-size` literals, and every hardcoded radius/tint/chip-shadow, to tokens
   (no intended visual change beyond the ≤1px scale merge and the two named drift corrections)
3. `.chip` — replaces `.clip-usage-chip`, `.auto-slice-badge`, and the safe-zone label chip
4. `.scroll-list` — replaces the triplicated 320px max-height rule in `video-box-panel.css`,
   `image-box-panel.css`, `auto-slice-panel.css`

**Batch 1b**
5. `UI.text` component (`eyebrow`/`label`/`hint`/`body`) + tests
6. Migrate the six eyebrow-label sites (`.style-group-label`, `.style-panel-header`,
   `.clip-section-label`, `.sub-panel-title`, `.settings-row-label`, `.accordion-header`)
7. Migrate `.style-field` labels and `.auto-slice-hint` / sibling hints
8. Migrate remaining unstyled body text sites; add a guard test for the retired classes

**Batch 2**
9. `UI.icon` service + tests (no migration yet — verified via a scratch render)
10. Migrate `index.html`'s 27 static SVGs
11. Migrate the `ui-*.js` shared components' SVGs
12. Migrate the `panel-*.js` SVGs
13. Migrate the `text-panel-*.js` / `caption-panel-*.js` SVGs; add the no-raw-`<svg>` guard test

**Batch 3**
14. `UI.button` component + `buttonClasses()` pure function + new `button.css` + tests
15. Migrate the ~20 `.panel-button*` sites
16. Migrate the ~20 `.icon-btn` sites
17. Migrate the one-offs; retire `panel-button.css` and the old `.button` rules; add the guard test

**Batch 4**
18. `UI.safeZones` + geometry derivation + tests

## Testing

`node --test "tests/js/**/*.test.js"` covers the pure parts:

- `UI.icon(name)` output shape, wrapper attributes, and that an unknown name throws
- `UI.text(container, { variant, content })` → correct class per variant, correct `textContent`
- `buttonClasses({ size, intent, pressed, disabled })` → class list
- The safe-zone pixel derivation, asserting the same values `safe-zone-geometry.js` hardcodes
  today (115.2 / 162 / 1401.6 / 1785.6) so the refactor is provably behavior-preserving

**Stated gap:** CSS and DOM wiring cannot be unit-tested — the JS test setup is pure modules
with no DOM. Mitigation is the project's standard one: keep the DOM layer as thin as
possible with all logic in the tested pure functions above, and verify each task in the
browser preview before commit.

**Guard tests** follow the existing `tests/js/preview-load-refreshes-overlays.test.js`
precedent of pinning source shape where behavior can't be exercised:

- After batch 2: no raw `<svg` remains in `static/*.js`
- After batch 3: no `.panel-button` / `.icon-btn` / `.row-add-btn` / `.zoom-btn` references remain

These are cheap and stop the codebase backsliding into pasted markup.

## Risks

- **Visual regressions across ~135 sites.** Mitigated by per-task browser verification and
  by keeping each task small enough to eyeball.
- **The `--danger` fix makes red appear where dark mode currently shows none.** This is the
  correct behavior, but it will look like a change. Called out so it isn't mistaken for a
  regression.
- **Live-verify on a throwaway project, never real project data** — the app's unload
  keepalive-save flushes in-memory mutations to disk.

## Documentation

Every task that adds, moves or deletes a file updates `CLAUDE.md`'s codebase map and
inventory in the same commit, per project convention. New components go into the inventory's
"Shared UI components" section.
