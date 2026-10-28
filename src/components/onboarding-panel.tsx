import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, FileText, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ITEM_TYPE_LABEL, WHO_LABEL, fileProblem, isOverdue, onboardingPath, ONBOARDING_FILE_TYPES, progress, type ItemType, type Who } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Onboarding tab in the applicant panel (Hired applicants). Access follows onboarding RLS. */
export function OnboardingPanel({ appId }: { appId: string }) {
  const qc = useQueryClient();
  const key = ["onboarding", appId];
  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: c, error } = await supabase.from("onboarding_checklists").select("id, org_id, start_date, status, token").eq("application_id", appId).maybeSingle();
      if (error) throw error;
      if (!c) return null;
      const { data: items } = await supabase.from("onboarding_checklist_items").select("*").eq("checklist_id", c.id).order("sort_order");
      return { checklist: c, items: items ?? [] };
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">No onboarding checklist yet. One is created when an applicant is moved to Hired. If you don't see it, you may not have access to onboarding for this store.</p>;
  const { checklist, items } = data;
  const p = progress(items);

  async function patchItem(id: string, patch: { completed_at?: string | null; file_path?: string; notes?: string }) {
    const { data: saved, error } = await supabase.from("onboarding_checklist_items").update(patch).eq("id", id).select("id").maybeSingle();
    if (error || !saved) { toast.error(error?.message ?? "Couldn't save. Please try again."); return false; }
    await refresh();
    return true;
  }
  async function upload(itemId: string, file: File) {
    const problem = fileProblem(file.name, file.size);
    if (problem) return toast.error(problem);
    setBusy(itemId);
    const path = onboardingPath(checklist.org_id, checklist.id, itemId, file.name);
    const { error } = await supabase.storage.from("onboarding-docs").upload(path, file);
    if (error) { setBusy(null); return toast.error("Upload failed. Please try again."); }
    if (await patchItem(itemId, { file_path: path, completed_at: new Date().toISOString() })) toast.success("File uploaded");
    setBusy(null);
  }
  async function openFile(path: string) {
    const { data: signed, error } = await supabase.storage.from("onboarding-docs").createSignedUrl(path, 300);
    if (error || !signed) return toast.error("That file isn't available.");
    window.open(signed.signedUrl, "_blank");
  }
  async function saveStart(v: string) {
    if (!v || v === checklist.start_date) return;
    const { data: saved, error } = await supabase.from("onboarding_checklists").update({ start_date: v }).eq("id", checklist.id).select("id").maybeSingle();
    if (error || !saved) return toast.error(error?.message ?? "Couldn't save.");
    toast.success("Start date saved"); await refresh();
  }
  function copyLink() {
    void navigator.clipboard.writeText(`${window.location.origin}/onboard/${checklist.token}`);
    toast.success("New hire link copied. Nothing was sent; share it yourself.");
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex items-center justify-between text-sm"><span className="font-medium">{p.done} of {p.total} required done</span>
          <Button size="sm" variant="outline" onClick={copyLink}><Copy />Copy new hire link</Button></div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-lime" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Start date
          <Input type="date" className="h-8 w-40" defaultValue={checklist.start_date ?? ""} onBlur={(e) => void saveStart(e.target.value)} /></label>
      </div>
      <ol className="space-y-2">
        {items.map((i) => {
          const done = !!i.completed_at;
          const overdue = isOverdue(i);
          return (
            <li key={i.id} className="space-y-2 rounded-xl border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{i.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {ITEM_TYPE_LABEL[i.item_type as ItemType]} · {WHO_LABEL[i.who_completes as Who]} · {i.required ? "Required" : "Optional"}
                    {i.due_date && ` · Due ${new Date(`${i.due_date}T12:00:00`).toLocaleDateString()}`}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  done ? "bg-lime/20 text-foreground" : overdue ? "bg-warning/20 text-warning-foreground" : "bg-secondary text-muted-foreground")}>
                  {done ? "Done" : overdue ? "Overdue" : "Not done"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {i.item_type === "manager_task" && !done && <Button size="sm" variant="outline" onClick={() => patchItem(i.id, { completed_at: new Date().toISOString() })}>Mark done</Button>}
                {i.item_type === "document_upload" && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent">
                    <Upload className="size-3.5" />{busy === i.id ? "Uploading…" : i.file_path ? "Replace file" : "Upload file"}
                    <input type="file" className="sr-only" accept={ONBOARDING_FILE_TYPES.join(",")} disabled={busy === i.id}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(i.id, f); e.target.value = ""; }} />
                  </label>
                )}
                {i.file_path && <Button size="sm" variant="ghost" onClick={() => openFile(i.file_path!)}><FileText />View file</Button>}
              </div>
              <Input className="h-8 text-xs" placeholder="Add a note" defaultValue={i.notes ?? ""}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (i.notes ?? "")) void patchItem(i.id, { notes: v }); }} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
