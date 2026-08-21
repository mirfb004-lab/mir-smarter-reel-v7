# AI Adaptive Video Publisher — Implementation Plan

A self-improving video publishing platform. Every run observes → analyzes → learns → generates → publishes → collects analytics → learns again. Built on TanStack Start + Lovable Cloud (Postgres + Auth + server functions) + Lovable AI Gateway (Gemini for vision + text) + Buffer API.

---

## 1. Overall Architecture

```text
┌─────────────────────────────────────────────────────────┐
│  Browser (React 19 + TanStack Router + shadcn/ui)       │
│  Dashboard · Queue · Sheet · Learning · Settings · Auth │
└───────────────┬─────────────────────────────────────────┘
                │ typed RPC (createServerFn)
┌───────────────▼─────────────────────────────────────────┐
│  TanStack Start server (Cloudflare Worker)              │
│  ├─ Server functions (auth-scoped, RLS as user)         │
│  │    queue, settings, memory, sheet, manual-run        │
│  ├─ Public server routes /api/public/*                  │
│  │    /cron/tick   (pg_cron → runs due schedules)       │
│  │    /webhooks/buffer (optional)                       │
│  └─ Run Orchestrator (state machine, idempotent)        │
└───────────────┬───────────────────────────────────────┬─┘
                │                                       │
        ┌───────▼────────┐                    ┌─────────▼────────┐
        │ Lovable Cloud  │                    │ External APIs    │
        │ Postgres + RLS │                    │ Buffer GraphQL   │
        │ pg_cron        │                    │ Lovable AI GW    │
        └────────────────┘                    │  (Gemini vision) │
                                              │ Cloudinary (CDN) │
                                              └──────────────────┘
```

Modules (each isolated behind a server-fn file):
Auth · Buffer · Scheduler · Queue · VideoAnalysis · LearningEngine · CaptionGenerator · Publishing · Analytics · Sheet · Settings · Exports · Logs · Notifications.

---

## 2. Database Schema

All tables in `public`, RLS ON, `auth.uid()`-scoped, GRANTs to `authenticated` + `service_role`.

- **profiles** (id=auth.users.id, display_name, timezone, created_at)
- **buffer_credentials** (id, user_id, api_token [encrypted], graphql_endpoint, label, last_tested_at, status)
- **channels** (id, user_id, buffer_channel_id, platform [tiktok|instagram|youtube|…], name, active)
- **ai_settings** (id, user_id, objective enum + custom_text, brand_tone, language, default_hashtags[], max_caption_len, temperature, model, platform_rules jsonb)
- **analysis_settings** (id, user_id, scope enum [last_n|top_n|highest_engagement|…], n_value, custom_query)
- **schedules** (id, user_id, channel_id, mode [interval|daily_times|manual], interval_hours, daily_times time[], next_run_at, active)
- **video_queue** (id, user_id, channel_id, position, cloudinary_url, status [pending|processing|done|failed|skipped], added_at)
- **runs** (id, user_id, channel_id, run_number, queue_item_id, status [pending|analyzing|generating|publishing|awaiting_analytics|complete|failed], started_at, finished_at, duration_ms, error, strategy_used, next_strategy)
- **video_analyses** (id, run_id, summary, objects[], people, scene, actions, emotions, topic, story, message, raw jsonb)
- **captions** (id, run_id, text, hooks, cta, hashtags[], emojis, length, style_tags[])
- **published_posts** (id, run_id, buffer_post_id, channel_id, platform, posted_at, permalink)
- **post_analytics** (id, published_post_id, fetched_at, views, likes, comments, shares, saves, reach, impressions, raw jsonb)
- **learning_reports** (id, run_id, worked bool, hook_verdict, length_verdict, emoji_verdict, hashtag_verdict, cta_verdict, cause, change_recommendation, raw jsonb)
- **memory_insights** (id, user_id, channel_id nullable, category [hook|length|emoji|hashtag|cta|topic|style|timing], insight text, confidence, support_count, last_reinforced_at, active)
- **settings** (id, user_id, max_retries, retry_interval_s, analytics_delay_h, rate_limit_per_min, notifications jsonb)
- **logs** (id, user_id, run_id nullable, level, module, message, meta jsonb, created_at)

