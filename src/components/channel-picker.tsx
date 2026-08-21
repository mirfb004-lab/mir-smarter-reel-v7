import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export type ChannelPickerOption = {
  id: string;
  name?: string | null;
  platform?: string | null;
  missing_since?: string | null;
  usage_labels?: string[];
};

export function filterChannelOptions<T extends ChannelPickerOption>(channels: T[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return channels;
  return channels.filter((channel) => `${channel.name ?? ""} ${channel.platform ?? ""} ${(channel.usage_labels ?? []).join(" ")}`.toLowerCase().includes(needle));
}

export function ChannelSearchField({ value, onChange, placeholder = "Search channels by name or platform…" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label="Search Buffer channels" className="h-8 text-xs" />;
}

export function ChannelOptionLabel({ channel }: { channel: ChannelPickerOption }) {
  const usage = channel.usage_labels?.length ? channel.usage_labels : ["Not yet used in any campaign"];
  return <span className="block min-w-0"><span className="block truncate">{channel.name ?? channel.platform ?? "Channel"} · {channel.platform ?? "unknown platform"}{channel.missing_since ? " (missing)" : ""}</span><span className="block truncate text-[10px] text-muted-foreground">Used in: {usage.join(", ")}</span></span>;
}

export function ChannelSelect<T extends ChannelPickerOption>({ channels, value, onValueChange, placeholder, className, includeMissing = true }: { channels: T[]; value: string; onValueChange: (value: string) => void; placeholder?: string; className?: string; includeMissing?: boolean }) {
  const [query, setQuery] = useState("");
  const visible = filterChannelOptions(includeMissing ? channels : channels.filter((channel) => !channel.missing_since), query);
  return <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent>
      <div className="px-2 pb-2" onKeyDown={(event) => event.stopPropagation()}>
        <ChannelSearchField value={query} onChange={setQuery} />
      </div>
      {visible.length ? visible.map((channel) => <SelectItem key={channel.id} value={channel.id}><ChannelOptionLabel channel={channel} /></SelectItem>) : <div className="px-2 py-2 text-xs text-muted-foreground">No matching channels.</div>}
    </SelectContent>
  </Select>;
}
