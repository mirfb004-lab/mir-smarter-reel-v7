import { supabase } from "@/integrations/supabase/client";

// Shared account used behind the site-wide password gate.
// All users of the app share this single Supabase identity so RLS-scoped
// server functions have a valid bearer token.
const SHARED_EMAIL = "loop-shared@app.local";
const SHARED_PASSWORD = "loop-shared-irfan1293-fixed-pw";

export async function ensureSharedSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;

  const signIn = await supabase.auth.signInWithPassword({
    email: SHARED_EMAIL,
    password: SHARED_PASSWORD,
  });
  if (signIn.data.session) return;

  const signUp = await supabase.auth.signUp({
    email: SHARED_EMAIL,
    password: SHARED_PASSWORD,
  });
  if (signUp.error) throw signUp.error;

  if (!signUp.data.session) {
    const retry = await supabase.auth.signInWithPassword({
      email: SHARED_EMAIL,
      password: SHARED_PASSWORD,
    });
    if (retry.error) throw retry.error;
  }
}
