import { Link } from "@tanstack/react-router";
import { useCampaignScope } from "@/components/campaign-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CampaignSelector() {
  const { campaigns, campaignId, setCampaignId, mode } = useCampaignScope();

  if (!campaigns.length) {
    return (
      <Link to="/campaigns" className="text-xs text-primary hover:underline px-2">
        Create your first campaign →
      </Link>
    );
  }

  const value = campaignId && campaigns.some((c) => c.id === campaignId) ? campaignId : campaigns[0].id;

  return (
    <Select value={value} onValueChange={setCampaignId}>
      <SelectTrigger className="h-8 text-xs w-full" disabled={mode === "global"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {campaigns.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${c.status === "active" ? "bg-success" : c.status === "paused" ? "bg-warning" : "bg-destructive"}`} />
              {c.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
