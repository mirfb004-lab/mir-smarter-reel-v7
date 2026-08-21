import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const statsInput = z.object({ days: z.number().int().min(1).max(365).default(30) }).optional();
const sources = ["loop", "formula", "sheet_mode"] as const;
type Source = (typeof sources)[number];

function sourceFor(strategy: string | null): Source | null {
  if (strategy === "1_reel_formula") return "formula";
  if (strategy === "sheet_mode") return "sheet_mode";
  if (strategy?.startsWith("objective=")) return "loop";
  return null;
}

export const getSchedulerStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => statsInput.parse(d))
  .handler(async ({ data, context }) => {
    const days = data?.days ?? 30;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data: rows, error } = await context.supabase.from("runs")
      .select("id,status,error,started_at,finished_at,duration_ms,strategy_used,published_posts(id,posted_at,buffer_status,permalink)")
      .eq("user_id", context.userId)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const metrics = Object.fromEntries(sources.map((source) => [source, { source, attempts: 0, successes: 0, failures: 0, success_rate: 0, average_duration_ms: null as number | null, posts_published: 0, last_run_at: null as string | null, recent_runs: [] as any[] }])) as Record<Source, any>;
    for (const row of rows ?? []) {
      const source = sourceFor(row.strategy_used);
      if (!source) continue;
      const metric = metrics[source];
      metric.attempts += 1;
      if (row.status === "complete") metric.successes += 1;
      if (row.status === "failed") metric.failures += 1;
      metric.posts_published += row.published_posts?.length ?? 0;
      metric.last_run_at ??= row.started_at;
      if (metric.recent_runs.length < 8) metric.recent_runs.push({ id: row.id, status: row.status, started_at: row.started_at, finished_at: row.finished_at, duration_ms: row.duration_ms, error: row.error, posts_published: row.published_posts?.length ?? 0 });
    }
    for (const source of sources) {
      const metric = metrics[source];
      const durations = (rows ?? []).filter((row) => sourceFor(row.strategy_used) === source && typeof row.duration_ms === "number").map((row) => row.duration_ms as number);
      metric.success_rate = metric.attempts ? Math.round((metric.successes / metric.attempts) * 100) : 0;
      metric.average_duration_ms = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
    }
    return { days, since, metrics };
  });

const schedulerItemHistoryInput = z.object({
  source: z.enum(sources),
  item_id: z.string().uuid(),
});

export const listSchedulerItemHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schedulerItemHistoryInput.parse(d))
  .handler(async ({ data, context }) => {
    const ownerTable = data.source === "loop" ? "campaigns" : data.source === "formula" ? "recurring_schedules" : "sheet_mode_sheets";
    const { data: ownedItem, error: ownerError } = await context.supabase
      .from(ownerTable)
      .select("id")
      .eq("id", data.item_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (ownerError) throw new Error(ownerError.message);
    if (!ownedItem) throw new Error("Scheduler item not found");

    let query = context.supabase.from("runs")
      .select("id,status,error,started_at,finished_at,duration_ms,strategy_used,published_posts(buffer_post_id,permalink,posted_at,buffer_status,due_at,verified_at,platform,text_content)", { count: "exact" })
      .eq("user_id", context.userId)
      .order("started_at", { ascending: false })
      .limit(8);
    if (data.source === "loop") {
      query = query.ilike("strategy_used", "objective=%").eq("campaign_id", data.item_id);
    } else {
      query = query.eq("strategy_used", data.source === "formula" ? "1_reel_formula" : "sheet_mode").contains("step_state", data.source === "formula" ? { recurring_schedule_id: data.item_id } : { sheet_id: data.item_id });
    }
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    const history = rows ?? [];
    return {
      total_runs: count ?? history.length,
      last_run_at: history[0]?.started_at ?? null,
      recent_runs: history.slice(0, 8).map((row: any) => ({ id: row.id, status: row.status, started_at: row.started_at, finished_at: row.finished_at, duration_ms: row.duration_ms, error: row.error, posts_published: row.published_posts?.length ?? 0 })),
    };
  });
