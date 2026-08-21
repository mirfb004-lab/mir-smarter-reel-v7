import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyCloudinaryTransform } from "./cloudinary-transform";

export const testCloudinaryTransform = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sampleUrl: z.string().url(),
    transformation: z.string().max(1000),
    mode: z.enum(["replace", "stack"]).default("replace"),
  }).parse(d))
  .handler(async ({ data }) => {
    const result = applyCloudinaryTransform(data.sampleUrl, data.transformation, data.mode);
    if (result.error) return { ...result, resolves: false, resolveError: result.error };
    try {
      const response = await fetch(result.url, { method: "HEAD", redirect: "follow" });
      return { ...result, resolves: response.ok, status: response.status, resolveError: response.ok ? null : `Cloudinary returned HTTP ${response.status}` };
    } catch (error) {
      return { ...result, resolves: false, resolveError: error instanceof Error ? error.message : String(error) };
    }
  });
