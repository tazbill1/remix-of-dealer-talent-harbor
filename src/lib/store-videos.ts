/** Store video library rules (pure, tested). */
export const VIDEO_KINDS = ["welcome", "thank_you"] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];
export const VIDEO_KIND_LABEL: Record<VideoKind, string> = { welcome: "Welcome video", thank_you: "Thank-you video" };

export type VideoRow = { store_id: string | null; kind: string; enabled: boolean; storage_path: string };

/**
 * Which video a store uses for a kind. A store's own video (once uploaded) wins and its switch decides;
 * a store with no video of its own uses the group's, if the group's is switched on.
 */
export function resolveStoreVideo<T extends VideoRow>(rows: T[], storeId: string, kind: VideoKind): { video: T | null; from: "store" | "group" | null } {
  const own = rows.find((r) => r.store_id === storeId && r.kind === kind);
  if (own) return own.enabled ? { video: own, from: "store" } : { video: null, from: null };
  const group = rows.find((r) => r.store_id === null && r.kind === kind);
  return group?.enabled ? { video: group, from: "group" } : { video: null, from: null };
}

export function videoPath(orgId: string, storeId: string | null, kind: VideoKind, fileName: string, now = Date.now()) {
  const ext = (fileName.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  return `${orgId}/${storeId ?? "group"}/${kind}-${now}.${ext}`;
}
