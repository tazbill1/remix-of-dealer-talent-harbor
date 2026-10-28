import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/interviews/process-recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { processInterviewRecording } = await import("@/lib/interview-recording.server");
        return processInterviewRecording(request);
      },
    },
  },
});
