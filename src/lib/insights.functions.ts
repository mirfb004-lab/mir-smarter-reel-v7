import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const scope = (d: unknown) =>
  z.object({ campaign_id: z.string().uuid().nullable().optional() }).optional().parse(d);

export const listTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("insight_trends")
      .select("*")
      .order("confidence", { ascending: false })
      .order("lift_pct", { ascending: false })
      .limit(200);
    if (data?.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listPredictionAccuracy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("predictions")
      .select("id,run_id,campaign_id,accuracy_score,confidence,evaluated_at,predicted_views,actual_views,predicted_likes,actual_likes,predicted_comments,actual_comments,predicted_shares,actual_shares,predicted_saves,actual_saves,predicted_reach,actual_reach,created_at")
      .not("evaluated_at", "is", null)
      .order("evaluated_at", { ascending: false })
      .limit(50);
    if (data?.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listStrategies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("strategies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data?.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
