import { createFileRoute } from "@tanstack/react-router";
import { publicUrl, verifyTwilioRequest } from "@/lib/messaging/twilio.server";
import { mapTwilioStatus } from "@/lib/messaging/inbound.server";

/** Twilio delivery receipts: marks texts delivered or failed. */
export const Route = createFileRoute("/api/sms/status")({
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
        const status = mapTwilioStatus(params["MessageStatus"] ?? "");
        const sid = params["MessageSid"];
        if (status && sid) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("messages")
            .update({
              status,
              error:
                status === "failed" ? `Carrier error ${params["ErrorCode"] ?? ""}`.trim() : null,
            })
            .eq("provider_message_id", sid);
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
