import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSchedulerStats } from "@/lib/scheduler-stats.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

type SchedulerSource = "loop" | "formula" | "sheet_mode";
const labels: Record<SchedulerSource, string> = { loop: "Loop Learner", formula: "1 Reel Formula", sheet_mode: "Sheet Mode" };
const formatDuration = (value: number | null) => value == null ? "—" : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;

export function SchedulerStatsPanel({ source }: { source: SchedulerSource }) {
  const getStats = useServerFn(getSchedulerStats);
  const [days, setDays] = useState("30");
  const { data, isLoading, error } = useQuery({ queryKey: ["scheduler-stats", source, days], queryFn: () => getStats({ data: { days: Number(days) } }) });
  const metric = data?.metrics[source];
  return <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{labels[source]} scheduler stats</CardTitle><CardDescription>Run metrics for {labels[source]} only.</CardDescription></div><Select value={days} onValueChange={setDays}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem></SelectContent></Select></div></CardHeader><CardContent>{isLoading ? <div className="text-sm text-muted-foreground">Loading stats…</div> : error ? <div className="text-sm text-destructive">Unable to load scheduler stats.</div> : <div className="rounded-md border p-3"><div className="mt-2 grid grid-cols-2 gap-2 text-sm"><div><div className="text-xs text-muted-foreground">Attempts</div><div>{metric?.attempts ?? 0}</div></div><div><div className="text-xs text-muted-foreground">Success rate</div><div>{metric?.success_rate ?? 0}%</div></div><div><div className="text-xs text-muted-foreground">Avg duration</div><div>{formatDuration(metric?.average_duration_ms ?? null)}</div></div><div><div className="text-xs text-muted-foreground">Posts published</div><div>{metric?.posts_published ?? 0}</div></div></div><div className="mt-3 space-y-1"><div className="text-xs font-medium">Recent runs</div>{metric?.recent_runs?.length ? metric.recent_runs.slice(0, 3).map((run: any) => <div key={run.id} className="flex items-center justify-between gap-2 text-xs"><span>{new Date(run.started_at).toLocaleString()}</span><Badge variant={run.status === "complete" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge></div>) : <div className="text-xs text-muted-foreground">No runs in range.</div>}</div></div>}</CardContent></Card>;
}
