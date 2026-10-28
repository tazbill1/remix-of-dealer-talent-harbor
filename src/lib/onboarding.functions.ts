import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fileProblem, onboardingPath } from "@/lib/onboarding";

/** Public new-hire link functions. The token is the only key; files can never be read back. */

type Checklist = {
  checklist_id: string; org_id: string; status: string; start_date: string | null; name: string; store: string;
  items: { id: string; title: string; description: string | null; item_type: string; who_completes: string; required: boolean; due_date: string | null; completed: boolean }[];
};

async function load(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("onboarding_by_token", { _token: token });
  if (error) { console.error("onboarding_by_token", error.message); return null; }
  return (data as Checklist | null) ?? null;
}

export const getNewHireChecklist = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const c = await load(data.token);
    if (!c) return null;
    return {
      firstName: c.name.split(" ")[0] ?? c.name, store: c.store, startDate: c.start_date, status: c.status,
      items: c.items.filter((i) => i.who_completes === "new_hire"),
    };
  });

export const newHireUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; itemId: string; fileName: string; size: number }) =>
    z.object({ token: z.string().uuid(), itemId: z.string().uuid(), fileName: z.string().min(1).max(200), size: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => {
    const problem = fileProblem(data.fileName, data.size);
    if (problem) throw new Error(problem);
    const c = await load(data.token);
    const item = c?.items.find((i) => i.id === data.itemId);
    if (!c || !item || item.who_completes !== "new_hire" || item.item_type !== "document_upload") throw new Error("This link is no longer valid.");
    const path = onboardingPath(c.org_id, c.checklist_id, item.id, data.fileName);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from("onboarding-docs").createSignedUploadUrl(path);
    if (error || !signed) throw new Error("Couldn't start the upload. Please try again.");
    return { path, token: signed.token };
  });

export const newHireCompleteItem = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; itemId: string; filePath?: string }) =>
    z.object({ token: z.string().uuid(), itemId: z.string().uuid(), filePath: z.string().max(400).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("onboarding_complete_item", {
      _token: data.token, _item: data.itemId, ...(data.filePath ? { _file_path: data.filePath } : {}),
    });
    if (error) throw new Error(error.message.includes("upload") ? "Please upload the document first." : "Couldn't save that. Please try again.");
    return { ok: true };
  });
