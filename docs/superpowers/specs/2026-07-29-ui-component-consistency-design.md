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
violates the project's own rule that every recurring CSS value becomes a token. Four
near-identical label recipes exist: `.style-group-label`, `.style-panel-header` and
`.clip-section-label` are all 10.5px / 0.06em / muted-or-dim, and `.safe-zone span` is a
fourth copy of the chip pattern (its own comment says "same recipe as `.slice-btn`").

**Safe zones — two hand-synced sources of truth.** The zone percentages live in
`static/css/components/safe-zones.css` (6% / 15% / 73% / 7%) and again as pixels in
`static/safe-zone-geometry.js` (115.2 / 162 / 1401.6 / 1785.6), whose header comment
admits they are "kept in sync by hand — no build step generates one from the other". The
four bands are also four near-identical hand-written `<div>` blocks in `index.html`.

**Two bugs found during the audit:**

1. `--danger` is defined only inside `:root[data-theme="light"]` ([tokens.css:57](../../../static/css/tokens.css)),
   not in the base `:root`. In dark mode — the default — every `var(--danger)` reference
   resolves to nothing, so delete buttons, the save-failure label and the transcribe error
   all silently lose their red.
2. `--radius` is `0px`, but `button.css` and `button-group.css` hardcode `border-radius: 4px`,
   so buttons ignore the radius token entirely.

## Goals

- One icon service. One button component. One type scale.
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

Four batches, in a forced order — everything consumes tokens, and the button component
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

Plus `--ls-tight: 0.03em`, `--ls-wide: 0.05em`, `--ls-wider: 0.06em`, and `--accent-soft`
for the shared pressed-state background.

All 51 literals rewrite to these tokens. The four duplicate label recipes collapse into
plain CSS classes — `.section-label`, `.field-label`, `.hint` — with no JS wrapper, matching
how `.panel-button` works today. Both bugs above are fixed here: `--danger` moves into base
`:root`, and the hardcoded `4px` radii reconcile with `--radius`.

Merging 13 sizes into 7 shifts some text by up to 1px. Accepted.

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
1. Type scale + letter-spacing tokens; `--danger` into base `:root`; `--accent-soft`; radius reconciliation
2. Migrate all 51 `font-size` literals to tokens (no intended visual change beyond the ≤1px scale merge)
3. `.section-label` — replaces `.style-group-label`, `.style-panel-header`, `.clip-section-label`
4. `.field-label` — replaces `.style-field` label styling
5. `.hint` — replaces `.auto-slice-hint` and sibling one-off hint text

**Batch 2**
6. `UI.icon` service + tests (no migration yet — verified via a scratch render)
7. Migrate `index.html`'s 27 static SVGs
8. Migrate the `ui-*.js` shared components' SVGs
9. Migrate the `panel-*.js` SVGs
10. Migrate the `text-panel-*.js` / `caption-panel-*.js` SVGs; add the no-raw-`<svg>` guard test

**Batch 3**
11. `UI.button` component + `buttonClasses()` pure function + new `button.css` + tests
12. Migrate the ~20 `.panel-button*` sites
13. Migrate the ~20 `.icon-btn` sites
14. Migrate the one-offs; retire `panel-button.css` and the old `.button` rules; add the guard test

**Batch 4**
15. `UI.safeZones` + geometry derivation + tests

## Testing

`node --test "tests/js/**/*.test.js"` covers the pure parts:

- `UI.icon(name)` output shape, wrapper attributes, and that an unknown name throws
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
