import { createFileRoute } from "@tanstack/react-router";
import { isOpen } from "@/lib/offers";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function html(title: string, body: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${esc(title)}</title><meta name="robots" content="noindex"><style>` +
      `body{font-family:system-ui,sans-serif;background:#f6f7fb;color:#1d224b;margin:0;padding:16px}` +
      `main{background:#fff;border-radius:16px;padding:24px;max-width:460px;margin:24px auto;box-shadow:0 2px 12px #0001}` +
      `h1{font-size:22px;margin:0 0 6px}p{line-height:1.5;margin:0 0 14px;color:#4a4f73}ul{list-style:none;padding:0;margin:0}` +
      `li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #eceef5}` +
      `a.btn{background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600;white-space:nowrap}` +
      `.done{color:#3f7d20;font-weight:600}.muted{color:#8a8fa8}</style></head><body><main>${body}</main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

/** Everything an applicant has to sign, from the one link texted to them. */
export const Route = createFileRoute("/api/public/docs/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { readDocsToken, offerToken } = await import("@/lib/offers-token.server");
        const appId = await readDocsToken(params.token);
        if (!appId) return html("Link not found", "<h1>Link not found</h1><p>This link isn't valid. Check the text from the dealership.</p>");
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const [{ data: app }, { data: docs }] = await Promise.all([
          db.from("applications").select("full_name, dealership_id").eq("id", appId).maybeSingle(),
          db
            .from("offers")
            .select("id, status, template_name, is_offer_letter, created_at")
            .eq("application_id", appId)
            .in("status", ["sent", "viewed", "signed"])
            .order("created_at"),
        ]);
        if (!app) return html("Link not found", "<h1>Link not found</h1><p>This link isn't valid.</p>");
        const { data: store } = await db.from("dealerships").select("name").eq("id", app.dealership_id).maybeSingle();
        const list = docs ?? [];
        const open = list.filter((d) => isOpen(d.status));
        const rows = await Promise.all(
          list.map(async (d) => {
            const name = esc(d.template_name ?? (d.is_offer_letter ? "Offer letter" : "Document"));
            if (!isOpen(d.status)) return `<li><span>${name}</span><span class="done">Signed ✓</span></li>`;
            const href = `/api/public/offer/${await offerToken(d.id)}?hub=${encodeURIComponent(params.token)}`;
            return `<li><span>${name}</span><a class="btn" href="${href}">Sign</a></li>`;
          }),
        );
        const first = esc(app.full_name.split(" ")[0] ?? "");
        const storeName = esc(store?.name ?? "the dealership");
        const intro = !list.length
          ? "<p>There's nothing waiting for your signature right now.</p>"
          : open.length
            ? `<p>${open.length === 1 ? "One document needs" : `${open.length} documents need`} your signature. Tap Sign on each one; you'll come back here after.</p>`
            : "<p>You're all done. Copies are on their way to your email. Thank you!</p>";
        return html(
          `Documents from ${store?.name ?? "the dealership"}`,
          `<h1>Hi ${first}!</h1><p class="muted">From ${storeName}</p>${intro}${list.length ? `<ul>${rows.join("")}</ul>` : ""}`,
        );
      },
    },
  },
});
