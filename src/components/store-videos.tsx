import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Video, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { VIDEO_KINDS, VIDEO_KIND_LABEL, resolveStoreVideo, videoPath, type VideoKind } from "@/lib/store-videos";

const BUCKET = "store-videos";

/** Welcome + Thank-you videos for one store (storeId) or the whole group (storeId = null). Everything starts off. */
export function StoreVideosCard({ orgId, storeId, canEdit }: { orgId: string; storeId: string | null; canEdit: boolean }) {
  const qc = useQueryClient();
  const key = ["store-videos", orgId, storeId];
  const { data: rows = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase.from("store_videos").select("*").eq("org_id", orgId);
      q = storeId ? q.or(`store_id.is.null,store_id.eq.${storeId}`) : q.is("store_id", null);
      const { data, error } = await q;
      if (error) throw error;
      const urls = await Promise.all(
        (data ?? []).map(async (r) => (await supabase.storage.from(BUCKET).createSignedUrl(r.storage_path, 3600)).data?.signedUrl ?? null),
      );
      return (data ?? []).map((r, i) => ({ ...r, url: urls[i] ?? null }));
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  return (
    <div className="space-y-4 rounded-2xl bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Video className="size-5 text-sapphire" />
        <h2 className="text-lg">{storeId ? "Videos" : "Group videos"}</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        {storeId
          ? "Upload this store's Welcome and Thank-you videos. If this store has no video of its own, it uses the group's."
          : "Every store without its own video uses these."}{" "}
        Videos start switched off.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {VIDEO_KINDS.map((kind) => {
          const own = rows.find((r) => r.kind === kind && r.store_id === storeId) ?? null;
          const inUse = storeId ? resolveStoreVideo(rows, storeId, kind) : null;
          const group = storeId ? rows.find((r) => r.kind === kind && r.store_id === null) : null;
          return (
            <VideoSlot key={kind} kind={kind} orgId={orgId} storeId={storeId} own={own} canEdit={canEdit} onChange={refresh}
              fallbackNote={storeId && !own ? (inUse?.from === "group" ? "Using the group's video." : group ? "The group's video is switched off." : "No group video yet.") : null}
              fallbackUrl={storeId && !own && inUse?.from === "group" ? (group?.url ?? null) : null} />
          );
        })}
      </div>
    </div>
  );
}

type Row = { id: string; storage_path: string; enabled: boolean; file_name: string | null; url: string | null };

function VideoSlot({ kind, orgId, storeId, own, canEdit, onChange, fallbackNote, fallbackUrl }: {
  kind: VideoKind; orgId: string; storeId: string | null; own: Row | null; canEdit: boolean; onChange: () => void;
  fallbackNote: string | null; fallbackUrl: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!file.type.startsWith("video/")) return toast.error("Please choose a video file.");
    if (file.size > 200 * 1024 * 1024) return toast.error("Videos must be under 200 MB.");
    setBusy(true);
    try {
      const path = videoPath(orgId, storeId, kind, file.name);
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { data: user } = await supabase.auth.getUser();
      const res = own
        ? await supabase.from("store_videos").update({ storage_path: path, file_name: file.name, uploaded_by: user.user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", own.id).select("id").single()
        : await supabase.from("store_videos").insert({ org_id: orgId, store_id: storeId, kind, storage_path: path, file_name: file.name, uploaded_by: user.user?.id ?? null }).select("id").single();
      if (res.error || !res.data) throw res.error ?? new Error("Couldn't save the video.");
      if (own) await supabase.storage.from(BUCKET).remove([own.storage_path]);
      toast.success(`${VIDEO_KIND_LABEL[kind]} uploaded${own?.enabled ? "" : ". Switch it on when you're ready"}.`);
      onChange();
    } catch (e) {
      toast.error((e as Error).message || "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function toggle(on: boolean) {
    if (!own) return;
    const { data, error } = await supabase.from("store_videos").update({ enabled: on, updated_at: new Date().toISOString() }).eq("id", own.id).select("id").single();
    if (error || !data) return toast.error("Couldn't change that. Please try again.");
    toast.success(`${VIDEO_KIND_LABEL[kind]} switched ${on ? "on" : "off"}.`);
    onChange();
  }

  return (
    <div className="space-y-3 rounded-xl bg-secondary/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{VIDEO_KIND_LABEL[kind]}</span>
        {own && (
          <label className="flex items-center gap-2 text-sm">
            {own.enabled ? "On" : "Off"}
            <Switch checked={own.enabled} onCheckedChange={toggle} disabled={!canEdit} aria-label={`${VIDEO_KIND_LABEL[kind]} on or off`} />
          </label>
        )}
      </div>
      {own?.url ? (
        <video src={own.url} controls preload="metadata" className="aspect-video w-full rounded-lg bg-muted" />
      ) : fallbackUrl ? (
        <video src={fallbackUrl} controls preload="metadata" className="aspect-video w-full rounded-lg bg-muted opacity-80" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">No video yet</div>
      )}
      {fallbackNote && <p className="text-xs text-muted-foreground">{fallbackNote}</p>}
      {own?.file_name && <p className="truncate text-xs text-muted-foreground">{own.file_name}</p>}
      {canEdit && (
        <>
          <input ref={input} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <Upload className="size-4" />{busy ? "Uploading..." : own ? "Replace video" : "Upload video"}
          </Button>
        </>
      )}
    </div>
  );
}
