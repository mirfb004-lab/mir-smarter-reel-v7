import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type AppSchedulerMode = "every_x_hours" | "daily_times" | "manual";

export function AppSchedulerFields({ mode, intervalHours, dailyTimes, onModeChange, onIntervalChange, onDailyTimesChange }: { mode: AppSchedulerMode; intervalHours: number; dailyTimes: string[]; onModeChange: (mode: AppSchedulerMode) => void; onIntervalChange: (hours: number) => void; onDailyTimesChange: (times: string[]) => void }) {
  const addTime = () => onDailyTimesChange([...dailyTimes, "09:00"]);
  const updateTime = (index: number, value: string) => onDailyTimesChange(dailyTimes.map((time, i) => i === index ? value : time));
  const removeTime = (index: number) => onDailyTimesChange(dailyTimes.filter((_, i) => i !== index));
  return <div className="md:col-span-2 rounded-md border p-3 space-y-3"><div><div className="font-medium text-sm">App Scheduler</div><div className="text-xs text-muted-foreground">Controls when the app attempts a Sheet Mode cycle. This is separate from Buffer publish mode. Times are stored and evaluated in UTC.</div></div><Select value={mode} onValueChange={(value) => onModeChange(value as AppSchedulerMode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="every_x_hours">Every X hours</SelectItem><SelectItem value="daily_times">Daily at time(s) — UTC</SelectItem><SelectItem value="manual">Manual only</SelectItem></SelectContent></Select>{mode === "every_x_hours" && <div className="space-y-1"><Label>Interval in hours</Label><Input type="number" min={1} step="1" value={intervalHours} onChange={(event) => onIntervalChange(Math.max(1, Number(event.target.value) || 1))} /></div>}{mode === "daily_times" && <div className="space-y-2"><Label>Daily UTC times</Label>{dailyTimes.map((time, index) => <div className="flex gap-2" key={`${index}-${time}`}><Input type="time" value={time} onChange={(event) => updateTime(index, event.target.value)} /><Button type="button" variant="ghost" size="icon" onClick={() => removeTime(index)} disabled={dailyTimes.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" size="sm" onClick={addTime}><Plus className="h-4 w-4 mr-1" /> Add time</Button></div>}</div>;
}
