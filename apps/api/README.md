# Fitfo API

FastAPI backend for Fitfo. This service handles phone-based auth, TikTok workout ingestion, saved workouts, and per-user workout history.

## Run locally

Use Python 3.12 when possible.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: `GET http://localhost:8000/health`

## Required env vars

Add these to `apps/api/.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SERVICE_SID`
- `TWILIO_VERIFY_FRIENDLY_NAME`

To confirm the droplet’s `.env` matches a working Twilio account (does not print secrets):

```bash
cd apps/api && ./venv/bin/python check_twilio_env.py
```

- `APP_JWT_SECRET`
- `APP_JWT_EXPIRES_IN_SECONDS`

Optional:

- `SUPABASE_STORAGE_BUCKET` if you do not want to use the default `raw-media` bucket
- `OPENAI_TRANSCRIBE_MODEL` to override the transcription model, default `gpt-4o-mini-transcribe`
- `OPENAI_PARSE_MODEL` to override the workout parser model, default `gpt-4.1-mini`
- `OPENAI_VISION_MODEL` to override the OCR vision model, default `gpt-4.1-mini`
- `ENABLE_FRAME_OCR` to disable frame OCR by setting it to `0`
- `FITFO_PRO_BYPASS_USER_IDS`, `FITFO_PRO_BYPASS_EMAILS`, `FITFO_PRO_BYPASS_PHONES` (comma-, newline-, or semicolon-separated lists) so listed team accounts get `fitfo_pro_bypass: true` in API responses. There is no in-code allowlist — if none of these env vars are set, every account is gated by the normal RevenueCat paywall.

## Database setup

Run these SQL files in the Supabase SQL editor, in order:

1. `sql/002_profiles.sql`
2. `sql/004_profiles_backend_auth.sql`
3. `sql/005_workout_persistence.sql`
4. `sql/006_profile_onboarding.sql`
5. `sql/007_body_weight_entries.sql`
6. `sql/008_scheduled_workouts.sql` *(calendar `scheduled_workouts` table + RLS)*
7. `sql/009_apple_auth.sql` *(Apple Sign-In column on `profiles`, if needed)*
8. `sql/010_profile_onboarding_custom_split.sql`
9. `sql/013_saved_scheduled_thumbnail.sql` *(adds optional `thumbnail_url` on `saved_workouts` and `scheduled_workouts` — required for API + calendar cards)*
10. `sql/014_profile_onboarding_sex.sql`
11. `sql/015_scheduled_workouts_thumbnail_url_fix.sql` *(idempotent redo of thumbnail columns — run if listings fail with Postgres `42703` / `thumbnail_url does not exist`)*
12. `sql/011_creator_corpus.sql` *(creates pgvector + creator-corpus tables)*
13. `sql/012_corpus_retrieval.sql` *(creates `match_content_chunks` RPC for chat)*

If you see **`scheduled_workouts.thumbnail_url does not exist`** (error `42703`) on scheduled workouts: open the Supabase SQL editor once and execute **`sql/015_scheduled_workouts_thumbnail_url_fix.sql`** *(or equivalently **`sql/013_saved_scheduled_thumbnail.sql`** — both use `IF NOT EXISTS`)*.

`sql/003_profiles_auth_link.sql` is legacy and only applies to an older `auth.users`-linked profile setup. The current backend OTP flow uses `sql/004_profiles_backend_auth.sql`, which preserves `profiles` data and detaches any stale `auth.users` linkage instead of dropping the table.

`005_workout_persistence.sql` adds account-scoped workout persistence:

- `user_id` ownership columns on `ingestion_jobs` and `workouts`
- `saved_workouts` for Save Workout for Later
- `completed_workouts` for workout history and summary pages
- indexes and `updated_at` triggers for the new tables
- per-user RLS policies keyed off `auth.uid()`
- repair logic for older installs where `ingestion_jobs.user_id` or `workouts.user_id` still referenced a legacy `users` table

## Auth flow

- `POST /auth/account-status` checks whether a normalized phone number already has an account
- `POST /auth/send-otp` sends the verification code
- `POST /auth/verify-otp` verifies the code and returns the backend bearer token
- `GET /auth/me` restores the current user from that bearer token
- `PUT /auth/onboarding` saves the first-run onboarding profile for the authenticated user

The mobile app stores only the auth session locally. Workout data now loads from the backend after login, so saved workouts and history survive logout/login and device changes.

## Workout persistence endpoints

These endpoints require the backend bearer token in `Authorization: Bearer <token>`.

- `POST /ingest`
- `GET /jobs/{job_id}`
- `GET /jobs/{job_id}/workout`
- `GET /saved-workouts`
- `POST /saved-workouts`
- `DELETE /saved-workouts/{saved_workout_id}`
- `GET /completed-workouts`
- `GET /completed-workouts/{completed_workout_id}`
- `POST /completed-workouts`
- `DELETE /completed-workouts/{completed_workout_id}`
- `GET /body-weight`
- `POST /body-weight`

