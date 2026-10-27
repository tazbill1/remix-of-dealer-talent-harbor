import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduler entry point; same job as /api/cron/escalate. */
export const Route = createFileRoute("/api/public/cron/escalate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runEscalation } = await import("@/lib/escalation-run.server");
        return Response.json(await runEscalation(supabaseAdmin));
      },
    },
  },
});
