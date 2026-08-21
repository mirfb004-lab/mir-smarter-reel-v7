import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const id = z.string().uuid();

export const listContentGalleryItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("content_gallery_items")
      .select("id,url,label,media_type,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateContentGalleryLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id, label: z.string().max(160).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("content_gallery_items")
      .update({ label: data.label?.trim() || null })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id,url,label,media_type,created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Gallery item not found");
    return row;
  });

export const deleteContentGalleryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("content_gallery_items")
      .delete({ count: "exact" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Gallery item not found");
    return { ok: true };
  });
