import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite, getInvite } from "@/lib/team.functions";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/invite/$token")({
  loader: ({ params }) => getInvite({ data: { token: params.token } }),
  head: () => ({
    meta: [{ title: "Join your team on hireme" }, { name: "robots", content: "noindex" }],
  }),
  component: Invite,
});

function Invite() {
  const invite = Route.useLoaderData();
  const { token } = Route.useParams();
  const accept = useServerFn(acceptInvite);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  const here = `/invite/${token}`;
  const authLink = (mode: "signin" | "signup") => ({
    to: "/auth" as const,
    search: { mode, redirect: here, email: invite?.email },
  });

  async function join() {
    setBusy(true);
    try {
      const r = await accept({ data: { token } });
      try {
        localStorage.setItem("wm_org", r.orgId);
      } catch {
        /* storage blocked: the app falls back to the first group */
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(`Welcome to ${invite?.orgName}!`);
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  const wrongAccount =
    !!userEmail && !!invite && userEmail.toLowerCase() !== invite.email.toLowerCase();

  return (
    <div className="min-h-screen bg-muted px-5 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <Logo className="h-6" />
        <div className="space-y-4 rounded-2xl bg-background p-6 shadow-sm">
          {!invite ? (
            <>
              <h1 className="text-2xl">This invite link isn't valid</h1>
              <p className="text-muted-foreground">Ask your HR team to send you a new one.</p>
            </>
          ) : invite.status !== "open" ? (
            <>
              <h1 className="text-2xl">
                {invite.status === "expired"
                  ? "This invite has expired"
                  : invite.status === "accepted"
                    ? "This invite has been used"
                    : "This invite was cancelled"}
              </h1>
              <p className="text-muted-foreground">
                {invite.status === "accepted" ? (
                  <>
                    Already joined?{" "}
                    <Link to="/dashboard" className="underline">
                      Go to hireme
                    </Link>
                    .
                  </>
                ) : (
                  "Ask your HR team to send you a new one."
                )}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl">Join {invite.orgName}</h1>
              <p className="text-muted-foreground">
                You've been invited as <b className="text-foreground">{invite.roleLabel}</b>. This
                invite is for <b className="text-foreground">{invite.email}</b>.
              </p>
              {userEmail === undefined ? null : userEmail && !wrongAccount ? (
                <Button className="w-full" disabled={busy} onClick={join}>
                  {busy ? "Joining…" : `Join ${invite.orgName}`}
                </Button>
              ) : (
                <>
                  {wrongAccount && (
                    <p className="rounded-lg bg-accent px-3 py-2 text-sm">
                      You're signed in as {userEmail}.{" "}
                      <button
                        className="underline"
                        onClick={async () => {
                          await supabase.auth.signOut();
                          setUserEmail(null);
                        }}
                      >
                        Sign out
                      </button>{" "}
                      and sign in as {invite.email}.
                    </p>
                  )}
                  {!wrongAccount && (
                    <div className="grid gap-2">
                      <Button asChild className="w-full">
                        <Link {...authLink("signup")}>Create my account</Link>
                      </Button>
                      <Button asChild variant="outline" className="w-full">
                        <Link {...authLink("signin")}>I already have an account</Link>
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
