import { describe, expect, it } from "vitest";
import { sourceKey } from "@/lib/sources";

describe("applicant source", () => {
  it("groups job boards", () => { expect(sourceKey("indeed")).toBe("job_board"); expect(sourceKey("ZipRecruiter")).toBe("job_board"); });
  it("recognizes LinkedIn and referrals", () => { expect(sourceKey("LinkedIn")).toBe("linkedin"); expect(sourceKey("employee-referral")).toBe("referral"); });
  it("treats the careers page or no source as our own site", () => { expect(sourceKey("careers")).toBe("own_site"); expect(sourceKey(undefined)).toBe("own_site"); });
  it("anything unknown is Other", () => { expect(sourceKey("billboard")).toBe("other"); });
});
