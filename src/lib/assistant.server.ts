import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { statusEventRows } from "@/lib/status-log";
import { keywordOf, toE164 } from "@/lib/messaging/core";
import {
  applyKeyword,
  deliverDue,
  keywordReply,
  loadSettings,
  managerContact,
  queueText,
  type Party,
} from "@/lib/messaging/outbox.server";

type DB = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// AI provider: Lovable AI by default; Claude when a group switches its AI provider
// to "anthropic" and ANTHROPIC_API_KEY is set. Falls back to Lovable otherwise.
// ---------------------------------------------------------------------------

const GATEWAY = "https://ai.gateway.lovable.dev";
const LOVABLE_MODEL = "openai/gpt-6-astra";
const LOVABLE_OPTS = {
  openai: {
    store: false,
    forceReasoning: true,
    reasoningEffort: "low",
    reasoningSummary: "auto",
    include: ["reasoning.encrypted_content"],
  },
} as any;

export function friendlyAiError(e: any) {
  const status = e?.statusCode ?? e?.lastError?.statusCode ?? e?.status;
  if (status === 402)
    return "Your workspace is out of AI credits. Add more in Settings → Plans & credits.";
  if (status === 429) return "The AI is busy right now. Please try again in a moment.";
  if (status === 403 || status === 401) return "AI access is blocked for this workspace right now.";
  return e?.message && !status
    ? e.message
    : `The AI couldn't finish that (${status ?? "error"}). Please try again.`;
}

export async function lovableProvider() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured.");
  const { createOpenAI } = await import("@ai-sdk/openai");
  return createOpenAI({
    baseURL: `${GATEWAY}/v1`,
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
}
export { LOVABLE_MODEL, LOVABLE_OPTS };

type ChatMsg = { role: "user" | "assistant"; content: string };

/** Structured reply from Claude via the Messages API, forcing a single tool call. */
async function claudeStructured<T>(
  system: string,
  messages: ChatMsg[],
  schema: object,
  parse: (v: unknown) => T,
) {
  const key = process.env["ANTHROPIC_API_KEY"]!;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env["ANTHROPIC_MODEL"] || "claude-sonnet-5-5",
      max_tokens: 1500,
      system,
      // Claude requires the conversation to start with a user turn.
      messages:
        messages[0]?.role === "assistant"
          ? [{ role: "user", content: "(conversation start)" }, ...messages]
          : messages,
      tools: [{ name: "respond", description: "Your structured reply", input_schema: schema }],
      tool_choice: { type: "tool", name: "respond" },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok)
    throw Object.assign(new Error(json?.error?.message ?? "Claude error"), { status: res.status });
  const tool = (json.content ?? []).find((c: any) => c.type === "tool_use");
  if (!tool) throw new Error("Claude didn't return a reply.");
  return parse(tool.input);
}

export function usesClaude(aiProvider: string) {
  return aiProvider === "anthropic" && !!process.env["ANTHROPIC_API_KEY"];
}

// ---------------------------------------------------------------------------
// Two-way texting assistant
// ---------------------------------------------------------------------------

const replySchema = z.object({
  reply: z.string(),
  profile_updates: z.object({
    full_name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    years_experience: z.number().nullable(),
    certifications: z.array(z.string()).nullable(),
    availability: z.string().nullable(),
    desired_pay: z.string().nullable(),
    earliest_start: z.string().nullable(),
    has_drivers_license: z.boolean().nullable(),
    other_facts: z.array(z.string()).nullable(),
  }),
  rating: z.number().nullable(),
  new_status: z.enum(["new", "screening", "interview", "offer", "hired", "rejected"]).nullable(),
  interview_start_iso: z.string().nullable(),
  summary: z.string(),
  timeline_note: z.string().nullable(),
});
type Reply = z.infer<typeof replySchema>;

const nullable = (type: string | object) =>
  typeof type === "string" ? { type: [type, "null"] } : { anyOf: [type, { type: "null" }] };
/** JSON Schema twin of replySchema for Claude's tool input. */
const replyJsonSchema = {
  type: "object",
  properties: {
    reply: { type: "string" },
    profile_updates: {
      type: "object",
      properties: {
        full_name: nullable("string"),
        email: nullable("string"),
        phone: nullable("string"),
        years_experience: nullable("number"),
        certifications: nullable({ type: "array", items: { type: "string" } }),
        availability: nullable("string"),
        desired_pay: nullable("string"),
        earliest_start: nullable("string"),
        has_drivers_license: nullable("boolean"),
        other_facts: nullable({ type: "array", items: { type: "string" } }),
      },
      required: [
        "full_name",
        "email",
        "phone",
        "years_experience",
        "certifications",
        "availability",
        "desired_pay",
        "earliest_start",
        "has_drivers_license",
        "other_facts",
      ],
    },
    rating: nullable("number"),
    new_status: {
      type: ["string", "null"],
      enum: ["new", "screening", "interview", "offer", "hired", "rejected", null],
    },
    interview_start_iso: nullable("string"),
    summary: { type: "string" },
    timeline_note: nullable("string"),
  },
  required: [
    "reply",
    "profile_updates",
    "rating",
    "new_status",
    "interview_start_iso",
    "summary",
    "timeline_note",
  ],
};

