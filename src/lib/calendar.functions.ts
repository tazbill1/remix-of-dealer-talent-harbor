import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The signed-in person's private calendar feed for this group. */
export const myCalendarFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) return { url: null as string | null };
    const { calendarToken } = await import("@/lib/calendar-feed.server");
    const { appBaseUrl } = await import("@/lib/email/provider.server");
    return { url: `${appBaseUrl(getRequest())}/api/public/calendar/${await calendarToken(member.id)}.ics` };
  });
