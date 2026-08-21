import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { addChannelUsageLabels } from "./channel-usage.server";

const scope = z.enum(["last_n", "top_n", "highest_engagement", "highest_views", "highest_saves", "all", "custom"]);
const targetSchema = z.object({
  channel_id: z.string().uuid(),
  analysis_scope: scope.default("last_n"),
  analysis_n_value: z.number().int().min(1).max(500).default(5),
  analysis_custom_query: z.string().max(1000).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const getMultiChannelConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: campaign, error: campaignError }, { data: channels, error: channelError }, { data: targets, error: targetError }, { data: schedule, error: scheduleError }] = await Promise.all([
      sb.from("campaigns").select("id,channel_mode").eq("id", data.campaign_id).eq("user_id", context.userId).single(),
      sb.from("channels").select("id,name,platform,buffer_channel_id,credential_id,campaign_id,active,missing_since,buffer_credentials(id,label)").eq("user_id", context.userId).is("missing_since", null).order("created_at", { ascending: false }),
      sb.from("campaign_channel_targets").select("*").eq("user_id", context.userId).eq("campaign_id", data.campaign_id).order("created_at", { ascending: true }),
      sb.from("multi_channel_schedules").select("*").eq("user_id", context.userId).eq("campaign_id", data.campaign_id).maybeSingle(),
    ]);
    if (campaignError) throw new Error(campaignError.message);
    if (channelError) throw new Error(channelError.message);
    if (targetError) throw new Error(targetError.message);
    if (scheduleError) throw new Error(scheduleError.message);
    return { campaign, channels: await addChannelUsageLabels(sb, context.userId, channels ?? []), targets: targets ?? [], schedule: schedule ?? null };
  });

export const saveMultiChannelConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    campaign_id: z.string().uuid(),
    channel_mode: z.enum(["single", "multi"]),
    targets: z.array(targetSchema).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: campaign } = await sb.from("campaigns").select("id").eq("id", data.campaign_id).eq("user_id", context.userId).maybeSingle();
    if (!campaign) throw new Error("Campaign not found");
    const ids = [...new Set(data.targets.map((target) => target.channel_id))];
    if (data.channel_mode === "multi" && ids.length < 2) throw new Error("Multi-channel campaigns require at least two selected channels.");
    if (ids.length) {
      const { data: channels } = await sb.from("channels").select("id").eq("user_id", context.userId).in("id", ids).eq("active", true).is("missing_since", null);
      if ((channels ?? []).length !== ids.length) throw new Error("One or more selected channels are unavailable.");
    }
    await sb.from("campaign_channel_targets").delete().eq("user_id", context.userId).eq("campaign_id", data.campaign_id);
    if (data.targets.length) {
      const { error } = await sb.from("campaign_channel_targets").insert(data.targets.map((target) => ({
        user_id: context.userId,
        campaign_id: data.campaign_id,
        channel_id: target.channel_id,
        analysis_scope: target.analysis_scope,
        analysis_n_value: target.analysis_n_value,
        analysis_custom_query: target.analysis_custom_query ?? null,
        is_active: target.is_active,
      })));
      if (error) throw new Error(error.message);
    }
    const { error } = await sb.from("campaigns").update({ channel_mode: data.channel_mode }).eq("id", data.campaign_id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, selected: ids.length };
  });

export const saveMultiChannelSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    campaign_id: z.string().uuid(),
    interval_hours: z.number().int().min(1).max(720),
    start_immediately: z.boolean().default(true),
    start_at: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: campaign } = await context.supabase.from("campaigns").select("id,channel_mode").eq("id", data.campaign_id).eq("user_id", context.userId).maybeSingle();
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.channel_mode !== "multi") throw new Error("Select multi-channel mode before activating a multi-channel schedule.");
    const next = data.start_immediately ? new Date() : new Date(data.start_at ?? "");
    if (!Number.isFinite(next.getTime())) throw new Error("Choose a valid start time.");
    const { error } = await context.supabase.from("multi_channel_schedules").upsert({
      user_id: context.userId, campaign_id: data.campaign_id, interval_hours: data.interval_hours,
      is_active: true, next_run_at: next.toISOString(), last_error: null,
    }, { onConflict: "campaign_id" });
    if (error) throw new Error(error.message);
    return { ok: true, next_run_at: next.toISOString() };
  });

export const setMultiChannelScheduleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("multi_channel_schedules").update({ is_active: data.is_active, last_error: null }).eq("campaign_id", data.campaign_id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runMultiChannelWarmup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { runMultiChannelRound } = await import("./multi-channel.server");
    return await runMultiChannelRound(context.supabase, context.userId, data.campaign_id, "warmup");
  });
