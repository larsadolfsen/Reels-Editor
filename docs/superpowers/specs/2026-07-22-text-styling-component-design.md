# Text styling component — design

## Problem

`static/css/components/*.css` has 35+ distinct `font-size` values for text that should share a small number of roles. A concrete confirmed case: `.style-field`, `.style-group-label`, `.clip-section-label`, `.settings-row-label`, `.sub-panel-title`, `.accordion-header` are all "small caps mono label" text, copy-pasted six times with drifted values (9px/0.05em/`--text-dim` vs 10.5px/0.06em/`--text-muted`). This causes visible drift between panels that should look identical (e.g. a "VIDEOS" section label rendering differently from a "WIDTH (PX)" field label).

## Goal

One canonical text-styling component so no file hand-rolls typography again: a `window.UI.text()` component + a `text.css` stylesheet defining a small, closed set of text roles, with every existing call site migrated onto it.

## Component API

`static/ui-text.js`, mirroring the existing minimal-component pattern in `static/ui-divider.js` (framework-free, presentational-only, attaches to `window.UI`):

```js
window.UI = window.UI || {};
window.UI.text = function text(container, str, { role, as = "span", strong = false } = {}) {
  const el = document.createElement(as);
  el.className = strong ? `text-${role} text-strong` : `text-${role}`;
  el.textContent = str;
  container.appendChild(el);
  return el;
};
```

Unlike `UI.divider`, this does not clear `container.innerHTML` — text nodes typically sit alongside sibling children in a row (e.g. a label next to an input), so `UI.text` only appends.

## Roles

`static/css/components/text.css` defines one class per role plus a `.text-strong` modifier (`font-weight: 600`), stamped on top of a role class when a caller passes `strong: true`.

| Role | family | size | letter-spacing | color | transform |
|---|---|---|---|---|---|
| `text-label` | `var(--font-ui)` | 11px | 0.03em | `var(--text-muted)` | uppercase |
| `text-body` | `var(--font-content)` | 13px | — | `var(--text)` | — |
| `text-heading` | `var(--font-ui)` | 13px | 0.04em | `var(--text)` | — |
| `text-data` | `var(--font-ui)` | 10px | — | `var(--text-dim)` | — |

`text-heading` and `text-body` land on the same 13px size but differ in family/letter-spacing/purpose (mono UI-chrome heading vs Public Sans content/name text) — kept as distinct roles since they render different typefaces, not just different sizes.

`text-label` absorbs what would otherwise have been a separate "button-label" role — both are small caps-mono chrome text, and button text (`IMPORT MEDIA`, `NEW PROJECT`, etc.) is already typed in caps in the markup, so the shared `uppercase` transform is a no-op for it. Buttons are native `<button>` elements, so there's no wrapper span to route through `UI.text()`: `base.css`'s existing button rule (11px/0.03em/`var(--text-muted)`) already matches `text-label`'s values exactly, and `button.css`'s `.button` (currently 11.5px) plus `button-group.css`'s `.btn-group button` (currently 10.5px) are realigned to the same 11px/0.03em/`--text-muted` values directly in their own CSS files (not by wrapping button contents in a `UI.text()` call). `.button`'s existing `font-weight: 600` stays as its own explicit rule (button-specific emphasis, not touched).

### Bespoke exceptions (not migrated, left as their own dedicated CSS)

These are sized for a functional reason, not copy-paste drift:

- `.font-list-row-name` (16px) and `.font-weight-row-preview` (20px) — render a live font/weight sample so the user can see what that font actually looks like.
- `.zoom-btn` (14px) — deliberately larger tap target for the lone +/- glyph buttons.
- `.icon-btn`'s 12px — icon glyph sizing, not label text.

### Out of scope

`.text-block` / `.caption-block` (stage canvas overlay text) — user-authored content styled by `font-fit.js` + the `text-panel-font-*.js`/`caption-panel-font-*.js` pipeline. This is a content-styling system, not UI chrome, and stays independent of `window.UI.text()`.

### Dead code deleted

`.style-checkbox` and `.caption-preview-box` in `style-panel.css` have no JS or HTML producer anywhere in the codebase. Deleted outright, not migrated.

