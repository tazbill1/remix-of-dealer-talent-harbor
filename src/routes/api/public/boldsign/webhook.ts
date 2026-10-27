import { createFileRoute } from "@tanstack/react-router";
import { hireOnSign, shouldMove, statusFromEvent, OFFER_LABEL } from "@/lib/offers";

/** BoldSign tells hireme when an offer is viewed, signed, declined or expires. */
export const Route = createFileRoute("/api/public/boldsign/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        // BoldSign checks the URL works when the webhook is added.
        if (request.headers.get("x-boldsign-event") === "Verification") return new Response("ok");
        const { verifyWebhook } = await import("@/lib/esign/boldsign.server");
        if (!(await verifyWebhook(raw, request.headers.get("x-boldsign-signature"))))
          return new Response("Bad signature", { status: 401 });

        let body: { event?: { eventType?: string }; data?: { documentId?: string; object?: string } };
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const to = statusFromEvent(body.event?.eventType ?? "");
        const documentId = body.data?.documentId;
        if (!to || !documentId || (body.data?.object && body.data.object !== "document"))
          return new Response("ignored");

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: offer } = await db
          .from("offers")
          .select("id, org_id, application_id, status, job_title, template_name, is_offer_letter")
          .eq("provider_document_id", documentId)
          .maybeSingle();
        if (!offer || !shouldMove(offer.status, to)) return new Response("ok");

        const now = new Date().toISOString();
        await db
          .from("offers")
          .update({ status: to, updated_at: now, ...(to === "signed" ? { completed_at: now } : {}) })
          .eq("id", offer.id);
        const docName = offer.is_offer_letter ? `Offer` : (offer.template_name ?? "Document");
        if (to !== "viewed")
          await db.from("application_events").insert({
            org_id: offer.org_id,
            application_id: offer.application_id,
            kind: "offer",
            message: `${docName} ${OFFER_LABEL[to].toLowerCase()}: ${offer.job_title}`,
          });

        if (to === "signed") {
          const [{ data: ms }, { data: app }] = await Promise.all([
            db.from("messaging_settings").select("hire_on_offer_signed").eq("org_id", offer.org_id).maybeSingle(),
            db.from("applications").select("status").eq("id", offer.application_id).single(),
          ]);
          if (hireOnSign({ status: to, isOfferLetter: offer.is_offer_letter, setting: !!ms?.hire_on_offer_signed, appStatus: app?.status ?? "" })) {
            const { statusEventRows } = await import("@/lib/status-log");
            await db.from("applications").update({ status: "hired" }).eq("id", offer.application_id);
            await db.from("application_events").insert(statusEventRows(offer.org_id, [offer.application_id], "hired"));
          }
        }
        if (!offer.is_offer_letter) return new Response("ok");

        if (to === "signed" || to === "declined") {
          try {
            const { data: app } = await db.from("applications").select("full_name").eq("id", offer.application_id).single();
            const { BRAND } = await import("@/lib/workflows/rules");
            const { queueText, deliverDue } = await import("@/lib/messaging/outbox.server");
            const row = await queueText(db, {
              applicationId: offer.application_id,
              party: "manager",
              purpose: to === "signed" ? "manager_offer_signed" : "manager_offer_declined",
              body: `${BRAND}: ${app?.full_name ?? "Your candidate"} ${to === "signed" ? "signed" : "declined"} the offer for ${offer.job_title}.`,
            });
            if (row.status === "queued") await deliverDue(db, { ids: [row.id] });
          } catch {
            /* the status is saved even if the heads-up text can't go out */
          }
        }
        return new Response("ok");
      },
    },
  },
});