Relationships: user → all; channel → queue/schedule/run/post; run → analysis/caption/post/report; post → analytics; user → memory_insights.

---

## 3. Scheduler Design

- `pg_cron` job every 5 min → HTTP POST via `pg_net` to `/api/public/cron/tick` with shared secret.
- Handler: `SELECT ... FROM schedules WHERE active AND next_run_at <= now() FOR UPDATE SKIP LOCKED`, enqueue a run per row, advance `next_run_at` from mode.
- Manual run: authenticated server fn inserts a `runs` row and invokes orchestrator inline.
- Interval + daily-times + custom expressions all normalized to `next_run_at`.

## 4. Queue Engine

- Ordered by `position`. `claim_next(channel_id)` = `UPDATE ... status='processing' WHERE id = (SELECT ... status='pending' ORDER BY position LIMIT 1 FOR UPDATE SKIP LOCKED)`.
- On success → `done`. On failure → retry counter, then `failed` (queue never loses progress; run is resumable by state).

## 5. Learning Engine

Two layers:
1. **Per-run learning report** (structured JSON from Gemini, stored in `learning_reports`).
2. **Durable memory** (`memory_insights`): each insight has confidence + support_count. New reports either reinforce (support_count++, confidence rebalanced) or contradict (confidence↓, deactivate below threshold). Deduped via embeddings-lite (normalized text + category key). Reset/export/import/view supported.

Caption generation prompt always includes: objective, brand voice, top-K active insights (by confidence × recency), last N captions + their analytics, current video summary.

## 6. AI Prompt Strategy (Lovable AI Gateway)

Model: `google/gemini-3-flash-preview` (default; vision + text in one).

- **Vision pass**: chat completion with `image_url`/video frame URL (Cloudinary can produce thumbnails; for full video understanding we sample 3–5 frames via Cloudinary transformations `so_auto`, `w_512`). Structured output via `Output` schema → video_analyses row.
- **Analysis pass**: input = prior caption + analytics → structured learning_report.
- **Caption pass**: input = objective + brand + memory insights + last-N captions/analytics + current video summary → `{caption, hooks, cta, hashtags[], style_tags[]}` with platform rules enforced (length, hashtag caps).
- All model calls run inside `createServerFn` handlers; `LOVABLE_API_KEY` read from `process.env` inside handler.

## 7. Buffer Integration

- Buffer GraphQL API (`https://graphql.buffer.com`) with Bearer token from `buffer_credentials`.
- Operations: `createPost` (mutation with channel, media URL, text, schedule=now), `getPost`, `getPostAnalytics`. Wrapped in a `buffer.functions.ts` module with typed inputs, retry+backoff, error normalization.
- Test Connection button = `viewer { id }` query.
- Token stored via Cloud secret (per-user encrypted column with app-level AES using `ENCRYPTION_KEY` secret).

## 8. Video Analysis Architecture

- Frame sampler (Cloudinary URL transforms) → 3–5 stills.
- Multi-image chat completion → structured summary.
- Fallback: single mid-frame if video too short.
- Result cached per `cloudinary_url` hash to avoid re-analysis.

## 9. State Machine (per run)

```text
pending → analyzing → generating → publishing → awaiting_analytics → complete
              │           │            │                │
              └───────────┴────────────┴────────► failed (with reason, retryable)
```

Each transition is a single SQL update guarded by expected prior state (optimistic). Orchestrator is idempotent: safe to re-invoke a stuck run.

## 10. Error Recovery

