import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { listSchedulerItemHistory } from "@/lib/scheduler-stats.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type SchedulerSource = "loop" | "formula" | "sheet_mode";

const labels: Record<SchedulerSource, string> = {
  loop: "Loop Learner",
  formula: "1 Reel Formula",
  sheet_mode: "Sheet Mode",
};

export function SchedulerItemHistory({ source, itemId }: { source: SchedulerSource; itemId: string }) {
  const [open, setOpen] = React.useState(false);
  const getHistory = useServerFn(listSchedulerItemHistory);
  const query = useQuery({
    queryKey: ["scheduler-item-history", source, itemId],
    queryFn: () => getHistory({ data: { source, item_id: itemId } }),
    enabled: open,
  });

  return (
    <div className="w-full md:w-auto">
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
        <History className="h-4 w-4 mr-1" />
        {open ? "Hide history" : "History"}
      </Button>
      {open && (
        <div className="mt-3 rounded-md border bg-muted/20 p-3 text-sm">
          {query.isLoading ? (
            <div className="text-muted-foreground">Loading {labels[source]} history…</div>
          ) : query.error ? (
            <div className="text-destructive">Unable to load this item&apos;s history.</div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Last run</div>
                  <div>{query.data?.last_run_at ? new Date(query.data.last_run_at).toLocaleString() : "No runs yet"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total runs</div>
                  <div>{query.data?.total_runs ?? 0}</div>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                <div className="text-xs font-medium">Recent runs</div>
                {query.data?.recent_runs?.length ? query.data.recent_runs.map((run: any) => (
                  <div key={run.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
                    <span>{new Date(run.started_at).toLocaleString()}</span>
                    <Badge variant={run.status === "complete" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge>
                  </div>
                )) : <div className="text-xs text-muted-foreground">No runs yet.</div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
