import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  PROVIDER_META, MODEL_REGISTRY, healthCheckProvider,
  type ProviderId, type ProviderConfig,
} from "./ai-gateway.server";

const providerIds = ["google","lovable","openai","openrouter","cloudflare","groq","deepseek"] as const;

const providerConfigSchema = z.object({
  id: z.enum(providerIds),
  apiKey: z.string(),
  apiKeys: z.array(z.string()).optional(),
  selectedModel: z.string(),
  baseUrl: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
});

const providersSchema = z.object({
  campaign_id: z.string().uuid().nullable().optional(),
  mode: z.enum(["strict","fallback"]),
  activeProvider: z.enum(providerIds),
  fallbackChain: z.array(z.enum(providerIds)),
  providers: z.record(z.string(), providerConfigSchema),
});

export const getProviderCatalog = createServerFn({ method: "GET" })
  .handler(async () => ({ meta: PROVIDER_META, models: MODEL_REGISTRY }));

export const updateAIProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providersSchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const campaignId = data.campaign_id ?? null;
    const fields = {
      provider_mode: data.mode,
      active_provider: data.activeProvider,
      fallback_chain: data.fallbackChain as never,
      providers_config: data.providers as never,
    };
    const base = sb.from("ai_settings").select("id").eq("user_id", context.userId);
    const { data: existing } = campaignId
      ? await base.eq("campaign_id", campaignId).maybeSingle()
      : await base.is("campaign_id", null).maybeSingle();
    if (existing) {
      const { error } = await sb.from("ai_settings").update(fields).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await sb.from("ai_settings")
      .insert({ ...fields, user_id: context.userId, campaign_id: campaignId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const runHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providerConfigSchema.parse(d))
  .handler(async ({ data }) => {
    const cfg: ProviderConfig = {
      id: data.id as ProviderId,
      apiKey: data.apiKey,
      apiKeys: data.apiKeys ?? [],
      selectedModel: data.selectedModel,
      baseUrl: data.baseUrl ?? undefined,
      accountId: data.accountId ?? undefined,
    };
    return healthCheckProvider(cfg);
  });

/** Health check EVERY key configured for a provider, so the user sees which keys are alive. */
export const runKeyPoolHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providerConfigSchema.parse(d))
  .handler(async ({ data }) => {
    const { providerKeyPool } = await import("./ai-gateway.server");
    const base: ProviderConfig = {
      id: data.id as ProviderId,
      apiKey: data.apiKey,
      apiKeys: data.apiKeys ?? [],
      selectedModel: data.selectedModel,
      baseUrl: data.baseUrl ?? undefined,
      accountId: data.accountId ?? undefined,
    };
    const keys = providerKeyPool(base);
    const results = await Promise.all(
      keys.map(async (k, index) => {
        const r = await healthCheckProvider({ ...base, apiKey: k, apiKeys: [] });
        return { index, ...r };
      }),
    );
    return { results };
  });


export const getResolvedAISettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid().nullable().optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    const { resolveCampaignAISettings } = await import("./ai-gateway.server");
    return resolveCampaignAISettings(context.supabase, context.userId, data?.campaign_id ?? null);
  });

export const discoverGeminiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      apiKey: z.string().min(1, "API key required"),
      verify: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { discoverAndVerifyGeminiModels } = await import("./providers/gemini-verifier");
    const models = await discoverAndVerifyGeminiModels(data.apiKey, { verify: data.verify ?? true });
    return { models };
  });

