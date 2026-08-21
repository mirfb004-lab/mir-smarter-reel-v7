import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { addChannelUsageLabels } from "./channel-usage.server";

export const listChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid().nullable().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("channels")
      .select("id,name,platform,buffer_channel_id,active,credential_id,campaign_id,last_seen_at,missing_since")
      .order("created_at", { ascending: false });
    // Campaign mode shows campaign-owned channels plus unassigned (shared) ones.
    if (data?.campaign_id) q = q.or(`campaign_id.eq.${data.campaign_id},campaign_id.is.null`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return addChannelUsageLabels(context.supabase, context.userId, rows ?? []);
  });

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  platform: z.string().min(1),
  buffer_channel_id: z.string().min(1),
  credential_id: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
});

export const saveChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase.from("channels").update({
        name: data.name,
        platform: data.platform,
        buffer_channel_id: data.buffer_channel_id,
        credential_id: data.credential_id ?? null,
        active: data.active,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("channels").insert({
      user_id: context.userId,
      name: data.name,
      platform: data.platform,
      buffer_channel_id: data.buffer_channel_id,
      credential_id: data.credential_id ?? null,
      active: data.active,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    // Optionally hand this channel's pending queue items to a replacement channel.
    move_queue_to: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    // Detach every reference first — history stays intact, only the link is cleared.
    await sb.from("video_queue")
      .update({ channel_id: data.move_queue_to ?? null })
      .eq("channel_id", data.id);
    await sb.from("schedules").delete().eq("channel_id", data.id);
    await sb.from("published_posts").update({ channel_id: null }).eq("channel_id", data.id);
    await sb.from("memory_insights").update({ channel_id: null }).eq("channel_id", data.id);
    await sb.from("runs").update({ channel_id: null }).eq("channel_id", data.id);
    const { error } = await sb.from("channels").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
