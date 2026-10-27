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

export const DIVISIONS = [
  { value: "fixed_ops", label: "Fixed Ops" },
  { value: "variable", label: "Variable Ops" },
  { value: "general", label: "General & Admin" },
] as const;
export const divisionLabel = (v: string | null | undefined) => DIVISIONS.find((d) => d.value === v)?.label ?? "General & Admin";

export const REQ_TYPES = [
  { value: "replacement", label: "Replacement" },
  { value: "growth", label: "Growth" },
] as const;

/** Only Recruiting/HR (group admins + recruiters) may publish job reqs; others submit requests. */
export function canPostJobs(role: string, isPlatformAdmin = false) {
  return isPlatformAdmin || role === "group_admin" || role === "recruiter";
}

/** Starter enterprise job bank shown until a group saves its own templates. */
export const STARTER_TEMPLATES = [
  { title: "Master Certified Technician", department: "Service", division: "fixed_ops", employment_type: "FULL_TIME", pay_period: "HOUR", pay_min: 30, pay_max: 50,
    description: "Diagnose and repair customer and internal vehicles to factory standards.\n\nWhat you'll need:\n- ASE Master and/or factory certification\n- Your own tools\n- Valid driver's license\n\nPay is flat rate with production bonuses." },
  { title: "Service Advisor", department: "Service", division: "fixed_ops", employment_type: "FULL_TIME", pay_period: "YEAR", pay_min: 55000, pay_max: 95000,
    description: "Be the friendly face of our service drive. Write repair orders, explain recommendations and keep customers updated.\n\nWhat you'll need:\n- Great communication and follow-up\n- DMS experience a plus\n- Focus on CSI" },
  { title: "Parts Specialist", department: "Parts", division: "fixed_ops", employment_type: "FULL_TIME", pay_period: "HOUR", pay_min: 18, pay_max: 26,
    description: "Look up, order and sell parts to technicians, wholesale and retail customers.\n\nWhat you'll need:\n- Catalog and inventory skills\n- Counter sales experience a plus" },
  { title: "Sales Consultant", department: "Sales", division: "variable", employment_type: "FULL_TIME", pay_period: "YEAR", pay_min: 50000, pay_max: 120000,
    description: "Help customers find the right vehicle and give them a great buying experience.\n\nWhat you'll need:\n- Friendly, competitive attitude\n- Weekend availability\n- CRM experience a plus\n\nPay is commission plus bonuses." },
  { title: "BDC Representative", department: "BDC", division: "variable", employment_type: "FULL_TIME", pay_period: "HOUR", pay_min: 16, pay_max: 24,
    description: "Respond quickly to internet and phone leads and set appointments for the sales team.\n\nWhat you'll need:\n- Fast, upbeat phone and chat skills\n- Organized follow-up" },
  { title: "F&I Manager", department: "Finance", division: "variable", employment_type: "FULL_TIME", pay_period: "YEAR", pay_min: 120000, pay_max: 250000,
    description: "Structure deals, work lenders and present protection products with full compliance.\n\nWhat you'll need:\n- 2+ years F&I experience\n- Menu selling and compliance know-how\n- Strong lender relationships" },
] as const;
