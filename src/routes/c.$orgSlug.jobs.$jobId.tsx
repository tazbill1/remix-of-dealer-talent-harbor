import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPin } from "lucide-react";
import { z } from "zod";
import { getPublicJob, submitApplication } from "@/lib/public.functions";
import { formatPay } from "@/lib/jobs";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand";

export const Route = createFileRoute("/c/$orgSlug/jobs/$jobId")({
  validateSearch: z.object({ source: z.string().max(40).optional() }),
  loader: async ({ params }) => {
    const d = await getPublicJob({ data: { jobId: params.jobId } });
    if (!d || !d.org || d.org.slug !== params.orgSlug) throw notFound();
    return d;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Job unavailable" }, { name: "robots", content: "noindex" }] };
    const t = `${loaderData.job.title} at ${loaderData.store?.name ?? loaderData.org?.name}`;
    const desc = loaderData.job.description.slice(0, 155) || t;
    return { meta: [{ title: t }, { name: "description", content: desc }, { property: "og:title", content: t }, { property: "og:description", content: desc }] };
  },
  component: JobPage,
});

function JobPage() {
  const { job, store, org } = Route.useLoaderData();
  const { source } = Route.useSearch();
  const navigate = useNavigate();
  const [f, setF] = useState({ fullName: "", email: "", phone: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const pay = formatPay(job.pay_min, job.pay_max, job.pay_period);

  const jsonLd = {
    "@context": "https://schema.org", "@type": "JobPosting", title: job.title, description: job.description || job.title,
    datePosted: job.created_at, employmentType: job.employment_type,
    hiringOrganization: { "@type": "Organization", name: store?.name ?? org?.name },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: store?.city, addressRegion: store?.state, addressCountry: "US" } },
    ...(job.pay_min ? { baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: { "@type": "QuantitativeValue", minValue: job.pay_min, maxValue: job.pay_max ?? job.pay_min, unitText: job.pay_period } } } : {}),
  };

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (file && file.size > 10 * 1024 * 1024) return toast.error("Resume must be under 10 MB.");
    setBusy(true);
    try {
      const r = await submitApplication({ data: { jobId: job.id, ...f, source, resumeFileName: file?.name, smsConsent } });
      if (file && r.resumePath && r.uploadToken) {
        await supabase.storage.from("resumes").uploadToSignedUrl(r.resumePath, r.uploadToken, file);
      }
      navigate({ to: "/status/$token", params: { token: r.token }, search: { welcome: true } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="bg-navy px-5 py-8 text-navy-foreground">
        <div className="mx-auto max-w-3xl">
          <Link to="/c/$orgSlug" params={{ orgSlug: org!.slug }} className="flex items-center gap-1 text-sm text-sidebar-foreground hover:underline"><ArrowLeft className="size-4" />All jobs</Link>
          <h1 className="mt-5 text-3xl md:text-4xl">{job.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sidebar-foreground">
            {store?.name}{store?.city && <><MapPin className="size-4" />{store.city}{store.state ? `, ${store.state}` : ""}</>}
            {pay && <span className="rounded-full bg-sidebar-accent px-3 py-0.5 text-sm font-semibold text-ultramarine">{pay}</span>}
          </p>
        </div>
      </div>
      <div className="mx-auto grid max-w-3xl gap-6 px-5 py-8 md:grid-cols-5">
        <div className="whitespace-pre-line text-sm leading-relaxed md:col-span-3">{job.description || "Come join a great team!"}</div>
        <form onSubmit={apply} className="h-fit space-y-3 rounded-2xl bg-background p-5 shadow-sm md:col-span-2">
          <h2 className="text-xl">Apply in a minute</h2>
          <div className="space-y-1.5"><Label htmlFor="n">Full name</Label><Input id="n" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="e">Email</Label><Input id="e" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="p">Mobile phone</Label><Input id="p" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="r">Resume (optional)</Label><Input id="r" type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <Checkbox id="sms" className="mt-0.5" checked={smsConsent} onCheckedChange={(c) => setSmsConsent(c === true)} />
            <span>Yes, text me updates about my application and interview times at the number above. Message and data rates may apply. Reply STOP anytime to opt out.</span>
          </label>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending..." : "Submit application"}</Button>
          <p className="text-xs text-muted-foreground">By applying you agree to get updates about this job by email.</p>
        </form>
      </div>
      <footer className="flex items-center justify-center gap-2 pb-8 text-xs text-muted-foreground">Powered by <Logo className="h-4" /></footer>
    </div>
  );
}
