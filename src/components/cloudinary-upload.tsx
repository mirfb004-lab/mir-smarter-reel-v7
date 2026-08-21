import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { uploadCloudinaryFile, cloudinaryUploadLimits } from "@/lib/cloudinary.server";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ContentGalleryPicker } from "@/components/content-gallery-picker";

export function CloudinaryUpload({ onUploaded, onSelectExisting, accept = "image/*,video/*" }: { onUploaded: (url: string) => void; onSelectExisting?: (url: string) => void; accept?: string }) {
  const upload = useServerFn(uploadCloudinaryFile);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const choose = async (file?: File) => {
    if (!file) return;
    const image = file.type.startsWith("image/");
    const limit = image ? cloudinaryUploadLimits.maxImageBytes : cloudinaryUploadLimits.maxVideoBytes;
    if (file.size > limit) { toast.error(`File is larger than the ${image ? "25MB image" : "500MB video"} limit`); return; }
    setBusy(true); setProgress(15);
    try {
      const form = new FormData(); form.append("file", file);
      setProgress(45);
      const result = await upload({ data: form });
      setProgress(100); onUploaded(result.url); await qc.invalidateQueries({ queryKey: ["content-gallery"] }); toast.success("Upload complete");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed"); }
    finally { setBusy(false); setTimeout(() => setProgress(0), 600); }
  };
  return <div className={`rounded-md border border-dashed p-3 text-center ${dragging ? "border-primary bg-primary/5" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void choose(e.dataTransfer.files?.[0]); }}><input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => void choose(e.target.files?.[0])} /><div className="flex flex-wrap justify-center gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}><UploadCloud className="mr-2 h-4 w-4" />{busy ? "Uploading…" : "Upload media"}</Button>{onSelectExisting && <ContentGalleryPicker onSelect={onSelectExisting} />}</div>{progress > 0 && <Progress value={progress} className="mt-2" />}<p className="mt-1 text-xs text-muted-foreground">Drop an image or video here, or choose a file.</p></div>;
}
