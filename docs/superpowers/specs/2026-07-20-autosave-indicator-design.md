# Autosave Indicator — Design

**Status:** brainstormed 2026-07-20, ready to plan. No open questions.

## What / Why

Every edit autosaves silently; there's no feedback that work is safe (or that a save failed). Show a small status.

## Design

- A status chip in the timeline toolbar (next to the time readout — the one always-visible chrome strip): "Saving…" while a `saveProject()` request is in flight, "Saved" (dimmed, with a check icon) once settled, "Save failed — retry" (accent/danger, clickable to retry) on error. Today a failed save is silently swallowed — this makes it visible for the first time.
- Implementation: `saveProject()` in `editor.js` gets before/success/error hooks calling a tiny `static/ui-save-status.js` (`UI.saveStatus(el)` returning `{saving(), saved(), failed(retryFn)}`); "Saved" state fades to just the icon after ~2 s to keep the toolbar quiet. CSS in `timeline.css`.
- In-flight counting (increment on start, decrement on settle) so overlapping saves don't flicker.

## Data model

None.

## Tasks

1. `ui-save-status.js` + toolbar chip + `saveProject()` hooks.

## Testing

UI wiring — manual verification: chip flickers Saving→Saved on an edit; killing the server mid-session shows the failed state and retry works after restart. `pytest -q` green.

## Out of scope

- Offline queueing of failed saves.
- Version history.
