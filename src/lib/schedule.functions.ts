import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  channel_id: z.string().uuid(),
  campaign_id: z.string().uuid().nullable().optional(),
  mode: z.enum(["interval", "daily_times", "manual"]),
  interval_hours: z.number().nullable().optional(),
  daily_times: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  publish_mode: z.enum(["addToQueue", "shareNow", "customScheduled"]).nullable().optional(),
  custom_scheduled_at: z.string().nullable().optional(),
  publish_delay_minutes: z.number().int().min(1).max(10080).nullable().optional(),
});

function computeNextRun(mode: string, interval_hours: number | null | undefined, daily_times: string[]): string | null {
  const now = new Date();
  if (mode === "interval" && interval_hours && interval_hours > 0) {
    return new Date(now.getTime() + interval_hours * 3600_000).toISOString();
  }
  if (mode === "daily_times" && daily_times.length) {
    const candidates = daily_times.map((t) => {
      const [h, m] = t.split(":").map(Number);
      const d = new Date(now); d.setUTCHours(h ?? 0, m ?? 0, 0, 0);
      if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
      return d;
    }).sort((a, b) => a.getTime() - b.getTime());
    return candidates[0].toISOString();
  }
  return null;
}

export const listSchedules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid().nullable().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("schedules")
      .select("id,channel_id,campaign_id,mode,interval_hours,daily_times,next_run_at,last_run_at,active,paused,publish_mode,custom_scheduled_at,publish_delay_minutes")
      .order("created_at", { ascending: false });
    if (data?.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const next_run_at = computeNextRun(data.mode, data.interval_hours, data.daily_times);
    if (data.id) {
      const { error } = await context.supabase.from("schedules").update({
        channel_id: data.channel_id, campaign_id: data.campaign_id ?? null, mode: data.mode,
        interval_hours: data.interval_hours ?? null,
        daily_times: data.daily_times, active: data.active, next_run_at,
        publish_mode: data.publish_mode ?? null,
        custom_scheduled_at: data.custom_scheduled_at ?? null,
        publish_delay_minutes: data.publish_delay_minutes ?? null,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("schedules").insert({
      user_id: context.userId, channel_id: data.channel_id, campaign_id: data.campaign_id ?? null, mode: data.mode,
      interval_hours: data.interval_hours ?? null, daily_times: data.daily_times,
      active: data.active, next_run_at,
      publish_mode: data.publish_mode ?? null,
      custom_scheduled_at: data.custom_scheduled_at ?? null,
      publish_delay_minutes: data.publish_delay_minutes ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("schedules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSchedulePaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), paused: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("schedules")
      .update({ paused: data.paused }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

