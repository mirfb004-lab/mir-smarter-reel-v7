import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { audit, makeIdempotencyKey } from "./reliability.server";
import { executeQueueItemForChannel } from "./orchestrator.server";

type Sb = SupabaseClient;

type Target = {
  id: string;
  channel_id: string;
  analysis_scope: string;
  analysis_n_value: number;
  analysis_custom_query: string | null;
  is_active: boolean;
};

async function loadTargets(sb: Sb, userId: string, campaignId: string): Promise<Target[]> {
  const { data, error } = await sb.from("campaign_channel_targets")
    .select("id,channel_id,analysis_scope,analysis_n_value,analysis_custom_query,is_active")
    .eq("user_id", userId).eq("campaign_id", campaignId).eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Target[];
}

async function findOrClaimQueueItem(sb: Sb, campaignId: string, roundId?: string | null): Promise<{ round: any; queueItem: any }> {
  if (roundId) {
    const { data } = await sb.from("multi_channel_rounds").select("id,queue_item_id,status").eq("id", roundId).maybeSingle();
    if (data) {
      const { data: queueItem } = await sb.from("video_queue").select("id,cloudinary_url,status").eq("id", data.queue_item_id).maybeSingle();
      if (queueItem) return { round: data, queueItem };
    }
  }
  const { data: existing } = await sb.from("multi_channel_rounds").select("id,queue_item_id,status").eq("campaign_id", campaignId).eq("status", "processing").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) {
    const { data: queueItem } = await sb.from("video_queue").select("id,cloudinary_url,status").eq("id", existing.queue_item_id).maybeSingle();
    if (queueItem) return { round: existing, queueItem };
  }
  const { data: candidate } = await sb.from("video_queue").select("id,cloudinary_url,status").eq("campaign_id", campaignId).eq("status", "pending").order("position", { ascending: true }).limit(1).maybeSingle();
  if (!candidate) throw new Error("Campaign queue is empty.");
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_multi_channel_queue_item", { _queue_item_id: candidate.id, _campaign_id: campaignId });
  if (claimError) throw new Error(`multi-channel queue claim: ${claimError.message}`);
  if (!claimed) throw new Error("Another multi-channel round claimed the next queue item.");
  return { round: null, queueItem: { ...candidate, status: "processing" } };
}

