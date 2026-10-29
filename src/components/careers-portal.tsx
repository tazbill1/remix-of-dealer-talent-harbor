import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCareersVideo, subscribeNewsletter } from "@/lib/careers-portal.functions";
import { isValidEmail, videoEmbedUrl } from "@/lib/applicant-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Header link: "Sign in" or "My applications", from the session. */
export function ApplicantMenu() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn
    ? <Link to="/careers/account" className="rounded-full border border-abc-yellow px-3 py-1.5 text-abc-yellow hover:bg-abc-yellow hover:text-abc-black">My applications</Link>
    : <Link to="/careers/login" className="rounded-full border border-abc-yellow px-3 py-1.5 text-abc-yellow hover:bg-abc-yellow hover:text-abc-black">Sign in</Link>;
}

export function NewsletterSignup() {
  const subscribe = useServerFn(subscribeNewsletter);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-b border-abc-white/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-semibold">Get our newsletter</p><p className="text-xs text-abc-white/60">Job openings and news from ABC Dealer Group. Unsubscribe anytime.</p></div>
        {done ? <p className="text-sm text-abc-yellow">Thanks, you're signed up.</p> : (
          <form className="flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!isValidEmail(email)) return toast.error("Please enter a valid email.");
            setBusy(true);
            try { await subscribe({ data: { email } }); setDone(true); } catch { toast.error("Couldn't sign you up. Please try again."); } finally { setBusy(false); }
          }}>
            <Input type="email" aria-label="Email for newsletter" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-abc-white text-abc-black" />
            <Button type="submit" disabled={busy} className="bg-abc-red text-abc-white hover:bg-abc-red-dark">Sign up</Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function CareersVideo() {
  const fetchVideo = useServerFn(getCareersVideo);
  const { data } = useQuery({ queryKey: ["careers-video"], queryFn: () => fetchVideo() });
  if (!data) return null;
  const embed = data.kind === "link" ? videoEmbedUrl(data.url) : null;
  if (data.kind === "link" && !embed) return null;
  return (
    <section className="mx-auto max-w-5xl px-5 pt-12">
      <h2 className="text-2xl">Why work with us</h2>
      <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-abc-black shadow-sm">
        {embed
          ? <iframe src={embed} title="Why work with us" className="size-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          : <video src={data.url} controls className="size-full" />}
      </div>
    </section>
  );
}
