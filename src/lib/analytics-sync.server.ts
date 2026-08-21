// Per-campaign analytics refresh.
// Pulls the latest Buffer metrics for one channel and upserts published_posts /
// post_analytics rows, stamping them with the campaign so each campaign's Sheet
// stays isolated and up to date after every run (manual or scheduled).
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeBufferClient, resolveBufferCredential } from "./buffer.server";

type Sb = SupabaseClient;

export async function refreshChannelAnalytics(
  sb: Sb,
  opts: { userId: string; channelId: string; campaignId: string | null; limit?: number },
): Promise<{ fetched: number; imported: number; updated: number }> {
  const { userId, channelId, campaignId, limit = 50 } = opts;

  const { data: ch } = await sb
    .from("channels")
    .select("id,platform,buffer_channel_id,campaign_id,buffer_credentials(api_token,graphql_endpoint)")
    .eq("id", channelId)
    .maybeSingle();
  if (!ch?.buffer_channel_id) return { fetched: 0, imported: 0, updated: 0 };

  const cred = await resolveBufferCredential(
    sb, userId, campaignId ?? (ch as any).campaign_id ?? null,
    (ch as any).buffer_credentials ?? null,
  );
  const buffer = makeBufferClient(cred.api_token, cred.graphql_endpoint || "https://graphql.buffer.com");
  const nodes = await buffer.getChannelPostsMetrics((ch as any).buffer_channel_id, limit);
  if (campaignId) await sb.from("campaign_channel_targets").update({ last_refreshed_at: new Date().toISOString() }).eq("campaign_id", campaignId).eq("channel_id", channelId);
  if (!nodes.length) return { fetched: 0, imported: 0, updated: 0 };

  const stampCampaign = campaignId ?? (ch as any).campaign_id ?? null;

  const { data: known } = await sb
    .from("published_posts")
    .select("id,run_id,buffer_post_id,campaign_id")
    .eq("user_id", userId)
    .in("buffer_post_id", nodes.map((n) => n.id));
  const knownById = new Map((known ?? []).map((k: any) => [k.buffer_post_id as string, k]));

  let imported = 0, updated = 0;

  for (const n of nodes) {
    let row = knownById.get(n.id) as { id: string; run_id: string | null; campaign_id: string | null } | undefined;

    if (!row) {
      const { data: ins } = await sb.from("published_posts").insert({
        user_id: userId, channel_id: channelId, run_id: null,
        campaign_id: stampCampaign,
        buffer_post_id: n.id, platform: (ch as any).platform,
        posted_at: n.sentAt, text_content: n.text,
        permalink: (n.raw as any)?.externalLink ?? null,
        buffer_status: (n.raw as any)?.status ?? "sent",
        verified_at: new Date().toISOString(),
        source: "buffer_import", raw: n.raw as never,
      } as never).select("id,run_id,campaign_id").single();
      if (!ins) continue;
      row = ins as any;
      imported++;
    } else {
      await sb.from("published_posts").update({
        buffer_status: (n.raw as any)?.status ?? null,
        permalink: (n.raw as any)?.externalLink ?? null,
        posted_at: n.sentAt ?? undefined,
        verified_at: new Date().toISOString(),
        metrics_updated_at: n.metricsUpdatedAt ?? new Date().toISOString(),
        ...(row.campaign_id ? {} : { campaign_id: stampCampaign }),
      } as never).eq("id", row.id);
    }

    const m = n.metrics;
    const metrics = {
      views: m.views ?? null, likes: m.likes ?? null, comments: m.comments ?? null,
      shares: m.shares ?? null, saves: m.saves ?? null, reach: m.reach ?? null,
      impressions: m.impressions ?? null,
    };
    const hasMetrics = Object.values(metrics).some((v) => v != null);
    if (!hasMetrics) continue;

    const { data: existing } = await sb.from("post_analytics")
      .select("id").eq("published_post_id", row!.id).maybeSingle();
    if (existing) {
      await sb.from("post_analytics").update({
        ...metrics, fetched_at: new Date().toISOString(), raw: n.raw as never,
      }).eq("id", existing.id);
    } else {
      await sb.from("post_analytics").insert({
        published_post_id: row!.id, user_id: userId,
        campaign_id: row!.campaign_id ?? stampCampaign,
        ...metrics, raw: n.raw as never,
      } as never);
    }
    updated++;

    if (row!.run_id) {
      const { data: run } = await sb.from("runs").select("prediction_id").eq("id", row!.run_id).maybeSingle();
      if (run?.prediction_id) {
        try {
          const { evaluatePrediction } = await import("./prediction-engine.server");
          await evaluatePrediction(sb, run.prediction_id, metrics);
        } catch { /* scoring must not break ingestion */ }
      }
    }
  }

  return { fetched: nodes.length, imported, updated };
}

// Refresh every channel that belongs to a campaign (or the workspace when null),
// so the campaign Sheet keeps previous posts' analytics up to date on every run.
export async function refreshCampaignAnalytics(
  sb: Sb,
  opts: { userId: string; campaignId: string | null; limit?: number },
): Promise<{ channels: number; fetched: number; imported: number; updated: number }> {
  let channelIds: string[] | null = null;
  if (opts.campaignId) {
    const { data: campaign } = await sb.from("campaigns").select("channel_mode").eq("id", opts.campaignId).maybeSingle();
    if (campaign?.channel_mode === "multi") {
      const { data: targets } = await sb.from("campaign_channel_targets").select("channel_id").eq("user_id", opts.userId).eq("campaign_id", opts.campaignId).eq("is_active", true);
      channelIds = (targets ?? []).map((target: any) => target.channel_id);
    }
  }
  let q = sb.from("channels").select("id").eq("user_id", opts.userId).is("missing_since", null);
  if (channelIds) q = channelIds.length ? (q as any).in("id", channelIds) : (q as any).eq("id", "00000000-0000-0000-0000-000000000000");
  else q = opts.campaignId ? (q as any).or(`campaign_id.eq.${opts.campaignId},campaign_id.is.null`) : (q as any).is("campaign_id", null);
  const { data: chans } = await q;
  let fetched = 0, imported = 0, updated = 0;
  for (const c of chans ?? []) {
    try {
      const r = await refreshChannelAnalytics(sb, {
        userId: opts.userId, channelId: (c as any).id, campaignId: opts.campaignId, limit: opts.limit,
      });
      fetched += r.fetched; imported += r.imported; updated += r.updated;
    } catch { /* one bad channel must not stop the rest */ }
  }
  return { channels: (chans ?? []).length, fetched, imported, updated };
}
