import { useEffect, useState } from "react";

const KEY = "loop:activeCampaign";
const EVT = "loop:activeCampaignChanged";

export function getActiveCampaignId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setActiveCampaignId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(KEY, id);
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useActiveCampaignId(): string | null {
  const [id, setId] = useState<string | null>(() => getActiveCampaignId());
  useEffect(() => {
    const on = () => setId(getActiveCampaignId());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return id;
}
