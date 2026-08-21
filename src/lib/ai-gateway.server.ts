// Dynamic multi-provider AI engine with Strict + Fallback routing.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import { generateText, type LanguageModel } from "ai";
type LanguageModelV1 = LanguageModel;

export type ProviderId =
  | "google"
  | "lovable"
  | "openai"
  | "openrouter"
  | "cloudflare"
  | "groq"
  | "deepseek";

export interface ProviderConfig {
  id: ProviderId;
  apiKey: string;
  /** Optional pool of keys for the SAME provider. Tried in order when one fails / hits quota. */
  apiKeys?: string[];
  selectedModel: string;
  baseUrl?: string;
  accountId?: string; // Cloudflare only
}

/** All usable keys for a provider, in priority order, deduped. */
export function providerKeyPool(cfg: ProviderConfig): string[] {
  const list = [cfg.apiKey, ...(cfg.apiKeys ?? [])]
    .map((k) => (k ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of list) if (!seen.has(k)) { seen.add(k); out.push(k); }
  if (!out.length && cfg.id === "lovable" && process.env.LOVABLE_API_KEY) out.push(process.env.LOVABLE_API_KEY);
  return out;
}

export interface AISettingsSchema {
  mode: "strict" | "fallback";
  activeProvider: ProviderId;
  fallbackChain: ProviderId[];
  providers: Partial<Record<ProviderId, ProviderConfig>>;
}

export interface ModelMeta {
  id: string;
  name: string;
  vision: boolean;
  isRecommended?: boolean;
}

export const PROVIDER_META: Record<ProviderId, { name: string; needsAccountId?: boolean; note?: string }> = {
  google: { name: "Google AI Studio", note: "Direct Gemini API — recommended free tier" },
  lovable: { name: "Lovable AI Gateway", note: "Default OpenAI-compatible gateway" },
  openai: { name: "OpenAI (ChatGPT)" },
  openrouter: { name: "OpenRouter", note: "Unified multi-model API" },
  cloudflare: { name: "Cloudflare Workers AI", needsAccountId: true, note: "Edge-native models" },
  groq: { name: "Groq", note: "Ultra-fast inference" },
  deepseek: { name: "DeepSeek", note: "Cost-effective open model API" },
};

export const MODEL_REGISTRY: Record<ProviderId, ModelMeta[]> = {
  google: [
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (Fast + Vision)", vision: true, isRecommended: true },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (Deep Reasoning + Vision)", vision: true, isRecommended: true },
    { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash (Experimental)", vision: true },
  ],
  lovable: [
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (via Gateway)", vision: true, isRecommended: true },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (via Gateway)", vision: true, isRecommended: true },
    { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", vision: true },
    { id: "openai/gpt-5-mini", name: "GPT-5 mini", vision: true },
    { id: "openai/gpt-5", name: "GPT-5", vision: true },
  ],
  openai: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini (Fast + Vision)", vision: true, isRecommended: true },
    { id: "gpt-4o", name: "GPT-4o (High Performance + Vision)", vision: true, isRecommended: true },
  ],
  openrouter: [
    { id: "google/gemini-flash-1.5", name: "Google Gemini 1.5 Flash", vision: true, isRecommended: true },
    { id: "google/gemini-pro-1.5", name: "Google Gemini 1.5 Pro", vision: true },
    { id: "openai/gpt-4o-mini", name: "OpenAI GPT-4o Mini", vision: true },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", vision: false },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", vision: false, isRecommended: true },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", vision: false },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7b", vision: false },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek-V3", vision: false, isRecommended: true },
    { id: "deepseek-reasoner", name: "DeepSeek-R1 (Reasoning)", vision: false },
  ],
  cloudflare: [
    { id: "@cf/meta/llama-3-8b-instruct", name: "Llama 3 8B (Edge)", vision: false, isRecommended: true },
    { id: "@cf/meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B (Edge)", vision: false },
  ],
};

export function requireLovableApiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY. Enable Lovable AI in your workspace.");
  return key;
}

