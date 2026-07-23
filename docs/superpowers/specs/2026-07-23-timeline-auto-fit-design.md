# Timeline auto-fit to content length

## Problem

The timeline strip (`static/timeline.js`) shows a fixed window of `visibleSeconds`
(default 30s) across the scroll container's width, adjustable only via the
zoom −/+ toolbar buttons (10s steps, clamped [10s, 120s]). When a project's
total content duration exceeds the visible window — e.g. after adding a video
that pushes the sequence past 30s, or well past the 120s zoom-out ceiling — the
user has to manually zoom out and/or scroll to see the whole timeline. There is
no way to see the entire project at a glance without manual effort.

## Goal

Adding a clip (or any edit that grows the project's total duration) should
automatically widen the visible timeline window to fit the whole project, with
no scrolling needed. Manual zoom still works and takes priority once used.

## Design

All changes are in `static/timeline.js`, reusing the existing zoom
infrastructure (`visibleSeconds`, `zoomIn`/`zoomOut`/`resetZoom`,
`currentPxPerSecond`, `totalDuration`).

### State

- New module-level flag `manualZoom = false`. Tracks whether the user has
  taken manual control of zoom for the currently open project.

### Behavior changes

- `zoomIn()` / `zoomOut()` (wired to the toolbar −/+ buttons) additionally set
  `manualZoom = true`. Once the user manually zooms, auto-fit stops adjusting
  `visibleSeconds` for the rest of that project session.
- `resetZoom()` (already called by `editor.js` on every project open) resets
  both `visibleSeconds = DEFAULT_VISIBLE_SECONDS` and `manualZoom = false`, so
  every newly opened project starts in auto-fit mode.
- New pure helper:
  ```js
  function fitVisibleSeconds(totalDuration) {
    return Math.max(DEFAULT_VISIBLE_SECONDS, Math.ceil(totalDuration) + 2);
  }
  ```
  The `+ 2` is small trailing padding so the last block's "+" add button /
  resize handle isn't flush against the container's right edge.
- In `render(project, timelineTime, selected, onSelect, actions)`: compute
  `duration = totalDuration(project)` (unchanged, already the first line of
  `render`). If `!manualZoom`, set `visibleSeconds = fitVisibleSeconds(duration)`
  before `currentPxPerSecond()` is read later in the same call. This means
  every render — which already runs after every project edit, including
  adding a clip — re-fits the window when the user hasn't manually zoomed.
- `zoomOut()`'s existing clamp (`Math.min(MAX_VISIBLE_SECONDS, visibleSeconds + ZOOM_STEP_SECONDS)`)
  is relaxed so manual zoom-out can never end up tighter than the content
  needs: the effective ceiling becomes
  `Math.max(MAX_VISIBLE_SECONDS, totalDuration(lastProject))` when a project
  is loaded, falling back to the existing `MAX_VISIBLE_SECONDS` (120s)
  otherwise. `zoomIn()`'s floor (`MIN_VISIBLE_SECONDS`, 10s) is unchanged.

### Not changed

- `MIN_PX_PER_SEC_FLOOR`, `PX_PER_SEC` getter, ruler rendering, row rendering,
  scroll/playhead behavior — untouched.
- No new persistence: like today, zoom state (now including `manualZoom`) is
  session-only and resets on project open via the existing `resetZoom()` call.

## Testing

This module has no existing automated test coverage (it's DOM-driven, no
`tests/test_timeline_js.*` file exists, and the project's Python test suite
doesn't cover `static/*.js`). Per the project's testing policy, this is a
thin-UI-wiring case: the new logic is a small pure function
(`fitVisibleSeconds`) plus a boolean-flag branch, kept as small as possible,
verified manually in the browser:

1. Open a project with < 30s of clips → visible window stays at 30s default.
2. Add clips until total duration exceeds 30s → visible window (ruler width,
   `visibleSeconds`) grows to fit without needing to scroll to see the end.
3. Add clips past 120s total (e.g. a 3+ minute project) → window still grows
   to fit the entire thing (confirms the 120s ceiling no longer applies to
   auto-fit).
4. Click zoom − or + once → `manualZoom` engages; adding another clip no
   longer changes `visibleSeconds` automatically.
5. Open a different project → auto-fit resumes (manual zoom from the
   previous project doesn't leak over).
6. Manually zoom out on a short project → can still zoom out at least to the
   old 120s ceiling (unaffected for short projects).
