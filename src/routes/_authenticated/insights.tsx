import { createFileRoute } from "@tanstack/react-router";
import { useScopedCampaignId } from "@/components/campaign-context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrends, listPredictionAccuracy, listStrategies } from "@/lib/insights.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Target, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/insights")({ component: InsightsPage });

function InsightsPage() {
  const trendsFn = useServerFn(listTrends);
  const predFn = useServerFn(listPredictionAccuracy);
  const stratFn = useServerFn(listStrategies);
  const campaignId = useScopedCampaignId();

  const { data: trends } = useQuery({ queryKey: ["insight_trends", campaignId], queryFn: () => trendsFn({ data: { campaign_id: campaignId } }) });
  const { data: predictions } = useQuery({ queryKey: ["prediction_accuracy", campaignId], queryFn: () => predFn({ data: { campaign_id: campaignId } }) });
  const { data: strategies } = useQuery({ queryKey: ["strategies", campaignId], queryFn: () => stratFn({ data: { campaign_id: campaignId } }) });

  const avgAccuracy = (() => {
    const rows = predictions ?? [];
    if (!rows.length) return null;
    const s = rows.reduce((a, r) => a + Number(r.accuracy_score ?? 0), 0);
    return s / rows.length;
  })();

  // Group trends by dimension
  const grouped: Record<string, any[]> = {};
  for (const t of trends ?? []) (grouped[t.dimension] ??= []).push(t);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Insights</h1>
        <p className="text-sm text-muted-foreground">What the AI has learned across your runs. Recomputed after every analytics fetch.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Prediction accuracy</CardDescription>
            <CardTitle className="text-3xl">{avgAccuracy == null ? "—" : `${Math.round(avgAccuracy * 100)}%`}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Average of last {predictions?.length ?? 0} scored predictions.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Insights discovered</CardDescription>
            <CardTitle className="text-3xl">{trends?.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Across {Object.keys(grouped).length} strategy dimensions.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Strategies decided</CardDescription>
            <CardTitle className="text-3xl">{strategies?.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Latest run: {strategies?.[0]?.hook_style ?? "—"} / {strategies?.[0]?.caption_length ?? "—"}
          </CardContent>
        </Card>
      </div>

      {(trends ?? []).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <Sparkles className="inline h-4 w-4 mr-2 text-primary" />
            Not enough runs yet. Insights appear once at least 3 posts have analytics.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {Object.entries(grouped).map(([dim, items]) => (
            <Card key={dim}>
              <CardHeader>
                <CardTitle className="capitalize text-base">{dim.replace(/_/g, " ")}</CardTitle>
                <CardDescription>{items.length} findings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {items
                  .sort((a: any, b: any) => Math.abs(b.lift_pct ?? 0) - Math.abs(a.lift_pct ?? 0))
                  .slice(0, 8)
                  .map((t: any) => (
                    <div key={t.id} className="border border-border rounded-md p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          {Number(t.lift_pct) >= 0
                            ? <TrendingUp className="h-4 w-4 text-emerald-500" />
                            : <TrendingDown className="h-4 w-4 text-rose-500" />}
                          <span className="text-sm font-medium">{t.value}</span>
                          <Badge variant="outline" className="text-[10px]">{t.metric}</Badge>
                        </div>
                        <span className={`text-sm font-mono ${Number(t.lift_pct) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {Number(t.lift_pct) >= 0 ? "+" : ""}{Number(t.lift_pct).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.human_summary}</p>
                      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                        <span>n={t.sample_size}</span>
                        <span>confidence {Math.round(Number(t.confidence ?? 0) * 100)}%</span>
                      </div>
                      <Progress value={Number(t.confidence ?? 0) * 100} className="h-1 mt-1" />
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(predictions ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4"/>Recent predictions vs actual</CardTitle>
            <CardDescription>How close the AI came on the last {predictions?.length} scored posts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left py-2">When</th>
                    <th className="text-right">Views (P/A)</th>
                    <th className="text-right">Likes (P/A)</th>
                    <th className="text-right">Comments (P/A)</th>
                    <th className="text-right">Shares (P/A)</th>
                    <th className="text-right">Saves (P/A)</th>
                    <th className="text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {(predictions ?? []).map((p: any) => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2">{new Date(p.evaluated_at).toLocaleDateString()}</td>
                      <td className="text-right font-mono">{p.predicted_views}/{p.actual_views}</td>
                      <td className="text-right font-mono">{p.predicted_likes}/{p.actual_likes}</td>
                      <td className="text-right font-mono">{p.predicted_comments}/{p.actual_comments}</td>
                      <td className="text-right font-mono">{p.predicted_shares}/{p.actual_shares}</td>
                      <td className="text-right font-mono">{p.predicted_saves}/{p.actual_saves}</td>
                      <td className="text-right font-mono">{Math.round(Number(p.accuracy_score ?? 0) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
