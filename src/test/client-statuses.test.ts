import { describe, expect, it } from "vitest";
import { STATUSES, STATUS_LABEL, STATUS_COLOR, isRejection } from "@/lib/jobs";
import { doNotHireRepeats } from "@/lib/do-not-hire";

describe("client stage list", () => {
  it("is in the client's order with their colors", () => {
    expect(STATUSES.map((s) => STATUS_LABEL[s])).toEqual([
      "Not Contacted Yet", "Does Not Meet Basic Qualifications", "Contacted", "Interviewing",
      "Consider for Another Location or Position", "Not Selected", "Hired", "Contacted for Hiring Event", "Do Not Hire",
    ]);
    expect(STATUSES.map((s) => STATUS_COLOR[s])).toEqual([
      "#4B4B4B", "#C8762A", "#93199A", "#4A4AE8", "#C2B93A", "#3C8AA0", "#4A9A3E", "#E687BE", "#E0373A",
    ]);
  });
  it("treats only the three rejection-type stages as needing confirmation", () => {
    expect(STATUSES.filter(isRejection)).toEqual(["unqualified", "rejected", "do_not_hire"]);
  });
  it("warns when a Do Not Hire person applies again", () => {
    const r = doNotHireRepeats([
      { id: "a", status: "do_not_hire", email: "X@y.com" },
      { id: "b", status: "new", email: "x@y.com " },
      { id: "c", status: "new", email: "z@y.com" },
    ]);
    expect([...r]).toEqual(["b"]);
  });
});
