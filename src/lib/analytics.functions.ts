import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Pull the freshest Buffer metrics for every channel in the active campaign so the
// campaign Sheet (including older posts) stays up to date on demand.
export const refreshCampaignSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ campaign_id: z.string().uuid().nullable().optional() }).optional().parse(d),
  )
  .handler(async ({ data, context }) => {
    const { refreshCampaignAnalytics } = await import("./analytics-sync.server");
    return await refreshCampaignAnalytics(context.supabase, {
      userId: context.userId,
      campaignId: data?.campaign_id ?? null,
      limit: 100,
    });
  });