The backend uses the authenticated profile id to scope every workout read/write so users can only access their own saved workouts, imported workouts, and completed workout logs.

## Media dependencies

`ffmpeg` and `ffprobe` are required for audio extraction and frame sampling.

```bash
brew install ffmpeg
```

The ingestion flow uses the original simpler pipeline:

- download the source video
- extract the full audio track with `ffmpeg`
- sample frames about once per second with `ffmpeg`/`ffprobe`
- run best-effort OpenAI vision OCR over those sampled frames
- transcribe audio with OpenAI when an audio stream is available
- merge transcript, on-screen text, and caption into one evidence object before parsing workout JSON with OpenAI
- return an empty workout plan with a parser reason when no exact exercise names are detected

OCR and transcription stay best-effort in v1. If frame sampling, audio extraction,
or an OpenAI request fails, the job continues with the remaining evidence instead
of inventing fallback exercises.

Expect OCR-enabled imports to add some latency and model cost versus the
audio-only pipeline, especially on longer reels with all configured providers
available.

## Creator corpus (TikTok knowledge base)

Separate ingestion path that crawls a coach's whole TikTok profile and stores
transcripts + LLM-chunked, LLM-tagged, OpenAI-embedded knowledge in Postgres
(pgvector). Powers a future RAG chatbot that answers in the coach's voice.

### Schema

`sql/011_creator_corpus.sql` adds (RLS deny-all, service role only):

- `creators` — one row per coach `(platform, handle)`
- `content_sources` — one row per source video, holds `transcript`
- `content_chunks` — retrieval chunks with locked-enum tags
- `content_embeddings` — `vector(1536)` per chunk, HNSW + cosine index

### Pipeline

```
discover (Apify clockworks/tiktok-scraper)
  → transcribe (TikWM + ffmpeg + OpenAI Whisper)
  → chunk (OpenAI gpt-4.1-mini → 1-4 sentence chunks)
  → tag (OpenAI gpt-4.1-mini → exercise/muscle_group/equipment/goal)
  → embed (OpenAI text-embedding-3-small)
  → human approval queue (admin UI)
```

Each phase is idempotent — re-running picks up where it stopped.

### Run it

```bash
cd apps/api
python -m app.scripts.ingest_creator jacoboestreichercoaching
```

Phase-by-phase (useful when iterating on prompts):

```bash
python -m app.scripts.ingest_creator jacoboestreichercoaching --phase discover
python -m app.scripts.ingest_creator jacoboestreichercoaching --phase transcribe
python -m app.scripts.ingest_creator jacoboestreichercoaching --phase chunk
python -m app.scripts.ingest_creator jacoboestreichercoaching --phase tag
python -m app.scripts.ingest_creator jacoboestreichercoaching --phase embed
```

### Admin endpoints

All gated behind `CORPUS_ADMIN_ENABLED=1`. Returns 503 when not enabled.

- `POST /admin/corpus/ingest-creator` — `{handle, results_per_page, run_full_pipeline}`
- `GET /admin/corpus/chunks?status=pending,needs_review` — review queue
- `POST /admin/corpus/chunks/{id}/review` — `{action, chunk_text?, ...edits}`
- `GET /admin/corpus/sources` / `GET /admin/corpus/sources/{id}` — debugging

### Web review UI

`apps/web/src/app/admin/review` — only renders when
`NEXT_PUBLIC_CORPUS_ADMIN_ENABLED=1` is set in `apps/web/.env`. Approves /
rejects / edits chunks via the admin endpoints above.

### Chat (RAG) endpoint

Once chunks are approved, `POST /chat` answers user questions grounded in
those chunks:

```
POST /chat
{
  "message": "How do I make my triceps bigger?",
  "history": [],
  "muscle_groups": ["arms"],   // optional hard filter
  "goals": ["hypertrophy"],    // optional hard filter
  "top_k": 8                   // default 8
}
→ { answer, citations: [...], retrieval: [...], model }
```

Pipeline: query → embed → pgvector cosine search via `match_content_chunks`
RPC → top-K approved chunks → `gpt-4.1-mini` synthesizes an answer in the
coach's voice with inline `[1] [2]` citations. Override the synthesis model
with `OPENAI_CHAT_MODEL=...` in `.env`.

Same `CORPUS_ADMIN_ENABLED=1` gate as the admin endpoints — flip to a
profile-allowlist `Depends` when you ship chat to real users.

Web UI lives at `apps/web/src/app/chat`.

## Docs

Interactive docs: `http://localhost:8000/docs`
