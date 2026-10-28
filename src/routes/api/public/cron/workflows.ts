import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled job (every 5 min): texting workflows, status rules and the weekly HR summary. Checks the cron secret. */
export const Route = createFileRoute("/api/public/cron/workflows")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runWorkflows } = await import("@/lib/workflows/run.server");
        const { runWeeklySummaries } = await import("@/lib/weekly-summary.server");
        const { runStatusRules } = await import("@/lib/status-rules.server");
        const { appBaseUrl } = await import("@/lib/email/provider.server");
        const result = await runWorkflows(supabaseAdmin);
        const statusRules = await runStatusRules(supabaseAdmin);
        const weekly = await runWeeklySummaries(supabaseAdmin, { appUrl: appBaseUrl(request) });
        return Response.json({ ...result, statusRules, weekly, at: new Date().toISOString() });
      },
    },
  },
});