export type AssistantInput = {
  applicationId: string;
  party: Party;
  body: string;
  /** Who's acting in the app (null for texts arriving from a phone). */
  actorId: string | null;
  /** Where the message came from: typed in the app for practice, or a real text. */
  source: "practice" | "sms";
  inbound?: { from: string; to: string | null; providerMessageId: string | null };
};

/**
 * Handle one incoming message (practice or real): log it, honor STOP/START/HELP,
 * otherwise ask the AI for a reply, apply profile/stage/interview updates, and put the
 * reply in the outbox. `sb` acts as the signed-in user where there is one (RLS applies);
 * `admin` is used only for opt-outs and delivery, which are server-only.
 */
export async function runAssistant(sb: DB, admin: DB, data: AssistantInput) {
  const { data: app, error } = await sb
    .from("applications")
    .select("*")
    .eq("id", data.applicationId)
    .single();
  if (error || !app) throw new Error("Applicant not found.");
  const [{ data: job }, { data: store }, { data: history }, { data: interviews }, settings] =
    await Promise.all([
      sb
        .from("jobs")
        .select("title, description, hiring_manager, hiring_manager_phone")
        .eq("id", app.job_id)
        .single(),
      sb
        .from("dealerships")
        .select("name, assistant_name, manager_name, manager_phone, timezone, sms_number")
        .eq("id", app.dealership_id)
        .single(),
      sb
        .from("messages")
        .select("party, direction, body, created_at, status")
        .eq("application_id", app.id)
        .order("created_at")
        .limit(60),
      sb
        .from("interviews")
        .select("starts_at, status")
        .eq("application_id", app.id)
        .eq("status", "scheduled"),
      loadSettings(sb, app.org_id),
    ]);
  const tz = store?.timezone || "America/Chicago";
  const manager = store
    ? managerContact(store, job ?? null)
    : { name: "the hiring manager", phone: null };
  const senderPhone =
    toE164(data.inbound?.from) ?? (data.party === "candidate" ? toE164(app.phone) : manager.phone);

  await sb.from("messages").insert({
    org_id: app.org_id,
    application_id: app.id,
    party: data.party,
    direction: "in",
    channel: "sms",
    body: data.body,
    status: "received",
    purpose: data.source === "practice" ? "practice" : "reply",
    from_phone: senderPhone,
    to_phone: toE164(data.inbound?.to ?? store?.sms_number),
    provider_message_id: data.inbound?.providerMessageId ?? null,
  });

  // Carrier keywords never reach the AI.
  const keyword = keywordOf(data.body);
  if (keyword) {
    if (senderPhone)
      await applyKeyword(admin, {
        orgId: app.org_id,
        phone: senderPhone,
        keyword,
        candidateId: data.party === "candidate" ? app.candidate_id : null,
        source: data.source,
      });
    const reply = keywordReply(keyword, store?.name ?? "Hiring team");
    const row = await queueText(sb, {
      applicationId: app.id,
      party: data.party,
      body: reply,
      purpose: "keyword",
      to: senderPhone,
      isKeywordReply: true,
    });
    await admin.from("application_events").insert({
      org_id: app.org_id,
      application_id: app.id,
      kind: "texting",
      message: `${data.party === "candidate" ? "Candidate" : "Hiring manager"} replied ${keyword.toUpperCase()}`,
    });
    if (row?.status === "queued") await deliverDue(admin, { ids: [row.id] });
    return {
      reply,
      keyword,
      changed: [] as string[],
      status: null,
      interviewAt: null,
      delivery: row?.status ?? null,
    };
  }

  const assistant = store?.assistant_name ?? "Your HR assistant";
  const now = new Date().toISOString();
  const system = `You are ${assistant}, the AI HR assistant for ${store?.name ?? "the dealership"}. Personality: bubbly, kind, sweet and super organized — the assistant HR manager everyone loves. You text by SMS, so keep replies under 320 characters, warm, with at most one emoji.
You are talking ONLY about this one applicant: ${app.full_name} (application ${app.id}) for ${job?.title ?? "an open role"}. Never mention or confuse any other applicant.
Right now you are texting with the ${data.party === "candidate" ? `CANDIDATE (${app.full_name})` : `HIRING MANAGER (${manager.name})`}.
${
  data.party === "candidate"
    ? "Keep them engaged and excited. Ask one simple screening question at a time (experience, certifications like ASE/OEM, availability, start date, pay expectations, driver's license). If they agree to an interview time, confirm it."
    : 'Keep the manager accountable: summarize where the candidate stands, ask for decisions (interview? move forward? pass?), and offer specific interview times. Follow their instructions about stage changes and scheduling. A reply of "1" means interview, "2" means pass.'
}
Current time (UTC): ${now}. Store time zone: ${tz}.
Current stage: ${app.status}. Profile so far: ${JSON.stringify(app.profile)}. Notes: ${app.notes ?? ""}.
Scheduled interviews: ${JSON.stringify(interviews ?? [])}.
Job description: ${(job?.description ?? "").slice(0, 2000)}

Return:
- reply: your next text message to this person.
- profile_updates: only facts newly learned from THIS message, else null for each.
- rating: 1-5 fit rating if you now have enough info, else null.
- new_status: only when clearly warranted (e.g. qualifications confirmed → "screening"; interview booked → "interview"; manager says hire/pass → "hired"/"rejected"). Else null.
- interview_start_iso: ISO 8601 with offset ONLY when both a specific date+time is agreed/instructed for an interview. Else null.
- summary: one-paragraph running summary of this applicant for the hiring team.
- timeline_note: a short note for the timeline if something important happened, else null.`;
  const msgs: ChatMsg[] = (history ?? [])
    .filter((m) => m.status !== "blocked")
    .map((m) => ({
      role: (m.direction === "in" ? "user" : "assistant") as ChatMsg["role"],
      content: `[${m.party === "candidate" ? "candidate thread" : "manager thread"}] ${m.body}`,
    }));
  msgs.push({
    role: "user",
    content: `[${data.party === "candidate" ? "candidate thread" : "manager thread"}] ${data.body}`,
  });

  let out: Reply;
  try {
    if (usesClaude(settings.ai_provider)) {
      out = await claudeStructured(system, msgs, replyJsonSchema, (v) => replySchema.parse(v));
    } else {
      const { streamText, Output } = await import("ai");
      const p = await lovableProvider();
      const result = streamText({
        model: p.responses(LOVABLE_MODEL) as any,
        system,
        messages: msgs,
        output: Output.object({ schema: replySchema }),
        providerOptions: LOVABLE_OPTS,
      });
      out = (await result.output) as Reply;
    }
  } catch (e) {
    throw new Error(friendlyAiError(e));
  }

  // Apply updates
  const u = out.profile_updates;
  const profile: any = { ...(app.profile as any) };
  const changed: string[] = [];
  for (const k of [
    "years_experience",
    "certifications",
    "availability",
    "desired_pay",
    "earliest_start",
    "has_drivers_license",
  ] as const) {
    const v = (u as any)[k];
    if (v !== null && v !== undefined && JSON.stringify(v) !== JSON.stringify(profile[k])) {
      profile[k] = v;
      changed.push(k.replace(/_/g, " "));
    }
  }
  if (u.other_facts?.length)
    profile.facts = [...new Set([...(profile.facts ?? []), ...u.other_facts])];
  const patch: any = { profile, ai_summary: out.summary };
  if (u.full_name && data.party === "candidate") patch.full_name = u.full_name;
  if (u.email) patch.email = u.email;
  if (u.phone) patch.phone = u.phone;
  if (out.rating && out.rating >= 1 && out.rating <= 5) patch.rating = Math.round(out.rating);
  let interviewAt: string | null = null;
  if (out.interview_start_iso && !isNaN(Date.parse(out.interview_start_iso))) {
    interviewAt = new Date(out.interview_start_iso).toISOString();
    const dup = (interviews ?? []).some(
      (i) => i.starts_at && new Date(i.starts_at).toISOString() === interviewAt,
    );
    if (!dup) {
      await sb.from("interviews").insert({
        org_id: app.org_id,
        application_id: app.id,
        starts_at: interviewAt,
        source: "werkandme",
        created_by: data.actorId,
        location: store?.name ?? null,
      });
      patch.status = "interview";
    }
  }
  if (out.new_status && !patch.status) patch.status = out.new_status;
  await sb.from("applications").update(patch).eq("id", app.id);

  const row = await queueText(sb, {
    applicationId: app.id,
    party: data.party,
    body: out.reply,
    purpose: "assistant_reply",
    to: senderPhone,
  });
  if (row?.status === "queued" && row.scheduled_for && Date.parse(row.scheduled_for) <= Date.now())
    await deliverDue(admin, { ids: [row.id] });

  const notes = [
    changed.length
      ? `${assistant} updated ${changed.join(", ")} from a text with the ${data.party}`
      : null,
    interviewAt
      ? `${assistant} booked an interview for ${new Date(interviewAt).toLocaleString("en-US", { timeZone: tz })}`
      : null,
    out.timeline_note,
  ].filter(Boolean) as string[];
  if (notes.length)
    await sb
      .from("application_events")
      .insert(
        notes.map((message) => ({
          org_id: app.org_id,
          application_id: app.id,
          kind: "assistant",
          message,
        })),
      );
  if (patch.status && patch.status !== app.status) {
    await sb.from("application_events").insert(statusEventRows(app.org_id, [app.id], patch.status));
  }
  return {
    reply: out.reply,
    keyword: null,
    changed,
    status: (patch.status ?? null) as string | null,
    interviewAt,
    delivery: row?.status ?? null,
  };
}
