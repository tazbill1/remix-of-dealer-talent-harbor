import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Download, Share2 } from "lucide-react";
import { BOARDS, jobLink, postText } from "@/lib/share";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.message(text);
  }
}

/** Share a job on free boards with tracked links, a ready-made post, and a QR code. */
export function JobShare({
  orgSlug,
  job,
  store,
  pay,
}: {
  orgSlug: string;
  job: { id: string; title: string; status: string };
  store: string;
  pay: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const qrLink = origin ? jobLink(origin, orgSlug, job.id, "qr") : "";

  useEffect(() => {
    if (!open || !qrLink) return;
    QRCode.toDataURL(qrLink, { width: 600, margin: 2, color: { dark: "#1d224b", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [open, qrLink]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={job.status !== "open"}
        title={job.status === "open" ? "Get links to post this job on other boards" : "Open the job to share it"}>
        <Share2 />
        Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Share: {job.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Each link tags where the applicant came from, so they land in hireme, get the welcome text, and
            show up by source in Analytics. Indeed and Google pick this job up automatically.
          </p>
          <div className="divide-y rounded-xl border">
            {BOARDS.filter((b) => b.source !== "qr").map((b) => {
              const link = jobLink(origin, orgSlug, job.id, b.source);
              return (
                <div key={b.source} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{b.label}</div>
                    <div className="text-xs text-muted-foreground">{b.tip}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => copy(link, `${b.label} link`)}>
                      <Copy />
                      Link
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => copy(postText({ title: job.title, store, pay, link }), `${b.label} post`)}>
                      <Copy />
                      Post
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-xl border p-3">
            {qr ? <img src={qr} alt={`QR code for ${job.title}`} className="size-32 rounded-lg border" /> : <div className="size-32 rounded-lg bg-muted" />}
            <div className="space-y-2">
              <div className="text-sm font-medium">QR code for flyers</div>
              <div className="text-xs text-muted-foreground">Scans open the apply page, tagged "qr".</div>
              {qr && (
                <Button size="sm" variant="outline" asChild>
                  <a href={qr} download={`${job.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`}>
                    <Download />
                    Download PNG
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
