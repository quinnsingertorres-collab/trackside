# Trackside

A spotting log for the MBTA's Red, Orange, Blue, and Green Line fleets. Every
currently-rostered car (957 of them, per public MBTA rolling-stock records)
has its own page; photos attach to the exact car they were shot on.

Built with Next.js (App Router) and [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
for photo + metadata storage — no separate database to provision.

## Architecture in brief

- `lib/roster-data.json` — the static fleet roster (also served as-is at `/roster.json`).
- `lib/photos-store.js` — reads/writes photo metadata as a single JSON index
  in Blob storage (`data/photos-index.json`), with etag-based
  compare-and-set so two near-simultaneous uploads don't clobber each other.
  Fine for a small, low-traffic invite-only gallery; if this ever needs to
  handle real concurrent write volume, swap this module for a proper
  database (Vercel Postgres, Upstash Redis, etc.) — the API routes that call
  it wouldn't need to change.
- `app/api/photos/route.js` — `GET` (public, optionally `?carId=`) and
  `POST` (upload, multipart form: `carId`, `file`, `caption`,
  `photographer`, `location`, `date`).
- `app/api/photos/[id]/route.js` — `DELETE`.
- Reads are fully public and unauthenticated on purpose — that's what lets
  another app (or a script) pull the feed later. Writes (`POST`/`DELETE`)
  are gated by a single shared passphrase via the `UPLOAD_PASSWORD` env var
  (sent as the `x-upload-password` header) — not real per-user accounts.
  Good enough for "me and people I invite"; swap in real auth if that ever
  needs to change.

### The public feed, for building something else on top

- `GET /api/photos` → `{ photos: [...] }`, newest first, each with `url`
  pointing at the actual image.
- `GET /api/photos?carId=Red-1857` → just that car's photos.
- `GET /roster.json` → the full fleet roster (car number, line, series,
  manufacturer, year, status).

Both are plain public JSON with no auth required to read — safe to point a
second app (a FlightRadar24-style viewer, say) at directly.

## Deploying

You'll need a GitHub account and a Vercel account (Vercel's free tier is
enough for this). Run these from a machine that's actually logged into both
— not from here.

### 1. Push to GitHub

```bash
cd trackside-app
gh auth login              # if you haven't already; follow the prompts
gh repo create trackside --private --source=. --remote=origin --push
```

(No `gh`? Create an empty repo at github.com/new, then:
`git remote add origin git@github.com:<you>/trackside.git && git push -u origin main`.)

### 2. Link and deploy on Vercel

```bash
npm i -g vercel             # if you haven't already
vercel login
vercel link                 # creates/links a Vercel project for this folder
```

Then, in the Vercel dashboard for that project: **Storage → Create Database
→ Blob**, and connect it to the project. That sets `BLOB_READ_WRITE_TOKEN`
for you automatically — no manual copying needed. While you're there,
**Settings → Environment Variables**, optionally add `UPLOAD_PASSWORD` with
whatever passphrase you want to hand out to people you invite.

```bash
vercel --prod
```

### 3. Connect the GitHub repo for auto-deploy

In the Vercel dashboard: **Project Settings → Git → Connect Git Repository**,
pick the repo you just pushed. From then on, every `git push` to `main`
auto-deploys — no need to run `vercel --prod` by hand again.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in BLOB_READ_WRITE_TOKEN (see above)
npm run dev
```

Without `BLOB_READ_WRITE_TOKEN` set, the app still runs but uploads will
fail — browsing the roster works regardless since it's static data.