// Back-compat helper (some legacy paths still call this).
export function createAiGateway(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    supportsStructuredOutputs: false,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

function modelMeta(id: ProviderId, modelId: string): ModelMeta | undefined {
  return MODEL_REGISTRY[id]?.find((m) => m.id === modelId);
}

export function getAIProviderInstance(config: ProviderConfig): LanguageModelV1 {
  switch (config.id) {
    case "google":
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.selectedModel);
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(config.selectedModel);
    case "groq":
      return createGroq({ apiKey: config.apiKey })(config.selectedModel);
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: config.baseUrl || "https://openrouter.ai/api/v1",
        headers: { Authorization: `Bearer ${config.apiKey}` },
      })(config.selectedModel);
    case "deepseek":
      return createOpenAICompatible({
        name: "deepseek",
        baseURL: config.baseUrl || "https://api.deepseek.com",
        headers: { Authorization: `Bearer ${config.apiKey}` },
      })(config.selectedModel);
    case "cloudflare":
      if (!config.accountId) throw new Error("Cloudflare provider requires an Account ID.");
      return createOpenAICompatible({
        name: "cloudflare",
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1`,
        headers: { Authorization: `Bearer ${config.apiKey}` },
      })(config.selectedModel);
    case "lovable":
    default: {
      const key = config.apiKey || process.env.LOVABLE_API_KEY || "";
      if (!key) throw new Error("Lovable AI Gateway requires LOVABLE_API_KEY.");
      return createOpenAICompatible({
        name: "lovable",
        baseURL: config.baseUrl || "https://ai.gateway.lovable.dev/v1",
        headers: {
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "vercel-ai-sdk",
        },
      })(config.selectedModel);
    }
  }
}

/**
 * Normalize whatever is stored in ai_settings into an AISettingsSchema.
 * Falls back to Lovable gateway with LOVABLE_API_KEY when nothing is configured.
 */
export function resolveAISettings(row: any | null | undefined): AISettingsSchema {
  const providers: Partial<Record<ProviderId, ProviderConfig>> = {};
  const raw = (row?.providers_config ?? {}) as Record<string, any>;
  for (const [id, cfg] of Object.entries(raw)) {
    if (!cfg || typeof cfg !== "object") continue;
    providers[id as ProviderId] = {
      id: id as ProviderId,
      apiKey: String(cfg.apiKey ?? ""),
      apiKeys: Array.isArray(cfg.apiKeys)
        ? cfg.apiKeys.map((k: unknown) => String(k ?? "").trim()).filter(Boolean)
        : [],
      selectedModel: String(cfg.selectedModel ?? MODEL_REGISTRY[id as ProviderId]?.[0]?.id ?? ""),
      baseUrl: cfg.baseUrl ?? undefined,
      accountId: cfg.accountId ?? undefined,
    };
  }
  // Ensure Lovable exists as a safety net using workspace env.
  if (!providers.lovable) {
    providers.lovable = {
      id: "lovable",
      apiKey: process.env.LOVABLE_API_KEY ?? "",
      selectedModel: row?.model || "google/gemini-2.5-flash",
    };
  }
  const mode = (row?.provider_mode === "fallback" ? "fallback" : "strict") as "strict" | "fallback";
  const activeProvider = (row?.active_provider as ProviderId) || "lovable";
  const chainRaw = Array.isArray(row?.fallback_chain) ? (row.fallback_chain as unknown[]) : ["lovable"];
  const fallbackChain = chainRaw
    .map((v) => String(v) as ProviderId)
    .filter((id) => !!providers[id]);
  return {
    mode,
    activeProvider: providers[activeProvider] ? activeProvider : "lovable",
    fallbackChain: (fallbackChain.length ? fallbackChain : ["lovable"]) as ProviderId[],
    providers,
  };
}

/**
 * Execute an AI operation using either the strict single provider or the
 * ranked fallback chain. Skips providers without vision when the step needs it.
 */
export async function executeAIRequest<T>(
  settings: AISettingsSchema,
  executor: (model: LanguageModelV1, ctx: { providerId: ProviderId; modelId: string }) => Promise<T>,
  opts: { requiresVision?: boolean } = {},
): Promise<T> {
  const requiresVision = !!opts.requiresVision;

  // Try every key configured for this provider, in order, until one works.
  const tryProvider = async (cfg: ProviderConfig) => {
    const meta = modelMeta(cfg.id, cfg.selectedModel);
    if (requiresVision && meta && !meta.vision) {
      throw new Error(`Provider ${cfg.id}/${cfg.selectedModel} does not support vision.`);
    }
    const keys = providerKeyPool(cfg);
    if (!keys.length) throw new Error(`No API key configured for provider "${cfg.id}".`);
    let lastKeyErr: unknown = null;
    for (let i = 0; i < keys.length; i++) {
      try {
        const model = getAIProviderInstance({ ...cfg, apiKey: keys[i] });
        return await executor(model, { providerId: cfg.id, modelId: cfg.selectedModel });
      } catch (err) {
        lastKeyErr = err;
        // eslint-disable-next-line no-console
        console.warn(`[AI Key Rotation] ${cfg.id} key #${i + 1}/${keys.length} failed:`, err instanceof Error ? err.message : err);
      }
    }
    throw lastKeyErr instanceof Error
      ? new Error(`All ${keys.length} ${cfg.id} API key(s) failed. Last error: ${lastKeyErr.message}`)
      : new Error(`All ${keys.length} ${cfg.id} API key(s) failed.`);
  };

  if (settings.mode === "strict") {
    const cfg = settings.providers[settings.activeProvider];
    if (!cfg || (!providerKeyPool(cfg).length)) {
      throw new Error(`Strict Mode: API key missing for provider "${settings.activeProvider}".`);
    }
    return tryProvider(cfg);
  }

  let lastErr: unknown = null;
  const attempted: string[] = [];
  for (const pid of settings.fallbackChain) {
    const cfg = settings.providers[pid];
    if (!cfg) continue;
    const keys = providerKeyPool(cfg);
    if (!keys.length) continue;
    attempted.push(`${pid}/${cfg.selectedModel} (${keys.length} key${keys.length > 1 ? "s" : ""})`);
    try {
      return await tryProvider(cfg);
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line no-console
      console.warn(`[AI Fallback] ${pid} failed:`, err instanceof Error ? err.message : err);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? "no providers configured");
  throw new Error(`All AI providers failed (tried: ${attempted.join(", ") || "none"}). Last error: ${msg}`);
}

