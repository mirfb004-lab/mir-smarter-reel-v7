// Reliability primitives: retry policies, channel locks, audit trail, prompt versions.
// Server-only. Do NOT import from client bundles.
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient;

// -------- Retry policies (per module) --------
export type RetryModule = "ai" | "buffer" | "cloudinary" | "db";

interface RetryPolicy {
  attempts: number;
  baseMs: number;
  factor: number;
  maxMs: number;
  jitter: boolean;
  retryOn?: (err: unknown) => boolean;
}

const POLICIES: Record<RetryModule, RetryPolicy> = {
  ai:         { attempts: 4, baseMs: 800,  factor: 2,   maxMs: 8000,  jitter: true },
  buffer:     { attempts: 4, baseMs: 1000, factor: 2,   maxMs: 10000, jitter: true },
  cloudinary: { attempts: 3, baseMs: 400,  factor: 1.8, maxMs: 3000,  jitter: true },
  db:         { attempts: 3, baseMs: 100,  factor: 2,   maxMs: 800,   jitter: false },
};

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export async function withRetry<T>(
  module: RetryModule,
  fn: (attempt: number) => Promise<T>,
  onAttempt?: (attempt: number, err: unknown | null, durationMs: number) => Promise<void>,
): Promise<T> {
  const p = POLICIES[module];
  let lastErr: unknown;
  for (let attempt = 1; attempt <= p.attempts; attempt++) {
    const t0 = Date.now();
    try {
      const out = await fn(attempt);
      if (onAttempt) await onAttempt(attempt, null, Date.now() - t0);
      return out;
    } catch (err) {
      lastErr = err;
      if (onAttempt) await onAttempt(attempt, err, Date.now() - t0);
      if (p.retryOn && !p.retryOn(err)) throw err;
      if (attempt >= p.attempts) throw err;
      const backoff = Math.min(p.maxMs, p.baseMs * Math.pow(p.factor, attempt - 1));
      const wait = p.jitter ? Math.floor(backoff * (0.5 + Math.random())) : backoff;
      await sleep(wait);
    }
  }
  throw lastErr;
}

// -------- Audit trail --------
export interface AuditEvent {
  userId: string;
  runId?: string | null;
  queueItemId?: string | null;
  eventType: string;
  module?: string | null;
  attempt?: number;
  status?: "success" | "error" | "skipped" | "info";
  durationMs?: number | null;
  payload?: unknown;
  error?: string | null;
}
export async function audit(sb: Sb, e: AuditEvent) {
  try {
    await sb.from("audit_events").insert({
      user_id: e.userId,
      run_id: e.runId ?? null,
      queue_item_id: e.queueItemId ?? null,
      event_type: e.eventType,
      module: e.module ?? null,
      attempt: e.attempt ?? 0,
      status: e.status ?? "info",
      duration_ms: e.durationMs ?? null,
      payload: (e.payload ?? null) as never,
      error: e.error ?? null,
    });
  } catch {
    // Never let audit failure break the pipeline.
  }
}

// -------- Channel lock --------
const LOCK_TTL_SECONDS = 15 * 60;

export async function acquireChannelLock(sb: Sb, channelId: string, runId: string): Promise<boolean> {
  const { data, error } = await sb.rpc("try_claim_channel_lock", {
    _channel_id: channelId, _run_id: runId, _ttl_seconds: LOCK_TTL_SECONDS,
  });
  if (error) throw new Error(`lock: ${error.message}`);
  return Boolean(data);
}
export async function releaseChannelLock(sb: Sb, channelId: string, runId: string) {
  await sb.rpc("release_channel_lock", { _channel_id: channelId, _run_id: runId });
}
export async function refreshHeartbeat(sb: Sb, runId: string, channelId?: string | null) {
  const now = new Date().toISOString();
  await sb.from("runs").update({ heartbeat_at: now }).eq("id", runId);
  if (channelId) {
    await sb.from("channels")
      .update({ lock_expires_at: new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString() })
      .eq("id", channelId).eq("active_run_id", runId);
  }
}

// -------- Prompt versions --------
export interface PromptVersion {
  id: string;
  name: string;
  version: number;
  vision_prompt: string;
  learning_prompt: string;
  caption_prompt: string;
}
const FALLBACK_PROMPTS: PromptVersion = {
  id: "builtin-default",
  name: "default",
  version: 1,
  vision_prompt:
    'Analyze this short-form video (frames sampled below). Return STRICT JSON only, no prose, matching this shape: {"summary":string,"objects":string[],"people":string,"scene":string,"actions":string[],"emotions":string[],"topic":string,"story":string,"message":string}',
  learning_prompt:
    "You are a social-media performance analyst. Given the previous post's caption and metrics, produce STRICT JSON only with fields: worked, hook_verdict, length_verdict, emoji_verdict, hashtag_verdict, cta_verdict, cause, change_recommendation, new_insights[]{category,insight,confidence}",
  caption_prompt:
    'You are Loop, an adaptive short-form caption engine. Blend objective, brand tone, durable learnings, and current video understanding. Return STRICT JSON only: {"caption":string,"hook":string,"cta":string,"hashtags":string[],"style_tags":string[]}',
};

export async function getActivePromptVersion(sb: Sb, userId: string): Promise<PromptVersion> {
  // Prefer user-owned active row, fall back to system default.
  const { data: mine } = await sb.from("prompt_versions")
    .select("id,name,version,vision_prompt,learning_prompt,caption_prompt")
    .eq("user_id", userId).eq("active", true)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (mine) return mine as PromptVersion;
  const { data: sys } = await sb.from("prompt_versions")
    .select("id,name,version,vision_prompt,learning_prompt,caption_prompt")
    .is("user_id", null).eq("active", true)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  if (sys) return sys as PromptVersion;
  // Never block a run: use built-in prompts when no row exists.
  return FALLBACK_PROMPTS;
}


// -------- Idempotency helpers --------
export function makeIdempotencyKey(parts: Array<string | number>): string {
  return parts.filter(Boolean).join("::");
}
