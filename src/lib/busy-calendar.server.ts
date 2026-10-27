/** Fetches store managers' private calendar links. Links are only ever read on the server. */
import { busyFromIcs, checkCalendarUrl } from "@/lib/busy-calendar";
import type { Busy } from "@/lib/booking";

type DB = import("@supabase/supabase-js").SupabaseClient;

export async function fetchIcs(rawUrl: string) {
  const checked = checkCalendarUrl(rawUrl);
  if ("error" in checked) throw new Error(checked.error);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(checked.url, { signal: ctl.signal, redirect: "follow", headers: { accept: "text/calendar" } });
    if (res.status === 404 || res.status === 403)
      throw new Error("The calendar link doesn't work anymore. It may have been reset; paste the new one.");
    if (!res.ok) throw new Error(`The calendar couldn't be read (${res.status}).`);
    const text = await res.text();
    if (text.length > 8_000_000) throw new Error("That calendar is too large to read.");
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link didn't return a calendar.");
    return text;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("The calendar took too long to answer.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busy times for a store: the calendars of the hiring managers and GMs who cover it
 * (plus any linked to the store itself). A calendar that can't be read is
 * skipped (and its error saved for the store page), so booking never breaks.
 */
export async function storeBusy(db: DB, storeId: string, storeTz: string, from: number, to: number): Promise<Busy[]> {
  const { data: store } = await db.from("dealerships").select("org_id").eq("id", storeId).maybeSingle();
  if (!store) return [];
  const { storeInterviewers } = await import("@/lib/member-calendars.functions");
  const people = await storeInterviewers(db, store.org_id, storeId);
  const owners = [`dealership_id.eq.${storeId}`, ...(people.length ? [`member_id.in.(${people.map((p) => p.id).join(",")})`] : [])];
  const { data: cals } = await db.from("store_calendars").select("id, ics_url").or(owners.join(",")).limit(20);
  const out: Busy[] = [];
  await Promise.all(
    (cals ?? []).map(async (c) => {
      try {
        out.push(...busyFromIcs(await fetchIcs(c.ics_url), { storeTz, from, to }));
        await db.from("store_calendars").update({ last_checked_at: new Date().toISOString(), last_error: null }).eq("id", c.id);
      } catch (e) {
        await db
          .from("store_calendars")
          .update({ last_checked_at: new Date().toISOString(), last_error: (e as Error).message.slice(0, 300) })
          .eq("id", c.id);
      }
    }),
  );
  return out;
}
