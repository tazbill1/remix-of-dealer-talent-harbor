/**
 * Reads a manager's private calendar link (Google "Secret address in iCal format",
 * an Outlook published calendar, or iCloud) and turns it into busy times, so the
 * booking page doesn't offer times the manager already has something on.
 */
import ICAL from "ical.js";
import { zonedTime, type Busy } from "@/lib/booking";

const HOSTS = ["calendar.google.com", "outlook.office365.com", "outlook.office.com", "outlook.live.com"];

/** Only well-known calendar hosts, over https. Returns the URL to fetch, or an error. */
export function checkCalendarUrl(raw: string): { url: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    return { error: "That isn't a web address." };
  }
  if (u.protocol !== "https:") return { error: "The link must start with https:// or webcal://." };
  const host = u.hostname.toLowerCase();
  if (!HOSTS.includes(host) && !host.endsWith(".icloud.com"))
    return { error: "Use the private calendar link from Google Calendar, Outlook, or iCloud." };
  if (host === "calendar.google.com" && !u.pathname.includes("/private-"))
    return {
      error:
        "That's Google's public address. Use the \"Secret address in iCal format\" (it contains /private-) so busy times can be read.",
    };
  return { url: u.toString() };
}

/** "calendar.google.com" style label, never the secret part of the link. */
export const calendarHost = (url: string) => {
  try {
    return new URL(url.replace(/^webcals?:\/\//i, "https://")).hostname;
  } catch {
    return "calendar";
  }
};

function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** An ICAL time as a timestamp. Floating and all-day times are read in the store's zone. */
function toMs(t: ICAL.Time, storeTz: string, tzid: string | null) {
  if (t.isDate) return zonedTime(t.year, t.month, t.day, 0, 0, storeTz);
  const zone = t.zone?.tzid;
  if (zone === "UTC" || (zone && zone !== "floating")) return t.toUnixTime() * 1000;
  const tz = tzid && validZone(tzid) ? tzid : storeTz;
  return zonedTime(t.year, t.month, t.day, t.hour, t.minute, tz);
}

const isFree = (e: ICAL.Event) =>
  String(e.component.getFirstPropertyValue("transp") ?? "").toUpperCase() === "TRANSPARENT" ||
  String(e.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

/** Busy blocks between `from` and `to`, recurring events expanded. */
export function busyFromIcs(text: string, a: { storeTz: string; from: number; to: number; maxEvents?: number }): Busy[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(vtz);
    } catch {
      /* a broken time zone block shouldn't stop the rest */
    }
  }
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const v of root.getAllSubcomponents("vevent")) {
    const e = new ICAL.Event(v);
    if (e.isRecurrenceException()) exceptions.push(e);
    else masters.set(e.uid, e);
  }
  for (const ex of exceptions) {
    const m = masters.get(ex.uid);
    if (m) m.relateException(ex);
    else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex);
  }

  const out: Busy[] = [];
  const max = a.maxEvents ?? 2000;
  const tzidOf = (e: ICAL.Event, prop: "dtstart" | "dtend") =>
    (e.component.getFirstProperty(prop)?.getParameter("tzid") as string | undefined) ?? null;
  const push = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (isFree(item)) return;
    const s = toMs(start, a.storeTz, tzidOf(item, "dtstart"));
    let e = toMs(end, a.storeTz, tzidOf(item, "dtend") ?? tzidOf(item, "dtstart"));
    if (e <= s) e = s + (start.isDate ? 86400e3 : 30 * 60e3);
    if (e > a.from && s < a.to) out.push({ start: s, end: e });
  };

  for (const e of masters.values()) {
    if (out.length >= max) break;
    if (!e.startDate) continue;
    if (!e.isRecurring()) {
      push(e, e.startDate, e.endDate ?? e.startDate);
      continue;
    }
    const it = e.iterator();
    for (let n = 0, next = it.next(); next && n < 1000; next = it.next(), n++) {
      const occ = e.getOccurrenceDetails(next);
      const s = toMs(occ.startDate, a.storeTz, tzidOf(e, "dtstart"));
      if (s >= a.to) break;
      push(occ.item, occ.startDate, occ.endDate);
      if (out.length >= max) break;
    }
  }
  return out;
}
