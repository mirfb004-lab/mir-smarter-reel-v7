import { AppSchedulerFields, type AppSchedulerMode } from "@/components/app-scheduler-fields";
import { CloudinaryTransformFields } from "@/components/cloudinary-transform-fields";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Settings = {
  name: string;
  publish_mode: "shareNow" | "addToQueue" | "customScheduled";
  custom_schedule_offset_minutes: number | null;
  custom_schedule_at: string | null;
  rows_per_run: number;
  schedule_label: string | null;
  selection_rule: string;
  after_publish_mark_status: boolean;
  after_publish_save_post_id: boolean;
  after_publish_save_time: boolean;
  after_publish_save_url: boolean;
  retry_failed: boolean;
  scheduler_mode: AppSchedulerMode;
  scheduler_interval_hours: number;
  daily_times: string[];
  cloudinary_transform_enabled: boolean;
  cloudinary_transform: string;
  cloudinary_transform_mode: "replace" | "stack";
};

const RULES = [["first_ready", "First ready"], ["oldest_first", "Oldest first"], ["random", "Random"]];

export function SheetModeSettingsEditor({ initial, sampleUrl, onSave, onCancel }: { initial: Settings; sampleUrl?: string; onSave: (settings: Settings) => void; onCancel: () => void }) {
  const [settings, setSettings] = useState(initial);
  const set = (patch: Partial<Settings>) => setSettings((value) => ({ ...value, ...patch }));
  return <div className="rounded-md border p-4 space-y-4"><div className="grid gap-4 md:grid-cols-2"><div className="space-y-1 md:col-span-2"><Label>Name</Label><Input value={settings.name} onChange={(e) => set({ name: e.target.value })} /></div><div className="space-y-1"><Label>Publish mode</Label><Select value={settings.publish_mode} onValueChange={(v) => set({ publish_mode: v as Settings["publish_mode"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="shareNow">Publish immediately</SelectItem><SelectItem value="addToQueue">Add to Buffer queue</SelectItem><SelectItem value="customScheduled">Custom schedule</SelectItem></SelectContent></Select></div>{settings.publish_mode === "customScheduled" && <div className="space-y-1"><Label>Custom schedule</Label><Select value={settings.custom_schedule_offset_minutes == null ? "absolute" : String(settings.custom_schedule_offset_minutes)} onValueChange={(v) => v === "absolute" ? set({ custom_schedule_offset_minutes: null }) : set({ custom_schedule_offset_minutes: Number(v), custom_schedule_at: null })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="5">5 minutes from now</SelectItem><SelectItem value="15">15 minutes from now</SelectItem><SelectItem value="30">30 minutes from now</SelectItem><SelectItem value="60">60 minutes from now</SelectItem><SelectItem value="absolute">Specific date/time</SelectItem></SelectContent></Select>{settings.custom_schedule_offset_minutes == null && <Input className="mt-2" type="datetime-local" value={settings.custom_schedule_at ?? ""} onChange={(e) => set({ custom_schedule_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />}</div>}<AppSchedulerFields mode={settings.scheduler_mode} intervalHours={settings.scheduler_interval_hours} dailyTimes={settings.daily_times} onModeChange={(scheduler_mode) => set({ scheduler_mode })} onIntervalChange={(scheduler_interval_hours) => set({ scheduler_interval_hours })} onDailyTimesChange={(daily_times) => set({ daily_times })} /><CloudinaryTransformFields enabled={settings.cloudinary_transform_enabled} transformation={settings.cloudinary_transform} mode={settings.cloudinary_transform_mode} sampleUrl={sampleUrl} onEnabledChange={(cloudinary_transform_enabled) => set({ cloudinary_transform_enabled })} onTransformationChange={(cloudinary_transform) => set({ cloudinary_transform })} onModeChange={(cloudinary_transform_mode) => set({ cloudinary_transform_mode })} /><div className="space-y-1"><Label>Rows per run</Label><Input type="number" min={1} max={500} value={settings.rows_per_run} onChange={(e) => set({ rows_per_run: Number(e.target.value) || 1 })} /></div><div className="space-y-1"><Label>Schedule label</Label><Input value={settings.schedule_label ?? ""} onChange={(e) => set({ schedule_label: e.target.value })} /></div><div className="space-y-1 md:col-span-2"><Label>Selection rule</Label><Select value={settings.selection_rule} onValueChange={(v) => set({ selection_rule: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RULES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div><div className="rounded-md border p-3 space-y-3"><div className="font-medium text-sm">After publish</div>{[["after_publish_mark_status", "Mark status complete"], ["after_publish_save_post_id", "Save Buffer post ID"], ["after_publish_save_time", "Save publish time"], ["after_publish_save_url", "Save published URL"], ["retry_failed", "Retry failed channel publishes"]].map(([key, label]) => <div key={key} className="flex justify-between text-sm"><span>{label}</span><Switch checked={Boolean(settings[key as keyof Settings])} onCheckedChange={(checked) => set({ [key]: checked } as Partial<Settings>)} /></div>)}</div><div className="flex gap-2"><Button onClick={() => onSave(settings)} disabled={!settings.name.trim()}>Save settings</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div></div>;
}
