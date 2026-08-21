import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { testCloudinaryTransform } from "@/lib/cloudinary-transform.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function CloudinaryTransformFields({ enabled, transformation, mode, sampleUrl, onEnabledChange, onTransformationChange, onModeChange }: { enabled: boolean; transformation: string; mode: "replace" | "stack"; sampleUrl?: string; onEnabledChange: (enabled: boolean) => void; onTransformationChange: (value: string) => void; onModeChange: (mode: "replace" | "stack") => void }) {
  const testFn = useServerFn(testCloudinaryTransform);
  const [result, setResult] = useState<{ url: string; resolves: boolean; resolveError: string | null } | null>(null);
  const [testing, setTesting] = useState(false);
  const [sample, setSample] = useState(sampleUrl ?? "");
  const test = async () => {
    const url = sample.trim();
    if (!url) { setResult({ url: "", resolves: false, resolveError: "Provide a Cloudinary sample URL or add a ready media URL first" }); return; }
    setTesting(true);
    try {
      const response = await testFn({ data: { sampleUrl: url, transformation, mode } });
      setResult({ url: response.url, resolves: response.resolves, resolveError: response.resolveError });
    } catch (error) {
      setResult({ url: "", resolves: false, resolveError: error instanceof Error ? error.message : String(error) });
    } finally { setTesting(false); }
  };
  return <div className="md:col-span-2 rounded-md border p-3 space-y-3"><div><div className="font-medium text-sm">Cloudinary transformation</div><div className="text-xs text-muted-foreground">Applied at publish time only. The stored video URL is never rewritten.</div></div><div className="flex items-center justify-between"><Label htmlFor="cloudinary-transform-enabled">Enable transformation</Label><Switch id="cloudinary-transform-enabled" checked={enabled} onCheckedChange={onEnabledChange} /></div>{enabled && <><div className="space-y-1"><Label>Transformation string</Label><Input value={transformation} onChange={(event) => onTransformationChange(event.target.value)} placeholder="w_1080,h_1920,c_fill,g_auto" /></div><div className="space-y-1"><Label>Existing transformation handling</Label><Select value={mode} onValueChange={(value) => onModeChange(value as "replace" | "stack")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="replace">Replace existing parameters</SelectItem><SelectItem value="stack">Stack before existing parameters</SelectItem></SelectContent></Select></div><div className="flex gap-2 items-end"><div className="flex-1 space-y-1"><Label>Sample Cloudinary URL</Label><Input value={sample} onChange={(event) => setSample(event.target.value)} placeholder="Use a ready row/item URL" /></div><Button type="button" variant="outline" onClick={test} disabled={testing}>{testing ? "Testing…" : "Test transformation"}</Button></div>{result && <div className="rounded-md bg-muted p-3 text-xs space-y-1"><div className={result.resolves ? "text-green-700" : "text-destructive"}>{result.resolves ? "Pass: transformed URL resolved" : `Fail: ${result.resolveError ?? "transformed URL did not resolve"}`}</div>{result.url && <div className="break-all"><strong>Before:</strong> {sample}<br /><strong>After:</strong> {result.url}</div>}</div>}</>}</div>;
}
