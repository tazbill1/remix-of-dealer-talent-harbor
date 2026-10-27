import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function ai() {
  const m = await import("@/lib/assistant.server");
  return { provider: m.lovableProvider, MODEL: m.LOVABLE_MODEL, OPTS: m.LOVABLE_OPTS, friendlyError: m.friendlyAiError };
}

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
    const { provider, MODEL, OPTS, friendlyError } = await ai();
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
// The logic lives in assistant.server.ts so practice chat in the app and real texts
// from phones share one code path (keywords, AI reply, updates, outbox).
export const assistantMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { applicationId: string; party: "candidate" | "manager"; body: string; tz: string }) => {
    if (!i.body?.trim() || i.body.length > 1600) throw new Error("Message is empty or too long.");
    if (i.party !== "candidate" && i.party !== "manager") throw new Error("Bad party.");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { runAssistant } = await import("@/lib/assistant.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return runAssistant(context.supabase, supabaseAdmin, {
      applicationId: data.applicationId,
      party: data.party,
      body: data.body,
      actorId: context.userId,
      source: "practice",
    });
  });
