type UsageRow = {
  channel_id: string;
  campaign_id?: string | null;
};

type ChannelRow = {
  id: string;
  campaign_id?: string | null;
};

export async function addChannelUsageLabels<T extends ChannelRow>(sb: any, userId: string, channels: T[]): Promise<Array<T & { usage_labels: string[] }>> {
  if (!channels.length) return [];
  const channelIds = channels.map((channel) => channel.id);
  const [campaignsResult, legacySchedulesResult, multiTargetsResult, formulaSchedulesResult, sheetsResult] = await Promise.all([
    sb.from("campaigns").select("id,name").eq("user_id", userId),
    sb.from("schedules").select("channel_id,campaign_id").in("channel_id", channelIds),
    sb.from("campaign_channel_targets").select("channel_id,campaign_id").eq("user_id", userId).in("channel_id", channelIds),
    sb.from("recurring_schedules").select("channel_id,campaign_id").eq("user_id", userId).in("channel_id", channelIds),
    sb.from("sheet_mode_channel_targets").select("channel_id,sheet_id,sheet_mode_sheets!inner(id,name,user_id)").eq("sheet_mode_sheets.user_id", userId).in("channel_id", channelIds),
  ]);
  for (const result of [campaignsResult, legacySchedulesResult, multiTargetsResult, formulaSchedulesResult, sheetsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const campaignNames = new Map<string, string>();
  for (const campaign of campaignsResult.data ?? []) campaignNames.set(campaign.id, campaign.name);
  const sheetNames = new Map<string, string>();
  for (const row of sheetsResult.data ?? []) {
    const sheet = Array.isArray(row.sheet_mode_sheets) ? row.sheet_mode_sheets[0] : row.sheet_mode_sheets;
    if (sheet?.id) sheetNames.set(sheet.id, sheet.name);
  }

  const labelsByChannel = new Map<string, Set<string>>();
  const add = (channelId: string, label: string) => {
    if (!channelId || !label) return;
    const labels = labelsByChannel.get(channelId) ?? new Set<string>();
    labels.add(label);
    labelsByChannel.set(channelId, labels);
  };
  const addCampaignUsage = (row: UsageRow) => add(row.channel_id, row.campaign_id ? (campaignNames.get(row.campaign_id) ?? "Campaign") : "Shared workspace");

  for (const channel of channels) {
    if (channel.campaign_id) addCampaignUsage({ channel_id: channel.id, campaign_id: channel.campaign_id });
    else add(channel.id, "Shared workspace");
  }
  for (const row of legacySchedulesResult.data ?? []) addCampaignUsage(row);
  for (const row of multiTargetsResult.data ?? []) addCampaignUsage(row);
  for (const row of formulaSchedulesResult.data ?? []) add(row.channel_id, row.campaign_id ? (campaignNames.get(row.campaign_id) ?? "1 Reel Formula") : "1 Reel Formula");
  for (const row of sheetsResult.data ?? []) add(row.channel_id, `Sheet Mode: ${sheetNames.get(row.sheet_id) ?? "Sheet"}`);

  return channels.map((channel) => ({
    ...channel,
    usage_labels: [...(labelsByChannel.get(channel.id) ?? new Set(["Not yet used in any campaign"]))],
  }));
}
