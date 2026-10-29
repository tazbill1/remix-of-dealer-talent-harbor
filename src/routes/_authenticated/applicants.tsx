import { ApplicantViewTabs } from "@/components/applicant-view-tabs";
import { BulkMessageCompose, useBulkSettings } from "@/components/bulk-message-compose";
import { canSendBulk } from "@/lib/bulk-messaging";
import { PossibleDuplicateTag, useOpenDuplicate } from "@/components/possible-duplicate-tag";
import { TagOverflow } from "@/components/tag-overflow";
import { orderCardFlags, type CardFlag } from "@/lib/card-tags";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Phone, FileText, Star, ArrowRightLeft, X, UserCheck, Search, LayoutGrid, List, Linkedin, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { BOARD_SHORT_LABEL, STATUSES, STATUS_LABEL, STATUS_COLOR, canPostJobs, isRejection, type AppStatus } from "@/lib/jobs";
import { StatusPill, statusSelectStyle } from "@/components/status-pill";
import { doNotHireRepeats } from "@/lib/do-not-hire";

const confirmRejection = (s: AppStatus, n: number) =>
  !isRejection(s) || window.confirm(`Move ${n === 1 ? "this applicant" : `${n} applicants`} to "${STATUS_LABEL[s]}"?`);
import { statusEventRows } from "@/lib/status-log";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApplicantNotes } from "@/components/applicant-notes";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AddCandidateDialog } from "@/components/add-candidate-dialog";
import { canAddCandidate } from "@/lib/manual-candidate";
import { SOURCE_CHANNELS } from "@/lib/sources";
import { AssistantThreads, InterviewsPanel, TextCompose } from "@/components/applicant-tools";
import { RetentionCheckins } from "@/components/retention-checkins";
import { EmailCompose } from "@/components/email-compose";
import { KnockoutBadge, ScreeningAnswers } from "@/components/screening-answers";
import { OfferPanel } from "@/components/offer-panel";
import { DocumentsPanel } from "@/components/documents-panel";
import { BackgroundCheckBadge, BackgroundCheckPanel } from "@/components/background-check-panel";
import { parseQuestions, type Answers, type Question } from "@/lib/questions";
import { useServerFn } from "@tanstack/react-start";
import { notifyApplicants } from "@/lib/email.functions";
import { UserPlus } from "lucide-react";
import { z } from "zod";
import { isTestName, plural, sourceLabel } from "@/lib/display";
import { filterApplicants, SORT_MENU, SORTS, sortApplicants } from "@/lib/applicant-filters";
import { LINKEDIN_ERROR, normalizeLinkedInUrl } from "@/lib/linkedin";
import { useReminderRules } from "@/components/status-reminders-settings";
import { overdueInfo, type Overdue } from "@/lib/status-reminders";
import { ReferralBadge, ReferralPanelRow, useReferrerNames } from "@/components/referral-badge";

type SearchKey = "q" | "job" | "source" | "applied" | "attention" | "sort" | "view" | "status" | "filter" | "region" | "store" | "tests" | "overdue";

