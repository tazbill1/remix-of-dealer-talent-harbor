import { CLOSED_STATUSES, STATUSES } from "@/lib/jobs";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  applicantPath,
  askSystemPrompt,
  pipelineReport,
  rankCandidates,
  safeApplicant,
  type Report,
  type ApplicantRow,
  type ScorecardRow,
} from "@/lib/gm-assistant";

const APP_FIELDS =
  "id, full_name, status, rating, created_at, knockout_failed, ai_summary, dealership_id, jobs!inner(title, department), dealerships(name)";

const NONE = "00000000-0000-0000-0000-000000000000";

// PostgREST filter values can't carry commas, parens or wildcards from the AI.
const clean = (s: string) => s.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);

const askInput = z.object({
  orgId: z.string().uuid(),
  timeZone: z.string().max(64),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
    .min(1)
    .max(30),
});

/** Manager "Ask" chat. Read-only, and every lookup runs as the signed-in user, so the
 * database's store access rules decide what the AI can see. */
export const askHiringAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.input<typeof askInput>) => askInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const orgId = data.orgId;
    const { tool, generateText, stepCountIs } = await import("ai");
    const { lovableProvider, LOVABLE_MODEL, LOVABLE_OPTS, friendlyAiError } = await import(
      "@/lib/assistant.server"
    );

    async function storeIds(store?: string | null) {
      if (!store) return null;
      const { data: rows } = await sb
        .from("dealerships")
        .select("id")
        .eq("org_id", orgId)
        .ilike("name", `%${clean(store)}%`);
      return (rows ?? []).map((r) => r.id);
    }
    async function scorecards(ids: string[]) {
      if (!ids.length) return [] as (ScorecardRow & { author_id: string | null })[];
      const { data: rows } = await sb
        .from("interview_scorecards")
        .select("application_id, author_id, answers, recommendation, submitted_at")
        .in("application_id", ids);
      return rows ?? [];
    }
    async function applicants(f: {
      role?: string | null;
      store?: string | null;
      stage?: string | null;
      name?: string | null;
      applied_after?: string | null;
      applied_before?: string | null;
      limit: number;
      openOnly?: boolean;
    }) {
      let q = sb.from("applications").select(APP_FIELDS).eq("org_id", orgId);
      if (f.role) {
        const r = clean(f.role);
        q = q.or(`title.ilike.%${r}%,department.ilike.%${r}%`, { referencedTable: "jobs" });
      }
      const stores = await storeIds(f.store);
      if (stores) q = q.in("dealership_id", stores.length ? stores : [NONE]);
      if (f.stage) q = q.eq("status", f.stage as any);
      if (f.openOnly) q = q.not("status", "in", `(${CLOSED_STATUSES.join(",")})`);
      if (f.name) q = q.ilike("full_name", `%${clean(f.name)}%`);
      if (f.applied_after) q = q.gte("created_at", f.applied_after);
      if (f.applied_before) q = q.lt("created_at", f.applied_before);
      const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(f.limit);
      if (error) throw new Error(error.message);
      return (rows ?? []) as unknown as ApplicantRow[];
    }

    const reports: Report[] = [];
    const stage = z.enum(STATUSES);
    const tools = {
      search_applicants: tool({
        description:
          "Find applicants at the user's stores. All filters optional. role matches job title or department (e.g. 'service', 'sales', 'technician').",
        inputSchema: z.object({
          role: z.string().nullable(),
          store: z.string().nullable().describe("Part of a store name"),
          stage: stage.nullable(),
          name: z.string().nullable(),
          applied_after: z.string().nullable().describe("ISO date"),
          applied_before: z.string().nullable().describe("ISO date"),
        }),
        execute: async (f) => {
          const rows = await applicants({ ...f, limit: 40 });
          const cards = await scorecards(rows.map((r) => r.id));
          return { count: rows.length, applicants: rows.map((r) => safeApplicant(r, cards)) };
        },
      }),
      find_top_candidates: tool({
        description:
          "The strongest open (not hired or rejected) applicants for a role, best first, using interview feedback, rating, stage and how recent they are.",
        inputSchema: z.object({
          role: z.string().describe("e.g. 'service', 'sales', 'technician'"),
          store: z.string().nullable(),
          count: z.number().int().min(1).max(10),
        }),
        execute: async (f) => {
          const rows = await applicants({ role: f.role, store: f.store, limit: 200, openOnly: true });
          const cards = await scorecards(rows.map((r) => r.id));
          const best = rankCandidates(rows, cards).slice(0, f.count);
          return { looked_at: rows.length, candidates: best.map((r) => safeApplicant(r, cards)) };
        },
      }),
      list_interviews: tool({
        description: "Interviews at the user's stores between two dates (ISO), oldest first.",
        inputSchema: z.object({ from: z.string(), to: z.string(), store: z.string().nullable() }),
        execute: async (f) => {
          let q = sb
            .from("interviews")
            .select(`starts_at, status, created_by, applications!inner(${APP_FIELDS})`)
            .eq("org_id", orgId)
            .gte("starts_at", f.from)
            .lt("starts_at", f.to);
          const stores = await storeIds(f.store);
          if (stores) q = q.in("applications.dealership_id", stores.length ? stores : [NONE]);
          const { data: rows, error } = await q.order("starts_at").limit(100);
          if (error) throw new Error(error.message);
          const list = (rows ?? []) as unknown as {
            starts_at: string;
            status: string;
            created_by: string | null;
            applications: ApplicantRow;
          }[];
          const cards = await scorecards(list.map((r) => r.applications.id));
          return {
            count: list.length,
            interviews: list.map((r) => ({
              when: r.starts_at,
              status: r.status,
              you_booked: r.created_by === context.userId,
              you_scored: cards.some(
                (c) => c.application_id === r.applications.id && c.author_id === context.userId,
              ),
              applicant: safeApplicant(r.applications, cards),
            })),
          };
        },
      }),
      pipeline_report: tool({
        description:
          "Shows the user a table of applicant counts per stage (New, Screening, Interview, Offer, and Hired / Not selected when include_closed), one row per store, region or role. Filters optional; dates filter by when people applied.",
        inputSchema: z.object({
          title: z.string().describe("Short report title, e.g. 'Technician pipeline by store'"),
          group_by: z.enum(["store", "region", "role"]),
          role: z.string().nullable().describe("Job title or department words, e.g. 'tech'"),
          store: z.string().nullable(),
          region: z.string().nullable(),
          applied_after: z.string().nullable().describe("ISO date"),
          applied_before: z.string().nullable().describe("ISO date"),
          include_closed: z.boolean().describe("Also count Hired and Not selected"),
          chart: z.boolean().describe("Add a bar chart"),
        }),
        execute: async (f) => {
          let q = sb
            .from("applications")
            .select("full_name, status, dealership_id, jobs!inner(title, department), dealerships(name, regions(name))")
            .eq("org_id", orgId);
          if (f.role) {
            const r = clean(f.role);
            q = q.or(`title.ilike.%${r}%,department.ilike.%${r}%`, { referencedTable: "jobs" });
          }
          const stores = await storeIds(f.store);
          if (stores) q = q.in("dealership_id", stores.length ? stores : [NONE]);
          if (f.region) {
            const { data: regs } = await sb.from("regions").select("id").eq("org_id", orgId).ilike("name", `%${clean(f.region)}%`);
            const { data: inRegion } = await sb
              .from("dealerships")
              .select("id")
              .eq("org_id", orgId)
              .in("region_id", (regs ?? []).map((r) => r.id).concat(NONE));
            q = q.in("dealership_id", (inRegion ?? []).map((d) => d.id).concat(NONE));
          }
          if (f.applied_after) q = q.gte("created_at", f.applied_after);
          if (f.applied_before) q = q.lt("created_at", f.applied_before);
          const { data: rows, error } = await q.limit(5000);
          if (error) throw new Error(error.message);
          const { isTestName } = await import("@/lib/display");
          const list = ((rows ?? []) as unknown as {
            full_name: string;
            status: string;
            dealership_id: string | null;
            jobs: { title: string } | null;
            dealerships: { name: string; regions: { name: string } | null } | null;
          }[]).filter((r) => !isTestName(r.full_name));
          const filters = [
            f.role && `role: ${f.role}`,
            f.store && `store: ${f.store}`,
            f.region && `region: ${f.region}`,
            f.applied_after && `applied from ${f.applied_after.slice(0, 10)}`,
            f.applied_before && `applied before ${f.applied_before.slice(0, 10)}`,
            f.include_closed ? "includes hired and not selected" : "open applicants only",
          ].filter(Boolean);
          const report = pipelineReport(
            list.map((r) => ({
              status: r.status,
              storeId: r.dealership_id,
              store: r.dealerships?.name ?? null,
              region: r.dealerships?.regions?.name ?? null,
              role: r.jobs?.title ?? null,
            })),
            {
              title: f.title,
              subtitle: filters.join(" · "),
              groupBy: f.group_by,
              includeClosed: f.include_closed,
              chart: f.chart,
            },
          );
          reports.push(report);
          return { shown_to_user: true, total: report.total, columns: report.columns, rows: report.rows.map((r) => [r.label, ...r.cells]) };
        },
      }),
      get_applicant: tool({
        description: "More detail on one applicant by id: what they told us, interviews, feedback.",
        inputSchema: z.object({ id: z.string().uuid() }),
        execute: async ({ id }) => {
          const { data: row } = await sb
            .from("applications")
            .select(`${APP_FIELDS}, profile, background_check_status, notes`)
            .eq("id", id)
            .maybeSingle();
          if (!row) return { error: "Not found or not at one of your stores." };
          const [{ data: ivs }, cards] = await Promise.all([
            sb.from("interviews").select("starts_at, status").eq("application_id", id).order("starts_at"),
            scorecards([id]),
          ]);
          const r = row as unknown as ApplicantRow & {
            profile: unknown;
            background_check_status: string | null;
            notes: string | null;
          };
          return {
            ...safeApplicant(r, cards),
            profile: r.profile,
            background_check: r.background_check_status,
            notes: r.notes?.slice(0, 800) ?? null,
            interviews: ivs ?? [],
            link: applicantPath(id),
          };
        },
      }),
    };

    try {
      const p = await lovableProvider();
      const result = await generateText({
        model: p.responses(LOVABLE_MODEL) as any,
        system: askSystemPrompt({ now: new Date().toISOString(), timeZone: data.timeZone, name: null }),
        messages: data.messages,
        tools,
        stopWhen: stepCountIs(6),
        providerOptions: LOVABLE_OPTS,
      });
      const reply = result.text.trim() || (reports.length ? "" : "I couldn't find an answer to that. Try asking another way.");
      return { reply, reports };
    } catch (e) {
      throw new Error(friendlyAiError(e));
    }
  });
