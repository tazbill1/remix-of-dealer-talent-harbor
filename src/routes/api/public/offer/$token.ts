import { createFileRoute } from "@tanstack/react-router";
import { isOpen } from "@/lib/offers";

const page = (title: string, text: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<meta name="robots" content="noindex"><style>body{font-family:system-ui,sans-serif;background:#f6f7fb;color:#1d224b;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}` +
      `main{background:#fff;border-radius:16px;padding:28px;max-width:420px;box-shadow:0 2px 12px #0001}h1{font-size:22px;margin:0 0 8px}p{line-height:1.5;margin:0}</style></head>` +
      `<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

/** The link texted to the candidate: opens a fresh BoldSign signing page. */
export const Route = createFileRoute("/api/public/offer/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { readOfferToken } = await import("@/lib/offers-token.server");
        const offerId = await readOfferToken(params.token);
        if (!offerId) return page("Link not found", "This offer link isn't valid. Check the text from the dealership.");
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: offer } = await db
          .from("offers")
          .select("id, status, provider_document_id, application_id")
          .eq("id", offerId)
          .maybeSingle();
        if (!offer) return page("Link not found", "This offer link isn't valid.");
        const url = new URL(request.url);
        if (url.searchParams.has("done") || offer.status === "signed")
          return page("Thank you!", "Your offer is signed. A copy is on its way to your email, and the dealership will be in touch about next steps.");
        if (!isOpen(offer.status) || !offer.provider_document_id)
          return page("This offer is closed", "This offer is no longer open. Please reach out to the dealership with any questions.");
        const { data: app } = await db.from("applications").select("email").eq("id", offer.application_id).single();
        try {
          const { embeddedSignLink } = await import("@/lib/esign/boldsign.server");
          const link = await embeddedSignLink(offer.provider_document_id, app?.email ?? "", `${url.origin}${url.pathname}?done=1`);
          return Response.redirect(link, 302);
        } catch {
          return page("Almost there", "We couldn't open the signing page right now. Look for the email from BoldSign to sign your offer, or try this link again in a few minutes.");
        }
      },
    },
  },
});
