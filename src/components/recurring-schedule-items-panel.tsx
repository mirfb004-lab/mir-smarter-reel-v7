import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CloudinaryUpload } from "@/components/cloudinary-upload";
import { addRecurringScheduleItem, deleteRecurringScheduleItem, listRecurringScheduleItems, moveRecurringScheduleItem, updateRecurringScheduleItem } from "@/lib/recurring-schedules.functions";

export function RecurringScheduleItemsPanel({ scheduleId }: { scheduleId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listRecurringScheduleItems);
  const addFn = useServerFn(addRecurringScheduleItem);
  const updateFn = useServerFn(updateRecurringScheduleItem);
  const deleteFn = useServerFn(deleteRecurringScheduleItem);
  const moveFn = useServerFn(moveRecurringScheduleItem);
  const { data: items } = useQuery({ queryKey: ["recurring-schedule-items", scheduleId], queryFn: () => listFn({ data: { schedule_id: scheduleId } }) });
  const [draft, setDraft] = useState({ media_url: "", caption: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["recurring-schedule-items", scheduleId] });
  const add = useMutation({ mutationFn: () => addFn({ data: { schedule_id: scheduleId, ...draft } }), onSuccess: () => { setDraft({ media_url: "", caption: "" }); refresh(); toast.success("Rotation item added"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Add failed") });
  const update = useMutation({ mutationFn: (item: { id: string; media_url: string; caption: string }) => updateFn({ data: item }), onSuccess: () => { refresh(); toast.success("Rotation item saved"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed") });
  const remove = useMutation({ mutationFn: (id: string) => deleteFn({ data: { id } }), onSuccess: () => { refresh(); toast.success("Rotation item deleted"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed") });
  const move = useMutation({ mutationFn: (input: { id: string; direction: "up" | "down" }) => moveFn({ data: input }), onSuccess: refresh, onError: (e) => toast.error(e instanceof Error ? e.message : "Reorder failed") });
  return <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-3"><div className="text-xs font-medium">Rotation items</div>{(items ?? []).map((item: any, index: number) => <div key={item.id} className="rounded border bg-background p-2 space-y-2"><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Position {item.position}</span><Button type="button" size="sm" variant="outline" disabled={index === 0 || move.isPending} onClick={() => move.mutate({ id: item.id, direction: "up" })}>Up</Button><Button type="button" size="sm" variant="outline" disabled={index === (items?.length ?? 1) - 1 || move.isPending} onClick={() => move.mutate({ id: item.id, direction: "down" })}>Down</Button><Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>Delete</Button></div><Input value={item.media_url} onChange={(e) => { item.media_url = e.target.value; }} onBlur={() => update.mutate({ id: item.id, media_url: item.media_url, caption: item.caption })} placeholder="Media URL" /><Textarea defaultValue={item.caption} onBlur={(e) => update.mutate({ id: item.id, media_url: item.media_url, caption: e.target.value })} placeholder="Caption" /><CloudinaryUpload onUploaded={(url) => update.mutate({ id: item.id, media_url: url, caption: item.caption })} onSelectExisting={(url) => update.mutate({ id: item.id, media_url: url, caption: item.caption })} /></div>)}<div className="rounded border border-dashed p-2 space-y-2"><div className="text-xs text-muted-foreground">Add item</div><Input value={draft.media_url} onChange={(e) => setDraft((value) => ({ ...value, media_url: e.target.value }))} placeholder="Media URL" /><CloudinaryUpload onUploaded={(url) => setDraft((value) => ({ ...value, media_url: url }))} onSelectExisting={(url) => setDraft((value) => ({ ...value, media_url: url }))} /><Textarea value={draft.caption} onChange={(e) => setDraft((value) => ({ ...value, caption: e.target.value }))} placeholder="Caption" /><Button type="button" size="sm" onClick={() => add.mutate()} disabled={!draft.media_url || add.isPending}>Add rotation item</Button></div></div>;
}
