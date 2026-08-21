// Google AI Studio (Gemini) model auto-discovery + live verification.
// Pure fetch-based; safe to run in the Worker runtime.

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface VerifiedModel {
  id: string;
  displayName: string;
  status: "working" | "failed" | "untested";
  latencyMs: number;
  error: string | null;
  supportsVision: boolean;
}

interface RawModel {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
}

const clean = (name: string) => name.replace(/^models\//, "");

function guessVision(m: RawModel, id: string): boolean {
  const hay = `${id} ${m.description ?? ""}`.toLowerCase();
  if (/embedding|aqa|imagen|tts|veo/.test(id)) return false;
  // Every Gemini 1.5+ chat model is multimodal.
  return /gemini-(1\.5|2\.0|2\.5|3)/.test(hay) || /vision|multimodal|image/.test(hay);
}

async function pingModel(apiKey: string, id: string, timeoutMs = 5000): Promise<{ ok: boolean; latencyMs: number; error: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/models/${encodeURIComponent(id)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as any;
        detail = body?.error?.message ?? detail;
      } catch { /* ignore */ }
      return { ok: false, latencyMs, error: detail };
    }
    return { ok: true, latencyMs, error: null };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, latencyMs, error: aborted ? `Timed out after ${timeoutMs}ms` : err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverAndVerifyGeminiModels(
  apiKey: string,
  opts: { verify?: boolean; timeoutMs?: number; maxVerify?: number } = {},
): Promise<VerifiedModel[]> {
  if (!apiKey) throw new Error("A Google AI Studio API key is required.");
  const verify = opts.verify ?? true;
  const maxVerify = opts.maxVerify ?? 24;

  const listRes = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
  if (!listRes.ok) {
    let detail = `HTTP ${listRes.status}`;
    try {
      const body = (await listRes.json()) as any;
      detail = body?.error?.message ?? detail;
    } catch { /* ignore */ }
    throw new Error(`Model discovery failed: ${detail}`);
  }
  const listJson = (await listRes.json()) as { models?: RawModel[] };
  const candidates = (listJson.models ?? [])
    .filter((m) => !!m.name && (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => {
      const id = clean(m.name!);
      return {
        id,
        displayName: m.displayName || id,
        supportsVision: guessVision(m, id),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  if (!verify) {
    return candidates.map((c) => ({ ...c, status: "untested" as const, latencyMs: 0, error: null }));
  }

  const toVerify = candidates.slice(0, maxVerify);
  const rest = candidates.slice(maxVerify);

  const results = await Promise.all(
    toVerify.map(async (c): Promise<VerifiedModel> => {
      const r = await pingModel(apiKey, c.id, opts.timeoutMs ?? 5000);
      return {
        ...c,
        status: r.ok ? "working" : "failed",
        latencyMs: r.latencyMs,
        error: r.error,
      };
    }),
  );

  return [
    ...results,
    ...rest.map((c) => ({ ...c, status: "untested" as const, latencyMs: 0, error: null })),
  ];
}
