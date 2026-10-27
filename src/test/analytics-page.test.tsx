import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { OrgContext } from "@/lib/org";

const NOW = Date.now();
const ago = (h: number) => new Date(NOW - h * 3600e3).toISOString();
const rows: Record<string, unknown[]> = {
  dealerships: [{ id: "s1", name: "Grand Rapids Ford" }],
  jobs: [
    {
      id: "j1",
      title: "Service Technician",
      dealership_id: "s1",
      status: "open",
      division: "fixed_ops",
      department: "Service",
      hiring_manager: "Dana",
      created_at: ago(400),
    },
  ],
  applications: [
    {
      id: "a1",
      job_id: "j1",
      dealership_id: "s1",
      status: "screening",
      source: "Indeed",
      created_at: ago(30),
      updated_at: ago(26),
    },
    {
      id: "a2",
      job_id: "j1",
      dealership_id: "s1",
      status: "new",
      source: "Careers site",
      created_at: ago(5),
      updated_at: ago(5),
    },
  ],
  application_events: [
    { application_id: "a1", kind: "status", message: "Moved to Screening", created_at: ago(26) },
  ],
  messages: [],
};

// A chainable stand-in for the Supabase query builder that resolves to the table's rows.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: () => Promise.resolve({ data: rows[table] ?? [], error: null }),
      };
      return q;
    },
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function waitForText(el: HTMLElement, text: string) {
  for (let i = 0; i < 50; i++) {
    if (el.textContent?.includes(text)) return;
    await act(() => new Promise((r) => setTimeout(r, 20)));
  }
  throw new Error(`"${text}" never appeared`);
}

describe("Analytics page", () => {
  it("renders the client's dashboard metrics from sample data", async () => {
    const { Route } = await import("@/routes/_authenticated/analytics");
    const Page = Route.options.component!;
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <OrgContext.Provider
            value={{
              orgId: "o1",
              orgName: "Test Group",
              orgSlug: "test",
              role: "recruiter",
              isPlatformAdmin: false,
            }}
          >
            <Page />
          </OrgContext.Provider>
        </QueryClientProvider>,
      );
    });
    await waitForText(el, "Candidate aging by stage");
    const text = el.textContent ?? "";
    expect(text).toContain("Time to first contact");
    expect(text).toContain("4.0 hrs"); // a1 applied 30h ago, moved to Screening 26h ago
    expect(text).toContain("Grand Rapids Ford");
    expect(text).toContain("1 fixed ops · 0 variable");
    act(() => root.unmount());
  });
});
