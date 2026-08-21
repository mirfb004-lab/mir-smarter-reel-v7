import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCampaigns } from "@/lib/campaigns.functions";
import { getActiveCampaignId, setActiveCampaignId } from "@/lib/active-campaign";

export type ScopeMode = "global" | "campaign";

const MODE_KEY = "loop:scopeMode";
const MODE_EVT = "loop:scopeModeChanged";

export function getScopeMode(): ScopeMode {
  if (typeof window === "undefined") return "campaign";
  return window.localStorage.getItem(MODE_KEY) === "global" ? "global" : "campaign";
}

export function setScopeMode(mode: ScopeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent(MODE_EVT));
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  objective: string;
  [k: string]: unknown;
}

interface CampaignContextValue {
  mode: ScopeMode;
  setMode: (m: ScopeMode) => void;
  /** Currently selected campaign, regardless of mode. */
  campaignId: string | null;
  setCampaignId: (id: string | null) => void;
  /** null while in Global Mode — pass this to scoped queries. */
  scopedCampaignId: string | null;
  campaigns: CampaignSummary[];
  activeCampaign: CampaignSummary | null;
  isLoading: boolean;
}

const Ctx = createContext<CampaignContextValue | null>(null);

export function ActiveCampaignProvider({ children }: { children: ReactNode }) {
  const fn = useServerFn(listCampaigns);
  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });
  const campaigns = (data ?? []) as unknown as CampaignSummary[];

  const [campaignId, setCampaignIdState] = useState<string | null>(null);
  const [mode, setModeState] = useState<ScopeMode>("campaign");

  // Hydrate from localStorage after mount (avoids SSR/first-render mismatch).
  useEffect(() => {
    setCampaignIdState(getActiveCampaignId());
    setModeState(getScopeMode());
    const onCampaign = () => setCampaignIdState(getActiveCampaignId());
    const onMode = () => setModeState(getScopeMode());
    window.addEventListener("loop:activeCampaignChanged", onCampaign);
    window.addEventListener("storage", onCampaign);
    window.addEventListener(MODE_EVT, onMode);
    return () => {
      window.removeEventListener("loop:activeCampaignChanged", onCampaign);
      window.removeEventListener("storage", onCampaign);
      window.removeEventListener(MODE_EVT, onMode);
    };
  }, []);

  // Keep the selection valid as campaigns load / change.
  useEffect(() => {
    if (!campaigns.length) return;
    const current = getActiveCampaignId();
    if (!current || !campaigns.some((c) => c.id === current)) {
      setActiveCampaignId(campaigns[0].id);
      setCampaignIdState(campaigns[0].id);
    }
  }, [campaigns]);

  const setCampaignId = useCallback((id: string | null) => {
    setActiveCampaignId(id);
    setCampaignIdState(id);
  }, []);

  const setMode = useCallback((m: ScopeMode) => {
    setScopeMode(m);
    setModeState(m);
  }, []);

  const value = useMemo<CampaignContextValue>(() => {
    const activeCampaign = campaigns.find((c) => c.id === campaignId) ?? null;
    return {
      mode,
      setMode,
      campaignId,
      setCampaignId,
      scopedCampaignId: mode === "global" ? null : campaignId,
      campaigns,
      activeCampaign,
      isLoading,
    };
  }, [mode, setMode, campaignId, setCampaignId, campaigns, isLoading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCampaignScope(): CampaignContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback so components used outside the shell never crash.
    return {
      mode: "campaign",
      setMode: () => {},
      campaignId: null,
      setCampaignId: () => {},
      scopedCampaignId: null,
      campaigns: [],
      activeCampaign: null,
      isLoading: false,
    };
  }
  return ctx;
}

/** Convenience: the campaign_id to filter by (null = all campaigns). */
export function useScopedCampaignId(): string | null {
  return useCampaignScope().scopedCampaignId;
}
