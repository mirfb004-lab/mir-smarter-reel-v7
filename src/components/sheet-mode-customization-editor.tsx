import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Draft = Record<string, any>;
type Props = { platform: string; value: Draft; onChange: (value: Draft) => void; onSave: () => void; onCancel: () => void };

const categories = [["1", "Film & Animation"], ["2", "Autos & Vehicles"], ["10", "Music"], ["15", "Pets & Animals"], ["17", "Sports"], ["19", "Travel & Events"], ["20", "Gaming"], ["22", "People & Blogs"], ["23", "Comedy"], ["24", "Entertainment"], ["25", "News & Politics"], ["26", "Howto & Style"], ["27", "Education"], ["28", "Science & Tech"], ["29", "Nonprofits & Activism"]] as const;

export function SheetModeCustomizationEditor({ platform, value, onChange, onSave, onCancel }: Props) {
  const p = platform.toLowerCase();
  const set = (key: string, next: any) => onChange({ ...value, [key]: next });
  const toggle = (key: string) => <Switch checked={Boolean(value[key])} onCheckedChange={(checked) => set(key, checked)} />;
  return (
    <div className="basis-full rounded-md border p-3 space-y-3">
      <Label>Verified {platform} Buffer settings</Label>
      {p === "instagram" && <>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm"><span>Post type</span><Select value={value.postType ?? "reel"} onValueChange={(v) => set("postType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="post">Post</SelectItem><SelectItem value="reel">Reel</SelectItem><SelectItem value="story">Story</SelectItem></SelectContent></Select></label>
          <label className="flex items-center justify-between text-sm"><span>Share to Feed</span>{toggle("shareToFeed")}</label>
          <label className="flex items-center justify-between text-sm"><span>AI-generated disclosure</span>{toggle("isAiGenerated")}</label>
          <label className="space-y-1 text-sm"><span>Shop Grid link</span><Input value={value.link ?? ""} onChange={(e) => set("link", e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span>Geolocation ID</span><Input value={value.geolocation?.id ?? ""} onChange={(e) => set("geolocation", { id: e.target.value, text: value.geolocation?.text ?? "" })} /></label>
          <label className="space-y-1 text-sm"><span>Geolocation text</span><Input value={value.geolocation?.text ?? ""} onChange={(e) => set("geolocation", { id: value.geolocation?.id ?? "", text: e.target.value })} /></label>
        </div>
        <p className="text-xs text-muted-foreground">Instagram firstComment is not shown because Buffer currently accepts but does not reliably persist it.</p>
      </>}
      {p === "tiktok" && <div className="grid gap-3 md:grid-cols-2"><label className="flex items-center justify-between text-sm"><span>AI-generated disclosure</span>{toggle("isAiGenerated")}</label><label className="space-y-1 text-sm"><span>Photo title</span><Input value={value.title ?? ""} onChange={(e) => set("title", e.target.value)} /></label><p className="text-xs text-muted-foreground md:col-span-2">Privacy, comments, duet, and stitch controls are not supported by Buffer and are not available here.</p></div>}
      {p === "facebook" && <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm"><span>Post type</span><Select value={value.facebookType ?? "post"} onValueChange={(v) => set("facebookType", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="post">Post</SelectItem><SelectItem value="story">Story</SelectItem><SelectItem value="reel">Reel</SelectItem></SelectContent></Select></label><label className="space-y-1 text-sm"><span>First comment</span><Input value={value.firstComment ?? ""} onChange={(e) => set("firstComment", e.target.value)} /></label><label className="space-y-1 text-sm md:col-span-2"><span>Link attachment URL</span><Input value={value.linkAttachment?.url ?? ""} onChange={(e) => set("linkAttachment", { ...(value.linkAttachment ?? {}), url: e.target.value })} /></label><label className="space-y-1 text-sm"><span>Link title</span><Input value={value.linkAttachment?.title ?? ""} onChange={(e) => set("linkAttachment", { ...(value.linkAttachment ?? {}), url: value.linkAttachment?.url ?? "", title: e.target.value })} /></label><label className="space-y-1 text-sm"><span>Link description</span><Input value={value.linkAttachment?.description ?? ""} onChange={(e) => set("linkAttachment", { ...(value.linkAttachment ?? {}), url: value.linkAttachment?.url ?? "", description: e.target.value })} /></label></div>}
      {p === "youtube" && <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm"><span>Title</span><Input value={value.youtubeTitle ?? ""} onChange={(e) => set("youtubeTitle", e.target.value)} /></label><label className="space-y-1 text-sm"><span>Privacy</span><Select value={value.youtubePrivacy ?? "public"} onValueChange={(v) => set("youtubePrivacy", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="unlisted">Unlisted</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select></label><label className="space-y-1 text-sm"><span>Category</span><Select value={value.categoryId ?? "22"} onValueChange={(v) => set("categoryId", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></label>{[["madeForKids", "Made for kids"], ["notifySubscribers", "Notify subscribers"], ["embeddable", "Embeddable"]].map(([key, label]) => <label key={key} className="flex items-center justify-between text-sm"><span>{label}</span>{toggle(key)}</label>)}<label className="space-y-1 text-sm"><span>License</span><Select value={value.license ?? "youtube"} onValueChange={(v) => set("license", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="youtube">Standard YouTube</SelectItem><SelectItem value="creativeCommon">Creative Commons</SelectItem></SelectContent></Select></label></div>}
      {p === "pinterest" && <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm"><span>Board service ID</span><Input value={value.boardServiceId ?? ""} onChange={(e) => set("boardServiceId", e.target.value)} /></label><label className="space-y-1 text-sm"><span>Pin title</span><Input value={value.title ?? ""} onChange={(e) => set("title", e.target.value)} /></label><p className="text-xs text-muted-foreground md:col-span-2">Pinterest destination URL is not shown because Buffer currently drops it.</p></div>}
      <div className="flex gap-2"><Button onClick={onSave}>Save customization</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div>
    </div>
  );
}