## Migration table

Every remaining text selector folds into its nearest role. Sizes round to the role's value; some colors shift brighter/dimmer; selectors that were bold (`#brand-name`, `.safe-zone span`, `.button`) keep their weight via `strong: true` (or, for `.button`, its own explicit rule). Deltas are approved as part of this unification.

**`text-label`** (target 11px / 0.03em / `--text-muted` / uppercase / JetBrains Mono — includes what would otherwise be a separate button-label role):

| Old selector | Old spec | Delta |
|---|---|---|
| `.accordion-header` | 10.5px/0.06em/text-muted | size 10.5→11, spacing 0.06→0.03 |
| `.style-group-label` | 10.5px/0.06em/text-muted | size 10.5→11, spacing 0.06→0.03 |
| `.settings-row-label` | 10.5px/0.06em/text-muted | size 10.5→11, spacing 0.06→0.03 |
| `.clip-section-label` | 10.5px/0.06em/text-muted | size 10.5→11, spacing 0.06→0.03 |
| `.style-panel-header` | 10.5px/0.06em/text-dim | size 10.5→11, spacing 0.06→0.03, color dim→muted |
| `.sub-panel-title` | 10.5px/0.06em/text-dim | size 10.5→11, spacing 0.06→0.03, color dim→muted |
| `.style-field` | 9px/0.05em/text-dim | size 9→11, spacing 0.05→0.03, color dim→muted |
| `.icon-rail-btn`/`.icon-rail-label` | 9px/0.04em/text-dim/uppercase | size 9→11, spacing 0.04→0.03, color dim→muted |
| `.layers-list-row-type` | 9.5px/text-dim/uppercase | size 9.5→11, +0.03em spacing (new), color dim→muted |
| `#brand-name` | 10px/0.02em/weight 600 | size 10→11, spacing 0.02→0.03, **+ `strong: true`** to keep weight 600 |
| `.safe-zone span` | 9px/0.05em/text-secondary/uppercase/600 | size 9→11, spacing 0.05→0.03, color secondary→muted, **+ `strong: true`** to keep weight 600 |
| `.save-indicator-label` | 8px/0.04em/text-dim | size **8→11 (largest single delta)**, spacing 0.04→0.03, color dim→muted |
| `.button` | 11.5px/0.03em/weight 600 | size 11.5→11, **+ `strong: true`**-equivalent (own explicit rule, not touched) to keep weight 600 |
| `.btn-group button` | 10.5px/0.03em | size 10.5→11 |

**`text-body`** (target 13px / `--text` / Public Sans):

| Old selector | Old spec | Delta |
|---|---|---|
| `.settings-row-value` | 16px/text-secondary | size 16→13, color secondary→text |
| `.color-swatch-label` | 14px/text-muted | size 14→13, color muted→text |
| `.font-list-row-time` | 12px/inherited | size 12→13 |
| `.style-field input[type="number"]` | 14px/text | size 14→13 |
| `.context-panel-name` | 12.5px/text-tertiary | size 12.5→13, color tertiary→text |
| `.layers-list-row-label` | 12.5px/text | size 12.5→13 |
| `.project-list-row-name` | 12.5px/text | size 12.5→13 |
| `.project-picker-empty` | 12px/text-dim | size 12→13, color dim→text |

**`text-heading`** (target 13px/0.04em/`--text`/JetBrains Mono):

| Old selector | Old spec | Delta |
|---|---|---|
| `.project-picker-heading` | 13px/0.04em/text | none — canonical already |

**`text-data`** (target 10px/`--text-dim`/JetBrains Mono):

| Old selector | Old spec | Delta |
|---|---|---|
| `.clip-info .clip-duration` | 9.5px/text-dim | size 9.5→10 |
| `.clip-usage-chip` | 9.5px/text-dim | size 9.5→10 |
| `.project-list-row-meta` | 9.5px/text-dim | size 9.5→10 |
| `.tick` | 9px/text-dim | size 9→10 |
| `.timeline-block span` | 9.5px/text-tertiary (video-row override: text-secondary) | size 9.5→10, color tertiary→dim (override collapses too) |
| `#transport` | 11px/text-dim | size 11→10 |
| `#export-result` | 11px/text-muted | size 11→10, color muted→dim |
| `#timeline-time` | 11px/text-dim | size 11→10 |

