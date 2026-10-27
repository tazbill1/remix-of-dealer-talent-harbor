import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { statusEventRows } from "@/lib/status-log";

const GATEWAY = "https://ai.gateway.lovable.dev";
const MODEL = "openai/gpt-6-astra";

function friendlyError(e: any) {
  const status = e?.statusCode ?? e?.lastError?.statusCode;
  if (status === 402) return "Your workspace is out of AI credits. Add more in Settings → Plans & credits.";
  if (status === 429) return "The AI is busy right now. Please try again in a moment.";
  if (status === 403) return "AI access is blocked for this workspace right now.";
  return e?.message && !status ? e.message : `The AI couldn't finish that (${status ?? "error"}). Please try again.`;
}

async function provider() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured.");
  const { createOpenAI } = await import("@ai-sdk/openai");
  return createOpenAI({
    baseURL: `${GATEWAY}/v1`, apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
}
const OPTS = { openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } } as any;

// ---------- Resume parsing ----------
const resumeSchema = z.object({
  full_name: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string(),
  years_experience: z.number().nullable(),
  current_title: z.string(),
  certifications: z.array(z.string()),
  past_employers: z.array(z.string()),
  skills: z.array(z.string()),
  summary: z.string(),
  suggested_job_id: z.string().nullable(),
});
export type ParsedResume = z.infer<typeof resumeSchema>;

async function docxText(b64: string) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("That Word file looks empty or damaged.");
  return strFromU8(xml).replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

export const parseResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { file: string; mime: string; jobs: { id: string; label: string }[] }) => {
    if (!i.file || i.file.length > 14_000_000) throw new Error("File is empty or larger than 10 MB.");
    return i;
  })
  .handler(async ({ data }) => {
    const { streamText, Output } = await import("ai");
    const p = await provider();
    const mime = data.mime;
    let content: any[];
    const ask = `Extract this applicant's details from their resume. Use "" for unknown text fields. Pick the best matching job id from this list, or null:\n${data.jobs.map((j) => `${j.id}: ${j.label}`).join("\n")}`;
    if (mime === "application/pdf") content = [{ type: "text", text: ask }, { type: "file", data: data.file, mediaType: "application/pdf", filename: "resume.pdf" }];
    else if (mime.startsWith("image/")) content = [{ type: "text", text: ask }, { type: "image", image: data.file, mediaType: mime }];
    else if (mime.includes("wordprocessingml") || mime.includes("msword")) {
      const text = await docxText(data.file);
      if (!text) throw new Error("We couldn't read any text in that Word file.");
      content = [{ type: "text", text: `${ask}\n\nResume text:\n${text.slice(0, 40000)}` }];
    } else throw new Error("Please drop a PDF, Word (.docx) or image file.");
    try {
      const result = streamText({
        model: p.responses(MODEL) as any,
        system: "You read resumes for car dealership hiring teams. Be accurate; never invent details.",
        messages: [{ role: "user", content }],
        output: Output.object({ schema: resumeSchema }),
        providerOptions: OPTS,
      });
      return (await result.output) as ParsedResume;
    } catch (e) { throw new Error(friendlyError(e)); }
  });

// ---------- Two-way SMS assistant ----------
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

