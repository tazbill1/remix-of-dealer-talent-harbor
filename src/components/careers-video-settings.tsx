import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { videoEmbedUrl } from "@/lib/applicant-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = { video_url: string | null; video_path: string | null };

/** Careers-page promo video: a YouTube/Vimeo link or an uploaded file. HR/admin writes are enforced by RLS. */
export function CareersVideoSettings() {
  const { orgId } = useOrg();
  const [row, setRow] = useState<Row | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => supabase.from("careers_settings").select("video_url, video_path").eq("org_id", orgId).maybeSingle()
    .then(({ data }) => { setRow(data); setLink(data?.video_url ?? ""); });
  useEffect(() => { void load(); }, [orgId]);

  async function save(next: Row) {
    const { error } = await supabase.from("careers_settings").upsert({ org_id: orgId, ...next, updated_at: new Date().toISOString() });
    if (error) throw error;
    await load();
  }
  async function saveLink() {
    if (!videoEmbedUrl(link)) return toast.error("Paste a YouTube or Vimeo link.");
    setBusy(true);
    try { await save({ video_url: link.trim(), video_path: null }); toast.success("Video saved"); } catch { toast.error("Couldn't save the video."); } finally { setBusy(false); }
  }
  async function upload(file: File) {
    if (!/^video\/(mp4|quicktime|webm)$/.test(file.type)) return toast.error("Use an MP4, MOV or WebM file.");
    if (file.size > 200 * 1024 * 1024) return toast.error("Videos must be under 200 MB.");
    setBusy(true);
    try {
      const path = `${orgId}/promo-${Date.now()}.${file.name.split(".").pop() ?? "mp4"}`;
      const { error } = await supabase.storage.from("careers-videos").upload(path, file, { contentType: file.type });
      if (error) throw error;
      if (row?.video_path) await supabase.storage.from("careers-videos").remove([row.video_path]);
      await save({ video_url: null, video_path: path });
      toast.success("Video uploaded");
    } catch { toast.error("Upload didn't work. Please try again."); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { if (row?.video_path) await supabase.storage.from("careers-videos").remove([row.video_path]); await save({ video_url: null, video_path: null }); setLink(""); toast.success("Video removed"); }
    catch { toast.error("Couldn't remove the video."); } finally { setBusy(false); }
  }

  const has = !!(row?.video_url || row?.video_path);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Careers video</p>
      <p className="text-sm text-muted-foreground">Show job seekers what it's like to work at your group. It appears on the careers home page.</p>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="https://www.youtube.com/watch?v=..." value={link} onChange={(e) => setLink(e.target.value)} className="max-w-md" />
        <Button size="sm" onClick={saveLink} disabled={busy || !link}>Save link</Button>
        <Button size="sm" variant="outline" asChild disabled={busy}>
          <label className="cursor-pointer"><Upload />Upload video<input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} /></label>
        </Button>
        {has && <Button size="sm" variant="ghost" onClick={remove} disabled={busy}><Trash2 />Remove</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{busy ? "Working…" : row?.video_path ? "Uploaded video is showing." : row?.video_url ? "Linked video is showing." : "No video yet."}</p>
    </div>
  );
}

export function NewsletterList() {
  const { orgId } = useOrg();
  const [rows, setRows] = useState<{ email: string; consented_at: string }[]>([]);
  useEffect(() => {
    supabase.from("newsletter_subscribers").select("email, consented_at").eq("org_id", orgId).is("unsubscribed_at", null).order("consented_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, [orgId]);
  function exportCsv() {
    const csv = "email,signed_up\n" + rows.map((r) => `${r.email},${r.consented_at}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "newsletter-subscribers.csv"; a.click();
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Newsletter signups</p>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{rows.length} subscribed</span>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}><Download />Export CSV</Button>
      </div>
    </div>
  );
}
