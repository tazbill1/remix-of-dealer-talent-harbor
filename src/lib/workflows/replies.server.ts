/**
 * Short manager replies with a fixed meaning, handled before the AI so they always
 * work the same way: "1" / "2" after a candidate summary, "Y" / "N" after a 30/60/90
 * check-in. Anything else returns null and goes to the AI as usual.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { checkinSchedule, departureFromCheckin } from "@/lib/retention";
import { statusEventRows } from "@/lib/status-log";
import {
  firstName,
  managerDecision,
  pendingManagerQuestion,
  PURPOSE,
  text,
  yesNo,
  type Msg,
} from "@/lib/workflows/rules";
import { localDate, sendText } from "@/lib/workflows/run.server";

type DB = SupabaseClient<Database>;

export async function handleManagerShortReply(
  sb: DB,
  admin: DB,
  input: {
    app: {
      id: string;
      org_id: string;
      full_name: string;
      status: string;
      start_date: string | null;
      hired_at: string | null;
      departed_at: string | null;
    };
    storeName: string;
    jobTitle: string;
    timeZone: string;
    body: string;
    replyTo: string | null;
    now?: number;
  },
) {
  const decision = managerDecision(input.body);
  const answer = yesNo(input.body);
  if (!decision && answer === null) return null;

  const { data: history } = await sb
    .from("messages")
    .select("application_id, party, direction, purpose, status, created_at")
    .eq("application_id", input.app.id)
    .eq("party", "manager")
    .eq("direction", "out");
  const pending = pendingManagerQuestion((history ?? []) as Msg[]);
  if (!pending) return null;
  const { app } = input;
  const now = input.now ?? Date.now();
  const event = (message: string) =>
    sb
      .from("application_events")
      .insert({ org_id: app.org_id, application_id: app.id, kind: "texting", message });
  const ack = (body: string) =>
    sendText(sb, admin, {
      applicationId: app.id,
      party: "manager",
      purpose: PURPOSE.decisionAck,
      body,
      to: input.replyTo,
      now,
    });

  if (pending.kind === "decision" && decision) {
    // Already decided (e.g. someone moved them in the app): let the AI respond instead.
    if (!["new", "screening"].includes(app.status)) return null;
    const status = decision === "interview" ? "interview" : "rejected";
    await sb.from("applications").update({ status }).eq("id", app.id);
    await sb.from("application_events").insert(statusEventRows(app.org_id, [app.id], status));
    await event(
      decision === "interview"
        ? "Hiring manager replied 1: interview"
        : "Hiring manager replied 2: pass",
    );
    const first = firstName(app.full_name);
    await sendText(sb, admin, {
      applicationId: app.id,
      party: "candidate",
      now,
      ...(decision === "interview"
        ? {
            purpose: PURPOSE.inviteCandidate,
            body: await inviteBody(app.id, first, input.storeName),
          }
        : {
            purpose: PURPOSE.declineCandidate,
            body: text.declineCandidate({ first, job: input.jobTitle, store: input.storeName }),
          }),
    });
    {
      const { emailApplicant } = await import("@/lib/email/applicant.server");
      await emailApplicant(admin, app.id, status === "interview"
        ? { kind: "interview", startsAt: null }
        : { kind: "status", status });
    }
    const reply =
      decision === "interview" ? text.ackInterview({ name: first }) : text.ackPass({ name: first });
    const row = await ack(reply);
    return {
      reply,
      keyword: null,
      changed: [] as string[],
      status,
      interviewAt: null,
      delivery: row?.status ?? null,
    };
  }

  if (pending.kind === "checkin" && answer !== null) {
    const due =
      checkinSchedule(app.start_date, app.hired_at).find((s) => s.mark === pending.mark)?.due ??
      localDate(now, input.timeZone);
    await sb.from("retention_checkins").upsert(
      {
        org_id: app.org_id,
        application_id: app.id,
        day_mark: pending.mark,
        due_on: due,
        still_employed: answer,
        responded_at: new Date(now).toISOString(),
        response: input.body.trim().slice(0, 200),
      },
      { onConflict: "application_id,day_mark" },
    );
    if (!answer && !app.departed_at)
      await sb
        .from("applications")
        .update({ departed_at: departureFromCheckin(due, localDate(now, input.timeZone)) })
        .eq("id", app.id);
    await event(
      `${pending.mark}-day check-in: hiring manager says ${app.full_name} ${answer ? "is still on the team" : "has left"}`,
    );
    const reply = text.checkinThanks(answer);
    const row = await ack(reply);
    return {
      reply,
      keyword: null,
      changed: [] as string[],
      status: null,
      interviewAt: null,
      delivery: row?.status ?? null,
    };
  }
  return null;
}

/** The interview invite: a link to pick a time, or the old "when works?" text if the link can't be made. */
async function inviteBody(applicationId: string, first: string, store: string) {
  try {
    const { bookingLink } = await import("@/lib/booking.functions");
    const { bookingInviteText } = await import("@/lib/booking");
    const link = await bookingLink(applicationId);
    if (link.startsWith("http")) return bookingInviteText({ first, store, link });
  } catch {
    /* fall through */
  }
  return text.inviteCandidate({ first, store });
}
