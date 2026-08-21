import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid().nullable().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("memory_insights")
      .select("*").order("confidence", { ascending: false }).limit(500);
    if (data?.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const resetMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("memory_insights").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const exportMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("memory_insights").select("*");
    if (error) throw new Error(error.message);
    return { exported_at: new Date().toISOString(), insights: data ?? [] };
  });

const importSchema = z.object({
  insights: z.array(z.object({
    category: z.enum(["hook","length","emoji","hashtag","cta","topic","style","timing","other"]),
    insight: z.string().min(1),
    confidence: z.number().min(0).max(1).default(0.5),
    support_count: z.number().int().min(1).default(1),
  })),
});
export const importMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    const rows = data.insights.map((i) => ({ ...i, user_id: context.userId, active: true }));
    const { error } = await context.supabase.from("memory_insights").insert(rows);
    if (error) throw new Error(error.message);
    return { imported: rows.length };
  });

export const deleteInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("memory_insights").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
