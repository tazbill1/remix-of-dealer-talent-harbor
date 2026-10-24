import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev";

function gatewayError(status: number, body: string) {
  if (status === 402) return "Your workspace is out of AI credits. Add more in Settings → Plans & credits.";
  if (status === 429) return "The AI is busy right now. Please try again in a moment.";
  let msg = "";
  try { msg = JSON.parse(body)?.error?.message ?? JSON.parse(body)?.message ?? ""; } catch {}
  return msg || `AI request failed (${status}).`;
}

export const transcribeJobAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { audio: string; mime: string }) => {
    if (!i.audio || i.audio.length > 25_000_000) throw new Error("Recording is empty or too long.");
    if (!i.mime.startsWith("audio/")) throw new Error("Unexpected audio type.");
    return i;
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured.");
    const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const ext = data.mime.includes("mp4") ? "m4a" : data.mime.includes("ogg") ? "ogg" : data.mime.includes("wav") ? "wav" : "webm";
    const form = new FormData();
    form.append("model", "openai/gpt-transcribe");
    form.append("file", new File([bytes], `job.${ext}`, { type: data.mime.split(";")[0] }));
    form.append("response_format", "json");
    const res = await fetch(`${GATEWAY}/v1/audio/transcriptions`, {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(gatewayError(res.status, body));
    const text = (JSON.parse(body).text ?? "").trim();
    if (!text) throw new Error("We couldn't hear anything. Try recording again a little closer to the mic.");
    return { text };
  });

const jobSchema = z.object({
  questions: z.array(z.string()),
  job: z.object({
    title: z.string(),
    department: z.string(),
    employment_type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACTOR"]),
    pay_min: z.number().nullable(),
    pay_max: z.number().nullable(),
    pay_period: z.enum(["YEAR", "HOUR"]),
    description: z.string(),
  }),
});
export type AiJobDraft = z.infer<typeof jobSchema>;

export const draftJobFromVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { transcript: string; answers: { q: string; a: string }[]; final: boolean }) => {
    if (!i.transcript?.trim() || i.transcript.length > 20000) throw new Error("Missing description.");
    return i;
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured.");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output } = await import("ai");
    const provider = createOpenAI({
      baseURL: `${GATEWAY}/v1`, apiKey: key,
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const answers = data.answers.filter((a) => a.a.trim()).map((a) => `Q: ${a.q}\nA: ${a.a}`).join("\n\n");
    const system = `You write job postings for car dealerships. Turn the hiring manager's spoken notes into a polished, friendly, inclusive job posting.
Description format: plain text with short sections: an inviting intro paragraph, "What you'll do" (bullets with "- "), "What we're looking for" (bullets), "Why you'll love it here" (bullets). No markdown headings symbols, no made-up pay, benefits or certifications that weren't mentioned.
Pay: numbers only (yearly dollars for YEAR, hourly dollars for HOUR); null if unknown.
${data.final
  ? "This is the final version: return an empty questions array and the best complete posting."
  : "Return 2 to 5 short questions about important details still missing (for example experience needed, certifications like ASE, schedule/hours, pay, benefits, driver's license). Skip anything already covered. Also return your best draft so far."}`;
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra") as any,
      system,
      messages: [{ role: "user", content: `Spoken notes:\n${data.transcript}${answers ? `\n\nAnswers to follow-up questions:\n${answers}` : ""}` }],
      output: Output.object({ schema: jobSchema }),
      providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low", include: ["reasoning.encrypted_content"] } },
    });
    try {
      const out = (await result.output) as AiJobDraft;
      if (data.final) out.questions = [];
      return out;
    } catch (e: any) {
      const status = e?.statusCode ?? e?.lastError?.statusCode;
      throw new Error(status ? gatewayError(status, e?.responseBody ?? "") : "The AI couldn't write this one. Please try again.");
    }
  });