## JS call sites to migrate

Each of these currently builds the element manually (via `className = "..."` or an inlined string) and switches to calling `UI.text(container, str, { role, as, strong })`:

- `static/ui-accordion-section.js` → `.accordion-header`
- `static/ui-settings-row.js` → `.settings-row-label`, `.settings-row-value`
- `static/ui-sub-panel-header.js` → `.sub-panel-title`
- `static/panel-media.js` → `.clip-section-label`, `.clip-info .clip-duration`, `.clip-usage-chip`
- `static/ui-icon-rail.js` → `.icon-rail-btn`/`.icon-rail-label`
- `static/panel-layers.js` → `.layers-list-row-type`, `.layers-list-row-label`
- `static/ui-save-indicator.js` → `.save-indicator-label`
- `static/ui-color-swatch.js` → `.color-swatch-label`
- `static/caption-panel-words.js` → `.font-list-row-time`
- `static/ui-project-picker.js` → `.project-picker-heading`, `.project-picker-empty`
- `static/ui-project-list-row.js` → `.project-list-row-name`, `.project-list-row-meta`
- `static/panel-video.js`, `static/panel-video-box.js`, `static/panel-audio.js` → `.context-panel-name`
- `static/timeline.js`, `static/timeline-clip-drag.js` → `.tick`, `.timeline-block span`

Literal-in-HTML cases get their class swapped directly in `static/index.html` (no JS call site to change): `#brand-name`, `.safe-zone span` (4 spans), `#transport`, `#export-result`, `#timeline-time`, `.style-panel-header` (per-panel literal headers), `.style-group-label` where used directly in markup.

`static/panel-export.js`'s number input (`.style-field input[type="number"]`) keeps using `UI.numberField` — only the CSS rule's values change, no call-site change needed since the input isn't created via `UI.text()`.

`.button` and `.btn-group button` are not migrated to a `UI.text()` call — they're native `<button>` elements. Their font-size/letter-spacing/color values in `button.css`/`button-group.css` are updated in place to match `text-label`'s 11px/0.03em/`--text-muted` exactly (`.button` keeps its own explicit `font-weight: 600` rule alongside).

## CSS cleanup

Once every selector above is migrated onto a role class, delete the now-dead per-selector font declarations from: `accordion.css`, `color-swatch.css`, `icon-rail.css`, `layers-panel.css`, `panel.css`, `project-list-row.css`, `project-picker.css`, `safe-zones.css`, `save-indicator.css`, `settings-row.css`, `stage.css` (`#transport`/`#export-result` only), `style-panel.css` (`.context-panel-name`, `.style-panel-header`, `.style-group-label`, `.style-field`, `.style-checkbox`, `.caption-preview-box`, `.clip-info .clip-duration`, `.clip-section-label`, `.clip-usage-chip`), `sub-panel.css` (`.sub-panel-title` only, keep `.font-list-row-name`/`.font-weight-row-preview` bespoke), `timeline.css` (`.tick`, `.timeline-block span`, `#timeline-time` only, keep `.zoom-btn` bespoke). `button-group.css`'s `.btn-group button` and `button.css`'s `.button` keep their rules but with values realigned (see above), not deleted.

## Non-goals

- No changes to `tokens.css` color values.
- No changes to `--font-content` body copy that isn't part of this label/value/heading family (e.g. `.text-block` canvas overlay text).
- No generic type-scale utility beyond the 4 roles found in the audit.

## Verification

Pure CSS/JS refactor, no automated visual-regression tooling in this repo. Verify by running the dev server and opening every panel that uses a migrated class — VIDEO, VIDEO BOX, TEXT, CAPTIONS, LAYERS, SETTINGS, EXPORT, PROJECTS, FILES, plus the cold-start project picker and the timeline strip — confirming no unintended layout/size shifts beyond the deltas explicitly approved above.
