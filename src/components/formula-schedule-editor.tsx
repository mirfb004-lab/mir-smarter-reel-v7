import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloudinaryUpload } from "@/components/cloudinary-upload";
import { CloudinaryTransformFields } from "@/components/cloudinary-transform-fields";
import { FormulaSchedulerFields, type FormulaSchedulerMode } from "@/components/formula-scheduler-fields";
import { getBufferPlatformCapabilities } from "@/lib/buffer-platforms";
import { PublishModeFields, isoToLocalInput, localInputToIso, type PublishMode } from "@/components/publish-mode-fields";
import { ChannelSelect } from "@/components/channel-picker";

type Schedule = any;
type Channel = any;

export function FormulaScheduleEditor({ schedule, channels, onSave, onCancel }: { schedule: Schedule; channels: Channel[]; onSave: (value: any) => void; onCancel: () => void }) {
  const [channelId, setChannelId] = useState(schedule.channel_id);
  const selectedChannel = useMemo(() => channels.find((channel) => channel.id === channelId), [channels, channelId]);
  const platform = String(selectedChannel?.platform ?? schedule.platform).toLowerCase().includes("tiktok") ? "tiktok" : "instagram";
  const capabilities = getBufferPlatformCapabilities(platform);
  const [postType, setPostType] = useState(schedule.post_type);
  const [mediaUrl, setMediaUrl] = useState(schedule.media_url ?? "");
  const [caption, setCaption] = useState(schedule.caption ?? "");
  const [thumbnailTimestamp, setThumbnailTimestamp] = useState(Number(schedule.thumbnail_timestamp ?? 0));
  const [privacyLevel, setPrivacyLevel] = useState(schedule.privacy_level ?? "PUBLIC");
  const [shareToFeed, setShareToFeed] = useState(Boolean(schedule.share_to_feed));
  const [allowComments, setAllowComments] = useState(Boolean(schedule.allow_comments));
  const [allowDuet, setAllowDuet] = useState(Boolean(schedule.allow_duet));
  const [allowStitch, setAllowStitch] = useState(Boolean(schedule.allow_stitch));
  const [schedulerMode, setSchedulerMode] = useState<FormulaSchedulerMode>(schedule.scheduler_mode ?? "every_x_hours");
  const [intervalHours, setIntervalHours] = useState(Number(schedule.interval_hours ?? 24));
  const [dailyTimes, setDailyTimes] = useState<string[]>(Array.isArray(schedule.daily_times) && schedule.daily_times.length ? schedule.daily_times : ["09:00"]);
  const [startAt, setStartAt] = useState(isoToLocalInput(schedule.start_at));
  const [publishMode, setPublishMode] = useState<PublishMode>(schedule.publish_mode ?? "shareNow");
  const [scheduledAt, setScheduledAt] = useState(isoToLocalInput(schedule.custom_schedule_at));
  const [delayMinutes, setDelayMinutes] = useState<number | null>(schedule.custom_schedule_offset_minutes ?? null);
  const [transformEnabled, setTransformEnabled] = useState(Boolean(schedule.cloudinary_transform_enabled));
  const [transform, setTransform] = useState(schedule.cloudinary_transform ?? "");
  const [transformMode, setTransformMode] = useState<"replace" | "stack">(schedule.cloudinary_transform_mode === "stack" ? "stack" : "replace");

  useEffect(() => {
    if (platform === "instagram" && !["reel", "story"].includes(postType)) setPostType("reel");
    if (platform === "tiktok" && !["video", "story"].includes(postType)) setPostType("video");
  }, [platform, postType]);

  return <div className="rounded-md border bg-muted/20 p-4 space-y-4" data-testid={`formula-schedule-editor-${schedule.id}`}>
    <div className="font-medium">Edit formula settings</div>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1"><Label>Buffer Connection & Channel</Label><ChannelSelect channels={channels.filter((channel) => channel.active && !channel.missing_since)} value={channelId} onValueChange={setChannelId} placeholder="Select a connected channel" includeMissing={false} /></div>
      <div className="space-y-1"><Label>Post type</Label><Select value={postType} onValueChange={setPostType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{platform === "instagram" ? <><SelectItem value="reel">Reel</SelectItem><SelectItem value="story">Story</SelectItem></> : <><SelectItem value="video">Video</SelectItem><SelectItem value="story">Story</SelectItem></>}</SelectContent></Select></div>
    </div>
    {schedule.mode === "multiple" ? <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">This is a Multiple/rotation formula. Rotation media, captions, order, and `last_published_item_id` are managed separately below and are not changed by this general settings edit.</div> : <>
      <div className="space-y-1"><Label>Media URL</Label><Input type="url" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} /><CloudinaryUpload onUploaded={setMediaUrl} onSelectExisting={setMediaUrl} /></div>
      <div className="space-y-1"><Label>Caption</Label><Textarea value={caption} onChange={(event) => setCaption(event.target.value)} disabled={platform === "instagram" && postType === "story"} /></div>
    </>}
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1"><Label>Thumbnail timestamp (seconds)</Label><Input type="number" min={0} step="0.1" value={thumbnailTimestamp} onChange={(event) => setThumbnailTimestamp(Number(event.target.value))} /></div>
      {platform === "tiktok" && <div className="space-y-1"><Label>Privacy level</Label><Select value={privacyLevel} onValueChange={setPrivacyLevel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PUBLIC">PUBLIC</SelectItem><SelectItem value="MUTUAL_FOLLOWS">MUTUAL_FOLLOWS</SelectItem><SelectItem value="SELF_ONLY">SELF_ONLY</SelectItem></SelectContent></Select></div>}
    </div>
    {platform === "instagram" ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={shareToFeed && postType === "reel"} disabled={postType !== "reel"} onCheckedChange={(checked) => setShareToFeed(Boolean(checked))} />Share to Feed</label> : <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><Checkbox checked={allowComments} disabled={capabilities.metadataSupport === "limited"} onCheckedChange={(checked) => setAllowComments(Boolean(checked))} />Allow Comments</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={allowDuet} disabled={capabilities.metadataSupport === "limited"} onCheckedChange={(checked) => setAllowDuet(Boolean(checked))} />Allow Duet</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={allowStitch} disabled={capabilities.metadataSupport === "limited"} onCheckedChange={(checked) => setAllowStitch(Boolean(checked))} />Allow Stitch</label></div>}
    <FormulaSchedulerFields mode={schedulerMode} intervalHours={intervalHours} dailyTimes={dailyTimes} onModeChange={setSchedulerMode} onIntervalChange={setIntervalHours} onDailyTimesChange={setDailyTimes} />
    {schedulerMode === "every_x_hours" && <div className="space-y-1"><Label>First run UTC time (optional)</Label><Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /><p className="text-xs text-muted-foreground">Saving recomputes `next_run_at` from the new scheduler settings.</p></div>}
    <PublishModeFields mode={publishMode} onModeChange={setPublishMode} scheduledAt={scheduledAt} onScheduledAtChange={setScheduledAt} delayMinutes={delayMinutes} onDelayMinutesChange={setDelayMinutes} />
    <CloudinaryTransformFields enabled={transformEnabled} transformation={transform} mode={transformMode} sampleUrl={schedule.mode === "multiple" ? schedule.media_url : mediaUrl} onEnabledChange={setTransformEnabled} onTransformationChange={setTransform} onModeChange={setTransformMode} />
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="button" onClick={() => onSave({ id: schedule.id, channel_id: channelId, platform, post_type: postType, media_url: schedule.mode === "multiple" ? schedule.media_url : mediaUrl, caption: schedule.mode === "multiple" ? schedule.caption : caption, thumbnail_timestamp: thumbnailTimestamp, privacy_level: platform === "tiktok" ? privacyLevel : null, share_to_feed: platform === "instagram" && postType === "reel" ? shareToFeed : false, allow_comments: allowComments, allow_duet: platform === "tiktok" ? allowDuet : false, allow_stitch: platform === "tiktok" ? allowStitch : false, interval_hours: intervalHours, publish_mode: publishMode, custom_schedule_offset_minutes: publishMode === "customScheduled" ? delayMinutes : null, custom_schedule_at: publishMode === "customScheduled" && delayMinutes == null ? localInputToIso(scheduledAt) : null, scheduler_mode: schedulerMode, daily_times: dailyTimes, start_at: schedulerMode === "every_x_hours" ? (startAt ? new Date(startAt).toISOString() : null) : null, cloudinary_transform_enabled: transformEnabled, cloudinary_transform: transform, cloudinary_transform_mode: transformMode })}>Save formula</Button></div>
  </div>;
}
