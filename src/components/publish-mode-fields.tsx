import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PublishMode = "addToQueue" | "shareNow" | "customScheduled";

export const PUBLISH_MODES: { v: PublishMode; l: string }[] = [
  { v: "addToQueue", l: "Add to Buffer Queue" },
  { v: "shareNow", l: "Publish Immediately" },
  { v: "customScheduled", l: "Custom Scheduled Time" },
];

/** Convert an ISO string to a value usable by <input type="datetime-local"> (local time). */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface Props {
  mode: PublishMode;
  onModeChange: (m: PublishMode) => void;
  /** datetime-local value */
  scheduledAt: string;
  onScheduledAtChange: (v: string) => void;
  delayMinutes: number | null;
  onDelayMinutesChange: (v: number | null) => void;
  className?: string;
}

export function PublishModeFields({
  mode, onModeChange, scheduledAt, onScheduledAtChange, delayMinutes, onDelayMinutesChange, className,
}: Props) {
  return (
    <div className={className}>
      <div className="space-y-1">
        <Label>Publishing mode</Label>
        <Select value={mode} onValueChange={(v) => onModeChange(v as PublishMode)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PUBLISH_MODES.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {mode === "customScheduled" && (
        <div className="grid gap-3 sm:grid-cols-2 pt-3">
          <div className="space-y-1">
            <Label>Date &amp; time</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              disabled={delayMinutes != null}
              onChange={(e) => onScheduledAtChange(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Or publish in… (minutes from run)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={10080}
                placeholder="e.g. 5"
                value={delayMinutes ?? ""}
                onChange={(e) => onDelayMinutesChange(e.target.value ? Number(e.target.value) : null)}
              />
              <Button type="button" variant="outline" onClick={() => onDelayMinutesChange(5)}>+5 min</Button>
              {delayMinutes != null && (
                <Button type="button" variant="ghost" onClick={() => onDelayMinutesChange(null)}>Clear</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A relative delay is computed at publish time and overrides the fixed date.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
