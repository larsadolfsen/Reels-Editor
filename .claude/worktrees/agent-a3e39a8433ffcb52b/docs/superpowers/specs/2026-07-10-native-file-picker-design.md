# Native File Picker for "Add Clip" — Design

## Problem

"Add clip" requires manually typing/pasting an absolute file path. The user wants to browse their filesystem instead.

## Approach

Since the server runs locally on the user's own machine and ffmpeg needs a real filesystem path (not uploaded file bytes), the browser's `<input type=file>` is a poor fit — modern browsers withhold the real path. Instead, "Add clip" opens a **native OS file dialog** via a small backend endpoint using Python's built-in `tkinter`.

## Backend

`app/media.py` — add:
- `pick_file() -> str | None`: opens `tkinter.filedialog.askopenfilename` filtered to video files (`*.mp4;*.mov;*.mkv`); returns the selected absolute path, or `None` if the user cancels.

`app/main.py` (wiring only) — add:
- `GET /api/pick-file` → `{"path": media.pick_file()}` (`path` may be `null`).

## Frontend

`static/editor.js` — "Add clip" click handler:
1. `GET /api/pick-file`.
2. If `path` is non-null, fill `#clip-path` with it and continue through the existing probe-and-add flow unchanged.
3. If `path` is `null` (dialog cancelled), do nothing.

The manual `#clip-path` text input is unchanged and remains usable as a fallback/override.

## Error handling

If the dialog fails to open, `/api/pick-file` returns a 500; the existing generic fetch-error handling in `editor.js` covers it. No new error path.

## Testing

`pick_file` wraps a real OS dialog and can't be meaningfully unit tested — stated untested layer, kept to a one-line wrapper around `tkinter.filedialog.askopenfilename`. Verified manually: click "Add clip" → native dialog opens → pick a file → it's probed and added to the clip list, same as today's manual-path flow (which remains covered by existing tests downstream).

## Out of scope

- Drag-and-drop.
- Multi-file selection in one dialog action.
