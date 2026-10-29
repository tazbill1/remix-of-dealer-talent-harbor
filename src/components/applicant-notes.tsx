import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type SavedApplicantNote = { id: string; message: string; created_at: string; author: string };

export function ApplicantNotes({ initialNotes, notes = [], onSave }: { initialNotes: string | null; notes?: SavedApplicantNote[]; onSave: (notes: string) => Promise<SavedApplicantNote | null> }) {
  const [draft, setDraft] = useState("");
  const [newNotes, setNewNotes] = useState<SavedApplicantNote[]>([]);
  const [legacyNotes] = useState(() => {
    let text = initialNotes ?? "";
    for (const note of [...notes].reverse()) {
      const suffix = `\n\n${note.message}`;
      if (text.endsWith(suffix)) text = text.slice(0, -suffix.length);
      else if (text === note.message) text = "";
    }
    return text;
  });
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  async function save() {
    if (saving || !draft.trim()) return;
    const value = draft;
    setSaving(true);
    try {
      const note = await onSave(value);
      if (note) { setNewNotes((prev) => [note, ...prev]); setDraft(""); setState("saved"); }
      else setState("error");
    } catch { setState("error"); }
    finally { setSaving(false); }
  }
  return <div className="space-y-2">
    <label htmlFor="applicant-notes" className="block text-sm font-semibold">Notes</label>
    <Textarea id="applicant-notes" rows={4} maxLength={10000} value={draft} onChange={e => { setDraft(e.target.value); setState("idle"); }} />
    <div className="flex items-center justify-between gap-3">
      <p role="status" className={state === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{saving ? "Saving notes…" : state === "error" ? "Note wasn’t saved. Check your access and try again." : draft ? "Unsaved changes" : state === "saved" ? "Note saved" : ""}</p>
      <Button size="sm" disabled={saving || !draft.trim()} onClick={() => void save()}><Save />Save notes</Button>
    </div>
    <ol className="space-y-2 text-sm" aria-label="Saved notes">
      {[...new Map([...newNotes, ...notes].map((n) => [n.id, n])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((note) => <li key={note.id} className="rounded-md border bg-background p-3">
        <p className="whitespace-pre-wrap break-words">{note.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{note.author} · {new Date(note.created_at).toLocaleString()}</p>
      </li>)}
      {legacyNotes && <li className="rounded-md border bg-background p-3"><p className="whitespace-pre-wrap break-words">{legacyNotes}</p><p className="mt-1 text-xs text-muted-foreground">Earlier notes · author and time not recorded</p></li>}
    </ol>
  </div>;
}