export const Route = createFileRoute("/_authenticated/applicants")({
  head: () => ({ meta: [{ title: "Applicants | WerkandMe Hiring" }, { name: "description", content: "Manage applicants and interview scorecards across your stores." }, { property: "og:title", content: "Applicants | WerkandMe Hiring" }, { property: "og:description", content: "Manage applicants and interview scorecards across your stores." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: z.object({
    q: z.string().optional(),
    job: z.string().optional(),
    source: z.string().optional(),
    applied: z.string().optional(),
    attention: z.string().optional(),
    sort: z.string().optional(),
    view: z.string().optional(),
    status: z.string().optional(),
    filter: z.string().optional(),
    region: z.string().optional(),
    store: z.string().optional(),
    tests: z.string().optional(),
    overdue: z.coerce.string().optional(),
    focus: z.string().optional(),
    applicant: z.string().uuid().optional(),
    tab: z.enum(["overview", "messages", "interview", "offer", "notes", "onboarding"]).optional(),
    interview: z.string().uuid().optional(),
  }),
  component: Applicants,
});

const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";

function Applicants() {
  const org = useOrg();
  const qc = useQueryClient();
  const key = ["applicants", org.orgId];
  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [apps, jobs, stores, regions] = await Promise.all([
        supabase.from("applications").select("*").eq("org_id", org.orgId).is("archived_at", null).order("created_at", { ascending: false }),
        supabase.from("jobs").select("id, title, dealership_id, status, questions").eq("org_id", org.orgId),
        supabase.from("dealerships").select("id, name, assistant_name, region_id, timezone").eq("org_id", org.orgId).order("name"),
        supabase.from("regions").select("id, name").eq("org_id", org.orgId).order("name"),
      ]);
      // Filters, sort and tags use the standardized source; the raw tag stays in raw_source.
      return { apps: (apps.data ?? []).map((a) => ({ ...a, raw_source: a.source, source: a.source_channel })), jobs: jobs.data ?? [], stores: stores.data ?? [], regions: regions.data ?? [] };
    },
  });
  const { data: referrerRows = [] } = useReferrerNames(org.orgId);
  // Open possible-duplicate matches (RLS scopes to what this person may see), for card tags.
  const { data: dupAppIds = new Set<string>() } = useQuery({
    queryKey: ["open-dup-apps", org.orgId],
    queryFn: async () => {
      const { data: d } = await supabase.from("possible_duplicates").select("record_a_type, record_a_id, record_b_type, record_b_id").eq("org_id", org.orgId).eq("status", "open");
      const ids = new Set<string>();
      for (const r of d ?? []) { if (r.record_a_type === "application") ids.add(r.record_a_id); if (r.record_b_type === "application") ids.add(r.record_b_id); }
      return ids;
    },
  });
  const referrerNames = new Map(referrerRows.map((r) => [r.id, r.employee_name]));
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const set = (patch: Partial<Record<SearchKey, string | undefined>>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const q = search.q ?? "";
  const jobFilter = search.job ?? "all";
  const sourceFilter = search.source ?? "all";
  const applied = search.applied ?? (search.filter === "today" ? "today" : "any");
  const attentionOnly = search.attention === "1";
  const sort = search.sort ?? "newest";
  const view = search.view === "list" ? "list" : "board";
  const region = search.region ?? "all";
  const store = search.store ?? "all";
  const showTests = search.tests === "1";
  const overdueOnly = search.overdue === "1";
  const { data: reminderRules = [] } = useReminderRules(org.orgId);
  const overdueOf = (a: { status: AppStatus; status_changed_at: string | null }) => overdueInfo(a, reminderRules);

  const [selectedLocal, setSelectedLocal] = useState<string | null>(null);
  const selected = search.applicant ?? selectedLocal;
  const setSelected = (id: string | null) => {
    setSelectedLocal(id);
    if (search.applicant) void navigate({ search: (prev) => ({ ...prev, applicant: undefined, tab: undefined, interview: undefined }), replace: true });
  };
  const [dragId, setDragId] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [bulkMessaging, setBulkMessaging] = useState(false);
  const { data: bulkSettings } = useBulkSettings(org.orgId);
  const [emailing, setEmailing] = useState<string[] | null>(null);
  const [bulkStatus, setBulkStatus] = useState<AppStatus>("screening");
  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const chosen = (data?.apps ?? []).filter((a) => checked.includes(a.id));
  async function bulkMove() {
    if (!confirmRejection(bulkStatus, checked.length)) return;
    const moving = chosen.filter((a) => a.status !== bulkStatus).map((a) => a.id);
    const { error } = await supabase.from("applications").update({ status: bulkStatus }).in("id", checked);
    if (error) return toast.error(error.message);
    if (moving.length) {
      await supabase.from("application_events").insert(statusEventRows(org.orgId, moving, bulkStatus));
      void notify({ data: { orgId: org.orgId, applicationIds: moving, event: { kind: "status", status: bulkStatus } } }).catch(() => {});
    }
    toast.success(`Moved ${checked.length} applicant${checked.length > 1 ? "s" : ""} to ${STATUS_LABEL[bulkStatus]}.`);
    setChecked([]); qc.invalidateQueries({ queryKey: key });
  }
  function bulkEmail() {
    setEmailing(chosen.map((a) => a.id));
  }
  async function transfer(appId: string, jobId: string) {
    const target = data?.jobs.find((j) => j.id === jobId);
    const app = data?.apps.find((a) => a.id === appId);
    if (!target || !app) return;
    const { error } = await supabase.from("applications").update({ job_id: target.id, dealership_id: target.dealership_id }).eq("id", appId);
    if (error) return toast.error(error.message);
    await supabase.from("application_events").insert({ org_id: org.orgId, application_id: appId, kind: "transfer",
      message: `Transferred from ${job(app.job_id)} at ${storeName(app.dealership_id)} to ${target.title} at ${storeName(target.dealership_id)}` });
    toast.success(`Transferred to ${storeName(target.dealership_id)}. Notes and history came along.`);
    qc.invalidateQueries({ queryKey: key });
  }
  const regionOf = (storeId: string) => data?.stores.find((s) => s.id === storeId)?.region_id ?? null;
  const regionName = (storeId: string) => data?.regions.find((r) => r.id === regionOf(storeId))?.name ?? null;
  const inRegion = (storeId: string) => region === "all" || (region === "none" ? !regionOf(storeId) : regionOf(storeId) === region);
  const storeOptions = (data?.stores ?? []).filter((s) => inRegion(s.id));
  const job = (id: string) => data?.jobs.find((j) => j.id === id)?.title ?? "";
  const storeName = (id: string) => data?.stores.find((s) => s.id === id)?.name ?? "";

  const storeTz = store !== "all" ? data?.stores.find((s) => s.id === store)?.timezone || undefined : undefined;
  const statusFilter = (STATUSES as readonly string[]).includes(search.status ?? "") ? (search.status as AppStatus) : null;
  const base = (data?.apps ?? []).filter((a) => inRegion(a.dealership_id) && (store === "all" || a.dealership_id === store
    || (store === "shared" && a.open_to_other_stores))
    && (showTests || !isTestName(a.full_name))
    && (!statusFilter || a.status === statusFilter));
  const focusAttention = search.focus === "attention";
  const focused = focusAttention ? base.filter((a) => !!a.needs_attention || !!overdueOf(a)) : base;
  const apps = filterApplicants(overdueOnly ? focused.filter((a) => overdueOf(a)) : focused, { q, jobId: jobFilter, source: sourceFilter, applied, attentionOnly, ...(storeTz ? { timeZone: storeTz } : {}) }, job);
  const sortedApps = sortApplicants(apps, sort, job, storeName);
  const sourceOptions = [...new Set(base.map((a) => a.source).filter(Boolean))].sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b)));
  const filtersActive = !!q.trim() || jobFilter !== "all" || sourceFilter !== "all" || applied !== "any" || attentionOnly || overdueOnly || region !== "all" || store !== "all";
  const activeFilterCount = [region !== "all", jobFilter !== "all", sourceFilter !== "all", applied !== "any", attentionOnly, overdueOnly].filter(Boolean).length;
  const clearFilters = () => set({ q: undefined, job: undefined, source: undefined, applied: undefined, filter: undefined, attention: undefined, overdue: undefined, region: undefined, store: undefined });

  // Must come after job() and storeName(): they're used while rendering.
  const emailRecipients = (data?.apps ?? [])
    .filter((a) => emailing?.includes(a.id))
    .map((a) => ({ id: a.id, full_name: a.full_name, email: a.email, jobTitle: job(a.job_id), storeName: storeName(a.dealership_id) }));
  const current = data?.apps.find((a) => a.id === selected);
  const dnhRepeats = doNotHireRepeats(data?.apps ?? []);
  // Every other application from the same person, across all stores in the group.
  const otherApps = current?.candidate_id
    ? (data?.apps ?? []).filter((a) => a.candidate_id === current.candidate_id && a.id !== current.id)
      .map((a) => ({ id: a.id, label: `${job(a.job_id)} · ${storeName(a.dealership_id)}`, status: a.status }))
    : [];

  const notify = useServerFn(notifyApplicants);
  async function update(id: string, patch: Database["public"]["Tables"]["applications"]["Update"]) {
    const before = data?.apps.find((a) => a.id === id)?.status;
    if (patch.status && patch.status !== before && !confirmRejection(patch.status, 1)) return false;
    const { data: saved, error } = await supabase.from("applications").update(patch).eq("org_id", org.orgId).eq("id", id).select("id").maybeSingle();
    if (error || !saved) { toast.error(error?.message ?? "This applicant couldn’t be updated. Check your store access and try again."); return false; }
    if (patch.status && patch.status !== before) {
      await supabase.from("application_events").insert(statusEventRows(org.orgId, [id], patch.status));
      void notify({ data: { orgId: org.orgId, applicationIds: [id], event: { kind: "status", status: patch.status } } }).catch(() => {});
    }
    qc.invalidateQueries({ queryKey: key });
    return true;
  }

  const headerBtn = "hover:text-foreground";
  const listHeaders: { label: string; asc: string; desc?: string }[] = [
    { label: "Name", asc: "name", desc: "name_desc" },
    { label: "Job", asc: "job" },
    { label: "Store", asc: "store" },
    { label: "Stage", asc: "stage" },
    { label: "Source", asc: "source" },
    { label: "Applied", asc: "newest", desc: "oldest" },
    { label: "Rating", asc: "rating", desc: "rating_asc" },
  ];

  type CardApp = NonNullable<typeof data>["apps"][number];
  /** Most important flag first; everything else folds into "+N". */
  const cardTags = (a: CardApp, withSource: boolean) => {
    const od = overdueOf(a);
    const kq = parseQuestions(data?.jobs.find((j) => j.id === a.job_id)?.questions);
    const nodes: Partial<Record<CardFlag, React.ReactNode>> = {
      dnh: dnhRepeats.has(a.id) ? <DoNotHireBadge key="dnh" /> : null,
      overdue: od ? <OverdueTag key="od" overdue={od} /> : null,
      attention: a.needs_attention ? <span key="att" className="mt-1 inline-block rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive" title={a.needs_attention}>Needs you</span> : null,
      duplicate: dupAppIds.has(a.id) ? <span key="dup" className="mt-1 inline-block rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">Possible duplicate</span> : null,
      pool: a.in_talent_pool ? <span key="pool" className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-medium" title={a.pool_reason ?? undefined}>In talent pool</span> : null,
      referral: (a.referrer_id || a.referred_by_text) ? <ReferralBadge key="ref" app={a} names={referrerNames} /> : null,
      source: withSource && a.source ? <span key="src" className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs">{sourceLabel(a.source)}</span> : null,
      knockout: a.knockout_failed ? <KnockoutBadge key="ko" questions={kq} answers={(a.answers ?? {}) as Answers} /> : null,
      background: a.background_check_status ? <BackgroundCheckBadge key="bg" status={a.background_check_status} /> : null,
    };
    const { top, rest } = orderCardFlags(Object.fromEntries(Object.entries(nodes).map(([k, v]) => [k, !!v])));
    return <span className="inline-flex flex-wrap items-center gap-1">{top && nodes[top]}<TagOverflow tags={rest.map((k) => nodes[k])} /></span>;
  };

  const boardStatuses = showEmpty ? STATUSES : STATUSES.filter((st) => sortedApps.some((a) => a.status === st));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl">Applicants</h1>{view === "board" && <p className="text-muted-foreground">Drag a card to move it along, or tick several to update them at once.</p>}</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border text-sm" role="group" aria-label="View">
            <button aria-pressed={view === "board"} onClick={() => set({ view: undefined })}
              className={cn("flex items-center gap-1.5 px-3 py-1.5", view === "board" ? "bg-sapphire text-primary-foreground" : "hover:bg-secondary")}>
              <LayoutGrid className="size-4" />Board</button>
            <button aria-pressed={view === "list"} onClick={() => set({ view: "list" })}
              className={cn("flex items-center gap-1.5 px-3 py-1.5", view === "list" ? "bg-sapphire text-primary-foreground" : "hover:bg-secondary")}>
              <List className="size-4" />List</button>
          </div>
          {canAddCandidate(org.role, org.isPlatformAdmin) && <Button onClick={() => setAddingManual(true)}><UserPlus />Add candidate</Button>}
        </div>
      </div>

      <ApplicantViewTabs active={focusAttention ? "attention" : "all"} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search applicants" placeholder="Search applicants" value={q}
            onChange={(e) => set({ q: e.target.value || undefined })} className="h-9 w-56 pl-8 pr-7" />
          {q && <button aria-label="Clear search" onClick={() => set({ q: undefined })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}
        </div>
        <select aria-label="Store" className={selectCls} value={store} onChange={(e) => set({ store: e.target.value === "all" ? undefined : e.target.value })}>
          <option value="all">All stores</option>
          <option value="shared">Open to other stores</option>
          {storeOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9"><SlidersHorizontal />Filters{activeFilterCount > 0 && <span className="rounded-full bg-sapphire px-1.5 text-xs text-primary-foreground">{activeFilterCount}</span>}</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-64 flex-col gap-3">
        {(data?.regions.length ?? 0) > 0 && (
          <select aria-label="Region" className={cn(selectCls, "w-full")} value={region}
            onChange={(e) => set({ region: e.target.value === "all" ? undefined : e.target.value, ...(store !== "shared" ? { store: undefined } : {}) })}>
            <option value="all">All regions</option>
            {data?.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            <option value="none">No region</option>
          </select>
        )}
        <select aria-label="Job" className={cn(selectCls, "w-full")} value={jobFilter} onChange={(e) => set({ job: e.target.value === "all" ? undefined : e.target.value })}>
          <option value="all">All jobs</option>
          {(data?.jobs ?? []).map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <select aria-label="Source" className={cn(selectCls, "w-full")} value={sourceFilter} onChange={(e) => set({ source: e.target.value === "all" ? undefined : e.target.value })}>
          <option value="all">All sources</option>
          {sourceOptions.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
        </select>
        <select aria-label="Applied" className={cn(selectCls, "w-full")} value={applied} onChange={(e) => set({ applied: e.target.value === "any" ? undefined : e.target.value, filter: undefined })}>
          <option value="any">Any time</option>
          <option value="today">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={attentionOnly} onCheckedChange={(c) => set({ attention: c === true ? "1" : undefined })} />
          Needs attention
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={overdueOnly} onCheckedChange={(c) => set({ overdue: c === true ? "1" : undefined })} />
          Overdue only
        </label>
          </PopoverContent>
        </Popover>
        <select aria-label="Sort" className={selectCls} value={sort} onChange={(e) => set({ sort: e.target.value === "newest" ? undefined : e.target.value })}>
          {SORT_MENU.map((s) => <option key={s} value={s}>{SORTS[s]?.label ?? s}</option>)}
          {!(SORT_MENU as readonly string[]).includes(sort) && <option value={sort}>{SORTS[sort]?.label ?? sort}</option>}
        </select>
        {filtersActive && <button className="text-sm text-sapphire underline" onClick={clearFilters}>Clear filters</button>}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {isPending
          ? <span aria-live="polite">Loading applicants…</span>
          : <span>Showing {apps.length} of {plural(base.length, "applicant")}</span>}
        <label className="flex items-center gap-2">
          <Checkbox checked={showTests} onCheckedChange={(c) => set({ tests: c === true ? "1" : undefined })} />
          Show test applicants
        </label>
        {store !== "all" && store !== "shared" && (
          <span className="flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-foreground">
            Store: {storeName(store) || "Store"}
            <button aria-label="Clear store filter" onClick={() => set({ store: undefined })} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          </span>
        )}
        {applied === "today" && (
          <span className="flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-foreground">
            Applied: Today
            <button aria-label="Clear applied filter" onClick={() => set({ applied: undefined, filter: undefined })} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          </span>
        )}
        {overdueOnly && (
          <span className="flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-foreground">
            Overdue only
            <button aria-label="Clear overdue filter" onClick={() => set({ overdue: undefined })} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          </span>
        )}
        {statusFilter && (
          <span className="flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-foreground">
            Showing: {STATUS_LABEL[statusFilter]}
            <button aria-label="Clear filter" onClick={() => set({ status: undefined })} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          </span>
        )}
      </div>

      <AddCandidateDialog open={addingManual} onOpenChange={setAddingManual} orgId={org.orgId} onCreated={() => qc.invalidateQueries({ queryKey: key })}
        stores={(data?.stores ?? []).map((s) => ({ id: s.id, name: s.name }))}
        jobs={(data?.jobs ?? []).filter((j) => j.status === "open").map((j) => ({ id: j.id, title: j.title, dealership_id: j.dealership_id }))} />
      {checked.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-navy p-3 text-navy-foreground shadow-lg">
          <span className="text-sm font-semibold">{checked.length} selected</span>
          <Button size="sm" variant="secondary" onClick={bulkEmail}><Mail />Email them</Button>
          <span className="text-sm">Move to</span>
          <select className="h-8 rounded-md border px-2 text-sm" style={statusSelectStyle(bulkStatus)} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as AppStatus)}>
            {STATUSES.map((s) => <option key={s} value={s} style={statusSelectStyle(s)}>{STATUS_LABEL[s]}</option>)}
          </select>
          <Button size="sm" variant="secondary" onClick={bulkMove}>Update stage</Button>
          {canSendBulk(org, bulkSettings?.bulk_messaging_enabled ?? false) && <Button size="sm" variant="secondary" onClick={() => setBulkMessaging(true)}><Mail />Send message</Button>}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setChecked([])}><X />Clear</Button>
        </div>
      )}

      {bulkMessaging && canSendBulk(org, bulkSettings?.bulk_messaging_enabled ?? false) && <BulkMessageCompose orgId={org.orgId} applicationIds={checked} onClose={() => { setBulkMessaging(false); }} onSent={() => {}} />}

      {view === "board" ? (
        <div className="overflow-x-auto pb-4">
        <label className="mb-2 flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showEmpty} onCheckedChange={(c) => setShowEmpty(c === true)} />
          Show empty stages
        </label>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${boardStatuses.length}, minmax(200px, 1fr))` }}>
          {boardStatuses.map((st) => {
            const col = sortedApps.filter((a) => a.status === st);
            return (
              <div key={st} className="min-w-0 rounded-2xl bg-secondary p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) update(dragId, { status: st }); setDragId(null); }}>
                <div className="mb-3 flex items-center justify-between gap-2 px-1 text-sm font-semibold">
                  <span title={STATUS_LABEL[st]} className="min-w-0"><StatusPill status={st} label={BOARD_SHORT_LABEL[st]} className="text-sm leading-tight" /></span>
                  <span className="flex items-center gap-2 text-muted-foreground">{col.length}
                    {col.length > 0 && <Checkbox aria-label={`Select all ${STATUS_LABEL[st]}`} checked={col.every((a) => checked.includes(a.id))}
                      onCheckedChange={(c) => setChecked((prev) => c ? [...new Set([...prev, ...col.map((a) => a.id)])] : prev.filter((id) => !col.some((a) => a.id === id)))} />}</span>
                </div>
                <div className="space-y-2">
                  {col.map((a) => (
                    <div key={a.id} role="button" tabIndex={0} draggable onDragStart={() => setDragId(a.id)} onClick={() => setSelected(a.id)}
                      onKeyDown={(e) => e.key === "Enter" && setSelected(a.id)}
                      className={cn("w-full cursor-pointer rounded-xl bg-background p-2 text-left shadow-sm transition hover:shadow-md", checked.includes(a.id) && "ring-2 ring-sapphire")}>
                      <div className="flex items-start justify-between gap-1"><div className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold"><span className="truncate">{a.full_name}</span>{a.linkedin_url && <Linkedin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has LinkedIn profile" />}</div>
                        <span onClick={(e) => e.stopPropagation()}><Checkbox aria-label={`Select ${a.full_name}`} checked={checked.includes(a.id)} onCheckedChange={() => toggle(a.id)} /></span></div>
                      <div className="truncate text-xs text-muted-foreground">{job(a.job_id)} · {storeName(a.dealership_id)}</div>
                      {cardTags(a, true)}
                      <div className="mt-2 flex items-center justify-end text-xs text-muted-foreground">
                        <span>{new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-background shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                {listHeaders.map((h) => (
                  <th key={h.label} className="px-3 py-2 font-medium">
                    <button className={cn(headerBtn, sort === h.asc || sort === h.desc ? "text-foreground" : "")}
                      onClick={() => set({ sort: h.desc && sort === h.asc ? h.desc : h.asc })}>
                      {h.label}{(sort === h.asc || sort === h.desc) ? (sort === h.asc ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedApps.map((a) => (
                <tr key={a.id} onClick={() => setSelected(a.id)} className="cursor-pointer border-b last:border-0 hover:bg-secondary/60">
                  <td className="px-3 py-2.5 font-medium"><span className="flex items-center gap-1">{a.full_name}{a.linkedin_url && <Linkedin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has LinkedIn profile" />}</span></td>
                  <td className="px-3 py-2.5">{job(a.job_id)}</td>
                  <td className="px-3 py-2.5">{storeName(a.dealership_id)}</td>
                  <td className="px-3 py-2.5"><span className="inline-flex flex-wrap items-center gap-1"><StatusPill status={a.status} />{cardTags(a, false)}</span></td>
                  <td className="px-3 py-2.5">{sourceLabel(a.source)}</td>
                  <td className="px-3 py-2.5">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5">{a.rating ?? "—"}</td>
                </tr>
              ))}
              {sortedApps.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No applicants match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <EmailCompose open={!!emailing} onOpenChange={(o) => !o && setEmailing(null)} orgId={org.orgId}
        recipients={emailRecipients} onSent={() => setChecked([])} />
      <Sheet open={!!current} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {current && <Profile key={current.id} app={current} questions={parseQuestions(data?.jobs.find((j) => j.id === current.job_id)?.questions)} jobTitle={job(current.job_id)} storeName={storeName(current.dealership_id)} onUpdate={(p) => update(current.id, p)}
            initialTab={search.tab} interviewId={search.interview}
            isHr={canPostJobs(org.role, org.isPlatformAdmin)} canEditSource={canAddCandidate(org.role, org.isPlatformAdmin)}
            otherApps={otherApps} onOpenApp={setSelected} doNotHireRepeat={dnhRepeats.has(current.id)}
            regionName={regionName(current.dealership_id)}
            transferOptions={(data?.jobs ?? []).filter((j) => j.status === "open" && j.id !== current.job_id).map((j) => ({ id: j.id, label: `${storeName(j.dealership_id)} · ${j.title}`,
              sameRegion: regionOf(j.dealership_id) === regionOf(current.dealership_id) }))}
            onTransfer={(jobId) => transfer(current.id, jobId)} orgId={org.orgId}
            assistantName={data?.stores.find((s) => s.id === current.dealership_id)?.assistant_name ?? "Assistant"}
            onRefresh={() => qc.invalidateQueries({ queryKey: key })}
            onEmail={() => setEmailing([current.id])} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type App = { answers: unknown; profile: unknown; ai_summary: string | null; id: string; full_name: string; email: string; phone: string | null; linkedin_url: string | null; status: AppStatus; status_changed_at: string | null; in_talent_pool: boolean; pool_reason: string | null; resume_path: string | null;
  open_to_other_stores: boolean; rating: number | null; notes: string | null; source: string; created_at: string;
  hired_at: string | null; start_date: string | null; departed_at: string | null; departure_reason: string | null; ai_paused_at: string | null; needs_attention: string | null;
  background_check_status: string | null; background_check_note: string | null; background_check_updated_at: string | null;
  referrer_id: string | null; referred_by_text: string | null; created_manually?: boolean; created_by?: string | null; source_detail?: string | null };

const PANEL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "messages", label: "Messages" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer & checks" },
  { id: "notes", label: "Notes & timeline" },
  { id: "onboarding", label: "Onboarding" },
] as const;
type PanelTab = (typeof PANEL_TABS)[number]["id"];
// Remembered for the session so reopening the panel lands on the last tab used.
let lastPanelTab: PanelTab = "overview";

function Profile({ canEditSource, doNotHireRepeat, app, questions, jobTitle, storeName, onUpdate, transferOptions, onTransfer, orgId, assistantName, onRefresh, isHr, otherApps, onOpenApp, regionName, onEmail, initialTab, interviewId }: { canEditSource: boolean; doNotHireRepeat: boolean; initialTab?: PanelTab | undefined; interviewId?: string | undefined; questions: Question[]; onEmail: () => void; orgId: string; assistantName: string; onRefresh: () => void; app: App; jobTitle: string; storeName: string; isHr: boolean;
  otherApps: { id: string; label: string; status: AppStatus }[]; onOpenApp: (id: string) => void; regionName: string | null;
  onUpdate: (p: Database["public"]["Tables"]["applications"]["Update"]) => Promise<boolean>; transferOptions: { id: string; label: string; sameRegion: boolean }[]; onTransfer: (jobId: string) => void }) {
  const [target, setTarget] = useState("");
  const [allRegions, setAllRegions] = useState(false);
  // Transfers stay in the candidate's region by default: someone in Grand Rapids won't move to Detroit.
  const visibleTransfers = transferOptions.filter((o) => allRegions || o.sameRegion);
  const hiddenTransfers = transferOptions.length - visibleTransfers.length;
  const { data: reminderRules = [] } = useReminderRules(orgId);
  const [departReason, setDepartReason] = useState(app.departure_reason ?? "");
  const [tab, setTab] = useState<PanelTab>(initialTab ?? lastPanelTab);
  const pickTab = (t: PanelTab) => { lastPanelTab = t; setTab(t); };
  const [editingLinkedin, setEditingLinkedin] = useState(false);
  const [linkedinDraft, setLinkedinDraft] = useState(app.linkedin_url ?? "");
  async function saveLinkedin() {
    const trimmed = linkedinDraft.trim();
    if (trimmed && !normalizeLinkedInUrl(trimmed)) return toast.error(LINKEDIN_ERROR);
    if (await onUpdate({ linkedin_url: normalizeLinkedInUrl(trimmed) })) setEditingLinkedin(false);
  }
  const { data: events = [] } = useQuery({
    queryKey: ["events", app.id, app.status],
    queryFn: async () => (await supabase.from("application_events").select("*").eq("application_id", app.id).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: addedBy } = useQuery({
    queryKey: ["added-by", orgId, app.created_by],
    enabled: !!app.created_manually && !!app.created_by,
    queryFn: async () => (await supabase.from("org_members").select("email").eq("org_id", orgId).eq("user_id", app.created_by!).maybeSingle()).data?.email ?? null,
  });
  async function openResume() {
    if (!app.resume_path) return;
    const { data, error } = await supabase.storage.from("resumes").createSignedUrl(app.resume_path, 300);
    if (error || !data) return toast.error("Resume isn't available yet.");
    window.open(data.signedUrl, "_blank");
  }
  const { data: dup } = useOpenDuplicate(app.id);
  const overdueNow = overdueInfo(app, reminderRules);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [texting, setTexting] = useState(false);
  useEffect(() => { setDetailsOpen(localStorage.getItem("wm_panel_details") === "1"); }, []);
  const toggleDetails = () => setDetailsOpen((o) => { localStorage.setItem("wm_panel_details", o ? "0" : "1"); return !o; });
  // Top shows just the single most important flag; Details lists all of them.
  const topFlag = doNotHireRepeat ? <DoNotHireBadge />
    : overdueNow ? <OverdueTag overdue={overdueNow} />
    : app.needs_attention ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive" title={app.needs_attention}>Needs you</span>
    : dup ? <PossibleDuplicateTag appId={app.id} />
    : app.in_talent_pool ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium" title={app.pool_reason ?? undefined}>In talent pool – {regionName ?? "region"}</span>
    : null;
  return (
    <div>
      {/* mb-6 cancels the -mt-6 pull on following content, so nothing slides under the header. */}
      <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 space-y-3 border-b bg-background px-6 pb-3 pt-6">
        <SheetHeader><SheetTitle className="text-2xl">{app.full_name}</SheetTitle>
          <p className="text-sm text-muted-foreground">{jobTitle} · {storeName}{regionName ? ` · ${regionName}` : ""}</p>
</SheetHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEmail}><Mail />Email</Button>
          {app.phone && <Button size="sm" variant="outline" onClick={() => setTexting(true)}><Phone />Text</Button>}
          {app.phone && <TextCompose open={texting} onOpenChange={setTexting} appId={app.id} name={app.full_name} onSent={onRefresh} />}
          {app.linkedin_url && <Button size="sm" variant="outline" asChild><a href={app.linkedin_url} target="_blank" rel="noreferrer"><Linkedin />LinkedIn</a></Button>}
          {app.resume_path && <Button size="sm" variant="outline" onClick={openResume}><FileText />Resume</Button>}
          <select aria-label="Stage" className="h-9 rounded-md border px-2 text-sm" style={statusSelectStyle(app.status)} value={app.status}
            onChange={(e) => onUpdate({ status: e.target.value as AppStatus })}>
            {STATUSES.map((s) => <option key={s} value={s} style={statusSelectStyle(s)}>{STATUS_LABEL[s]}</option>)}
          </select>
          {topFlag}
          {isHr && !app.in_talent_pool && regionName && app.status !== "hired" && app.status !== "do_not_hire" && (
            <Button size="sm" variant="outline" onClick={async () => {
              const reason = window.prompt("Move to talent pool. Reason (optional):", "");
              if (reason === null) return;
              const { error } = await supabase.rpc("return_to_talent_pool", { _app: app.id, ...(reason.trim() ? { _reason: reason.trim() } : {}) });
              if (error) return toast.error(error.message);
              toast.success(`Moved to the ${regionName} talent pool.`);
              onRefresh();
            }}>Move to talent pool</Button>
          )}
          <div className="flex gap-0.5" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} aria-label={`${n} stars`} onClick={() => onUpdate({ rating: n })}>
                <Star className={cn("size-4", (app.rating ?? 0) >= n ? "fill-chartreuse text-chartreuse" : "text-muted-foreground")} />
              </button>
            ))}
          </div>
        </div>
        {/* Compact spacing keeps every full label visible on desktop;
            narrow mobile widths can still scroll without wrapping. */}
        <div className="flex flex-nowrap gap-1 overflow-x-auto text-sm" aria-label="Applicant tabs">
          {PANEL_TABS.filter((t) => t.id !== "onboarding" || app.status === "hired").map((t) => (
            <Button variant="ghost" key={t.id} onClick={() => pickTab(t.id)}
              className={cn("h-auto rounded-none whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm font-medium hover:bg-transparent", tab === t.id ? "border-sapphire text-sapphire" : "border-transparent text-muted-foreground")}>
              {t.label}</Button>
          ))}
        </div>
      </div>

      <div className={cn("pt-4", tab === "overview" ? "space-y-4" : "space-y-6")}>
        {tab === "overview" && (
          <>
            <div className="text-sm text-muted-foreground">{app.email}{app.phone ? ` · ${app.phone}` : ""}</div>
            <div className="rounded-xl border bg-background">
              <button type="button" onClick={toggleDetails} aria-expanded={detailsOpen}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold">
                Details<ChevronDown className={cn("size-4 transition-transform", !detailsOpen && "-rotate-90")} />
              </button>
              {detailsOpen && (
            <div className="space-y-3 border-t p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Source</span>
              {canEditSource ? (
                <select aria-label="Source" className="h-7 rounded-full border bg-accent px-2 text-xs" value={app.source}
                  onChange={(e) => onUpdate({ source_channel: e.target.value })}>
                  {SOURCE_CHANNELS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : <span className="rounded-full bg-accent px-2 py-0.5">{app.source}</span>}
              {app.source_detail && <span className="text-muted-foreground">{app.source_detail}</span>}
            </div>
            {app.created_manually && <p className="text-xs text-muted-foreground">Added by {addedBy ?? "a team member"}</p>}
            <ReferralPanelRow app={app} orgId={orgId} isHr={isHr} onLink={(id) => onUpdate({ referrer_id: id })} />
            {(doNotHireRepeat || dup || overdueNow || app.needs_attention || app.in_talent_pool) && (
              <div className="flex flex-wrap items-center gap-2">
                {doNotHireRepeat && <DoNotHireBadge />}
                <OverdueTag overdue={overdueNow} />
                {app.needs_attention && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive" title={app.needs_attention}>Needs you</span>}
                <PossibleDuplicateTag appId={app.id} />
              </div>
            )}
            {app.in_talent_pool && <p className="text-xs"><span className="rounded-full bg-accent px-2 py-0.5 font-medium">In talent pool – {regionName ?? "region"}</span>{app.pool_reason ? <span className="ml-2 text-muted-foreground">{app.pool_reason}</span> : null}</p>}
            </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border bg-background p-3 text-sm">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">LinkedIn profile</div>
                {editingLinkedin ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Input className="h-8" placeholder="https://www.linkedin.com/in/yourname" value={linkedinDraft} onChange={(e) => setLinkedinDraft(e.target.value)} />
                    <Button size="sm" onClick={saveLinkedin}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingLinkedin(false); setLinkedinDraft(app.linkedin_url ?? ""); }}>Cancel</Button>
                  </div>
                ) : app.linkedin_url ? (
                  <a href={app.linkedin_url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-sapphire underline">{app.linkedin_url}</a>
                ) : (
                  <div className="mt-0.5 text-muted-foreground">Not provided</div>
                )}
              </div>
              {!editingLinkedin && (
                <Button size="sm" variant="outline" onClick={() => { setLinkedinDraft(app.linkedin_url ?? ""); setEditingLinkedin(true); }}><Pencil />Edit</Button>
              )}
            </div>
            {app.ai_summary && <p className="rounded-xl border bg-background p-3 text-sm">{app.ai_summary}</p>}
            <ScreeningAnswers questions={questions} answers={(app.answers ?? {}) as Answers} />
            <ProfileFacts profile={app.profile as Record<string, unknown>} />
            {otherApps.length > 0 && (
              <div className="rounded-xl border bg-background p-3">
                <div className="mb-2 text-sm font-semibold">Also applied for</div>
                <div className="space-y-1">
                  {otherApps.map((o) => (
                    <button key={o.id} onClick={() => onOpenApp(o.id)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary">
                      <span>{o.label}</span>
                      <StatusPill status={o.status} />
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Each application keeps its own stage, so you can pass on one without closing the others.</p>
              </div>
            )}
            <label className="flex items-center justify-between rounded-xl border bg-background p-3 text-sm">
              <span><b>Open to other stores</b><br /><span className="text-muted-foreground">Other stores in your group can reach out. Never shared outside your group.</span></span>
              <Switch checked={app.open_to_other_stores} onCheckedChange={(c) => onUpdate({ open_to_other_stores: c })} />
            </label>
            <div className="rounded-xl border bg-background p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><ArrowRightLeft className="size-4" />Transfer to another store</div>
              <p className="mb-2 text-xs text-muted-foreground">Better fit somewhere else in your group? Move them to that store's opening. Notes, rating and history come along.</p>
              <div className="flex gap-2">
                <select className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">{visibleTransfers.length ? "Pick an open job..." : "No open jobs in this region"}</option>
                  {visibleTransfers.map((o) => <option key={o.id} value={o.id}>{o.label}{allRegions && !o.sameRegion ? " (other region)" : ""}</option>)}
                </select>
                <Button size="sm" disabled={!target} onClick={() => { onTransfer(target); setTarget(""); }}>Transfer</Button>
              </div>
              {(hiddenTransfers > 0 || allRegions) && (
                <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={allRegions} onCheckedChange={(c) => { setAllRegions(c === true); setTarget(""); }} />
                  Show jobs in other regions{hiddenTransfers > 0 && !allRegions ? ` (${hiddenTransfers})` : ""}
                </label>
              )}
            </div>
            {(app.status === "hired" || app.hired_at) && (
              <div className="space-y-3 rounded-xl border bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><UserCheck className="size-4 text-lime" />Hiring & retention</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Hired on</div>
                    <div>{app.hired_at ? new Date(app.hired_at).toLocaleDateString() : "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Start date</div>
                    {isHr && !app.departed_at
                      ? <Input type="date" className="h-8" defaultValue={app.start_date ?? ""} onBlur={(e) => e.target.value !== (app.start_date ?? "") && onUpdate({ start_date: e.target.value || null })} />
                      : <div>{app.start_date ? new Date(app.start_date + "T00:00:00").toLocaleDateString() : "—"}</div>}</div>
                </div>
                <RetentionCheckins orgId={orgId} appId={app.id} name={app.full_name} startDate={app.start_date} hiredAt={app.hired_at}
                  departedAt={app.departed_at} canRecord={isHr} onDeparted={(d) => onUpdate({ departed_at: d })} />
                {app.departed_at ? (
                  <p className="rounded-lg bg-destructive/10 p-2 text-sm">
                    Departed {new Date(app.departed_at + "T00:00:00").toLocaleDateString()}{app.departure_reason ? ` — ${app.departure_reason}` : ""}
                    {isHr && <button className="ml-2 text-xs text-sapphire underline" onClick={() => onUpdate({ departed_at: null, departure_reason: null })}>Undo</button>}
                  </p>
                ) : isHr && (
                  <div className="space-y-2">
                    <Input placeholder="Reason for leaving (optional)" value={departReason} onChange={(e) => setDepartReason(e.target.value)} />
                    <Button size="sm" variant="outline" onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      onUpdate({ departed_at: today, departure_reason: departReason || null });
                      toast.success(`Marked ${app.full_name} as departed.`);
                    }}>Mark as departed</Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === "messages" && (
          <AssistantThreads appId={app.id} orgId={orgId} assistantName={assistantName} onChanged={onRefresh} paused={!!app.ai_paused_at} needsAttention={app.needs_attention} />
        )}

        {tab === "interview" && (
          <InterviewsPanel appId={app.id} orgId={orgId} focusInterviewId={interviewId} title={`Interview: ${app.full_name} (${jobTitle})`} onChanged={onRefresh} />
        )}

        {tab === "offer" && (
          <>
            <BackgroundCheckPanel key={app.id} orgId={orgId} appId={app.id} status={app.background_check_status} note={app.background_check_note}
              updatedAt={app.background_check_updated_at} canEdit={isHr} onChanged={onRefresh} />
            {app.status !== "rejected" && !app.departed_at && (
              <>
                <OfferPanel orgId={orgId} appId={app.id} jobTitle={jobTitle} defaultPay={null} hasPhone={!!app.phone} applicantName={app.full_name} onChanged={onRefresh} />
                <DocumentsPanel orgId={orgId} appId={app.id} jobTitle={jobTitle} hasPhone={!!app.phone} />
              </>
            )}
          </>
        )}

        {tab === "onboarding" && app.status === "hired" && <OnboardingPanel appId={app.id} />}

        {tab === "notes" && (
          <>
            <ApplicantNotes key={app.id} initialNotes={app.notes} onSave={notes => onUpdate({ notes })} />
            <div>
              <div className="mb-2 text-sm font-semibold">Timeline</div>
              <ol className="space-y-2 border-l pl-4 text-sm">
                {events.map((e) => (
                  <li key={e.id}><div>{e.message}</div><div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div></li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const FACT_LABELS: Record<string, string> = { current_title: "Current title", years_experience: "Experience (yrs)", certifications: "Certifications",
  availability: "Availability", desired_pay: "Desired pay", earliest_start: "Earliest start", has_drivers_license: "Driver's license",
  past_employers: "Past employers", skills: "Skills", city: "City", facts: "Other notes" };
function ProfileFacts({ profile }: { profile: Record<string, unknown> }) {
  const rows = Object.entries(profile ?? {}).filter(([k, v]) => FACT_LABELS[k] && v !== null && v !== "" && !(Array.isArray(v) && !v.length));
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-xl border bg-background p-3 text-sm">
      {rows.map(([k, v]) => (
        <div key={k}><dt className="text-xs text-muted-foreground">{FACT_LABELS[k]}</dt>
          <dd>{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</dd></div>
      ))}
    </dl>
  );
}

function DoNotHireBadge() {
  return (
    <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: STATUS_COLOR.do_not_hire, color: "#FFFFFF" }}
      title="This person is marked Do Not Hire on another application in your group.">⚠ Previously Do Not Hire</span>
  );
}

function OverdueTag({ overdue }: { overdue: Overdue | null }) {
  if (!overdue) return null;
  return (
    <span className="ml-1 mt-1 inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground"
      title="Past this stage's reminder limit (set on Status rules).">Overdue · {overdue.label}</span>
  );
}