/**
 * Lightweight ping to confirm a provider config is valid and within quota.
 */
export async function healthCheckProvider(cfg: ProviderConfig): Promise<{ ok: boolean; latencyMs: number; error?: string; sample?: string }> {
  const t0 = Date.now();
  try {
    const model = getAIProviderInstance(cfg);
    const res = await generateText({
      model,
      prompt: "Reply with the single word: OK",
    });
    return { ok: true, latencyMs: Date.now() - t0, sample: res.text?.slice(0, 40) };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Campaign-aware AI key resolution.
 * Order: campaign-specific ai_settings row → global (campaign_id IS NULL) row →
 * any row for the user → Lovable gateway defaults.
 */
export async function resolveCampaignAISettings(
  sb: any,
  userId: string,
  campaignId: string | null | undefined,
): Promise<AISettingsSchema> {
  let row: any = null;
  if (campaignId) {
    const { data } = await sb.from("ai_settings").select("*")
      .eq("user_id", userId).eq("campaign_id", campaignId).maybeSingle();
    row = data ?? null;
  }
  if (!row) {
    const { data } = await sb.from("ai_settings").select("*")
      .eq("user_id", userId).is("campaign_id", null).maybeSingle();
    row = data ?? null;
  }
  if (!row) {
    const { data } = await sb.from("ai_settings").select("*").eq("user_id", userId).maybeSingle();
    row = data ?? null;
  }
  return resolveAISettings(row);
}
