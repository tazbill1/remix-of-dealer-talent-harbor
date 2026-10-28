import { normalizeEmail } from "@/lib/email/core";

/** Never guess between interviewers or broadcast a booking to the team. */
export function interviewRecipient(people: { id: string; email: string | null }[]) {
  if (people.length !== 1) return null;
  const person = people[0];
  if (!person) return null;
  const email = normalizeEmail(person.email);
  return email ? { id: person.id, email } : null;
}

export const interviewInviteKey = (id: string, startsAt: string, memberId: string) =>
  `staff-interview-${id}-${Date.parse(startsAt)}-${memberId}`;