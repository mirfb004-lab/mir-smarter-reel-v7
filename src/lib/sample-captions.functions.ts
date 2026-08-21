import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const campaignId = z.string().uuid();
const sampleText = z.string().trim().min(1).max(4000);

async function assertCampaignOwner(sb: SupabaseClient, userId: string, id: string) {
  const { data, error } = await sb
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Campaign not found");
}

export const listSampleCaptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: campaignId }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCampaignOwner(context.supabase, context.userId, data.campaign_id);
    const { data: rows, error } = await context.supabase
      .from("sample_captions")
      .select("id,campaign_id,text,is_active,created_at")
      .eq("campaign_id", data.campaign_id)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createSampleCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: campaignId, text: sampleText }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCampaignOwner(context.supabase, context.userId, data.campaign_id);
    const { data: row, error } = await context.supabase
      .from("sample_captions")
      .insert({
        user_id: context.userId,
        campaign_id: data.campaign_id,
        text: data.text,
        is_active: true,
      })
      .select("id,campaign_id,text,is_active,created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSampleCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), text: sampleText }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("sample_captions")
      .update({ text: data.text })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id,campaign_id,text,is_active,created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sample caption not found");
    return row;
  });

export const setSampleCaptionActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("sample_captions")
      .update({ is_active: data.is_active })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id,campaign_id,text,is_active,created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sample caption not found");
    return row;
  });

export const deleteSampleCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("sample_captions")
      .delete({ count: "exact" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Sample caption not found");
    return { ok: true };
  });

export const updateCampaignSampleCaptionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaign_id: campaignId,
        use_sample_captions: z.boolean(),
        sample_caption_mode: z.enum(["style_reference", "learning_seed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCampaignOwner(context.supabase, context.userId, data.campaign_id);
    const { data: row, error } = await context.supabase
      .from("campaigns")
      .update({
        use_sample_captions: data.use_sample_captions,
        sample_caption_mode: data.sample_caption_mode,
      })
      .eq("id", data.campaign_id)
      .eq("user_id", context.userId)
      .select("id,use_sample_captions,sample_caption_mode")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
