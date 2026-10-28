import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getNewHireChecklist, newHireCompleteItem, newHireUploadUrl } from "@/lib/onboarding.functions";
import { fileProblem, ONBOARDING_FILE_TYPES, progress } from "@/lib/onboarding";
import { Logo, GradientText } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/onboard/$token")({
  loader: async ({ params }) => {
    const d = await getNewHireChecklist({ data: { token: params.token } });
    if (!d) throw notFound();
    return d;
  },
  head: () => ({ meta: [
    { title: "Your new hire checklist" }, { name: "description", content: "Finish your new hire paperwork." },
    { property: "og:title", content: "Your new hire checklist" }, { property: "og:description", content: "Finish your new hire paperwork." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6 text-center">
      <div className="space-y-2"><Logo className="mx-auto h-6" /><h1 className="text-2xl">This link is no longer active</h1>
        <p className="text-muted-foreground">Please contact your hiring manager for a new link.</p></div>
    </div>
  ),
  component: NewHire,
});

function NewHire() {
  const initial = Route.useLoaderData();
  const { token } = Route.useParams();
  const [items, setItems] = useState(initial.items);
  const [busy, setBusy] = useState<string | null>(null);
  const markDone = (id: string) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, completed: true } : i)));
  const p = progress(items);

  async function complete(id: string, filePath?: string) {
    await newHireCompleteItem({ data: { token, itemId: id, ...(filePath ? { filePath } : {}) } });
    markDone(id);
  }
  async function upload(id: string, file: File) {
    const problem = fileProblem(file.name, file.size);
    if (problem) return toast.error(problem);
    setBusy(id);
    try {
      const { path, token: uploadToken } = await newHireUploadUrl({ data: { token, itemId: id, fileName: file.name, size: file.size } });
      const { error } = await supabase.storage.from("onboarding-docs").uploadToSignedUrl(path, uploadToken, file);
      if (error) throw new Error("Upload failed. Please try again.");
      await complete(id, path);
      toast.success("Received. Thank you!");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }
  async function tick(id: string) {
    setBusy(id);
    try { await complete(id); toast.success("Saved"); } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  return (
    <div className="min-h-screen bg-muted px-5 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <Logo className="h-6" />
        <div className="rounded-2xl bg-background p-6 shadow-sm">
          <h1 className="text-3xl">Welcome aboard, {initial.firstName}! <GradientText>Let's get you ready.</GradientText></h1>
          <p className="mt-2 text-muted-foreground">{initial.store}{initial.startDate ? ` · Starts ${new Date(`${initial.startDate}T12:00:00`).toLocaleDateString()}` : ""}</p>
          <div className="mt-4 text-sm font-medium">{p.done} of {p.total} required items done</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-lime" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></div>
        </div>
        <ol className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="rounded-2xl bg-background p-5 shadow-sm">
              <div className="flex items-start gap-3">
                {i.completed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-lime" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="font-semibold">{i.title}{!i.required && <span className="ml-2 text-xs font-normal text-muted-foreground">Optional</span>}</div>
                  {i.description && <p className="text-sm text-muted-foreground">{i.description}</p>}
                  {i.completed ? <p className="text-sm font-medium text-foreground">Received</p>
                    : i.item_type === "document_upload" ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
                        <Upload className="size-4" />{busy === i.id ? "Uploading…" : "Upload file"}
                        <input type="file" className="sr-only" accept={ONBOARDING_FILE_TYPES.join(",")} disabled={busy === i.id}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(i.id, f); e.target.value = ""; }} />
                      </label>
                    ) : i.item_type === "acknowledgement" ? (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox disabled={busy === i.id} onCheckedChange={(c) => c === true && void tick(i.id)} />
                        I have received and read the employee handbook.
                      </label>
                    ) : <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => tick(i.id)}>Mark as done</Button>}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-center text-xs text-muted-foreground">Files go straight to your employer's private records. For your privacy, they can't be opened from this page.</p>
      </div>
    </div>
  );
}
