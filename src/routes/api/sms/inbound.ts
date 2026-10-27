import { createFileRoute } from "@tanstack/react-router";
import { keywordOf, toE164 } from "@/lib/messaging/core";
import { publicUrl, sendTwilio, verifyTwilioRequest } from "@/lib/messaging/twilio.server";
import { resolveSender, storeForNumber, twiml } from "@/lib/messaging/inbound.server";

/**
 * Twilio calls this when someone texts a store number. Set it as the number's
 * "A message comes in" webhook: https://<app>/api/sms/inbound (HTTP POST).
 */
export const Route = createFileRoute("/api/sms/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env["TWILIO_AUTH_TOKEN"])
          return new Response("Texting provider isn't connected", { status: 503 });
        const form = await request.formData();
        const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
        const ok = await verifyTwilioRequest(
          publicUrl(request),
          params,
          request.headers.get("x-twilio-signature"),
        );
        if (!ok) return new Response("Invalid signature", { status: 403 });

        const from = toE164(params["From"]);
        const to = toE164(params["To"]);
        const body = (params["Body"] ?? "").slice(0, 1600);
        if (!from || !to || !body.trim()) return twiml();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { applyKeyword, keywordReply } = await import("@/lib/messaging/outbox.server");
        const store = await storeForNumber(supabaseAdmin, to);
        if (!store) return twiml();
        const sender = await resolveSender(supabaseAdmin, store, from);

        if (!sender) {
          // Unknown number: still honor STOP/START/HELP, then ignore anything else.
          const keyword = keywordOf(body);
          if (keyword) {
            await applyKeyword(supabaseAdmin, {
              orgId: store.org_id,
              phone: from,
              keyword,
              source: "sms",
            });
            await sendTwilio({ to: from, from: to, body: keywordReply(keyword, store.name) }).catch(
              () => {},
            );
          }
          return twiml();
        }

        const { runAssistant } = await import("@/lib/assistant.server");
        try {
          await runAssistant(supabaseAdmin, supabaseAdmin, {
            applicationId: sender.applicationId,
            party: sender.party,
            body,
            actorId: null,
            source: "sms",
            inbound: { from, to, providerMessageId: params["MessageSid"] ?? null },
          });
        } catch (e) {
          // The text is already logged; a failed AI reply shouldn't make Twilio retry.
          console.error("inbound assistant failed", (e as Error).message);
        }
        return twiml();
      },
    },
  },
});