export const assistantMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { applicationId: string; party: "candidate" | "manager"; body: string; tz: string }) => {
    if (!i.body?.trim() || i.body.length > 1600) throw new Error("Message is empty or too long.");
    if (i.party !== "candidate" && i.party !== "manager") throw new Error("Bad party.");
    return i;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: app, error } = await sb.from("applications").select("*").eq("id", data.applicationId).single();
    if (error || !app) throw new Error("Applicant not found.");
    const [{ data: job }, { data: store }, { data: history }, { data: interviews }] = await Promise.all([
      sb.from("jobs").select("title, description").eq("id", app.job_id).single(),
      sb.from("dealerships").select("name, assistant_name, manager_name").eq("id", app.dealership_id).single(),
      sb.from("messages").select("party, direction, body, created_at").eq("application_id", app.id).order("created_at").limit(60),
      sb.from("interviews").select("starts_at, status").eq("application_id", app.id).eq("status", "scheduled"),
    ]);
    await sb.from("messages").insert({ org_id: app.org_id, application_id: app.id, party: data.party, direction: "in", body: data.body });

    const assistant = store?.assistant_name ?? "Your HR assistant";
    const manager = store?.manager_name || "the hiring manager";
    const now = new Date().toISOString();
    const system = `You are ${assistant}, the AI HR assistant for ${store?.name ?? "the dealership"}. Personality: bubbly, kind, sweet and super organized — the assistant HR manager everyone loves. You text by SMS, so keep replies under 320 characters, warm, with at most one emoji.
You are talking ONLY about this one applicant: ${app.full_name} (application ${app.id}) for ${job?.title ?? "an open role"}. Never mention or confuse any other applicant.
Right now you are texting with the ${data.party === "candidate" ? `CANDIDATE (${app.full_name})` : `HIRING MANAGER (${manager})`}.
${data.party === "candidate"
  ? "Keep them engaged and excited. Ask one simple screening question at a time (experience, certifications like ASE/OEM, availability, start date, pay expectations, driver's license). If they agree to an interview time, confirm it."
  : "Keep the manager accountable: summarize where the candidate stands, ask for decisions (interview? move forward? pass?), and offer specific interview times. Follow their instructions about stage changes and scheduling."}
Current time (UTC): ${now}. Business timezone: ${data.tz}.
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
    const msgs = (history ?? []).map((m) => ({
      role: (m.direction === "in" ? "user" : "assistant") as "user" | "assistant",
      content: `[${m.party === "candidate" ? "candidate thread" : "manager thread"}] ${m.body}`,
    }));
    msgs.push({ role: "user", content: `[${data.party === "candidate" ? "candidate thread" : "manager thread"}] ${data.body}` });

    let out: z.infer<typeof replySchema>;
    try {
      const { streamText, Output } = await import("ai");
      const p = await provider();
      const result = streamText({ model: p.responses(MODEL) as any, system, messages: msgs, output: Output.object({ schema: replySchema }), providerOptions: OPTS });
      out = (await result.output) as z.infer<typeof replySchema>;
    } catch (e) { throw new Error(friendlyError(e)); }

    // Apply updates
    const u = out.profile_updates;
    const profile: any = { ...(app.profile as any) };
    const changed: string[] = [];
    for (const k of ["years_experience", "certifications", "availability", "desired_pay", "earliest_start", "has_drivers_license"] as const) {
      const v = (u as any)[k];
      if (v !== null && v !== undefined && JSON.stringify(v) !== JSON.stringify(profile[k])) { profile[k] = v; changed.push(k.replace(/_/g, " ")); }
    }
    if (u.other_facts?.length) profile.facts = [...new Set([...(profile.facts ?? []), ...u.other_facts])];
    const patch: any = { profile, ai_summary: out.summary };
    if (u.full_name && data.party === "candidate") patch.full_name = u.full_name;
    if (u.email) patch.email = u.email;
    if (u.phone) patch.phone = u.phone;
    if (out.rating && out.rating >= 1 && out.rating <= 5) patch.rating = Math.round(out.rating);
    let interviewAt: string | null = null;
    if (out.interview_start_iso && !isNaN(Date.parse(out.interview_start_iso))) {
      interviewAt = new Date(out.interview_start_iso).toISOString();
      const dup = (interviews ?? []).some((i) => i.starts_at && new Date(i.starts_at).toISOString() === interviewAt);
      if (!dup) {
        await sb.from("interviews").insert({ org_id: app.org_id, application_id: app.id, starts_at: interviewAt, source: "werkandme", created_by: context.userId, location: store?.name ?? null });
        patch.status = "interview";
      }
    }
    if (out.new_status && !patch.status) patch.status = out.new_status;
    await sb.from("applications").update(patch).eq("id", app.id);
    await sb.from("messages").insert({ org_id: app.org_id, application_id: app.id, party: data.party, direction: "out", body: out.reply });
    const notes = [
      changed.length ? `${assistant} updated ${changed.join(", ")} from a text with the ${data.party}` : null,
      interviewAt ? `${assistant} booked an interview for ${new Date(interviewAt).toLocaleString("en-US", { timeZone: data.tz })}` : null,
      out.timeline_note,
    ].filter(Boolean) as string[];
    if (notes.length) await sb.from("application_events").insert(notes.map((message) => ({ org_id: app.org_id, application_id: app.id, kind: "assistant", message })));
    if (patch.status && patch.status !== app.status) {
      await sb.from("application_events").insert(statusEventRows(app.org_id, [app.id], patch.status));
    }
    return { reply: out.reply, changed, status: patch.status ?? null, interviewAt };
  });
