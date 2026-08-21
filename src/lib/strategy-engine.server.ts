// Strategy Engine — turns memory + analytics + video understanding into
// a structured decision the Caption Generator follows.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { executeAIRequest, type AISettingsSchema } from "./ai-gateway.server";
import { withRetry, audit } from "./reliability.server";

type Sb = SupabaseClient;

export interface StrategyDecision {
  hook_style: string;         // curiosity | question | shock | listicle | story | promise | contrarian
  caption_length: string;     // micro | short | medium | long
  cta_type: string;           // question | link | tag | share | none
  emoji_level: string;        // none | low | medium | high
  storytelling: boolean;
  education_level: string;    // none | light | deep
  hashtag_count: number;
  tone: string;
  posting_time_hint: string | null;
  reasoning: string;
}

const OBJECTIVE_WEIGHTS: Record<string, Record<string, number>> = {
  followers:  { shares: 3, saves: 2, comments: 2, reach: 1 },
  likes:      { likes: 1 },
  comments:   { comments: 3, replies: 2 },
  saves:      { saves: 3, shares: 1 },
  shares:     { shares: 3, saves: 1 },
  reach:      { reach: 1, impressions: 0.5, shares: 1 },
  watch_time: { views: 1 },
  ctr:        { clicks: 3, shares: 1 },
  engagement: { likes: 1, comments: 2, shares: 2, saves: 2 },
};

export function objectiveWeights(objective: string): Record<string, number> {
  return OBJECTIVE_WEIGHTS[objective] ?? OBJECTIVE_WEIGHTS.engagement;
}

export function scoreByObjective(objective: string, analytics: Record<string, number | null | undefined>): number {
  const w = objectiveWeights(objective);
  let s = 0;
  for (const [k, weight] of Object.entries(w)) {
    const v = Number(analytics?.[k] ?? 0);
    if (Number.isFinite(v)) s += v * weight;
  }
  return s;
}

export async function decideStrategy({
  sb, userId, runId, aiSettings, objective, videoSummary, memoryTop, trends, recentReports,
}: {
  sb: Sb; userId: string; runId: string;
  aiSettings: AISettingsSchema; objective: string;
  videoSummary: any;
  memoryTop: Array<{ category: string; insight: string; confidence: number }>;
  trends: Array<{ dimension: string; value: string; metric: string; lift_pct: number | null; human_summary: string | null }>;
  recentReports: Array<{ worked: boolean | null; cause: string | null; change_recommendation: string | null }>;
}): Promise<{ decision: StrategyDecision; strategyId: string }> {

  const prompt = `You are the Strategy Engine for an adaptive video publisher.
Return ONLY compact JSON with keys:
{ "hook_style", "caption_length", "cta_type", "emoji_level", "storytelling",
  "education_level", "hashtag_count", "tone", "posting_time_hint", "reasoning" }.

Allowed values:
- hook_style: curiosity | question | shock | listicle | story | promise | contrarian
- caption_length: micro | short | medium | long
- cta_type: question | link | tag | share | none
- emoji_level: none | low | medium | high
- education_level: none | light | deep
- hashtag_count: integer 0..10

OBJECTIVE: Maximize ${objective}. Weight your decision toward metrics that drive this goal.

DURABLE MEMORY (highest confidence first):
${memoryTop.map((m) => `- [${m.category}] ${m.insight} (${Math.round(m.confidence*100)}%)`).join("\n") || "(none — cold start)"}

CROSS-RUN TRENDS:
${trends.map((t) => `- ${t.human_summary ?? `${t.dimension}=${t.value} → ${t.metric} lift ${t.lift_pct}%`}`).join("\n") || "(not enough data yet)"}

LAST FEW LEARNING REPORTS:
${recentReports.map((r) => `- worked=${r.worked} | cause=${r.cause ?? "?"} | change=${r.change_recommendation ?? "?"}`).join("\n") || "(none)"}

CURRENT VIDEO UNDERSTANDING:
${JSON.stringify(videoSummary)}

Choose the strategy most likely to move the ${objective} metric for this specific video, informed by memory and trends. Be decisive; do not hedge.`;

  const t0 = Date.now();
  const result = await withRetry("ai",
    async () => executeAIRequest(aiSettings, (model, ctx) =>
      generateText({ model, temperature: 0.4, prompt })
        .then((r) => ({ ...r, _providerId: ctx.providerId, _modelId: ctx.modelId }))),
    async (attempt, err, durationMs) => {
      await audit(sb, {
        userId, runId, eventType: err ? "ai.retry" : "ai.response",
        module: "ai", attempt, status: err ? "error" : "success", durationMs,
        error: err instanceof Error ? err.message : err ? String(err) : null,
        payload: { purpose: "strategy", mode: aiSettings.mode },
      });
    },
  );


  const rawText = typeof result?.text === "string" ? result.text : "";
  let parsed: any = {};
  try { parsed = JSON.parse(rawText.replace(/^```json\s*/i, "").replace(/```$/,"").trim()); }
  catch { parsed = { reasoning: rawText.slice(0, 400) }; }

  const decision: StrategyDecision = {
    hook_style: String(parsed.hook_style ?? "curiosity"),
    caption_length: String(parsed.caption_length ?? "medium"),
    cta_type: String(parsed.cta_type ?? "question"),
    emoji_level: String(parsed.emoji_level ?? "low"),
    storytelling: Boolean(parsed.storytelling ?? false),
    education_level: String(parsed.education_level ?? "light"),
    hashtag_count: Math.max(0, Math.min(10, Number(parsed.hashtag_count ?? 3))),
    tone: String(parsed.tone ?? "confident"),
    posting_time_hint: parsed.posting_time_hint ?? null,
    reasoning: String(parsed.reasoning ?? ""),
  };

  const memoryRefs: string[] = []; // (Could be filled by matching memory IDs; kept simple for now.)

  const { data: row, error } = await sb.from("strategies").insert({
    user_id: userId, run_id: runId,
    hook_style: decision.hook_style,
    caption_length: decision.caption_length,
    cta_type: decision.cta_type,
    emoji_level: decision.emoji_level,
    storytelling: decision.storytelling,
    education_level: decision.education_level,
    hashtag_count: decision.hashtag_count,
    tone: decision.tone,
    posting_time_hint: decision.posting_time_hint,
    reasoning: decision.reasoning,
    memory_refs: memoryRefs as never,
    objective,
    raw: parsed as never,
  }).select("id").single();
  if (error || !row) throw new Error(`strategy insert: ${error?.message}`);

  await sb.from("runs").update({ strategy_id: row.id }).eq("id", runId);
  await audit(sb, { userId, runId, eventType: "strategy.decided", module: "strategy", status: "success", durationMs: Date.now() - t0, payload: decision as never });
  return { decision, strategyId: row.id };
}
