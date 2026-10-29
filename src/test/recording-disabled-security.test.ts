import { expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  auth: { getUser: async () => ({ data: { user: { id: "staff" } } }) },
  from: (table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({ data:
    table === "interview_recordings" ? { id: "00000000-0000-0000-0000-000000000001", interview_id: "iv", org_id: "abc" } :
    table === "interviews" ? { application_id: "a" } : table === "applications" ? { org_id: "abc", dealership_id: "s" } : { interview_recording_enabled: false },
  }) }) }) }),
} }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: async () => ({ data: true }) }) }));
vi.mock("@/lib/recording-ai/transcribe.server", () => ({ transcribe: vi.fn() }));
import { processInterviewRecording } from "@/lib/interview-recording.server";
import { transcribe } from "@/lib/recording-ai/transcribe.server";
it("denies processing when recording is off even for an authorized staff reader", async () => {
  const response = await processInterviewRecording(new Request("http://localhost/process", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000001" }) }));
  expect(response.status).toBe(403);
  expect(transcribe).not.toHaveBeenCalled();
});