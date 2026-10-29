import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContact } from "@/lib/public.functions";
import { CAREERS_ORG_SLUG, SITE_URL } from "@/lib/site";

const title = "Contact the ABC Dealer Group hiring team";
const description = "Questions about a job at ABC Dealer Group? Send the hiring team a message and we'll get back to you fast.";

export const Route = createFileRoute("/careers/contact")({
  head: () => ({
    meta: [
      { title }, { name: "description", content: description },
      { property: "og:title", content: title }, { property: "og:description", content: description },
      { property: "og:type", content: "website" }, { property: "og:url", content: `${SITE_URL}/careers/contact` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/careers/contact` }],
  }),
  component: Contact,
});

const layout = getRouteApi("/careers");

function Contact() {
  const { stores, jobs } = layout.useLoaderData();
  const send = useServerFn(submitContact);
  const [f, setF] = useState({ fullName: "", email: "", phone: "", jobId: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const store = (id: string) => stores.find((s) => s.id === id)?.name ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send({ data: { orgSlug: CAREERS_ORG_SLUG, ...f, jobId: f.jobId || null } });
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  if (done)
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <CheckCircle2 className="mx-auto size-12 text-abc-red" />
        <h1 className="mt-4 text-3xl">Thanks, we got your message!</h1>
        <p className="mt-2 text-muted-foreground">Our hiring team will reach out soon. Check your email for a confirmation.</p>
        <Button asChild className="mt-6 bg-abc-red text-abc-white hover:bg-abc-red-dark"><Link to="/careers/jobs">Browse open jobs</Link></Button>
      </div>
    );

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 md:grid-cols-5">
      <div className="md:col-span-2">
        <h1 className="text-4xl">Talk to our hiring team</h1>
        <p className="mt-3 text-muted-foreground">Not sure which job fits, or have a question first? Send us a note. A real person reads every message.</p>
      </div>
      <form onSubmit={submit} className="space-y-3 rounded-2xl bg-background p-5 shadow-sm md:col-span-3">
        <div className="space-y-1.5"><Label htmlFor="cn">Full name</Label>
          <Input id="cn" required minLength={2} maxLength={120} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ce">Email</Label>
            <Input id="ce" type="email" required maxLength={255} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cp">Phone (optional)</Label>
            <Input id="cp" type="tel" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="cj">Job you're interested in</Label>
          <select id="cj" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.jobId} onChange={(e) => setF({ ...f, jobId: e.target.value })}>
            <option value="">Not sure yet / any role</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title} · {store(j.dealership_id)}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label htmlFor="cm">Message</Label>
          <Textarea id="cm" required maxLength={2000} rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></div>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
        <Button type="submit" className="w-full bg-abc-red text-abc-white hover:bg-abc-red-dark" disabled={busy || !jobs.length}>{busy ? "Sending..." : "Send message"}</Button>
        <p className="text-xs text-muted-foreground">By sending this you agree to get replies about jobs by email.</p>
      </form>
    </div>
  );
}
