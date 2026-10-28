import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, Circle } from "lucide-react";
import { getApplicationStatus } from "@/lib/public.functions";
import { isRejection, APPLICANT_STATUS_COPY, type AppStatus } from "@/lib/jobs";
import { Logo, GradientText } from "@/components/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/status/$token")({
  validateSearch: z.object({ welcome: z.boolean().optional() }),
  loader: async ({ params }) => {
    const d = await getApplicationStatus({ data: { token: params.token } });
    if (!d) throw notFound();
    return d;
  },
  head: () => ({ meta: [{ title: "Your application status" }, { name: "description", content: "Check where your application stands." }, { name: "robots", content: "noindex" }] }),
  component: Status,
});

const steps: { key: AppStatus; label: string }[] = [
  { key: "new", label: "Received" }, { key: "screening", label: "Reviewing" },
  { key: "interview", label: "Interview" }, { key: "offer", label: "Offer" }, { key: "hired", label: "Hired" },
];

function Status() {
  const d = Route.useLoaderData();
  const { welcome } = Route.useSearch();
  const idx = steps.findIndex((s) => s.key === d.status);
  return (
    <div className="min-h-screen bg-muted px-5 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <Logo className="h-6" />
        <div className="rounded-2xl bg-background p-6 shadow-sm">
          <h1 className="text-3xl">
            {welcome ? <>Thank you, {d.firstName}! <GradientText>You're in.</GradientText></> : <>Hi {d.firstName}!</>}
          </h1>
          <p className="mt-2 text-muted-foreground">{d.jobTitle} at {d.storeName}</p>
          <div className="mt-5 rounded-xl bg-accent p-4 text-sm">
            <b>{d.assistantName} from {d.storeName}:</b> {APPLICANT_STATUS_COPY[d.status]} Bookmark this page. It always shows your latest status.
          </div>
        </div>
        {!isRejection(d.status) && (
          <div className="rounded-2xl bg-background p-6 shadow-sm">
            <ol className="space-y-4">
              {steps.map((s, i) => (
                <li key={s.key} className="flex items-center gap-3">
                  {i <= idx ? <CheckCircle2 className="size-5 text-lime" /> : <Circle className="size-5 text-muted-foreground" />}
                  <span className={cn(i === idx && "font-semibold", i > idx && "text-muted-foreground")}>{s.label}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="text-center text-xs text-muted-foreground">Last updated {new Date(d.updatedAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
}
