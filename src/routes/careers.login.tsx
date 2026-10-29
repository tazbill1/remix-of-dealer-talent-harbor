import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const title = "Applicant sign in | ABC Dealer Group Careers";
const description = "Sign in or create an applicant account to track your applications at ABC Dealer Group.";

export const Route = createFileRoute("/careers/login")({
  validateSearch: z.object({ mode: z.enum(["signin", "signup"]).optional().catch(undefined) }),
  head: () => ({ meta: [
    { title }, { name: "description", content: description },
    { property: "og:title", content: title }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ApplicantLogin,
});

function ApplicantLogin() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/careers/account` } });
        if (error) throw error;
        if (!data.session) { setCheckEmail(true); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/careers/account" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/careers/login` });
    if (r.error) return toast.error("Google sign-in didn't work. Please try again.");
    if (r.redirected) return;
    navigate({ to: "/careers/account" });
  }

  return (
    <section className="mx-auto max-w-md px-5 py-12">
      <div className="rounded-2xl border-t-4 border-abc-red bg-abc-white p-6 shadow-sm">
        {checkEmail ? (
          <div className="space-y-2 text-center">
            <h1 className="text-2xl">Check your email</h1>
            <p className="text-sm text-muted-foreground">We sent a link to {email}. Click it to finish creating your account.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-2xl">{mode === "signup" ? "Create your applicant account" : "Applicant sign in"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Track your applications and see jobs picked for you. Use the email you applied with.</p>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
            <div className="text-center text-xs text-muted-foreground">or</div>
            <div className="space-y-2"><Label htmlFor="ap-email">Email</Label><Input id="ap-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="ap-pw">Password</Label><Input id="ap-pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full bg-abc-red text-abc-white hover:bg-abc-red-dark" disabled={busy}>
              {busy ? "One moment..." : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
            <button type="button" className="w-full text-sm text-abc-red hover:underline" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
              {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
