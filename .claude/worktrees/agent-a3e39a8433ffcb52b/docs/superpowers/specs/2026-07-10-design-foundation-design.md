# Design Foundation — Spec

**Date:** 2026-07-10
**Status:** Approved

## Goal

Replace Pico.css with a hand-rolled design system matching the approved north-star mockup ("Local Reel Editor" HTML mockup), applied to the existing screen only (top bar, clip panel, stage, export). No new features. Future screens (timeline, captions panel, text presets) adopt the same tokens when their features land per the first-reel plan.

**Mockup:** `docs/superpowers/specs/assets/2026-07-10-design-foundation-mockup.html` — the "Local Reel Editor" north star (open directly in a browser to view; it's a self-contained React prototype, not the real app).

## Decisions (settled with the user)

1. **The mockup is the north star** — its layout, palette, and type system are the target the app builds toward incrementally.
2. **Foundation first, then screens** — one package establishes tokens + base primitives and restyles the existing screen; later screens reuse the foundation.
3. **Hand-rolled CSS custom properties; Pico.css is dropped.** Tailwind rejected (would force npm + a build step into a build-free Python project). Open Props rejected (dead weight for a token set this small). The "prefer established libraries" rule targets behavior code, not a declared-values stylesheet; "simplest/boring" rules favor no framework.
4. **Small focused files** — styles split into single-purpose files (~100–400 lines each), one component per file, to minimize long-run token cost when editing.
5. **Scope: restyle only what exists today.** No visual scaffolding of unbuilt features.

## Design tokens (extracted from the mockup)

Colors:

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#101113` | app background |
| `--bg-1` | `#16171A` | panel background |
| `--bg-2` | `#18191C` | input/well background |
| `--surface` | `#1C1E20` | raised surface (hover, chips) |
| `--border` | `#2B2D30` | default borders |
| `--border-soft` | `#26282B` | subtle dividers |
| `--text` | `#E7E7E6` | primary text |
| `--text-muted` | `#8A8B8F` | secondary text |
| `--text-dim` | `#5C5D61` | labels, disabled |
| `--accent` | `#6C87A3` | blue-gray: selection, primary action |
| `--accent-green` | `#6FA37E` | positive states |
| `--accent-gold` | `#B8935A` | highlights/warnings |

Typography:

- `--font-ui`: `'JetBrains Mono', monospace` — all chrome: labels, buttons, timecodes. Uppercase, letter-spaced, small sizes (10–12px).
- `--font-content`: `'Public Sans', sans-serif` — content text: captions, body copy.
- Both vendored as woff2 in `static/fonts/`, loaded via `@font-face` (local-first app, no CDN).

Spacing scale: `--space-1: 4px`, `--space-2: 8px`, `--space-3: 16px`, `--space-4: 24px`. Radius: `--radius: 2px` (near-square corners throughout).

## File structure

```
static/
  css/
    tokens.css            # :root custom properties only — single source of truth
    base.css              # reset + element defaults (body, button, input) on the tokens
    layout.css            # app shell grid: top bar, left panel, stage area
    components/
      panel.css           # media/clip panel + clip rows
      stage.css           # 9:16 stage + transport controls
  fonts/                  # JetBrainsMono-*.woff2, PublicSans-*.woff2
```

Removed: `static/pico.min.css`, `static/style.css` (surviving editor rules migrate into the new files).

## HTML changes

`static/index.html`: swap the Pico link for the new CSS files; add semantic class names; add the top bar per the mockup (app name, project name, export button relocated there). `editor.js`/`preview.js` untouched except class-name hooks.

## What it reuses

Existing `static/index.html` structure and all JS. The mockup's exact palette/type (extracted above). No new endpoints, no data model changes — nothing is persisted.

## Testing

Pure CSS + minor HTML — no logic to unit test. **Stated untested layer:** visual styling. Verified manually: load the editor with real sample clips, screenshot, compare against the mockup. The existing pytest suite must stay green (guards HTML/JS breakage).

## Delivery

One package, one commit: tokens + base + restyled existing screen, visible at `http://127.0.0.1:8000`.
