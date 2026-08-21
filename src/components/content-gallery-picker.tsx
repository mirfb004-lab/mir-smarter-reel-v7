import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listContentGalleryItems } from "@/lib/content-gallery.functions";
import { Library } from "lucide-react";

export function ContentGalleryPicker({ onSelect }: { onSelect: (url: string) => void }) {
  const list = useServerFn(listContentGalleryItems);
  const { data: items, isLoading } = useQuery({ queryKey: ["content-gallery"], queryFn: () => list() });
  return <Popover><PopoverTrigger asChild><Button type="button" variant="outline"><Library className="mr-2 h-4 w-4" />Choose from gallery</Button></PopoverTrigger><PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))]"><div className="space-y-2"><div className="font-medium text-sm">Choose uploaded content</div>{isLoading ? <div className="text-xs text-muted-foreground">Loading…</div> : !items?.length ? <div className="text-xs text-muted-foreground">No gallery items yet. Upload media first.</div> : <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto">{items.map((item: any) => <button type="button" key={item.id} className="rounded border p-1 text-left hover:bg-muted" onClick={() => onSelect(item.url)}><div className="aspect-video overflow-hidden rounded bg-muted">{item.media_type === "video" ? <video src={item.url} muted className="h-full w-full object-cover" /> : <img src={item.url} alt={item.label ?? "Gallery item"} className="h-full w-full object-cover" />}</div><div className="truncate pt-1 text-[11px]">{item.label ?? item.media_type}</div></button>)}</div>}</div></PopoverContent></Popover>;
}
