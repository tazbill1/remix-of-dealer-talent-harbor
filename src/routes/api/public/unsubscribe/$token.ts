import { createFileRoute } from "@tanstack/react-router";

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from their own "Unsubscribe"
 * button. The token is signed, so only a real link from one of our emails works.
 */
export const Route = createFileRoute("/api/public/unsubscribe/$token")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const { readUnsubscribeToken } = await import("@/lib/email/provider.server");
        const t = await readUnsubscribeToken(params.token);
        if (!t) return new Response("Invalid link", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { applyEmailOptOut } = await import("@/lib/email/unsubscribe.server");
        await applyEmailOptOut(supabaseAdmin, t.orgId, t.email, "one_click");
        return new Response("Unsubscribed", { status: 200 });
      },
    },
  },
});
