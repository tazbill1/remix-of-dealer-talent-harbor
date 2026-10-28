import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { OrgContext } from "@/lib/org";

const saved: unknown[] = [];
vi.mock("@tanstack/react-start", async (orig) => ({
  ...(await orig<object>()),
  useServerFn: (fn: { name?: string }) => (args: { data: unknown }) => {
    if (String(fn).includes("save") || fn.name === "saveAutomations") {
      saved.push(args.data);
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({
      canEdit: true,
      automations: { texts: { decline: { enabled: false }, invite: { text: "Hey {first}, book: {link}" } } },
      nudgeHours: 4,
      escalateHours: 24,
    });
  },
}));

describe("Automatic texts page", () => {
  it("shows every automatic text with on/off, wording and a live preview", async () => {
    const { Route } = await import("@/routes/_authenticated/automations");
    const Page = Route.options.component!;
    const el = document.createElement("div");
    document.body.appendChild(el);
    const qc = new QueryClient();
    await act(async () => {
      createRoot(el).render(
        <QueryClientProvider client={qc}>
          <OrgContext.Provider value={{ orgId: "00000000-0000-4000-8000-000000000001", orgSlug: "abc", role: "group_admin", isPlatformAdmin: false } as never}>
            <Page />
          </OrgContext.Provider>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const text = el.textContent ?? "";
    expect(text).toContain("Automatic texts");
    expect(text).toContain("Welcome");
    expect(text).toContain("Day-of reminder");
    expect(text).toContain("Check-in days");
    // Custom invite wording shows in its preview with sample data.
    expect(text).toContain("Hey Jordan, book: workwithwerk.com/book/x7k2");
    // Turned-off text shows as Off and hides its editor.
    expect(el.querySelectorAll('[aria-label="Not moving forward wording"]').length).toBe(0);
    expect(el.querySelectorAll("textarea").length).toBe(13);
  });
});
