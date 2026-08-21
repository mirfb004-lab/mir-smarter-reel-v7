// Prediction Engine — forecasts per-post metrics before publish, and
// later scores accuracy after analytics arrive.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { executeAIRequest, type AISettingsSchema } from "./ai-gateway.server";
import { withRetry, audit } from "./reliability.server";

type Sb = SupabaseClient;

export interface Prediction {
  views: number; likes: number; comments: number;
  shares: number; saves: number; reach: number;
  confidence: number; rationale: string;
}

export async function predictMetrics({
  sb, userId, runId, aiSettings, strategy, videoSummary, baseline,
}: {
  sb: Sb; userId: string; runId: string;
  aiSettings: AISettingsSchema;
  strategy: any; videoSummary: any;
  baseline: { views: number; likes: number; comments: number; shares: number; saves: number; reach: number };
}): Promise<{ prediction: Prediction; predictionId: string }> {
  const prompt = `Predict analytics for this post. Return ONLY compact JSON:
{ "views": int, "likes": int, "comments": int, "shares": int, "saves": int, "reach": int, "confidence": 0..1, "rationale": "..." }

Baseline (recent rolling averages): ${JSON.stringify(baseline)}
Strategy chosen: ${JSON.stringify(strategy)}
Video understanding: ${JSON.stringify(videoSummary)}

Predictions must be non-negative integers grounded in the baseline. Confidence reflects how sure you are; lower it on cold-start or unusual content.`;

  const t0 = Date.now();
  const result = await withRetry("ai",
    async () => executeAIRequest(aiSettings, (model) =>
      generateText({ model, temperature: 0.3, prompt })),
    async (attempt, err, durationMs) => {
      await audit(sb, {
        userId, runId, eventType: err ? "ai.retry" : "ai.response",
        module: "ai", attempt, status: err ? "error" : "success", durationMs,
        error: err instanceof Error ? err.message : err ? String(err) : null,
        payload: { purpose: "prediction", mode: aiSettings.mode },
      });
    },
  );
  let parsed: any = {};
  try { parsed = JSON.parse(result.text.replace(/^```json\s*/i,"").replace(/```$/,"").trim()); }
  catch { parsed = {}; }

  const clamp = (n: any) => Math.max(0, Math.round(Number(n) || 0));
  const pred: Prediction = {
    views: clamp(parsed.views), likes: clamp(parsed.likes),
    comments: clamp(parsed.comments), shares: clamp(parsed.shares),
    saves: clamp(parsed.saves), reach: clamp(parsed.reach),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
    rationale: String(parsed.rationale ?? ""),
  };

  const { data: row, error } = await sb.from("predictions").insert({
    user_id: userId, run_id: runId,
    predicted_views: pred.views, predicted_likes: pred.likes,
    predicted_comments: pred.comments, predicted_shares: pred.shares,
    predicted_saves: pred.saves, predicted_reach: pred.reach,
    confidence: pred.confidence, rationale: pred.rationale,
    raw: parsed as never,
  }).select("id").single();
  if (error || !row) throw new Error(`prediction insert: ${error?.message}`);
  await sb.from("runs").update({ prediction_id: row.id }).eq("id", runId);
  await audit(sb, { userId, runId, eventType: "prediction.saved", module: "prediction", status: "success", durationMs: Date.now() - t0 });
  return { prediction: pred, predictionId: row.id };
}

// Rolling baseline from recent post_analytics for this user.
export async function computeBaseline(sb: Sb, userId: string, lookback = 10) {
  const { data } = await sb.from("post_analytics")
    .select("views,likes,comments,shares,saves,reach")
    .eq("user_id", userId).order("captured_at", { ascending: false }).limit(lookback);
  const rows = data ?? [];
  const n = Math.max(1, rows.length);
  const avg = (k: keyof typeof rows[number]) =>
    Math.round(rows.reduce((a, r) => a + (Number((r as any)[k]) || 0), 0) / n);
  return {
    views: avg("views"), likes: avg("likes"), comments: avg("comments"),
    shares: avg("shares"), saves: avg("saves"), reach: avg("reach"),
    sample: rows.length,
  };
}

// Score prediction vs actual once analytics land. 1.0 = perfect, 0 = way off.
export async function evaluatePrediction(sb: Sb, predictionId: string, actual: {
  views?: number | null; likes?: number | null; comments?: number | null;
  shares?: number | null; saves?: number | null; reach?: number | null;
}) {
  const { data: p } = await sb.from("predictions").select("*").eq("id", predictionId).maybeSingle();
  if (!p) return;
  const pairs: Array<[number, number]> = [
    [p.predicted_views ?? 0, actual.views ?? 0],
    [p.predicted_likes ?? 0, actual.likes ?? 0],
    [p.predicted_comments ?? 0, actual.comments ?? 0],
    [p.predicted_shares ?? 0, actual.shares ?? 0],
    [p.predicted_saves ?? 0, actual.saves ?? 0],
    [p.predicted_reach ?? 0, actual.reach ?? 0],
  ];
  // Symmetric MAPE-style score per metric, averaged.
  const scores = pairs.map(([pv, av]) => {
    const denom = Math.max(1, (pv + av) / 2);
    const err = Math.abs(pv - av) / denom;
    return Math.max(0, 1 - err);
  });
  const accuracy = scores.reduce((a, s) => a + s, 0) / scores.length;
  await sb.from("predictions").update({
    actual_views: actual.views ?? null, actual_likes: actual.likes ?? null,
    actual_comments: actual.comments ?? null, actual_shares: actual.shares ?? null,
    actual_saves: actual.saves ?? null, actual_reach: actual.reach ?? null,
    accuracy_score: Number(accuracy.toFixed(3)),
    evaluated_at: new Date().toISOString(),
  }).eq("id", predictionId);
}
