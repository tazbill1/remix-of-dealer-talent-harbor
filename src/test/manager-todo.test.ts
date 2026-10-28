import { describe, expect, it } from "vitest";
import { managerTodo, todoTab, type TodoApp } from "@/lib/manager-todo";
import { PURPOSE } from "@/lib/workflows/rules";

const now = Date.parse("2026-10-28T17:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 864e5).toISOString();
const app = (id: string, status: string, extra: Partial<TodoApp> = {}): TodoApp => ({
  id,
  full_name: id,
  status,
  created_at: daysAgo(10),
  needs_attention: null,
  dealership_id: "s1",
  job_id: "j1",
  ...extra,
});
const empty = { apps: [], messages: [], interviews: [], cards: [], offers: [] };

describe("managerTodo", () => {
  it("lists Screening applicants to decide on, like the manager texts, and notes a reminder text", () => {
    const items = managerTodo(
      {
        ...empty,
        apps: [app("a", "screening"), app("b", "screening"), app("c", "new"), app("d", "rejected")],
        messages: [
          { application_id: "a", party: "manager", direction: "out", purpose: PURPOSE.summary, created_at: daysAgo(3) },
          { application_id: "a", party: "manager", direction: "out", purpose: PURPOSE.nudge, created_at: daysAgo(2) },
        ],
      },
      now,
    );
    expect(items.map((i) => [i.kind, i.applicationId])).toEqual([
      ["decide", "b"],
      ["decide", "a"],
    ]);
    expect(items[1]!.detail).toBe("Interview or pass? Waiting 3 days · reminder texted");
  });

  it("puts flagged applicants under call back instead of decide", () => {
    const items = managerTodo({ ...empty, apps: [app("a", "screening", { needs_attention: "Wants a person" })] }, now);
    expect(items).toMatchObject([{ kind: "call", detail: "Wants a person" }]);
  });

  it("lists finished interviews without a submitted scorecard from the last two weeks", () => {
    const iv = (id: string, d: number, status = "scheduled") => ({
      id,
      application_id: "a",
      starts_at: daysAgo(d),
      duration_min: 30,
      status,
    });
    const items = managerTodo(
      {
        ...empty,
        apps: [app("a", "interview")],
        interviews: [iv("done", 1.5), iv("draft", 2), iv("scored", 3), iv("old", 20), iv("cancel", 1, "cancelled"), iv("future", -1)],
        cards: [
          { interview_id: "scored", submitted_at: daysAgo(3) },
          { interview_id: "draft", submitted_at: null },
        ],
      },
      now,
    );
    expect(items.map((i) => i.interviewId)).toEqual(["draft", "done"]);
    expect(items[1]!.detail).toBe("Interviewed 1 day ago, no scorecard yet");
  });

  it("skips scorecards for applicants who are hired or passed", () => {
    const items = managerTodo(
      {
        ...empty,
        apps: [app("a", "rejected")],
        interviews: [{ id: "i", application_id: "a", starts_at: daysAgo(2), duration_min: 30, status: "scheduled" }],
      },
      now,
    );
    expect(items).toEqual([]);
  });

  it("shows offers out but unsigned, and Offer-stage applicants with no letter", () => {
    const items = managerTodo(
      {
        ...empty,
        apps: [app("out", "offer"), app("none", "offer"), app("signed", "offer")],
        offers: [
          { application_id: "out", status: "viewed", is_offer_letter: true, created_at: daysAgo(4) },
          { application_id: "signed", status: "signed", is_offer_letter: true, created_at: daysAgo(4) },
          { application_id: "none", status: "sent", is_offer_letter: false, created_at: daysAgo(4) },
        ],
      },
      now,
    );
    expect(items.map((i) => [i.kind, i.applicationId])).toEqual([
      ["offer_ready", "none"],
      ["offer_out", "out"],
    ]);
    expect(items[1]!.detail).toBe("Offer letter sent 4 days ago, not signed yet");
  });

  it("opens the panel tab that answers each item", () => {
    expect(todoTab("scorecard")).toBe("interview");
    expect(todoTab("offer_out")).toBe("offer");
    expect(todoTab("decide")).toBe("overview");
  });
});
