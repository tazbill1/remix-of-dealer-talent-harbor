import { isClosed } from "@/lib/jobs";
/**
 * Offer letters signed through BoldSign. The dealer group's own letter lives in
 * BoldSign as a template; hireme fills in the candidate's details, texts them a
 * signing link, and tracks the status on the profile.
 */
import { z } from "zod";

export const OFFER_STATUSES = ["sent", "viewed", "signed", "declined", "revoked", "expired", "failed"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_LABEL: Record<OfferStatus, string> = {
  sent: "Sent, waiting to sign",
  viewed: "Opened, not signed yet",
  signed: "Signed",
  declined: "Declined",
  revoked: "Cancelled",
  expired: "Expired",
  failed: "Couldn't be delivered",
};

/** Offers still waiting on the candidate (only one open offer per applicant). */
export const isOpen = (s: string) => s === "sent" || s === "viewed";

/**
 * Text fields hireme fills in on the BoldSign template. Give the template's fields
 * these IDs (any you leave out are skipped).
 */
export const OFFER_FIELDS = [
  { id: "candidate_name", label: "Candidate name" },
  { id: "job_title", label: "Job title" },
  { id: "store_name", label: "Store" },
  { id: "pay", label: "Pay" },
  { id: "start_date", label: "Start date" },
  { id: "manager_name", label: "Manager" },
] as const;

export const offerInput = z.object({
  orgId: z.string().uuid(),
  applicationId: z.string().uuid(),
  jobTitle: z.string().trim().min(2).max(120),
  pay: z.string().trim().max(120).optional().default(""),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  note: z.string().trim().max(500).optional().default(""),
  textLink: z.boolean().default(true),
});
export type OfferInput = z.input<typeof offerInput>;

export const templateIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,80}$/, "That doesn't look like a BoldSign template ID.");

export function prettyDate(iso: string | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function prefillFields(v: {
  candidateName: string;
  jobTitle: string;
  storeName: string;
  pay: string;
  startDate?: string | undefined;
  managerName: string | null;
}) {
  const values: Record<string, string> = {
    candidate_name: v.candidateName,
    job_title: v.jobTitle,
    store_name: v.storeName,
    pay: v.pay,
    start_date: prettyDate(v.startDate),
    manager_name: v.managerName ?? "",
  };
  return Object.entries(values)
    .filter(([, value]) => value)
    .map(([id, value]) => ({ id, value }));
}

/** What a BoldSign webhook event means for the offer (null = nothing to change). */
export function statusFromEvent(eventType: string): OfferStatus | null {
  switch (eventType) {
    case "Sent":
      return "sent";
    case "Viewed":
      return "viewed";
    case "Completed":
      return "signed";
    case "Declined":
      return "declined";
    case "Revoked":
      return "revoked";
    case "Expired":
      return "expired";
    case "SendFailed":
    case "DeliveryFailed":
      return "failed";
    default:
      return null;
  }
}

/** Later states win; a signed offer never goes back to "viewed". */
const RANK: Record<OfferStatus, number> = {
  sent: 0,
  viewed: 1,
  failed: 2,
  signed: 3,
  declined: 3,
  revoked: 3,
  expired: 3,
};
export const shouldMove = (from: string, to: OfferStatus) =>
  (RANK[from as OfferStatus] ?? -1) < RANK[to];

export function offerText(a: { first: string; store: string; title: string; link: string }) {
  return `Congrats ${a.first}! ${a.store} is offering you the ${a.title} job. Review and sign your offer here: ${a.link}`;
}

/** Parse "t=123, s0=abc, s1=def" from the X-BoldSign-Signature header. */
export function parseSignatureHeader(header: string | null) {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const t = Number(parts["t"]);
  const sigs = [parts["s0"], parts["s1"]].filter((s): s is string => !!s);
  return Number.isFinite(t) && sigs.length ? { t, sigs } : null;
}

/**
 * Fill-in boxes hireme fills on any BoldSign template. Either naming style works
 * (ApplicantName or candidate_name); boxes the template doesn't have are skipped.
 */
export const DOC_FIELDS = [
  { id: "ApplicantName", alt: "candidate_name", label: "Applicant name" },
  { id: "JobTitle", alt: "job_title", label: "Job title" },
  { id: "Store", alt: "store_name", label: "Store" },
  { id: "Pay", alt: "pay", label: "Pay" },
  { id: "StartDate", alt: "start_date", label: "Start date" },
  { id: "Manager", alt: "manager_name", label: "Manager" },
] as const;

export function documentFields(v: Parameters<typeof prefillFields>[0]) {
  const byAlt = new Map(prefillFields(v).map((f) => [f.id, f.value]));
  return DOC_FIELDS.flatMap((f) => {
    const value = byAlt.get(f.alt);
    return value ? [{ id: f.id, value }, { id: f.alt, value }] : [];
  });
}

export const sendDocsInput = z.object({
  orgId: z.string().uuid(),
  applicationId: z.string().uuid(),
  templates: z
    .array(z.object({ id: templateIdSchema, name: z.string().trim().min(1).max(200) }))
    .min(1, "Pick at least one document.")
    .max(10),
  jobTitle: z.string().trim().min(2).max(120),
  pay: z.string().trim().max(120).optional().default(""),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  note: z.string().trim().max(500).optional().default(""),
  textLink: z.boolean().default(true),
});

export function docsText(a: { first: string; store: string; count: number; link: string }) {
  return `${a.store}: Hi ${a.first}, you have ${a.count === 1 ? "a document" : `${a.count} documents`} to review and sign. It takes a few minutes on your phone: ${a.link}`;
}

/** Whether a signed document should move the applicant to Hired. */
export const hireOnSign = (a: { status: OfferStatus; isOfferLetter: boolean; setting: boolean; appStatus: string }) =>
  a.status === "signed" && a.isOfferLetter && a.setting && !isClosed(a.appStatus);
