# Cloud hosting + access gate — design

Piece 1 of 4 in the "run this app on Android" project (see project memory / this doc's sibling specs for pieces 2-4: upload flow, PWA manifest, mobile-responsive UI). This piece makes the existing desktop-oriented FastAPI app deployable on Railway, persistent across redeploys, and gated behind a password — a prerequisite for every later piece, since none of them matter if the app isn't reachable outside your own machine.

## Goal

Deploy the current app to Railway (connected via GitHub — Railway builds and redeploys automatically on push, no CLI/MCP deploy steps needed from this session) so it is reachable over the internet, with:

- Project/media/export data surviving redeploys (persistent volume).
- A simple shared-password gate so random visitors with the URL can't open it.
- ffmpeg available in the deployed environment (required for probing/export; already a hard requirement locally, just needs to be installed in the container).

Out of scope for this piece: replacing native file-picker media import (piece 2), PWA installability (piece 3), mobile-responsive layout (piece 4), multi-user accounts, GPU-based transcription in production.

## Config

`app/main.py` currently hardcodes `DATA_DIR = Path("data")`. Change to:

```python
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
```

Local dev behavior is unchanged (defaults to `./data`, already gitignored). On Railway, `DATA_DIR` is set to the mounted volume's path (e.g. `/data`).

Two new env vars, read at startup:

- `APP_PASSWORD` — the shared password. If unset, auth is skipped entirely (keeps local `uvicorn --reload` dev frictionless — no login prompt when running locally).
- `SESSION_SECRET` — random string used to sign the login cookie. Required only when `APP_PASSWORD` is set.

## Auth: login page + signed cookie

No user accounts, no database table — this is a single shared secret, not a data model. The cookie is a signed token (itsdangerous `URLSafeTimedSerializer`, new dependency), not a server-side session store, so nothing new is persisted.

- `GET /login` — serves a minimal HTML page with one password `<input>` and a submit button. New static file, follows the existing no-inline-`style` convention (styling in a small dedicated CSS file).
- `POST /login` — form-encoded `{password}`. Compares against `APP_PASSWORD` (constant-time compare via `hmac.compare_digest`). On match, sets a signed cookie (`itsdangerous`, max-age ~30 days) and redirects to `/`. On mismatch, redisplays the login page with an error.
- New Starlette middleware in `app/main.py`, registered before the static/app routes: if `APP_PASSWORD` is set and the request isn't for `/login` (or its static assets) and the cookie is missing/invalid, redirect (or 401 for API/XHR requests distinguished by `Accept`/path prefix `/api/`) to `/login`.
- No logout route in v1 (YAGNI — this is single-user personal use; clearing the cookie manually via browser dev tools is enough if ever needed).

## Dockerfile (new)

```
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml .
COPY app ./app
COPY static ./static
RUN pip install --no-cache-dir .
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Only base dependencies are installed (no `dev` or `ml` extras) — keeps the image small and avoids pulling in `faster-whisper`/CUDA-related packages that can't run on Railway's CPU-only instances anyway.

Railway (GitHub-connected) auto-detects and builds this Dockerfile on push. You separately (in the Railway dashboard, not via this session) attach a persistent Volume mounted at `/data` and set `DATA_DIR=/data`, `APP_PASSWORD`, `SESSION_SECRET` as service env vars.

## Transcription fallback

`app/transcribe.py`'s `_get_model()` lazily imports `faster_whisper` only when called, so today an uninstalled `ml` extra means the first transcribe call raises `ImportError`, which FastAPI turns into an unhandled 500.

`transcribe_project` in `app/main.py` wraps the `transcribe.transcribe_file(...)` call:

```python
try:
    words = transcribe.transcribe_file(str(wav_path))
except ImportError:
    raise HTTPException(503, "Transcription not available on this deployment")
```

Desktop use (where `ml` extra is installed) is unaffected — `ImportError` never fires there. The CAPTIONS panel's "Auto-transcribe" button will surface this as a normal API error; no new frontend handling required beyond whatever already surfaces failed API calls (existing error path, not touched by this piece).

## Testing

Unit-testable (pytest, following existing test file conventions):

- `DATA_DIR` resolves from env var when set, falls back to `"data"` otherwise.
- Auth middleware: request without cookie → redirected/401 when `APP_PASSWORD` set; request passes through unmodified when `APP_PASSWORD` unset; valid cookie → request passes through; tampered/expired cookie → redirected/401.
- `POST /login` — correct password sets cookie and redirects; wrong password re-shows the form without setting a cookie.
- `transcribe_project` returns 503 (not 500) when `transcribe.transcribe_file` raises `ImportError` (mocked).

Not testable via pytest — verified manually once deployed:

- Railway build actually succeeds from the Dockerfile and `ffmpeg`/`ffprobe` resolve on PATH inside the container. Since piece 2 (upload flow) hasn't landed yet, there's no way to get new media onto the server remotely — verify this instead via a quick check that the binaries exist in the running container (e.g. Railway's shell/exec, or a temporary health-check route).
- Volume persistence across a redeploy (create a project, redeploy, confirm it's still there).
- Real login flow in a browser (cookie set, persists across tabs/sessions, expires after ~30 days).

I'll walk through this manual checklist with you once you've connected Railway and set the env vars, and report exactly what passed.