export async function runMultiChannelRound(sb: Sb, userId: string, campaignId: string, reason: "warmup" | "scheduled" = "scheduled") {
  const { data: campaign } = await sb.from("campaigns").select("id,channel_mode,status").eq("id", campaignId).eq("user_id", userId).maybeSingle();
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.channel_mode !== "multi") throw new Error("Campaign is not configured for multi-channel publishing.");
  if (campaign.status && campaign.status !== "active") throw new Error(`Campaign is ${campaign.status}`);

  const targets = await loadTargets(sb, userId, campaignId);
  if (targets.length < 2) throw new Error("Select at least two active channels before running a multi-channel campaign.");
  const { round: existingRound, queueItem } = await findOrClaimQueueItem(sb, campaignId);
  if (existingRound?.status === "processing" && existingRound.started_at && Date.now() - new Date(existingRound.started_at).getTime() < 10 * 60 * 1000) {
    return { roundId: existingRound.id, queueItemId: queueItem.id, completed: existingRound.completed_count ?? 0, total: targets.length, alreadyInFlight: true };
  }
  const idempotencyKey = existingRound?.id ? `round:${existingRound.id}` : makeIdempotencyKey(["multi-round", queueItem.id]);
  let round: any = existingRound;
  if (!round) {
    const { data: prior } = await sb.from("multi_channel_rounds").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (prior) {
      round = prior;
      await sb.from("multi_channel_rounds").update({ status: "processing", error: null, finished_at: null }).eq("id", prior.id);
    }
  }
  if (!round) {
    const { data: created, error } = await sb.from("multi_channel_rounds").insert({
      user_id: userId, campaign_id: campaignId, queue_item_id: queueItem.id,
      idempotency_key: idempotencyKey, status: "processing", channel_count: targets.length,
    }).select("*").single();
    if (error || !created) throw new Error(error?.message ?? "Failed to create multi-channel round");
    round = created as any;
  }
  if (!round) throw new Error("Failed to initialize multi-channel round");
  await audit(sb, { userId, queueItemId: queueItem.id, eventType: "multi_channel.round_started", module: "multi_channel", status: "info", payload: { campaign_id: campaignId, round_id: round.id, reason, channel_count: targets.length } });

  let completed = Number(round.completed_count ?? 0);
  try {
    for (const target of targets) {
      const started = Date.now();
      try {
        const result = await executeQueueItemForChannel({
          supabase: sb, userId, campaignId, channelId: target.channel_id, queueItem: { id: queueItem.id, cloudinary_url: queueItem.cloudinary_url },
          analysisLookback: target.analysis_n_value,
        });
        const postId = result.postId ?? null;
        let publishedPostId: string | null = null;
        if (postId) {
          const { data: post } = await sb.from("published_posts").select("id,posted_at").eq("run_id", result.runId).eq("buffer_post_id", postId).maybeSingle();
          publishedPostId = post?.id ?? null;
        }
        await sb.from("campaign_channel_targets").update({
          last_analysis_at: new Date().toISOString(), last_published_at: new Date().toISOString(), last_post_id: publishedPostId, last_error: null,
          learning_state: { last_run_id: result.runId, last_post_id: postId, refreshed_at: new Date().toISOString() }, updated_at: new Date().toISOString(),
        }).eq("id", target.id).eq("user_id", userId);
        completed++;
        await sb.from("multi_channel_rounds").update({ completed_count: completed }).eq("id", round.id);
        await audit(sb, { userId, runId: result.runId, queueItemId: queueItem.id, eventType: "multi_channel.channel_completed", module: "multi_channel", status: "success", durationMs: Date.now() - started, payload: { target_id: target.id, channel_id: target.channel_id, post_id: postId } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sb.from("campaign_channel_targets").update({ last_error: message, updated_at: new Date().toISOString() }).eq("id", target.id).eq("user_id", userId);
        await audit(sb, { userId, queueItemId: queueItem.id, eventType: "multi_channel.channel_failed", module: "multi_channel", status: "error", durationMs: Date.now() - started, error: message, payload: { target_id: target.id, channel_id: target.channel_id } });
        throw error;
      }
    }
    await sb.from("video_queue").update({ status: "done", processed_at: new Date().toISOString(), error: null }).eq("id", queueItem.id);
    await sb.from("multi_channel_rounds").update({ status: "complete", completed_count: completed, finished_at: new Date().toISOString(), error: null }).eq("id", round.id);
    await audit(sb, { userId, queueItemId: queueItem.id, eventType: "multi_channel.round_completed", module: "multi_channel", status: "success", payload: { round_id: round.id, completed_count: completed } });
    return { roundId: round.id, queueItemId: queueItem.id, completed, total: targets.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sb.from("video_queue").update({ status: "pending", error, last_error_module: "multi_channel" } as never).eq("id", queueItem.id);
    await sb.from("multi_channel_rounds").update({ status: "failed", error: message, completed_count: completed, finished_at: new Date().toISOString() }).eq("id", round.id);
    await audit(sb, { userId, queueItemId: queueItem.id, eventType: "multi_channel.round_failed", module: "multi_channel", status: "error", error: message, payload: { round_id: round.id, completed_count: completed } });
    throw error;
  }
}

export async function runDueMultiChannelSchedules(sb: Sb) {
  const { data: schedules } = await sb.from("multi_channel_schedules").select("id,user_id,campaign_id,interval_hours,next_run_at").eq("is_active", true).lte("next_run_at", new Date().toISOString()).limit(20);
  const results: unknown[] = [];
  for (const schedule of schedules ?? []) {
    const now = new Date();
    const next = new Date(now.getTime() + Number(schedule.interval_hours) * 3600000);
    const { data: claimed, error } = await supabaseAdmin.rpc("claim_multi_channel_schedule", { _schedule_id: schedule.id, _now: now.toISOString(), _next_run_at: next.toISOString() });
    if (error || !claimed) continue;
    try {
      results.push(await runMultiChannelRound(sb, schedule.user_id, schedule.campaign_id, "scheduled"));
      await sb.from("multi_channel_schedules").update({ last_error: null }).eq("id", schedule.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sb.from("multi_channel_schedules").update({ last_error: message }).eq("id", schedule.id);
      results.push({ campaignId: schedule.campaign_id, error: message });
    }
  }
  return results;
}
