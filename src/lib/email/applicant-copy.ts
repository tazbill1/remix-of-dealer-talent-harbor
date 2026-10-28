/**
 * Wording for the automatic applicant emails (confirmation, interview invite, status
 * updates). Pure functions so the rules are testable. The outbox adds the footer.
 */
import type { AppStatus } from "@/lib/jobs";

export type ApplicantEmailKind =
  | { kind: "confirmation" }
  | { kind: "interview"; startsAt: string | null }
  | { kind: "status"; status: AppStatus };

/** Stages that trigger an automatic status email. "new" never does; "interview" uses the invite. */
export const STATUS_EMAIL_STAGES: AppStatus[] = ["screening", "offer", "hired", "rejected"];

/** One purpose per event, so the same email is never sent twice to an applicant. */
export function applicantEmailPurpose(e: ApplicantEmailKind) {
  if (e.kind === "confirmation") return "email_confirmation";
  if (e.kind === "interview") return e.startsAt ? `email_interview_${e.startsAt}` : "email_interview";
  return `email_status_${e.status}`;
}

export function applicantEmail(
  e: ApplicantEmailKind,
  a: { first: string; job: string; store: string; assistant: string; statusUrl: string; timezone: string; bookingUrl?: string | null },
): { subject: string; body: string } | null {
  const sign = `${a.assistant}\n${a.store} hiring team`;
  const check = `Check your status anytime: ${a.statusUrl}`;
  if (e.kind === "confirmation")
    return {
      subject: `We got your application — ${a.job} at ${a.store}`,
      body: `Hi ${a.first},\n\nThanks for applying for ${a.job} at ${a.store}! Our team is reviewing your application and we'll reach out soon with next steps.\n\n${check}\n\n${sign}`,
    };
  if (e.kind === "interview") {
    const when = e.startsAt
      ? new Date(e.startsAt).toLocaleString("en-US", {
          timeZone: a.timezone,
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        })
      : null;
    return {
      subject: `Interview invite — ${a.job} at ${a.store}`,
      body: when
        ? `Hi ${a.first},\n\nGreat news — we'd like to interview you for ${a.job}! You're scheduled for ${when} at ${a.store}.\n\n${a.bookingUrl ? `Need a different time? Pick a new one here:\n${a.bookingUrl}` : "If that time doesn't work, just reply to this email and we'll find another."}\n\n${check}\n\n${sign}`
        : a.bookingUrl
          ? `Hi ${a.first},\n\nGreat news — we'd like to interview you for ${a.job} at ${a.store}!\n\nPick a time that works for you here (it takes a few seconds):\n${a.bookingUrl}\n\n${check}\n\n${sign}`
          : `Hi ${a.first},\n\nGreat news — we'd like to interview you for ${a.job} at ${a.store}! We'll reach out shortly to set up a time. You can also reply to this email with times that work for you.\n\n${check}\n\n${sign}`,
    };
  }
  if (!STATUS_EMAIL_STAGES.includes(e.status)) return null;
  const lines: Record<string, [string, string]> = {
    screening: [`Your application is moving forward`, `Good news — your application for ${a.job} is moving forward and is now being reviewed by the hiring team.`],
    offer: [`An offer for ${a.job}`, `Congratulations! We'd like to offer you the ${a.job} position at ${a.store}. Someone from our team will be in touch with the details.`],
    hired: [`Welcome to ${a.store}!`, `Welcome to the team! We're excited to have you join ${a.store} as ${a.job}. We'll follow up with everything you need for your first day.`],
    rejected: [`Update on your application`, `Thank you for your interest in ${a.job} at ${a.store}. We've decided to move forward with other candidates for this role, but we'd love to keep you in mind for future openings.`],
  };
  const [subject, text] = lines[e.status]!;
  return { subject: `${subject} — ${a.store}`, body: `Hi ${a.first},\n\n${text}\n\n${check}\n\n${sign}` };
}
