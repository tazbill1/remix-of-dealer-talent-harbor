import { STATUS_LABEL, STATUSES, type AppStatus } from "@/lib/jobs";

/**
 * Stage changes are logged to application_events with kind "status" so analytics can
 * measure time to first contact, stage aging and time to fill. The target stage is kept
 * in the message ("Moved to Screening") so no schema change is needed.
 */
export const STATUS_EVENT_KIND = "status";

export function statusEventMessage(to: AppStatus) {
  return `Moved to ${STATUS_LABEL[to]}`;
}

/** Reads the target stage back out of a status event message. */
export function statusFromEventMessage(message: string | null | undefined): AppStatus | null {
  if (!message?.startsWith("Moved to ")) return null;
  const label = message.slice("Moved to ".length).trim();
  return STATUSES.find((s) => STATUS_LABEL[s] === label) ?? null;
}

export function statusEventRows(orgId: string, appIds: string[], to: AppStatus) {
  return appIds.map((application_id) => ({
    org_id: orgId,
    application_id,
    kind: STATUS_EVENT_KIND,
    message: statusEventMessage(to),
  }));
}
