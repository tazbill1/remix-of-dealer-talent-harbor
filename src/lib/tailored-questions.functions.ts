import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  conversationForAi,
  keepSafeQuestions,
  tailoredOutputSchema,
  tailoredSystemPrompt,
  tailoredUserPrompt,
} from "@/lib/tailored-questions";

const MAX_RESUME_BYTES = 8_000_000;

/** Interview questions written for one applicant. Runs as the signed-in user, so store access
 * rules decide which applicants (and resumes) the AI can read. Nothing is saved. */
export const writeTailoredQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { applicationId: string }) => z.object({ applicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: app } = await sb
      .from("applications")
      .select("id, full_name, answers, profile, ai_summary, resume_path, job_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Applicant not found.");
    const [{ data: job }, { data: texts }] = await Promise.all([
      sb.from("jobs").select("title, department, questions, interview_kit_id").eq("id", app.job_id).maybeSingle(),
      sb
        .from("messages")
        .select("direction, body, created_at")
        .eq("application_id", app.id)
        .eq("party", "candidate")
        .order("created_at", { ascending: false })
        .limit(80),
    ]);
    const { data: kit } = job?.interview_kit_id
      ? await sb.from("interview_kits").select("questions").eq("id", job.interview_kit_id).maybeSingle()
      : { data: null };
    const { parseKitQuestions } = await import("@/lib/interview-kits");
    const { answersForAi, parseQuestions } = await import("@/lib/questions");
    const screeningQs = parseQuestions(job?.questions);
    const firstName = app.full_name.trim().split(/\s+/)[0] || "Applicant";

    // The resume goes to the AI as a file (PDF/image) or as text (Word).
    let resume: any = null;
    let resumeNote = "No resume on file.";
    if (app.resume_path) {
      const { data: blob } = await sb.storage.from("resumes").download(app.resume_path);
      const ext = app.resume_path.split(".").pop()?.toLowerCase() ?? "";
      if (blob && blob.size <= MAX_RESUME_BYTES) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        resumeNote = "Their resume is attached.";
        if (ext === "pdf") resume = { type: "file", data: bytes, mediaType: "application/pdf", filename: "resume.pdf" };
        else if (["png", "jpg", "jpeg", "webp"].includes(ext))
          resume = { type: "image", image: bytes, mediaType: `image/${ext === "jpg" ? "jpeg" : ext}` };
        else if (ext === "docx") {
          const { docxText } = await import("@/lib/docx-text");
          let b64 = "";
          for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          const text = await docxText(btoa(b64)).catch(() => "");
          resumeNote = text ? `Resume:\n${text.slice(0, 20000)}` : "Their resume couldn't be read.";
        } else resumeNote = "Their resume couldn't be read.";
      } else resumeNote = "Their resume couldn't be read.";
    }

    const prompt = tailoredUserPrompt({
      role: [job?.title, job?.department].filter(Boolean).join(", ") || "Dealership role",
      kitQuestions: parseKitQuestions(kit?.questions).map((q) => q.text),
      screening: screeningQs.length ? answersForAi(screeningQs, (app.answers ?? {}) as Record<string, string>) : "",
      profile: app.profile,
      summary: app.ai_summary,
      conversation: conversationForAi(texts ?? [], firstName),
      resumeNote,
    });

    const { streamText, Output } = await import("ai");
    const { lovableProvider, LOVABLE_MODEL, LOVABLE_OPTS, friendlyAiError } = await import("@/lib/assistant.server");
    const p = await lovableProvider();
    const ask = async (withResume: boolean) => {
      const content: any[] = [{ type: "text", text: withResume ? prompt : prompt.replace(resumeNote, "Their resume couldn't be read.") }];
      if (withResume && resume) content.push(resume);
      const result = streamText({
        model: p.responses(LOVABLE_MODEL) as any,
        system: tailoredSystemPrompt(),
        messages: [{ role: "user", content }],
        output: Output.object({ schema: tailoredOutputSchema }),
        providerOptions: LOVABLE_OPTS,
      });
      return result.output;
    };
    try {
      let out: unknown;
      let resumeRead = !!resume || resumeNote.startsWith("Resume:");
      try {
        out = await ask(true);
      } catch (e) {
        if (!resume) throw e;
        // A resume file the AI can't open shouldn't block the rest.
        out = await ask(false);
        resumeRead = false;
      }
      const questions = keepSafeQuestions(out);
      if (!questions.length) throw new Error("The AI didn't come up with usable questions. Please try again.");
      return { questions, firstName, resumeRead, hadResume: !!app.resume_path };
    } catch (e) {
      throw new Error(friendlyAiError(e));
    }
  });