- Retry with exponential backoff for network/AI/Buffer errors (config: max_retries, retry_interval_s).
- Analytics fetch delayed by `analytics_delay_h` (default 24h) — a follow-up scheduled job re-reads `published_posts` missing recent analytics.
- Invalid Cloudinary URL → mark queue item `failed`, log, continue to next.
- Scheduler interruption: `SKIP LOCKED` + `next_run_at` guarantees no double-publish.

## 11. Security

- Supabase Auth (email/password + Google via broker).
- RLS everywhere; `has_role()` pattern; roles in separate `user_roles` table.
- Buffer token encrypted at rest.
- `/api/public/cron/tick` verifies shared secret header (`CRON_SECRET`) with `timingSafeEqual`.
- Input validation with Zod on every server fn.
- No secrets in client bundle; publishable Supabase key only.

## 12. API Contracts (server functions)

- `queue.add(urls[])`, `queue.reorder(id, position)`, `queue.remove(id)`, `queue.list()`
- `buffer.testConnection(credId)`, `buffer.saveCredentials(...)`, `channels.list/create/delete`
- `settings.getAll`, `settings.updateAI`, `settings.updateAnalysis`, `settings.updateGeneral`
- `schedule.upsert(...)`, `schedule.pause(id)`
- `runs.manualTrigger(channelId)`, `runs.list({filters})`, `runs.get(id)`
- `sheet.rows({search, sort, filter, page})`, `sheet.export(format)`
- `memory.list`, `memory.reset`, `memory.export`, `memory.import(json)`
- `analytics.refresh(postId)`
- Public routes: `POST /api/public/cron/tick`

## 13. UI / Pages

- `/auth` (public), `/_authenticated/` gate
- `/` Dashboard (widgets listed in spec)
- `/queue` URL paste + reorder
- `/sheet` full table (TanStack Table: search/sort/filter/paginate/export CSV·XLSX·JSON, live via query invalidation)
- `/learning` memory browser + reset/export/import
- `/settings/buffer`, `/settings/ai`, `/settings/analysis`, `/settings/scheduler`, `/settings/general`
- `/runs/:id` run detail (analysis, caption, publish, analytics, learning report)

Design system: dark modern SaaS, semantic tokens in `src/styles.css`, shadcn components, no hardcoded colors.

## 14. Future Scalability

- Multi-channel per user (already modeled).
- Per-channel memory namespacing (channel_id on insights).
- Model swap via `ai_settings.model` (allowlisted).
- Queue partitioning by channel; workers via multiple cron ticks.
- Optional embeddings table for smarter insight dedupe later.

## 15. Risks & Missing Requirements

- **Buffer analytics coverage varies by platform** — some metrics unavailable; UI must show "n/a" gracefully.
- **Video vision cost** — sampling frames keeps token cost bounded; cache aggressively.
- **Cron cadence** — pg_cron 5-min tick means schedule granularity ≥5 min (acceptable given hourly/daily use cases).
- **Timezone handling** — all times stored UTC; daily_times evaluated in user's TZ.
- **Rate limits** — Buffer + AI Gateway 429 handling surfaced in UI.
- **Cold-start Phase 1** — no analytics yet → caption prompt runs with objective + brand + video summary only.

## 16. Suggested Improvements (defer unless asked)

- A/B caption variants + pick winner post-analytics.
- Auto-hashtag research per topic.
- Slack/email notifications on run complete/fail.
- Best-time-to-post heuristic from analytics history.

## 17. Build Order (after approval)

1. Enable Lovable Cloud, migrations (schema + RLS + grants + pg_cron), auth.
2. Settings pages + Buffer credential + test connection.
3. Queue page + URL ingest.
4. Buffer publish module (manual publish end-to-end).
5. Video analysis + caption generation (Phase 1 loop).
6. Learning engine + memory (Phase 2 loop).
7. Analytics fetch + delayed job.
8. Scheduler (pg_cron + tick route).
9. Sheet page (table + exports).
10. Dashboard widgets.
11. Logs, notifications, polish.

---

**Please approve or request changes.** On approval I'll start at step 1 (enable Cloud + schema).
