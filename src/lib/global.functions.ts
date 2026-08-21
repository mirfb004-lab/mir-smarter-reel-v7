import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Workspace-wide aggregate metrics across every campaign. */
export const globalStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const [campaigns, activeCampaigns, queuePending, queueProcessing, deadLetters, published, preds, runsActive] =
      await Promise.all([
        sb.from("campaigns").select("id", { count: "exact", head: true }),
        sb.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "active"),
        sb.from("video_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
        sb.from("video_queue").select("id", { count: "exact", head: true }).eq("status", "processing"),
        sb.from("video_queue").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
        sb.from("published_posts").select("id", { count: "exact", head: true }),
        sb.from("predictions").select("accuracy_score").not("evaluated_at", "is", null).limit(2000),
        sb.from("runs").select("id", { count: "exact", head: true }).in("status", ["analyzing", "generating", "publishing"]),
      ]);

    const scores = (preds.data ?? []).map((p: any) => Number(p.accuracy_score)).filter((n) => Number.isFinite(n));
    const accuracy = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;

    return {
      campaigns: campaigns.count ?? 0,
      activeCampaigns: activeCampaigns.count ?? 0,
      queuePending: queuePending.count ?? 0,
      queueProcessing: queueProcessing.count ?? 0,
      deadLetters: deadLetters.count ?? 0,
      publishedPosts: published.count ?? 0,
      activeRuns: runsActive.count ?? 0,
      predictionAccuracy: accuracy,
      predictionSample: scores.length,
    };
  });

const pageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(200).default(50),
  search: z.string().optional().nullable(),
  status: z.enum(["all", "active", "paused", "stopped"]).default("all"),
});

/** Server-side paginated campaign progress table. */
export const listCampaignProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pageSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = sb.from("campaigns").select("id,name,status,objective,created_at", { count: "exact" });
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search?.trim()) q = q.ilike("name", `%${data.search.trim()}%`);
    const { data: rows, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    if (!ids.length) return { rows: [], total: count ?? 0, page: data.page, pageSize: data.pageSize };

    const [queue, runs, preds, scheds, channels] = await Promise.all([
      sb.from("video_queue").select("campaign_id,status").in("campaign_id", ids),
      sb.from("runs").select("campaign_id,status,started_at,run_number").in("campaign_id", ids).order("started_at", { ascending: false }).limit(2000),
      sb.from("predictions").select("campaign_id,accuracy_score").in("campaign_id", ids).not("evaluated_at", "is", null).limit(4000),
      sb.from("schedules").select("campaign_id,channel_id,paused,active").in("campaign_id", ids),
      sb.from("channels").select("id,name,platform"),
    ]);

    const chanMap = new Map((channels.data ?? []).map((c: any) => [c.id, c]));
    const out = (rows ?? []).map((c) => {
      const qRows = (queue.data ?? []).filter((r: any) => r.campaign_id === c.id);
      const lastRun = (runs.data ?? []).find((r: any) => r.campaign_id === c.id) as any;
      const pScores = (preds.data ?? [])
        .filter((p: any) => p.campaign_id === c.id)
        .map((p: any) => Number(p.accuracy_score))
        .filter((n) => Number.isFinite(n));
      const sched = (scheds.data ?? []).find((s: any) => s.campaign_id === c.id) as any;
      const chan = sched?.channel_id ? chanMap.get(sched.channel_id) : null;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        channelName: (chan as any)?.name ?? null,
        channelPlatform: (chan as any)?.platform ?? null,
        pending: qRows.filter((r: any) => r.status === "pending").length,
        deadLetter: qRows.filter((r: any) => r.status === "dead_letter").length,
        queueTotal: qRows.length,
        lastRunStatus: lastRun?.status ?? null,
        lastRunAt: lastRun?.started_at ?? null,
        predictionAccuracy: pScores.length
          ? Math.round((pScores.reduce((a, b) => a + b, 0) / pScores.length) * 100) / 100
          : null,
      };
    });

    return { rows: out, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

/** Failures + dead letters across every campaign. */
export const listGlobalFailures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const [queue, campaigns] = await Promise.all([
      sb.from("video_queue")
        .select("id,cloudinary_url,status,attempts,max_attempts,error,last_error_module,dead_letter_at,campaign_id,channel_id")
        .in("status", ["dead_letter", "failed"])
        .order("dead_letter_at", { ascending: false })
        .limit(300),
      sb.from("campaigns").select("id,name"),
    ]);
    if (queue.error) throw new Error(queue.error.message);
    const names = new Map((campaigns.data ?? []).map((c) => [c.id, c.name]));
    return (queue.data ?? []).map((r) => ({ ...r, campaignName: r.campaign_id ? names.get(r.campaign_id) ?? null : null }));
  });

/** Bulk retry: resets failed/dead-lettered queue items back to pending. */
export const bulkRetryFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ids: z.array(z.string().uuid()).optional(),
      campaign_id: z.string().uuid().nullable().optional(),
      all: z.boolean().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("video_queue")
      .update({ status: "pending", error: null, attempts: 0, dead_letter_at: null, last_error_module: null })
      .in("status", ["dead_letter", "failed"]);
    if (data.ids?.length) q = q.in("id", data.ids);
    else if (data.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    else if (!data.all) throw new Error("Nothing selected");
    const { error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
