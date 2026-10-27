import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { toE164 } from "@/lib/messaging/core";
import type { Party } from "@/lib/messaging/outbox.server";

type DB = SupabaseClient<Database>;

/** Which store a text was sent to, by its texting number. */
export async function storeForNumber(admin: DB, to: string) {
  const { data } = await admin
    .from("dealerships")
    .select("id, org_id, name, sms_number")
    .not("sms_number", "is", null);
  return (data ?? []).find((s) => toE164(s.sms_number) === to) ?? null;
}

const CLOSED = ["hired", "rejected"];

/**
 * Who sent this text and which application it's about. First choice: whoever we last
 * texted from this group at that number (so a manager's "1" lands on the candidate we
 * just summarized). Otherwise, the candidate's most recent open application at the store,
 * then anywhere in the group.
 */
export async function resolveSender(
  admin: DB,
  store: { id: string; org_id: string },
  from: string,
): Promise<{ party: Party; applicationId: string; candidateId: string | null } | null> {
  const { data: last } = await admin
    .from("messages")
    .select("application_id, party")
    .eq("org_id", store.org_id)
    .eq("to_phone", from)
    .eq("direction", "out")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last) {
    const { data: app } = await admin
      .from("applications")
      .select("candidate_id")
      .eq("id", last.application_id)
      .maybeSingle();
    return {
      party: last.party as Party,
      applicationId: last.application_id,
      candidateId: app?.candidate_id ?? null,
    };
  }
  const { data: apps } = await admin
    .from("applications")
    .select("id, dealership_id, status, phone, candidate_id, created_at")
    .eq("org_id", store.org_id)
    .not("phone", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  const mine = (apps ?? []).filter((a) => toE164(a.phone) === from);
  const pick =
    mine.find((a) => a.dealership_id === store.id && !CLOSED.includes(a.status)) ??
    mine.find((a) => !CLOSED.includes(a.status)) ??
    mine[0];
  return pick
    ? { party: "candidate", applicationId: pick.id, candidateId: pick.candidate_id }
    : null;
}

/** Twilio delivery statuses mapped to ours. */
export function mapTwilioStatus(s: string) {
  if (s === "delivered") return "delivered";
  if (s === "undelivered" || s === "failed") return "failed";
  if (s === "sent") return "sent";
  return null; // queued/sending/accepted: keep what we have
}

/** Empty TwiML: we reply through the outbox, not inline. */
export const twiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "content-type": "text/xml" },
  });
