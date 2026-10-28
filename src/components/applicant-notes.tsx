import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ApplicantNotes({ initialNotes, onSave }: { initialNotes: string | null; onSave: (notes: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  async function save() {
    if (saving || draft === saved) return;
    const value = draft;
    setSaving(true);
    try {
      if (await onSave(value)) { setSaved(value); setState("saved"); }
      else setState("error");
    } catch { setState("error"); }
    finally { setSaving(false); }
  }
  return <div className="space-y-2">
    <label htmlFor="applicant-notes" className="block text-sm font-semibold">Notes</label>
    <Textarea id="applicant-notes" rows={4} value={draft} onChange={e => { setDraft(e.target.value); setState("idle"); }} />
    <div className="flex items-center justify-between gap-3">
      <p role="status" className={state === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{saving ? "Saving notes…" : state === "error" ? "Notes weren’t saved. Please try again." : draft !== saved ? "Unsaved changes" : state === "saved" ? "Notes saved" : ""}</p>
      <Button size="sm" disabled={saving || draft === saved} onClick={() => void save()}><Save />Save notes</Button>
    </div>
  </div>;
}