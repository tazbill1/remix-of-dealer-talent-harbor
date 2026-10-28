/** One-click "add event" links for Google Calendar and Outlook (no file download). Pure, tested. */
export type CalendarEvent = { title: string; startsAt: string; minutes: number; location?: string | null; details?: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function calendarLinks(e: CalendarEvent) {
  const s = new Date(e.startsAt);
  const end = new Date(s.getTime() + e.minutes * 60000);
  const g = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${stamp(s)}/${stamp(end)}`, location: e.location ?? "", details: e.details ?? "" });
  const o = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title, startdt: s.toISOString(), enddt: end.toISOString(), location: e.location ?? "", body: e.details ?? "" });
  return {
    google: `https://calendar.google.com/calendar/render?${g.toString()}`,
    outlook: `https://outlook.office.com/calendar/deeplink/compose?${o.toString()}`,
  };
}
