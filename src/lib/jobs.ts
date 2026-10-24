export const STATUSES = ["new", "screening", "interview", "offer", "hired", "rejected"] as const;
export type AppStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<AppStatus, string> = {
  new: "New",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Not selected",
};

/** Friendly, applicant-facing wording for each stage. */
export const APPLICANT_STATUS_COPY: Record<AppStatus, string> = {
  new: "We've got your application and our team is reviewing it.",
  screening: "Good news! You're being reviewed by the hiring team.",
  interview: "You're in the interview stage. We'll be in touch with times!",
  offer: "Exciting! An offer is on its way to you.",
  hired: "Welcome to the team! We're so glad you're here.",
  rejected: "We've gone another direction for this role, but we'd love to keep you in mind.",
};

export const ROLE_TEMPLATES = [
  { title: "Sales Consultant", department: "Sales" },
  { title: "Service Technician", department: "Service" },
  { title: "Service Advisor", department: "Service" },
  { title: "Finance Manager", department: "Finance" },
  { title: "Parts Specialist", department: "Parts" },
  { title: "Lot Porter", department: "Operations" },
  { title: "BDC Representative", department: "Sales" },
  { title: "Detailer", department: "Operations" },
];

export function formatPay(min: number | null, max: number | null, period: string) {
  if (!min && !max) return null;
  const f = (n: number) => (period === "HOUR" ? `$${n}` : `$${Math.round(n / 1000)}k`);
  const suffix = period === "HOUR" ? "/hr" : "/yr";
  if (min && max) return `${f(min)} - ${f(max)}${suffix}`;
  return `${f((min || max)!)}${suffix}`;
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}
