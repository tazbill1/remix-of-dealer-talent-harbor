import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled job (every 5 min): send due texts and emails. Checks the cron secret. */
export const Route = createFileRoute("/api/public/cron/messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { deliverDue } = await import("@/lib/messaging/outbox.server");
        const { publicUrl } = await import("@/lib/messaging/twilio.server");
        const statusCallback = new URL("/api/sms/status", publicUrl(request)).toString();
        const result = await deliverDue(supabaseAdmin, { statusCallback, limit: 500 });
        return Response.json({ ...result, at: new Date().toISOString() });
      },
    },
  },
});
