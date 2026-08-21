import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMultiChannelConfig, runMultiChannelWarmup, saveMultiChannelConfig, saveMultiChannelSchedule, setMultiChannelScheduleActive } from "@/lib/multi-channel.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ChannelOptionLabel, ChannelSearchField, filterChannelOptions } from "@/components/channel-picker";

type Props = { campaignId: string; campaignMode: string };
type Draft = { channel_id: string; analysis_scope: string; analysis_n_value: number; analysis_custom_query: string | null; is_active: boolean; last_refreshed_at: string | null };

export function MultiChannelCampaignPanel({ campaignId, campaignMode }: Props) {
  const get = useServerFn(getMultiChannelConfig);
  const save = useServerFn(saveMultiChannelConfig);
  const saveSchedule = useServerFn(saveMultiChannelSchedule);
  const setActive = useServerFn(setMultiChannelScheduleActive);
  const warmup = useServerFn(runMultiChannelWarmup);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["multi-channel-config", campaignId], queryFn: () => get({ data: { campaign_id: campaignId } }), enabled: campaignMode === "multi" });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [intervalHours, setIntervalHours] = useState(24);
  const [startImmediately, setStartImmediately] = useState(true);
  const [startAt, setStartAt] = useState("");
  const [channelSearch, setChannelSearch] = useState("");

  useEffect(() => {
    if (!data) return;
    setDrafts((data.targets ?? []).map((target: any) => ({ channel_id: target.channel_id, analysis_scope: target.analysis_scope ?? "last_n", analysis_n_value: target.analysis_n_value ?? 5, analysis_custom_query: target.analysis_custom_query ?? null, is_active: target.is_active !== false, last_refreshed_at: target.last_refreshed_at ?? null })));
    if (data.schedule) { setIntervalHours(data.schedule.interval_hours); setStartImmediately(false); }
  }, [data]);

  const selected = useMemo(() => new Set(drafts.map((d) => d.channel_id)), [drafts]);
  const toggleChannel = (channelId: string) => {
    if (selected.has(channelId)) setDrafts((current) => current.filter((d) => d.channel_id !== channelId));
    else setDrafts((current) => [...current, { channel_id: channelId, analysis_scope: "last_n", analysis_n_value: 5, analysis_custom_query: null, is_active: true, last_refreshed_at: null }]);
  };
  const updateDraft = (channelId: string, patch: Partial<Draft>) => setDrafts((current) => current.map((d) => d.channel_id === channelId ? { ...d, ...patch } : d));
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["multi-channel-config", campaignId] }); qc.invalidateQueries({ queryKey: ["campaigns"] }); };

  const saveMut = useMutation({
    mutationFn: () => save({ data: { campaign_id: campaignId, channel_mode: "multi", targets: drafts as any } }),
    onSuccess: () => { toast.success("Multi-channel selection saved"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save channels"),
  });
  const scheduleMut = useMutation({
    mutationFn: () => saveSchedule({ data: { campaign_id: campaignId, interval_hours: intervalHours, start_immediately: startImmediately, start_at: startImmediately ? null : new Date(startAt).toISOString() } }),
    onSuccess: () => { toast.success("Multi-channel schedule activated"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save schedule"),
  });
  const activeMut = useMutation({
    mutationFn: (is_active: boolean) => setActive({ data: { campaign_id: campaignId, is_active } }),
    onSuccess: () => { toast.success("Schedule updated"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update schedule"),
  });
  const warmupMut = useMutation({
    mutationFn: () => warmup({ data: { campaign_id: campaignId } }),
    onSuccess: (r) => { toast.success(`Warm-up published to ${r.completed} channel${r.completed === 1 ? "" : "s"}`); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Warm-up failed"),
  });

  if (campaignMode !== "multi") return null;
  if (isLoading || !data) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Loading multi-channel settings…</CardContent></Card>;
  return (
    <Card>
      <CardHeader><CardTitle>Multi-channel campaign</CardTitle><CardDescription>One shared Cloudinary queue item is published to every selected channel, with separate analytics and lookback settings per channel.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2"><Label>Connected channels and Buffer accounts</Label>
          <ChannelSearchField value={channelSearch} onChange={setChannelSearch} />
          <div className="grid gap-2 md:grid-cols-2">
            {filterChannelOptions(data.channels ?? [], channelSearch).map((channel: any) => {
              const checked = selected.has(channel.id);
              const target = drafts.find((d) => d.channel_id === channel.id);
              return <div key={channel.id} className="rounded-md border p-3 space-y-3">
                <div className="flex items-start gap-2"><Checkbox checked={checked} onCheckedChange={() => toggleChannel(channel.id)} /><div className="min-w-0"><ChannelOptionLabel channel={channel} /><div className="text-[10px] text-muted-foreground">{channel.buffer_credentials?.label ?? "Buffer account"}</div></div></div>
                {checked && target && <div className="grid gap-2 pl-6 md:grid-cols-2"><div className="space-y-1"><Label className="text-xs">Previous posts per channel</Label><Input type="number" min={1} max={500} value={target.analysis_n_value} onChange={(e) => updateDraft(channel.id, { analysis_n_value: Number(e.target.value), analysis_scope: "last_n" })} /></div><div className="text-[11px] text-muted-foreground md:pt-6">Last refreshed: {target.last_refreshed_at ? new Date(target.last_refreshed_at).toLocaleString() : "Not yet"}</div></div>}
              </div>;
            })}
          </div>
        </div>
        <Button onClick={() => saveMut.mutate()} disabled={drafts.length < 2 || saveMut.isPending}>Save selected channels</Button>
        <div className="border-t pt-4 space-y-3"><div className="font-medium text-sm">Scheduler</div><div className="grid gap-3 md:grid-cols-3"><div className="space-y-1"><Label>Repeat every hours</Label><Input type="number" min={1} max={720} value={intervalHours} onChange={(e) => setIntervalHours(Number(e.target.value))} /></div><div className="flex items-center gap-2 pt-6"><Switch checked={startImmediately} onCheckedChange={setStartImmediately} /><Label>Start immediately</Label></div>{!startImmediately && <div className="space-y-1"><Label>Start at</Label><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>}</div><div className="flex flex-wrap gap-2"><Button onClick={() => scheduleMut.mutate()} disabled={drafts.length < 2 || scheduleMut.isPending}>Activate multi-channel schedule</Button>{data.schedule && <Button variant="outline" onClick={() => activeMut.mutate(!(data.schedule?.is_active ?? false))}>{data.schedule?.is_active ? "Pause schedule" : "Resume schedule"}</Button>}</div></div>
        <div className="border-t pt-4 flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium text-sm">Manual warm-up</div><p className="text-xs text-muted-foreground">Publishes the next shared queue item to all selected channels, one channel at a time.</p></div><Button variant="secondary" onClick={() => warmupMut.mutate()} disabled={drafts.length < 2 || warmupMut.isPending}>Run warm-up</Button></div>
        {data.schedule && <div className="text-xs text-muted-foreground">{data.schedule.is_active ? `Active · next run ${new Date(data.schedule.next_run_at).toLocaleString()}` : "Paused"}{data.schedule.last_error ? ` · Last error: ${data.schedule.last_error}` : ""}</div>}
      </CardContent>
    </Card>
  );
}
