import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid().nullable().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("video_queue")
      .select("id,position,cloudinary_url,status,attempts,error,added_at,processed_at,channel_id,campaign_id")
      .order("position", { ascending: true });
    if (data?.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const addSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  channel_id: z.string().uuid().nullable().optional(),
  campaign_id: z.string().uuid().nullable().optional(),
});
export const addToQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Dedupe: drop URLs that already exist (any status) for this user in this campaign scope.
    let dupQ = context.supabase
      .from("video_queue")
      .select("cloudinary_url")
      .eq("user_id", context.userId)
      .in("cloudinary_url", data.urls);
    if (data.campaign_id) dupQ = dupQ.eq("campaign_id", data.campaign_id);
    const { data: existing } = await dupQ;
    const seen = new Set((existing ?? []).map((r) => r.cloudinary_url));
    const fresh: string[] = [];
    const batch = new Set<string>();
    for (const u of data.urls) {
      if (seen.has(u) || batch.has(u)) continue;
      batch.add(u);
      fresh.push(u);
    }
    if (!fresh.length) return { added: 0, skipped: data.urls.length };

    // Positions are per-campaign — each campaign's queue numbers start at 1.
    let maxQ = context.supabase
      .from("video_queue")
      .select("position")
      .eq("user_id", context.userId)
      .order("position", { ascending: false })
      .limit(1);
    maxQ = data.campaign_id ? maxQ.eq("campaign_id", data.campaign_id) : maxQ.is("campaign_id", null);
    const { data: maxRow } = await maxQ.maybeSingle();
    const start = (maxRow?.position ?? 0) + 1;
    const rows = fresh.map((u, i) => ({
      user_id: context.userId,
      cloudinary_url: u,
      channel_id: data.channel_id ?? null,
      campaign_id: data.campaign_id ?? null,
      position: start + i,
    }));
    const { error } = await context.supabase.from("video_queue").insert(rows);
    if (error) throw new Error(error.message);
    return { added: rows.length, skipped: data.urls.length - rows.length };
  });


export const removeFromQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("video_queue").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("video_queue")
      .update({ status: "pending", error: null, attempts: 0, processed_at: null, dead_letter_at: null, last_error_module: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Retry a dead-lettered item — clears failure state and returns it to pending.
export const retryDeadLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("video_queue")
      .update({ status: "pending", error: null, attempts: 0, dead_letter_at: null })
      .eq("id", data.id).eq("status", "dead_letter");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// List all dead-lettered items with attempt/limit metadata.
export const listDeadLetters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid().nullable().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("video_queue")
      .select("id,cloudinary_url,attempts,max_attempts,error,last_error_module,dead_letter_at,channel_id,campaign_id")
      .eq("status", "dead_letter")
      .order("dead_letter_at", { ascending: false });
    if (data?.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Swap the position of two adjacent (or any two) queue items.
export const moveQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }).parse(d))
  .handler(async ({ data, context }) => {
    // Reordering stays inside the item's own campaign.
    const { data: self } = await context.supabase
      .from("video_queue").select("campaign_id").eq("id", data.id).maybeSingle();
    let listQ = context.supabase
      .from("video_queue")
      .select("id,position,status")
      .eq("user_id", context.userId)
      .order("position", { ascending: true });
    listQ = self?.campaign_id ? listQ.eq("campaign_id", self.campaign_id) : listQ.is("campaign_id", null);
    const { data: items, error } = await listQ;
    if (error) throw new Error(error.message);
    const list = items ?? [];
    const idx = list.findIndex((r) => r.id === data.id);
    if (idx < 0) throw new Error("Item not found");
    const swapIdx = data.direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return { ok: true };
    const a = list[idx], b = list[swapIdx];
    // Only allow reordering pending items — moving a processing/done item is meaningless.
    if (a.status !== "pending" || b.status !== "pending") throw new Error("Only pending items can be reordered");
    // Two-step swap to avoid unique-position conflicts if any constraint is added later.
    const tmp = -Math.abs(a.position) - 1;
    await context.supabase.from("video_queue").update({ position: tmp }).eq("id", a.id);
    await context.supabase.from("video_queue").update({ position: a.position }).eq("id", b.id);
    await context.supabase.from("video_queue").update({ position: b.position }).eq("id", a.id);
    return { ok: true };
  });

// Move queue items to a different channel — either a specific set of items or
// every item currently pointing at an old (e.g. removed/reconnected) channel.
export const moveQueueToChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    ids: z.array(z.string().uuid()).optional(),
    from_channel_id: z.string().uuid().nullable().optional(),
    to_channel_id: z.string().uuid().nullable(),
    campaign_id: z.string().uuid().nullable().optional(),
    only_pending: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("video_queue")
      .update({ channel_id: data.to_channel_id })
      .eq("user_id", context.userId);
    if (data.ids?.length) q = q.in("id", data.ids);
    else if (data.from_channel_id) q = q.eq("channel_id", data.from_channel_id);
    else if (data.from_channel_id === null) q = q.is("channel_id", null);
    if (data.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    if (data.only_pending) q = q.in("status", ["pending", "failed", "dead_letter"]);
    const { data: rows, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { moved: rows?.length ?? 0 };
  });
