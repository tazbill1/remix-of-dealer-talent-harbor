import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** QR image + Download PNG + Copy link; shared by referral, event and store QR codes. */
export function QrCard({ name, link, caption, fileName, showLink }: { name: string; link: string; caption: string; fileName: string; showLink?: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(link, { width: 600, margin: 2, color: { dark: "#1d224b", light: "#ffffff" } }).then(setQr).catch(() => setQr(null));
  }, [link]);
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast.success("QR link copied."); } catch { toast.error("Couldn't copy. Select the link and copy it."); }
  }
  return (
    <div className="flex flex-col items-center gap-3">
      {qr ? <img src={qr} alt={`QR code for ${name}`} className="size-56 rounded-lg border" /> : <div className="size-56 rounded-lg bg-muted" />}
      <p className="text-center text-xs text-muted-foreground">{caption}</p>
      {showLink && <code className="break-all rounded bg-muted px-2 py-1 text-xs">{link}</code>}
      <div className="flex gap-2">
        {qr && <Button size="sm" asChild><a href={qr} download={fileName}><Download />Download PNG</a></Button>}
        <Button size="sm" variant="outline" onClick={copy}><Copy />Copy link</Button>
      </div>
    </div>
  );
}
