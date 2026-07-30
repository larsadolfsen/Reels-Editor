# Context-panel header unification

## Problem

Every right-hand context panel (`#panel-*` inside `#style-panel`) hand-rolls its own header markup: a static all-caps "eyebrow" label (`FILES`, `TEXT`, `VIDEO BOX`, ...) with no icon. For the four file-backed panels (VIDEO, VIDEO BOX, IMAGE BOX, AUDIO) the selected item's file name was shown in a separate row *below* the header instead of in it, and the panel type (video vs. image vs. audio) had no visual marker beyond the text label itself.

A prior pass (this session) fixed VIDEO, IMAGE BOX, and AUDIO by introducing `UI.contextPanelHeader(container, {icon, label})` — an icon + label header row, shared via a container div already in the panel's HTML, following the same "container in markup, JS builds into it" pattern as `UI.settingsRow`/`UI.numberField`. That component now needs to become the single header treatment for **all ten** context panels, including the six with a purely static label and VIDEO BOX (currently unconverted).

## Goals

- Every context panel header is an icon + label row, built via `UI.contextPanelHeader`.
- One consistent typography for all header labels — the old small-caps "eyebrow" look is dropped from context-panel headers specifically (it stays defined and in use elsewhere, e.g. section labels like "SIZE & POSITION").
- File-backed panels (VIDEO, VIDEO BOX, IMAGE BOX, AUDIO) show the selected item's real file name in the header once something is selected, replacing the separate name row underneath.
- Icons are reused from the left icon rail (`panel-nav.js`) wherever a rail entry already exists for that panel, so the same panel is represented by the same icon in both places.

## Non-goals

- Not building a generic panel "shell" component (outer `.context-panel` wrapper, body container, show/hide). `panel-nav.js`'s existing `showPanel()` already handles show/hide generically by id; that's out of scope here. This spec covers the header row only.
- Not changing which panels exist, their nav rail entries, or their body content/behavior.

## Component

`UI.contextPanelHeader(container, {icon, label})` (`static/ui-context-panel-header.js`) — already built. Idempotent: safe to call on every `render()`. Builds two child spans (`.context-panel-header-icon`, `.context-panel-header-label`) into `container` on first call, then just updates their content on subsequent calls.

**CSS change:** fold the current `.context-panel-header-file` modifier's flex/icon/label styling directly into the base `.context-panel-header` class, since every context-panel header will use this layout now. Drop `text-eyebrow` from all ten header divs in `index.html`.

## Icon (new)

One new icon needed: `clapperboard`, for the MAIN video-clip panel. Path data (confirmed from Lucide's source SVG):

```
<path d="m12.296 3.464 3.02 3.956"/>
<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"/>
<path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
<path d="m6.18 5.276 3.1 3.899"/>
```

## Per-panel mapping

| Panel | `#panel-*` | Icon | Idle label | Selected label |
|---|---|---|---|---|
| PROJECTS | `panel-projects` | `layout-grid` *(matches rail)* | "Projects" | — (list panel, never changes) |
| FILES | `panel-files` | `file` *(matches rail)* | "Files" | — |
| TEXT | `panel-text` | `type` *(matches rail)* | "Text" | — |
| CAPTIONS | `panel-captions` | `captions` *(matches rail)* | "Captions" | — |
| SETTINGS | `panel-settings` | `settings` *(matches rail)* | "Settings" | — |
| EXPORT | `panel-export` | `upload` *(matches rail)* | "Export" | — |
| VIDEO (MAIN clip) | `panel-video` | `clapperboard` *(new)* | *(panel only opens with a clip selected — no idle state)* | clip's file name |
| VIDEO BOX | `panel-video-box` | `picture-in-picture` | "Video" | box's file name |
| IMAGE BOX | `panel-image-box` | `image` | "Image" | box's file name |
| AUDIO | `panel-audio` | `music` | "Audio" | music file name |

VIDEO BOX and IMAGE BOX idle labels drop the word "Box" ("Video"/"Image", not "Video Box"/"Image Box") per explicit direction — the icon already distinguishes a PiP box from the MAIN clip panel.

## Wiring pattern

- **Static-label panels** (PROJECTS, FILES, TEXT, CAPTIONS, SETTINGS, EXPORT): the label never changes, so `UI.contextPanelHeader` is called once at the panel's file-level IIFE — the same one-time-setup pattern already used for those files' `UI.tabBar` calls. SETTINGS has no dedicated JS file today (its one control, the theme toggle, is wired inline in `editor.js`); this adds a new minimal `static/panel-settings.js` — one line of header wiring — matching the project's "each feature gets its own file" convention rather than growing `editor.js`. The theme-toggle wiring itself is untouched and stays where it is.
- **Dynamic panels** (VIDEO, VIDEO BOX, IMAGE BOX, AUDIO): call happens inside the existing `render()`/`render(selectedId)` function, computing the label from the selected item (or the idle fallback when nothing's selected). VIDEO, IMAGE BOX, and AUDIO already do this from the prior pass — only their fallback casing changes ("IMAGE BOX" → "Image", "AUDIO" stays "Audio" but via the shared component, VIDEO unaffected since it has no idle state). VIDEO BOX gets the same treatment IMAGE BOX already has, mirrored 1:1 (`renderDetail(box)` currently sets `#video-box-name` directly — that line moves into `render(selectedId)` as `UI.contextPanelHeader(...)`, and the standalone `#video-box-name` row is removed).

## Files touched

- `static/ui-icon.js` — add `clapperboard`.
- `static/index.html` — 7 header divs converted to the icon+label container pattern (files, text, captions, settings, export, projects, video-box); the 3 already-converted ones (video, image-box, audio) are untouched structurally.
- `static/css/components/style-panel.css` — fold `.context-panel-header-file` into `.context-panel-header`; remove now-unused modifier class.
- `static/panel-media.js`, `static/panel-text.js`, `static/panel-captions.js`, `static/panel-export.js`, `static/panel-projects.js` — one-time `UI.contextPanelHeader` call each.
- `static/panel-video-box.js` — move the name row into the header, mirroring `panel-image-box.js`.
- `static/panel-video.js`, `static/panel-image-box.js`, `static/panel-audio.js` — icon swap (VIDEO → `clapperboard`) and idle-label casing updates only.
- `static/panel-settings.js` — new file, header wiring only.

## Testing / verification

- `node --test "tests/js/**/*.test.js"` — no existing test currently pins header markup/text, so no test changes expected; suite must stay green.
- Live verification in the browser preview, on a throwaway project (never real project data): open each of the 10 panels and confirm icon + correct label text, including the idle → selected transition for the 4 dynamic panels.
