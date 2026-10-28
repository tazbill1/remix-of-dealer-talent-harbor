import { describe, expect, it } from "vitest";
import { orderCardFlags } from "@/lib/card-tags";

describe("card tag priority", () => {
  it("Do Not Hire beats everything", () => {
    expect(orderCardFlags({ source: true, overdue: true, dnh: true })).toEqual({ top: "dnh", rest: ["overdue", "source"] });
  });
  it("follows Overdue > Wants a person > duplicate > pool > referral > source", () => {
    expect(orderCardFlags({ source: true, referral: true, pool: true, duplicate: true, attention: true }).top).toBe("attention");
    expect(orderCardFlags({ source: true, referral: true, pool: true }).top).toBe("pool");
    expect(orderCardFlags({ source: true, referral: true }).top).toBe("referral");
  });
  it("source alone shows with no +N", () => {
    expect(orderCardFlags({ source: true })).toEqual({ top: "source", rest: [] });
  });
});
