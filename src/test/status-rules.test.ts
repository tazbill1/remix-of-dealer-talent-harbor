import { describe, expect, it } from "vitest";
import { parseAutomations } from "@/lib/automations";
import {
  describeRule,
  dueRule,
  newRule,
  ruleProblem,
  stageSince,
  stampRules,
  type StatusRule,
} from "@/lib/status-rules";
import { planMoves, runStatusRules } from "@/lib/status-rules.server";
import { fakeSupabase } from "./fake-supabase";

const DAY = 24 * 3600e3;
const NOW = Date.parse("2026-10-28T15:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const rule = (p: Partial<StatusRule> = {}): StatusRule => ({
  ...newRule("r1"),
  enabled: true,
  enabledAt: ago(30),
  ...p,
});
const app = (
  p: Partial<{ status: string; created_at: string; knockout_failed: boolean }> = {},
) => ({
  status: "screening",
  created_at: ago(20),
  knockout_failed: false,
  ...p,
});
const out = (days: number, p: Record<string, unknown> = {}) => ({
  party: "candidate",
  direction: "out",
  status: "simulated",
  created_at: ago(days),
  channel: "sms",
  ...p,
});
const inbound = (days: number) => ({ ...out(days), direction: "in", status: "received" });

describe("status rules: matching", () => {
  it("no reply: moves once the wait has passed since the last text", () => {
    const r = rule({ days: 5 });
    const base = { app: app(), stageSince: Date.parse(ago(10)), now: NOW };
    expect(dueRule([r], { ...base, messages: [out(6)] })).toBe(r);
    expect(dueRule([r], { ...base, messages: [out(4)] })).toBeNull();
  });

  it("no reply: a reply after the last text stops it, a new text restarts the clock", () => {
    const r = rule({ days: 5 });
    const base = { app: app(), stageSince: Date.parse(ago(10)), now: NOW };
    expect(dueRule([r], { ...base, messages: [out(9), inbound(8)] })).toBeNull();
    expect(dueRule([r], { ...base, messages: [out(9), inbound(8), out(7)] })).toBe(r);
    expect(dueRule([r], { ...base, messages: [out(9), inbound(8), out(2)] })).toBeNull();
  });

  it("no reply: never texted, emails and blocked texts don't count", () => {
    const r = rule({ days: 5 });
    const base = { app: app(), stageSince: Date.parse(ago(10)), now: NOW };
    expect(dueRule([r], { ...base, messages: [] })).toBeNull();
    expect(dueRule([r], { ...base, messages: [out(8, { channel: "email" })] })).toBeNull();
    expect(dueRule([r], { ...base, messages: [out(8, { status: "blocked" })] })).toBeNull();
  });

  it("no reply: the clock doesn't start before they entered the stage", () => {
    const r = rule({ days: 5 });
    expect(
      dueRule([r], { app: app(), stageSince: Date.parse(ago(3)), messages: [out(8)], now: NOW }),
    ).toBeNull();
  });

  it("no change: counts days in the current stage", () => {
    const r = rule({ trigger: "no_change", days: 14, from: ["new"] });
    expect(
      dueRule([r], {
        app: app({ status: "new" }),
        stageSince: Date.parse(ago(15)),
        messages: [],
        now: NOW,
      }),
    ).toBe(r);
    expect(
      dueRule([r], {
        app: app({ status: "new" }),
        stageSince: Date.parse(ago(13)),
        messages: [],
        now: NOW,
      }),
    ).toBeNull();
  });

  it("knockout: only when a requirement wasn't met, right away with 0 days", () => {
    const r = rule({ trigger: "knockout", days: 0, from: ["new"] });
    const base = { stageSince: Date.parse(ago(1)), messages: [], now: NOW };
    expect(dueRule([r], { ...base, app: app({ status: "new", knockout_failed: true }) })).toBe(r);
    expect(
      dueRule([r], { ...base, app: app({ status: "new", knockout_failed: false }) }),
    ).toBeNull();
  });

  it("only applies to the stages picked, and skips rules that are off", () => {
    const r = rule({ trigger: "no_change", days: 1, from: ["new"] });
    const base = { stageSince: Date.parse(ago(5)), messages: [], now: NOW };
    expect(dueRule([r], { ...base, app: app({ status: "interview" }) })).toBeNull();
    expect(
      dueRule([{ ...r, enabled: false }], { ...base, app: app({ status: "new" }) }),
    ).toBeNull();
  });

  it("the clock starts when the rule was turned on, unless already-waiting is included", () => {
    const r = rule({ trigger: "no_change", days: 7, from: ["new"], enabledAt: ago(2) });
    const base = {
      app: app({ status: "new" }),
      stageSince: Date.parse(ago(60)),
      messages: [],
      now: NOW,
    };
    expect(dueRule([r], base)).toBeNull();
    expect(dueRule([{ ...r, includeExisting: true }], base)).not.toBeNull();
    expect(dueRule([{ ...r, enabledAt: undefined }], base)).toBeNull();
    expect(dueRule([r], { ...base, ignoreEnabledAt: true })).not.toBeNull();
  });

  it("the first matching rule on the list wins", () => {
    const a = rule({ id: "a", trigger: "no_change", days: 3, to: "rejected" });
    const b = rule({ id: "b", trigger: "no_change", days: 3, to: "interview" });
    const input = { app: app(), stageSince: Date.parse(ago(5)), messages: [], now: NOW };
    expect(dueRule([a, b], input)?.id).toBe("a");
    expect(dueRule([b, a], input)?.id).toBe("b");
  });

  it("stage start comes from the latest logged move to the current stage", () => {
    const a = { status: "screening", created_at: ago(20) };
    expect(stageSince(a, [])).toBe(Date.parse(ago(20)));
    expect(
      stageSince(a, [
        { created_at: ago(9), to: "screening" },
        { created_at: ago(4), to: "screening" },
        { created_at: ago(2), to: "interview" },
      ]),
    ).toBe(Date.parse(ago(4)));
  });
});

