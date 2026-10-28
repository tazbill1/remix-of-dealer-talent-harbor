import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GradientText } from "@/components/brand";
import { slugify } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up your dealer group | WerkandMe" }] }),
  component: Onboarding,
});

function Onboarding() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("create_organization", { _name: name, _slug: slug || slugify(name) });
    setBusy(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "That web address is taken. Try another." : error.message);
    localStorage.setItem("wm_org", data as string);
    await qc.invalidateQueries({ queryKey: ["me"] });
    toast.success("Your dealer group is ready! Let's add your stores.");
    navigate({ to: "/stores" });
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl bg-background p-8 shadow-sm">
      <h1 className="text-3xl">Welcome! Let's set up <GradientText>your group.</GradientText></h1>
      <p className="mt-2 text-sm text-muted-foreground">Joining an existing dealer group instead? Open the invite link your HR team sent you.</p>
      <p className="mt-2 text-muted-foreground">Your group's data is private to your team. Always.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="n">Dealer group name</Label>
          <Input id="n" required value={name} placeholder="Sunrise Auto Group"
            onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s">Careers site address</Label>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>/c/</span>
            <Input id="s" required value={slug} pattern="[a-z0-9-]{3,40}" onChange={(e) => setSlug(slugify(e.target.value))} />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating..." : "Create dealer group"}</Button>
      </form>
    </div>
  );
}
