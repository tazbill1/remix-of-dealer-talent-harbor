import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { AskChat } from "@/components/ask-chat";

export const Route = createFileRoute("/_authenticated/ask")({
  head: () => ({
    meta: [
      { title: "Ask | WerkandMe Hiring" },
      { name: "description", content: "Ask the hiring assistant about your applicants and interviews." },
    ],
  }),
  component: AskPage,
});

function AskPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="size-5" /> Ask</h1>
        <p className="text-sm text-muted-foreground">
          Ask about applicants and interviews at your stores, or for a report like "tech pipeline at each store". It only looks things up; it never texts or changes anyone.
        </p>
      </div>
      <AskChat />
    </div>
  );
}
