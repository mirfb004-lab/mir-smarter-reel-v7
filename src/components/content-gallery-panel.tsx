import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Trash2, Check } from "lucide-react";
import { listContentGalleryItems, updateContentGalleryLabel, deleteContentGalleryItem } from "@/lib/content-gallery.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function ContentGalleryPanel({ onSelect, compact = false }: { onSelect?: (url: string) => void; compact?: boolean }) {
  const list = useServerFn(listContentGalleryItems);
  const updateLabel = useServerFn(updateContentGalleryLabel);
  const remove = useServerFn(deleteContentGalleryItem);
  const qc = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { data: items, isLoading } = useQuery({ queryKey: ["content-gallery"], queryFn: () => list() });
  const labelMut = useMutation({
    mutationFn: (value: { id: string; label: string | null }) => updateLabel({ data: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-gallery"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update label"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Gallery item removed; Cloudinary media was not deleted"); qc.invalidateQueries({ queryKey: ["content-gallery"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete gallery item"),
  });
  const copyUrl = async (id: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
  };
  return <Card><CardHeader><CardTitle>{compact ? "Choose from gallery" : "Content Gallery"}</CardTitle><CardDescription>{compact ? "Reuse an uploaded asset without uploading it again." : "Every successful Cloudinary upload is reusable here. Removing an item only removes this gallery record; the public Cloudinary URL remains usable elsewhere."}</CardDescription></CardHeader><CardContent>{isLoading ? <div className="text-sm text-muted-foreground">Loading gallery…</div> : !items?.length ? <div className="text-sm text-muted-foreground">No uploaded media yet.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item: any) => <div key={item.id} className="overflow-hidden rounded-md border bg-background"><div className="aspect-video bg-muted">{item.media_type === "video" ? <video src={item.url} controls className="h-full w-full object-cover" /> : <img src={item.url} alt={item.label ?? "Uploaded content"} className="h-full w-full object-cover" />}</div><div className="space-y-2 p-2"><div className="flex items-center justify-between gap-2"><Badge variant="secondary">{item.media_type}</Badge><span className="text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</span></div><Input defaultValue={item.label ?? ""} placeholder="Optional label" onBlur={(event) => { const value = event.target.value.trim() || null; if (value !== (item.label ?? null)) labelMut.mutate({ id: item.id, label: value }); }} /><div className="flex flex-wrap gap-1"><Button type="button" size="sm" variant="outline" onClick={() => onSelect?.(item.url)} disabled={!onSelect}>Choose</Button><Button type="button" size="sm" variant="outline" onClick={() => void copyUrl(item.id, item.url)}>{copiedId === item.id ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}Copy URL</Button><Button type="button" size="sm" variant="ghost" asChild><a href={item.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3 w-3" />Preview</a></Button><Button type="button" size="sm" variant="ghost" onClick={() => deleteMut.mutate(item.id)} disabled={deleteMut.isPending}><Trash2 className="mr-1 h-3 w-3 text-destructive" />Delete</Button></div></div></div>)}</div>}</CardContent></Card>;
}
