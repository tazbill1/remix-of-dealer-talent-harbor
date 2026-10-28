import { average, statusTimeline, type AApp, type AEvent, type AJob, type AStore } from "./analytics";
import { isTestName, sourceLabel } from "./display";
import { endOfDay, startOfWeek, startOfQuarter, subDays, subWeeks } from "date-fns";

export type ReportApp = AApp & { needs_attention: string | null };
export type ReportMessage = { application_id: string; party: string; direction: string; created_at: string; sent_at: string | null; status: string; channel: string; provider: string | null };
export type ReportInterview = { application_id: string; starts_at: string; status: string };
export type ReportOffer = { application_id: string; created_at: string; status: string; is_offer_letter: boolean; provider_document_id: string | null };
export type ReportData = { apps: ReportApp[]; jobs: AJob[]; stores: AStore[]; regions: { id: string; name: string }[]; events: AEvent[]; messages: ReportMessage[]; interviews: ReportInterview[]; offers: ReportOffer[]; groupWide: boolean };
export type ReportRange = { from: number; to: number };
export type ReportPeriod = "this_week" | "last_week" | "30" | "quarter" | "custom";
export function reportRange(period: ReportPeriod, now: Date, customFrom = "", customTo = ""): ReportRange {
  const week = startOfWeek(now, { weekStartsOn: 1 });
  if (period === "last_week") return { from: subWeeks(week, 1).getTime(), to: week.getTime() - 1 };
  if (period === "custom") return { from: new Date(`${customFrom}T00:00:00`).getTime(), to: endOfDay(new Date(`${customTo}T00:00:00`)).getTime() };
  return { from: (period === "this_week" ? week : period === "quarter" ? startOfQuarter(now) : subDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 29)).getTime(), to: now.getTime() };
}
export function assignedStores(stores: AStore[], groupWide: boolean, scopes: { dealership_id: string | null; region_id: string | null }[]) {
  return stores.filter(s => groupWide || scopes.some(scope => scope.dealership_id === s.id || (!!scope.region_id && scope.region_id === s.region_id)));
}
export const enoughAverage = (values: number[]) => values.length >= 3 ? average(values) : null;
export const measurement = (value: number | null, unit = "days") => value === null ? "Not enough data yet" : `${value < 1 ? "<1" : value.toFixed(1)} ${unit}`;
export function comparison(value: number | null, group: number | null, lowerBetter: boolean): "green" | "amber" | "red" | null {
  if (value === null || group === null) return null;
  const delta = group === 0 ? (value === 0 ? 0 : 1) : (value - group) / group;
  const quality = lowerBetter ? -delta : delta;
  return quality > .1 ? "green" : quality < -.1 ? "red" : "amber";
}
export const REPORT_SOURCES = ["Careers", "Indeed", "ZipRecruiter", "Glassdoor", "Referral", "Walk-in"];
export function reportSource(source: string) {
  const label = sourceLabel(source);
  return /^(careers( site)?|own site)$/i.test(label) ? "Careers" : label;
}
const time = (iso: string) => Date.parse(iso);
const within = (at: number, range: ReportRange) => at >= range.from && at <= range.to;
export function computeReports(data: ReportData, range: ReportRange, filters: { storeId: string; regionId: string; showTests: boolean }, now = Date.now()) {
  const stores = data.stores.filter(s => (filters.storeId === "all" || s.id === filters.storeId) && (filters.regionId === "all" || (filters.regionId === "none" ? !s.region_id : s.region_id === filters.regionId)));
  const storeIds = new Set(stores.map(s => s.id));
  const apps = data.apps.filter(a => storeIds.has(a.dealership_id) && (filters.showTests || !isTestName(a.full_name)));
  const timeline = statusTimeline(data.events);
  const hireTime = (a: ReportApp) => a.hired_at ? time(a.hired_at) : timeline.get(a.id)?.find(e => e.to === "hired")?.at ?? null;
  const stats = (list: ReportApp[], r: ReportRange) => {
    const ids = new Set(list.map(a => a.id));
    const newApps = list.filter(a => within(time(a.created_at), r));
    const hires = list.filter(a => { const at = hireTime(a); return at !== null && within(at, r); });
    const interviews = data.interviews.filter(i => ids.has(i.application_id) && ["completed", "held"].includes(i.status) && within(time(i.starts_at), r));
    const offers = data.offers.filter(o => ids.has(o.application_id) && o.is_offer_letter && !!o.provider_document_id && o.status !== "failed" && within(time(o.created_at), r));
    const contacts = newApps.flatMap(a => { const first = data.messages.filter(m => m.application_id === a.id && m.party === "candidate" && m.direction === "out" && m.sent_at && ["sent", "delivered"].includes(m.status) && m.provider !== "practice" && time(m.sent_at) <= r.to).sort((x,y) => time(x.sent_at ?? x.created_at) - time(y.sent_at ?? y.created_at))[0]; return first?.sent_at && time(first.sent_at) >= time(a.created_at) ? [(time(first.sent_at) - time(a.created_at)) / 3600e3] : []; });
    const replies: number[] = [];
    for (const a of list) {
      let waiting: number | null = null;
      for (const m of data.messages.filter(m => m.application_id === a.id && m.party === "manager" && m.channel === "sms" && m.provider !== "practice").sort((x,y) => time(x.sent_at ?? x.created_at) - time(y.sent_at ?? y.created_at))) {
        if (m.direction === "out" && m.sent_at && ["sent", "delivered"].includes(m.status) && waiting === null) waiting = time(m.sent_at);
        if (m.direction === "in" && waiting !== null && time(m.created_at) >= waiting) { if (within(time(m.created_at), r)) replies.push((time(m.created_at) - waiting)/3600e3); waiting = null; }
      }
    }
    const fills = hires.flatMap(a => { const at = hireTime(a); return at !== null && at >= time(a.created_at) ? [(at - time(a.created_at))/86400e3] : []; });
    return { applicants: newApps.length, interviews: interviews.length, offers: offers.length, hires: hires.length, attention: list.filter(a => a.needs_attention && time(a.created_at) <= Math.min(now, r.to)).length, contact: enoughAverage(contacts), response: enoughAverage(replies), fill: enoughAverage(fills), fillSamples: fills.length };
  };
  const duration = range.to - range.from + 1;
  const previous = { from: range.from - duration, to: range.from - 1 };
  const total = stats(apps, range);
  const prior = stats(apps, previous);
  const storeRows = stores.map(s => ({ id: s.id, label: s.name, ...stats(apps.filter(a => a.dealership_id === s.id), range) }));
  const roles = [...new Set(data.jobs.filter(j => storeIds.has(j.dealership_id)).map(j => j.title))].map(label => ({ label, ...stats(apps.filter(a => data.jobs.find(j => j.id === a.job_id)?.title === label), range) }));
  const sources = [...new Set([...REPORT_SOURCES, ...apps.map(a => reportSource(a.source))])].map(label => {
    const cohort = apps.filter(a => reportSource(a.source) === label && within(time(a.created_at), range));
    const hires = cohort.filter(a => { const at = hireTime(a); return at !== null && at <= range.to; }).length;
    return { label, applicants: cohort.length, hires, rate: cohort.length >= 3 ? Math.round(hires/cohort.length*100) : null };
  });
  return { total, prior, storeRows, roles, sources, topStores: [...storeRows].sort((a,b) => (b.applicants+b.interviews+b.offers+b.hires) - (a.applicants+a.interviews+a.offers+a.hires)).slice(0,3) };
}