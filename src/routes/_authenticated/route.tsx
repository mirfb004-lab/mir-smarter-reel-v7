import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ensureSharedSession } from "@/lib/shared-session";

const UNLOCK_KEY = "loop:unlocked";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(UNLOCK_KEY) !== "true") {
      throw redirect({ to: "/auth" });
    }
    try {
      await ensureSharedSession();
    } catch {
      throw redirect({ to: "/auth" });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
