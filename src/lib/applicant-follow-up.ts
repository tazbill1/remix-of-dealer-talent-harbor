import { dayKey } from "@/lib/applicant-filters";

export type ContactMessage = { application_id: string; direction: string; status: string; created_at: string; sent_at: string | null };
export type FollowUp = { lastContacted: string | null; lastReply: string | null; interviewThisWeek: boolean };
const DAY = 86400000;

export function inCalendarWeek(moment: string, now: number, timeZone?: string) {
  const today = Date.parse(`${dayKey(now, timeZone)}T00:00:00Z`);
  const start = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  const date = Date.parse(`${dayKey(moment, timeZone)}T00:00:00Z`);
  return date >= start && date < start + 7 * DAY;
}

export function followUpIndex(messages: ContactMessage[], interviews: { application_id: string; starts_at: string; status: string }[], now = Date.now(), zoneFor: (id: string) => string | undefined = () => undefined) {
  const index: Record<string, FollowUp> = {};
  const row = (id: string) => index[id] ?? (index[id] = { lastContacted: null, lastReply: null, interviewThisWeek: false });
  for (const m of messages) {
    const r = row(m.application_id);
    if ((m.direction === "out" || m.direction === "outbound") && ["sent", "delivered", "simulated"].includes(m.status)) {
      const at = m.sent_at ?? m.created_at;
      if (!r.lastContacted || Date.parse(at) > Date.parse(r.lastContacted)) r.lastContacted = at;
    }
    if ((m.direction === "in" || m.direction === "inbound") && m.status !== "failed") {
      if (!r.lastReply || Date.parse(m.created_at) > Date.parse(r.lastReply)) r.lastReply = m.created_at;
    }
  }
  for (const i of interviews) if (i.status !== "cancelled" && inCalendarWeek(i.starts_at, now, zoneFor(i.application_id))) row(i.application_id).interviewThisWeek = true;
  return index;
}

export function matchesFollowUp(row: FollowUp | undefined, filters: { contacted?: string | undefined; noReply?: string | undefined; interviewWeek?: boolean }, now = Date.now()) {
  const last = row?.lastContacted ? Date.parse(row.lastContacted) : null;
  if (filters.contacted === "never" && last !== null) return false;
  if (filters.contacted && filters.contacted !== "never" && (last === null || last > now - Number(filters.contacted) * DAY)) return false;
  if (filters.noReply && (last === null || last > now - Number(filters.noReply) * DAY || (row?.lastReply && Date.parse(row.lastReply) >= last))) return false;
  if (filters.interviewWeek && !row?.interviewThisWeek) return false;
  return true;
}