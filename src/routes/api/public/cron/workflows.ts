import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduler entry point; same job as /api/cron/workflows. */
export const Route = createFileRoute("/api/public/cron/workflows")({
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
