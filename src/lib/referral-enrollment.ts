import Papa from "papaparse";
import { z } from "zod";
import { isValidUsPhone } from "@/lib/store-validation";
import { SITE_URL } from "@/lib/site";

export const employeeSchema = z.object({
  name: z.string().trim().min(2).max(120), store_id: z.string().uuid(),
  role: z.string().trim().min(1).max(120), department: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).default(""), phone: z.string().trim().max(30).default(""),
}).superRefine((r, ctx) => {
  if (!r.email && !r.phone) ctx.addIssue({ code: "custom", message: "Email or phone is required", path: ["email"] });
  if (r.email && !z.string().email().safeParse(r.email).success) ctx.addIssue({ code: "custom", message: "Enter a valid email", path: ["email"] });
  if (r.phone && !isValidUsPhone(r.phone)) ctx.addIssue({ code: "custom", message: "Enter a valid US phone", path: ["phone"] });
});
export type EmployeeInput = z.output<typeof employeeSchema>;
export type ExistingEmployee = { employee_name: string; store_id: string | null; email: string | null; phone: string | null };
export const signupSchema = z.object({ token: z.string().uuid(), first: z.string().trim().min(1).max(60), last: z.string().trim().min(1).max(60), role: z.string().trim().min(1).max(120), email: z.string().trim().max(200), phone: z.string().trim().max(30) }).superRefine((r,ctx) => {
  const parsed = employeeSchema.safeParse({ name: `${r.first} ${r.last}`, store_id: r.token, role: r.role, email: r.email, phone: r.phone });
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
});
const norm = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const phone = (s: string | null) => (s ?? "").replace(/\D/g, "").slice(-10);
export function employeeDuplicate(row: EmployeeInput, existing: ExistingEmployee[]) {
  return existing.some((e) => (e.store_id === row.store_id && norm(e.employee_name) === norm(row.name))
    || (!!row.email && norm(e.email) === norm(row.email)) || (!!row.phone && phone(e.phone) === phone(row.phone)));
}
export type CsvPreviewRow = { row: number; input: EmployeeInput | null; name: string; store: string; status: "ready" | "added" | "duplicate" | "error"; errors: string[] };
export function previewEmployees(csv: string, stores: { id: string; name: string }[], existing: ExistingEmployee[]): CsvPreviewRow[] {
  if (csv.length > 2_000_000) throw new Error("CSV must be under 2 MB.");
  const parsed = Papa.parse<Record<string,string>>(csv, { header: true, skipEmptyLines: "greedy", transformHeader: (s) => s.replace(/^\uFEFF/, "").trim().toLowerCase() });
  if (parsed.data.length > 5000) throw new Error("Upload at most 5,000 employees at a time.");
  if (!["name", "store", "role"].every((h) => parsed.meta.fields?.includes(h))) throw new Error("CSV needs name, store and role columns, plus email or phone.");
  const names=new Set(existing.map(e=>`${e.store_id}|${norm(e.employee_name)}`));
  const emails=new Set(existing.filter(e=>e.email).map(e=>norm(e.email)));
  const phones=new Set(existing.filter(e=>e.phone).map(e=>phone(e.phone)));
  return parsed.data.map((r, i) => {
    const store = stores.filter((s) => norm(s.name) === norm(r["store"] ?? "") || s.id === r["store"]?.trim());
    const result = employeeSchema.safeParse({ name: r["name"] ?? "", store_id: store[0]?.id ?? "", role: r["role"] ?? "", department: r["department"] ?? "", email: r["email"] ?? "", phone: r["phone"] ?? "" });
    const errors = parsed.errors.filter((e) => e.row === i).map((e) => e.message);
    if (store.length !== 1) errors.push("Store must match one store in this group.");
    if (!result.success) errors.push(...result.error.issues.filter((e) => e.path[0] !== "store_id").map((e) => `${e.path[0]}: ${e.message}`));
    if (errors.length || !result.success) return { row: i+2, input: null, name: r["name"] ?? "", store: r["store"] ?? "", status: "error", errors };
    const input=result.data;
    const nameKey=`${input.store_id}|${norm(input.name)}`;
    const duplicate=names.has(nameKey)||(!!input.email&&emails.has(norm(input.email)))||(!!input.phone&&phones.has(phone(input.phone)));
    if (!duplicate) {names.add(nameKey);if(input.email)emails.add(norm(input.email));if(input.phone)phones.add(phone(input.phone));}
    return { row: i+2, input: result.data, name: result.data.name, store: r["store"] ?? "", status: duplicate ? "duplicate" : "ready", errors: [] };
  });
}
export function storeSignupLink(token: string, origin = SITE_URL) { return new URL(`/refer/join/${token}`, origin).toString(); }
export const directorySchema = z.object({ total: z.number(), rows: z.array(z.object({
  id: z.string(), employee_name: z.string(), store_id: z.string().nullable(), department: z.string().nullable(), role_title: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), referral_code: z.string(), active: z.boolean(), referrals: z.number(), hires: z.number(),
})) });