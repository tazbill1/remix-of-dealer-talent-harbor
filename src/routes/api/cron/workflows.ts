import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled job: texting workflows. Sends the manager summary when a candidate reaches
 * Screening, the nudge and escalation when the manager doesn't answer, interview
 * reminders, and 30/60/90 check-ins. Safe to run repeatedly; every 5 minutes is ideal.
 */
export const Route = createFileRoute("/api/cron/workflows")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runWorkflows } = await import("@/lib/workflows/run.server");
        const result = await runWorkflows(supabaseAdmin);
        return Response.json({ ...result, at: new Date().toISOString() });
      },
    },
  },
});
