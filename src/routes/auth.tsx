import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Sparkles, Lock } from "lucide-react";
import { ensureSharedSession } from "@/lib/shared-session";

const SITE_PASSWORD = "irfan1293";
const UNLOCK_KEY = "loop:unlocked";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: UnlockPage,
});

function UnlockPage() {
  const { next } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(UNLOCK_KEY) === "true") {
      ensureSharedSession()
        .then(() => navigate({ to: next || "/dashboard" }))
        .catch(() => {});
    }
  }, [navigate, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (password === SITE_PASSWORD) {
      try {
        await ensureSharedSession();
        window.localStorage.setItem(UNLOCK_KEY, "true");
        toast.success("Unlocked");
        navigate({ to: next || "/dashboard" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Sign-in failed");
      }
    } else {
      toast.error("Incorrect password");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary/10 via-background to-accent/10 border-r border-border">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-primary" /> Loop
        </div>
        <div className="space-y-6 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">Every post makes the next one smarter.</h1>
          <p className="text-muted-foreground">
            Loop is an adaptive AI publishing engine. It analyzes your video, learns from every post's performance,
            and rewrites its own strategy — forever.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">Built for creators who ship.</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="h-10 w-10 rounded-md bg-primary/15 flex items-center justify-center mb-2">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Enter password</CardTitle>
            <CardDescription>This app is password protected.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw">Password</Label>
                <Input
                  id="pw"
                  type="password"
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Unlock
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
