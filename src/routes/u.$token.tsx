import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2 } from "lucide-react";
import { unsubscribe } from "@/lib/email.functions";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/u/$token")({
  // Looking up the link doesn't unsubscribe anyone; only the button does. Email
  // security scanners open links automatically, and that shouldn't count.
  loader: ({ params }) => unsubscribe({ data: { token: params.token, confirm: false } }),
  head: () => ({
    meta: [{ title: "Email preferences" }, { name: "robots", content: "noindex" }],
  }),
  component: Unsubscribe,
});

function Unsubscribe() {
  const info = Route.useLoaderData();
  const { token } = Route.useParams();
  const run = useServerFn(unsubscribe);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-h-screen bg-muted px-5 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <Logo className="h-6" />
        <div className="rounded-2xl bg-background p-6 shadow-sm">
          {!info.ok ? (
            <>
              <h1 className="text-2xl">This link isn't valid</h1>
              <p className="mt-2 text-muted-foreground">
                Please use the unsubscribe link from the most recent email you received.
              </p>
            </>
          ) : done ? (
            <>
              <CheckCircle2 className="size-8 text-lime" />
              <h1 className="mt-3 text-2xl">You're unsubscribed</h1>
              <p className="mt-2 text-muted-foreground">
                {info.email} won't get any more emails from {info.orgName}.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl">Stop emails from {info.orgName}?</h1>
              <p className="mt-2 text-muted-foreground">
                {info.email} will stop getting hiring emails from every {info.orgName} store.
              </p>
              <Button
                className="mt-5 w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await run({ data: { token, confirm: true } });
                  setBusy(false);
                  if (r.ok) setDone(true);
                }}
              >
                Unsubscribe
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