describe("status rules: settings", () => {
  it("flags rules that can't work", () => {
    expect(ruleProblem(rule())).toBeNull();
    expect(ruleProblem(rule({ from: [] }))).toMatch(/at least one stage/);
    expect(ruleProblem(rule({ from: ["screening"], to: "screening" }))).toMatch(/can't move/);
    expect(ruleProblem(rule({ trigger: "no_reply", days: 0 }))).toMatch(/1 day/);
    expect(ruleProblem(rule({ trigger: "knockout", days: 0 }))).toBeNull();
  });

  it("describes rules in plain words", () => {
    expect(describeRule(rule())).toBe("No reply for 5 days in Not Contacted Yet or Contacted → Not Selected");
    expect(
      describeRule(rule({ trigger: "no_change", days: 1, from: ["new"], to: "screening" })),
    ).toBe("1 day with no change in New → Screening");
  });

  it("stamps the turned-on time, keeps it while on, clears it when off", () => {
    const now = "2026-10-28T00:00:00.000Z";
    const off = { ...rule(), enabled: false, enabledAt: undefined };
    const [on] = stampRules([{ ...off, enabled: true }], [off], now);
    expect(on!.enabledAt).toBe(now);
    const [kept] = stampRules(
      [{ ...on!, days: 9, enabledAt: "forged" }],
      [on!],
      "2026-11-01T00:00:00.000Z",
    );
    expect(kept!.enabledAt).toBe(now);
    const [cleared] = stampRules([{ ...on!, enabled: false }], [on!], now);
    expect(cleared!.enabledAt).toBeUndefined();
    const [fresh] = stampRules(
      [{ ...off, id: "new", enabled: true, enabledAt: "forged" }],
      [],
      now,
    );
    expect(fresh!.enabledAt).toBe(now);
  });

  it("rules are kept when the group's settings are read", () => {
    const a = parseAutomations({ texts: {}, statusRules: [rule()] });
    expect(a.statusRules).toHaveLength(1);
  });
});

function world(
  rules: StatusRule[],
  apps: Record<string, unknown>[],
  extra: Record<string, Record<string, unknown>[]> = {},
) {
  return fakeSupabase({
    messaging_settings: [{ org_id: "o1", automations: { texts: {}, statusRules: rules } }],
    applications: apps.map((a, i) => ({
      id: `a${i + 1}`,
      org_id: "o1",
      full_name: `Person ${i + 1}`,
      status: "new",
      created_at: ago(20),
      knockout_failed: false,
      ...a,
    })),
    application_events: [],
    messages: [],
    ...extra,
  });
}

describe("status rules: scheduled run", () => {
  it("moves matching applicants, logs it, and sends no email by default", async () => {
    const r = rule({ trigger: "no_change", days: 14, from: ["new"], to: "rejected" });
    const { client, tables } = world([r], [{}, { created_at: ago(3) }, { status: "hired" }]);
    const res = await runStatusRules(client, { now: NOW });
    expect(res).toEqual({ moved: 1, emailed: 0, errors: 0 });
    expect(tables["applications"]!.map((a) => a["status"])).toEqual(["rejected", "new", "hired"]);
    const ev = tables["application_events"]!.filter((e) => e["application_id"] === "a1");
    expect(ev.map((e) => e["message"])).toEqual([
      "Moved to Not Selected",
      "Moved automatically by status rule: 14 days with no change in Not Contacted Yet → Not Selected",
    ]);
    expect(tables["messages"]).toHaveLength(0);
    // Running again does nothing more.
    expect((await runStatusRules(client, { now: NOW })).moved).toBe(0);
  });

  it("does nothing for rules that are off or groups without rules", async () => {
    const { client, tables } = world(
      [rule({ trigger: "no_change", days: 1, enabled: false })],
      [{}],
    );
    expect((await runStatusRules(client, { now: NOW })).moved).toBe(0);
    expect(tables["applications"]![0]!["status"]).toBe("new");
  });

  it("uses texts for no-reply rules", async () => {
    const r = rule({ days: 5, from: ["screening"] });
    const { client, tables } = world([r], [{ status: "screening" }, { status: "screening" }], {
      messages: [
        { application_id: "a1", ...out(6) },
        { application_id: "a2", ...out(6) },
        { application_id: "a2", ...inbound(5) },
      ],
    });
    await runStatusRules(client, { now: NOW });
    expect(tables["applications"]!.map((a) => a["status"])).toEqual(["rejected", "screening"]);
  });

  it("preview lists who fits a rule that isn't on yet, without moving anyone", async () => {
    const r = {
      ...rule({ trigger: "no_change", days: 14, from: ["new"] }),
      enabled: false,
      enabledAt: undefined,
    };
    const { client, tables } = world([], [{}, {}]);
    const moves = await planMoves(client, {
      orgId: "o1",
      rules: [r],
      now: NOW,
      ignoreEnabledAt: true,
    });
    expect(moves.map((m) => m.app.full_name).sort()).toEqual(["Person 1", "Person 2"]);
    expect(tables["applications"]!.every((a) => a["status"] === "new")).toBe(true);
  });
});
