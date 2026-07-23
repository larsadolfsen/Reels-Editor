# Deploying to Railway

This app deploys to Railway as a GitHub-connected service using the repo's `Dockerfile`.

## One-time setup (in the Railway dashboard, not from this repo)

1. Create a new Railway project, connect it to this GitHub repo, and let Railway build from `Dockerfile`.
2. Attach a Volume to the service, mounted at `/data`.
3. Set service environment variables:
   - `DATA_DIR=/data`
   - `APP_PASSWORD=<a password only you know>`
   - `SESSION_SECRET=<a long random string>` — generate one with `python -c "import secrets; print(secrets.token_hex(32))"`
4. Deploy. Railway sets `PORT` automatically; the Dockerfile's `CMD` already reads it.

## What's not included yet

- Transcription (auto-captions) is disabled on this deployment — it returns `503` (see `app/transcribe.py`/`app/main.py`'s `transcribe_project`). Desktop use with the `ml` extra installed is unaffected.
- No way to import new media from the deployed app yet — the native file-picker (`app/media.py`'s `pick_file`/`pick_files`) only works when the server runs on your own machine. Remote media upload is piece 2 of the Android-app project (see `docs/superpowers/specs/2026-07-23-cloud-hosting-auth-design.md`).

## Manual verification checklist (do this once deployed)

- [ ] Visit the Railway URL — you're redirected to `/login`.
- [ ] Enter the wrong password — redisplays the form with an error, no cookie set.
- [ ] Enter the correct password — redirected to `/`, the editor loads, cookie persists across a page reload.
- [ ] Create a project, trigger a redeploy from Railway, confirm the project is still there (volume persistence).
- [ ] Confirm `ffmpeg`/`ffprobe` are on PATH inside the container (Railway's shell/exec into the running service, run `ffmpeg -version`).
