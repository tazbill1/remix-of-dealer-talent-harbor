import { describe, expect, it } from "vitest";
import { resolveStoreVideo, videoPath } from "@/lib/store-videos";

const row = (store_id: string | null, kind: string, enabled: boolean) => ({ store_id, kind, enabled, storage_path: `${store_id}-${kind}` });

describe("resolveStoreVideo", () => {
  it("shows nothing when everything is off (the starting state)", () => {
    expect(resolveStoreVideo([row(null, "welcome", false), row("s1", "welcome", false)], "s1", "welcome").video).toBeNull();
  });
  it("uses the store's own video when it is on", () => {
    const r = resolveStoreVideo([row(null, "welcome", true), row("s1", "welcome", true)], "s1", "welcome");
    expect(r.from).toBe("store");
  });
  it("falls back to the group's video when the store has none", () => {
    expect(resolveStoreVideo([row(null, "thank_you", true)], "s1", "thank_you").from).toBe("group");
  });
  it("a store's switched-off video does not fall back to the group", () => {
    expect(resolveStoreVideo([row(null, "welcome", true), row("s1", "welcome", false)], "s1", "welcome").video).toBeNull();
  });
  it("never uses another store's video", () => {
    expect(resolveStoreVideo([row("s2", "welcome", true)], "s1", "welcome").video).toBeNull();
  });
});

it("videoPath puts files under the group and store folders", () => {
  expect(videoPath("o", null, "welcome", "Hi.MOV", 5)).toBe("o/group/welcome-5.mov");
  expect(videoPath("o", "s", "thank_you", "x.mp4", 5)).toBe("o/s/thank_you-5.mp4");
});
