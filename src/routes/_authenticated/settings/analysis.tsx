import { createFileRoute } from "@tanstack/react-router";
import { useScopedCampaignId } from "@/components/campaign-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAllSettings, updateAnalysisSettings } from "@/lib/settings.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/settings/analysis")({ component: AnalysisSettings });

const scopes = [
  { v: "last_n", d: "Last N posts" },
  { v: "top_n", d: "Top N by engagement" },
  { v: "highest_engagement", d: "Highest engagement overall" },
  { v: "highest_views", d: "Highest views overall" },
  { v: "highest_saves", d: "Highest saves overall" },
  { v: "all", d: "All history" },
  { v: "custom", d: "Custom rule" },
];

function AnalysisSettings() {
  const get = useServerFn(getAllSettings);
  const upd = useServerFn(updateAnalysisSettings);
  const qc = useQueryClient();
  const campaignId = useScopedCampaignId();
  const { data } = useQuery({ queryKey: ["settings", campaignId], queryFn: () => get({ data: { campaign_id: campaignId } }) });

  const [state, setState] = useState<any>(null);
  useEffect(() => { if (data?.analysis) setState(data.analysis); }, [data]);

  const mut = useMutation({
    mutationFn: () => upd({ data: { scope: state.scope, n_value: Number(state.n_value), custom_query: state.custom_query ?? null } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!state) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analysis Lookback</h1>
        <p className="text-sm text-muted-foreground">How much history the loop learns from before each new caption.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Lookback</CardTitle><CardDescription>Configure what "previous posts" means to the AI.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Scope</Label>
              <Select value={state.scope} onValueChange={(v) => setState({ ...state, scope: v })}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{scopes.map(s => <SelectItem key={s.v} value={s.v}>{s.d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>N value</Label>
              <Input type="number" value={state.n_value} onChange={(e) => setState({ ...state, n_value: Number(e.target.value) })}/></div>
          </div>
          {state.scope === "custom" && (
            <div className="space-y-1"><Label>Custom query hint</Label>
              <Textarea rows={3} value={state.custom_query ?? ""} onChange={(e) => setState({ ...state, custom_query: e.target.value })} placeholder="e.g. only posts published on weekends"/></div>
          )}
        </CardContent>
      </Card>
      <Button onClick={() => mut.mutate()}>Save analysis settings</Button>
    </div>
  );
}
