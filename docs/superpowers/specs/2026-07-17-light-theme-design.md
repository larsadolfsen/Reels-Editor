# Light theme + header switcher

## Goal

Add a light color theme alongside the existing dark theme, and a switcher in the top bar to toggle between them, with the choice persisted across reloads.

## Token strategy

`tokens.css` currently defines a single flat `:root` token set (the dark theme). Components already reference tokens exclusively, except for a handful of hardcoded hex colors:

- `layout.css`: `#project-name` (`#B4B5B8`), `#export` text-on-accent (`#12161A`), `#export:hover` (`#7C97B3`, `#12161A`)
- `timeline.css`: block colors (`#232427`, `#B4B5B8`, `#202224`, `#C7C8CA`) and the AUDIO-row stripe pattern (`#26282B`/`#2B2D30`)
- `panel.css`: `#add-clip` label color (`#B4B5B8`) and its stripe pattern (same colors as timeline)
- `style-panel.css`: muted label color (`#C7C8CA`)
- `stage.css`: transparency-checkerboard stripe pattern (`#1E2023`/`#232529`) — this one stays hardcoded; it represents "no video loaded" checkering, not themed UI chrome

Changes:

1. Promote the UI-chrome hardcoded colors above into new semantic tokens in `tokens.css`: `--text-secondary` (`#B4B5B8`), `--text-tertiary` (`#C7C8CA`), `--on-accent` (`#12161A`), `--accent-hover` (`#7C97B3`), `--stripe-a`/`--stripe-b` (`#26282B`/`#2B2D30`). Update the ~4 component files to reference them instead of literals.
2. Add a `:root[data-theme="light"] { ... }` override block in `tokens.css` redefining every token (existing + new) with light equivalents: light backgrounds, dark text, same accent hues (deepened slightly for contrast on white where needed), and `color-scheme: light` for native form-control styling.
3. `stage.css`'s checkerboard pattern is left as-is (not themed — it's video-canvas content, not chrome).

## Switcher UI

- New `<button id="theme-toggle" class="icon-btn">` in `#topbar`, placed immediately left of `#safe-zones-toggle`.
- Contains two inline SVGs (Lucide `sun` and `moon` paths, matching the existing icon wrapper style), one visible at a time via `style.display` — the same pattern `preview.js` already uses for the play/pause transport icons.
- `title` attribute: "Toggle light/dark theme".

## Behavior

- `editor.js` gains `setTheme(theme)`: sets `document.documentElement.dataset.theme = theme`, toggles the two icon SVGs' `display`, sets the button's `aria-pressed`, and writes `theme` to `localStorage`.
- Init (same spot as the existing `panelCollapsed`/`safeZonesVisible` init): read `localStorage.getItem('theme')`. If unset, fall back to `window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'`. Apply via `setTheme(...)`.
- Click handler on `#theme-toggle` flips between `'dark'`/`'light'` and calls `setTheme(...)`.
- `<html>` already ships with a static `data-theme="dark"` attribute today (unused) — it becomes the live theme attribute this feature reads/writes.

## Error handling & testing

- No error handling beyond what `panelCollapsed`/`safeZonesVisible` already do (no try/catch around `localStorage`/`matchMedia` — consistent with existing local-desktop-tool assumptions).
- No automated test coverage — `pytest` only covers the Python backend. Verified manually via the dev server: toggle both themes, confirm all panels/timeline/stage read legibly, confirm persistence across reload.

## Scope boundaries

- No system-level "auto" third option (just explicit dark/light toggle, seeded once from OS preference).
- No per-component visual redesign — light theme is a token-value mirror of the existing dark design, not a new visual language.
