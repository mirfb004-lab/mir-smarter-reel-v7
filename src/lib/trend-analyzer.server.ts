// Cross-run trend analyzer — populates insight_trends for the Insights Dashboard.
// Computes per-dimension lift vs the user's overall baseline.
import type { SupabaseClient } from "@supabase/supabase-js";
type Sb = SupabaseClient;

const METRICS = ["views", "likes", "comments", "shares", "saves", "reach"] as const;
type Metric = (typeof METRICS)[number];

interface Row {
  user_id: string;
  hook_style: string | null;
  caption_length: string | null;
  cta_type: string | null;
  emoji_level: string | null;
  hashtag_count: number | null;
  posted_hour: number | null;
  metrics: Record<Metric, number>;
}

function pctLift(observed: number, baseline: number): number {
  if (baseline <= 0) return 0;
  return Number((((observed - baseline) / baseline) * 100).toFixed(2));
}

function humanize(dimension: string, value: string, metric: string, lift: number): string {
  const dir = lift >= 0 ? "increased" : "decreased";
  const abs = Math.abs(lift).toFixed(0);
  const label: Record<string, string> = {
    hook_style: "hooks",
    caption_length: "captions",
    cta_type: "CTAs",
    emoji_level: "emoji usage",
    hashtag_bucket: "hashtag counts",
    posted_hour_bucket: "posts",
  };
  const noun = label[dimension] ?? dimension;
  return `${value} ${noun} ${dir} ${metric} by ${abs}%`;
}

function hourBucket(h: number | null): string | null {
  if (h == null) return null;
  if (h < 6) return "late-night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}
function hashBucket(n: number | null): string | null {
  if (n == null) return null;
  if (n === 0) return "none";
  if (n <= 3) return "few";
  if (n <= 7) return "some";
  return "many";
}

export async function recomputeTrends(sb: Sb, userId: string) {
  // Pull joined dataset: strategies + published_posts + analytics.
  const { data } = await sb
    .from("runs")
    .select(`
      user_id,
      strategies(hook_style,caption_length,cta_type,emoji_level,hashtag_count),
      published_posts(posted_at, post_analytics(views,likes,comments,shares,saves,reach))
    `)
    .eq("user_id", userId)
    .eq("status", "complete")
    .limit(500);

  const rows: Row[] = [];
  for (const r of (data ?? []) as any[]) {
    const s = r.strategies?.[0] ?? r.strategies;
    const pp = r.published_posts?.[0];
    const a = pp?.post_analytics?.[0];
    if (!a) continue;
    const postedHour = pp?.posted_at ? new Date(pp.posted_at).getUTCHours() : null;
    rows.push({
      user_id: r.user_id,
      hook_style: s?.hook_style ?? null,
      caption_length: s?.caption_length ?? null,
      cta_type: s?.cta_type ?? null,
      emoji_level: s?.emoji_level ?? null,
      hashtag_count: s?.hashtag_count ?? null,
      posted_hour: postedHour,
      metrics: {
        views: Number(a.views) || 0,
        likes: Number(a.likes) || 0,
        comments: Number(a.comments) || 0,
        shares: Number(a.shares) || 0,
        saves: Number(a.saves) || 0,
        reach: Number(a.reach) || 0,
      },
    });
  }
  if (rows.length < 3) return { rows: rows.length, updated: 0 };

  // Baselines per metric = overall mean.
  const baselines: Record<Metric, number> = { views:0, likes:0, comments:0, shares:0, saves:0, reach:0 };
  for (const m of METRICS) baselines[m] = rows.reduce((a, r) => a + r.metrics[m], 0) / rows.length;

  const dimensions: Array<[string, (r: Row) => string | null]> = [
    ["hook_style", (r) => r.hook_style],
    ["caption_length", (r) => r.caption_length],
    ["cta_type", (r) => r.cta_type],
    ["emoji_level", (r) => r.emoji_level],
    ["hashtag_bucket", (r) => hashBucket(r.hashtag_count)],
    ["posted_hour_bucket", (r) => hourBucket(r.posted_hour)],
  ];

  const toUpsert: any[] = [];
  for (const [dim, getVal] of dimensions) {
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const v = getVal(r);
      if (!v) continue;
      (groups.get(v) ?? groups.set(v, []).get(v)!).push(r);
    }
    for (const [value, group] of groups) {
      if (group.length < 2) continue;
      for (const metric of METRICS) {
        const observed = group.reduce((a, r) => a + r.metrics[metric], 0) / group.length;
        const lift = pctLift(observed, baselines[metric]);
        if (Math.abs(lift) < 5) continue; // ignore noise
        const conf = Math.min(1, group.length / 10);
        toUpsert.push({
          user_id: userId,
          dimension: dim, value, metric,
          lift_pct: lift,
          sample_size: group.length,
          baseline: Number(baselines[metric].toFixed(2)),
          observed: Number(observed.toFixed(2)),
          confidence: Number(conf.toFixed(3)),
          human_summary: humanize(dim, value, metric, lift),
          last_computed_at: new Date().toISOString(),
        });
      }
    }
  }

  if (!toUpsert.length) return { rows: rows.length, updated: 0 };
  await sb.from("insight_trends").upsert(toUpsert, { onConflict: "user_id,dimension,value,metric" });
  return { rows: rows.length, updated: toUpsert.length };
}
