# Phase 2 — Text Panel Accordion Restructure

**Parent:** [2026-07-17-major-plan-revision-design.md](2026-07-17-major-plan-revision-design.md)
**Status:** planning only — subthreads verified/refined by a brainstorm at pickup time before their plans are written.

## Goal

Split the TEXT context panel's current two accordions (FONT, MISC — the latter a catch-all for TIME/STYLE/BOX/ALIGN/POSITION) into six purpose-built accordions, add a text-highlight feature, add saved style presets (reviving the original plan's never-built Task 8), and let users edit heading text by clicking directly into it on the stage. Components are built so Phase 3 (Captions) can reuse them against a different backing model (a caption track instead of a text block).

## Target accordion layout

| Accordion | Contents | Source |
|---|---|---|
| **FONT** | Font family (existing drill-down, unchanged) + size, weight/bold, italic, underline, color, outline color/width (currently in MISC) + new highlight toggle/color | move + extend |
| **STYLE** | Saved presets: save current style as a named preset, list saved presets, apply one | new (revives original plan's Task 8) |
| **BOX** | Toggle, background color, border width/color/radius, drag+resize | already built in Phase 1, unchanged here |
| **POSITION** | Text align + anchor grid + pixel offsets (currently in MISC) | move, unchanged content |
| **TIME** | Start/end seconds (currently in MISC) | move, unchanged content |

Plus: inline editing of the heading directly on the stage.

## Open questions for the pre-phase brainstorm

- Exact STYLE-preset UX: is "save" always "save as new," or can it update the currently-applied preset? Does the preset dropdown/list live in the STYLE accordion body, or does it get its own drill-down subpanel like Font Family's?
- Is text-highlight a `TextPreset` field pair (`highlight: bool`, `highlight_color: str`, mirroring the Box fields' pattern) or does it need something more structured (e.g. per-word highlight later for captions)? Given Phase 3 needs a *different* highlight behavior (mode toggle, current-word vs progressive-fill) for captions, decide now whether Phase 2's highlight fields are generic enough to carry that mode later, or whether captions get their own highlight-mode field bolted on in Phase 3.

## Subthreads

### Backend

1. **`GET /api/presets` / `POST /api/presets` routes** — [parallel-safe]. `store.load_presets`/`store.save_preset` already exist in `app/store.py`; only the HTTP routes in `app/main.py` are missing (confirmed via grep — no `preset` routes exist yet). Wiring only, per `CLAUDE.md`'s "main.py is composition only" rule.
2. **`TextPreset` highlight fields + migration** — [parallel-safe]. Add e.g. `highlight: bool = False`, `highlight_color: str = "#FFFFFF"` to `app/models.py`, mirroring the existing box-field migration pattern (`model_validator(mode="before")`) in case of future renames. Test in `tests/test_models.py`.
3. **`ass_render.py` highlight rendering** — [parallel-safe, depends on subthread 2's fields existing]. A background-behind-glyphs render, distinct from the Box `\p1` dialogue (that's a separate container; this is a highlight that hugs the text itself — likely an ASS `BackColour`/`\shad`-style approach or a second, tighter `\p1` box sized to the wrapped text). Needs its own test coverage in `tests/test_ass_render.py`.

### Frontend — accordions

4. **FONT accordion consolidation** — [parallel-safe]. Move size/weight/italic/underline/color/outline controls out of `#text-misc-body` into `#text-font-body` in `static/index.html`, alongside the existing font-family row; update `editor.js`'s `renderTextPanel()`/`renderFontRow()` wiring accordingly. Add the highlight toggle + `UI.colorSwatch` here too.
5. **POSITION accordion** — [parallel-safe]. Extract the existing align-button-group + anchor grid + offset-X/Y fields out of MISC into their own accordion (new `#text-position-header`/`#text-position-body` following the BOX accordion's pattern from Phase 1).
6. **TIME accordion** — [parallel-safe]. Extract the existing start/end `UI.numberField`s out of MISC into their own accordion.
7. **STYLE accordion** — [depends on subthread 1, the preset routes]. New component: save-current-style-as-named-preset flow, list of saved presets, click to apply. Needs a new `UI.*` component (list/drill-down) plus wiring in `editor.js`.
8. **Confirm BOX accordion placement** — [sequential, after 4–7 land]. BOX already exists from Phase 1; just verify it sits correctly among the new six-accordion order (FONT, STYLE, BOX, POSITION, TIME) once the others are built. No code expected.

### Frontend — highlight rendering

9. **`preview.js` highlight rendering** — [parallel-safe, depends on subthread 2]. Background-behind-glyphs CSS on the `.text-block`'s text content (likely a `<span>` wrapping the text, distinct from the box `div`'s own background), reading the new highlight fields.

### Frontend — inline editing

10. **Inline stage text editing** — [parallel-safe]. Make the `.text-block` div's text `contenteditable` on the stage; wire `input` events to update `project.text_blocks[].heading` + debounced `saveProject()`; keep the side-panel `#text-heading` textarea in sync in both directions (typing in either place updates the other without a feedback loop — likely needs an "is this update originating from me" guard).

## Verification (phase checkpoint)

- `pytest -q` green.
- Manual: all six accordions collapse/expand independently and contain the right controls; saving/applying a preset round-trips through a server restart; highlight renders correctly behind text in preview and export; typing directly on the stage updates both the overlay and the side panel.
