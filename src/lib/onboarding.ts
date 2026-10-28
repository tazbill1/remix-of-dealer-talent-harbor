/** Onboarding checklist rules and wording. Pure, tested. */

export type ItemType = "document_upload" | "form_to_complete" | "acknowledgement" | "manager_task";
export type Who = "new_hire" | "manager";

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  document_upload: "Upload",
  form_to_complete: "Form to complete",
  acknowledgement: "Acknowledgement",
  manager_task: "Manager task",
};
export const WHO_LABEL: Record<Who, string> = { new_hire: "New hire", manager: "Manager" };
export const ITEM_TYPES = Object.keys(ITEM_TYPE_LABEL) as ItemType[];

export const ONBOARDING_FILE_TYPES = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
export const ONBOARDING_MAX_BYTES = 10 * 1024 * 1024;

/** Problem with a chosen file, or null when it's fine. */
export function fileProblem(name: string, size: number): string | null {
  const lower = name.toLowerCase();
  if (!ONBOARDING_FILE_TYPES.some((ext) => lower.endsWith(ext))) return "Please choose a PDF, JPG, PNG, DOC or DOCX file.";
  if (size > ONBOARDING_MAX_BYTES) return "That file is over 10 MB.";
  return null;
}

/** Storage path inside the private onboarding-docs bucket. */
export function onboardingPath(orgId: string, checklistId: string, itemId: string, fileName: string, stamp: number = Date.now()) {
  const ext = fileName.toLowerCase().match(/\.(pdf|jpe?g|png|docx?)$/)?.[0] ?? "";
  return `${orgId}/${checklistId}/${itemId}-${stamp}${ext}`;
}

type Item = { required: boolean; completed_at?: string | null; completed?: boolean; due_date: string | null };
const isDone = (i: Item) => i.completed ?? !!i.completed_at;

export function progress(items: Item[]) {
  const req = items.filter((i) => i.required);
  return { done: req.filter(isDone).length, total: req.length };
}

/** Today's date (YYYY-MM-DD) in local time. */
export const todayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** An item is overdue when it's not done and its due date is before today. */
export const isOverdue = (i: Item, today: string = todayKey()) => !isDone(i) && !!i.due_date && i.due_date < today;
export const overdueCount = (items: Item[], today: string = todayKey()) => items.filter((i) => isOverdue(i, today)).length;
