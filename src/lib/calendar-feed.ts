/**
 * The private calendar feed each team member subscribes to from Outlook or Google.
 * Pure helpers (no database) so they're easy to test.
 */

/** Roles that see every store's interviews; everyone else sees their stores/regions. */
const GROUP_WIDE = new Set(["group_admin", "recruiter"]);

export function visibleStoreIds(
  role: string,
  scopes: { dealership_id: string | null; region_id: string | null }[],
  stores: { id: string; region_id: string | null }[],
) {
  if (GROUP_WIDE.has(role)) return new Set(stores.map((s) => s.id));
  const ids = new Set<string>();
  const regions = new Set(scopes.map((s) => s.region_id).filter(Boolean));
  for (const s of scopes) if (s.dealership_id) ids.add(s.dealership_id);
  for (const st of stores) if (st.region_id && regions.has(st.region_id)) ids.add(st.id);
  return ids;
}

export type FeedEvent = {
  id: string;
  startsAt: string;
  durationMin: number;
  status: string;
  title: string;
  location: string;
  description: string;
};

/** Text values in .ics need \ ; , and newlines escaped. */
export const icsText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 bytes are folded onto continuation lines starting with a space. */
export function foldLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function buildIcs(calName: string, events: FeedEvent[], now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WerkandMe//hireme//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    const start = new Date(e.startsAt);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + Math.max(5, e.durationMin || 30) * 60000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@hireme.werkandme`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${icsText(e.title)}`,
      `LOCATION:${icsText(e.location)}`,
      `DESCRIPTION:${icsText(e.description)}`,
      `STATUS:${e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** One-click subscribe links. Both calendars need a public https/webcal address. */
export function subscribeLinks(feedUrl: string, name = "hireme interviews") {
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");
  return {
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(name)}`,
    outlookPersonal: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(name)}`,
    webcal,
  };
}
