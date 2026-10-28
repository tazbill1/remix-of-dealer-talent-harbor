// Store setup rules (pure, tested). App-side only: existing stores missing info keep working.
export const DEFAULT_ASSISTANT_NAME = "Penny";
export const DEFAULT_TIMEZONE = "America/Chicago";

export type StoreForm = {
  name: string; brand: string; address: string; city: string; state: string; timezone: string;
  manager_name: string; manager_phone: string; escalation_name: string; escalation_phone: string;
  assistant_name: string;
};
export type StoreErrors = Partial<Record<keyof StoreForm, string>>;

export function isValidUsPhone(v: string): boolean {
  const d = v.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(ten);
}

export function isValidTimeZone(v: string): boolean {
  if (!v.trim()) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: v.trim() }); return true; } catch { return false; }
}

const REQUIRED: [keyof StoreForm, string][] = [
  ["name", "Store name"], ["brand", "Brand"], ["city", "City"], ["state", "State"],
  ["timezone", "Time zone"], ["manager_name", "Store manager name"], ["manager_phone", "Store manager phone"],
];

export function validateStore(f: StoreForm): StoreErrors {
  const e: StoreErrors = {};
  for (const [k, label] of REQUIRED) if (!String(f[k] ?? "").trim()) e[k] = `${label} is required`;
  if (!e.timezone && !isValidTimeZone(f.timezone)) e.timezone = "Enter a valid time zone, such as America/Chicago";
  if (!e.manager_phone && !isValidUsPhone(f.manager_phone)) e.manager_phone = "Enter a valid US phone number";
  if (f.escalation_phone.trim() && !isValidUsPhone(f.escalation_phone)) e.escalation_phone = "Enter a valid US phone number";
  return e;
}

/** Values to save: trims, and fills blank optional fields with their defaults. */
export function storeValues(f: StoreForm) {
  const t = (v: string) => v.trim() || null;
  return {
    name: f.name.trim(), brand: t(f.brand), address: t(f.address), city: t(f.city), state: t(f.state),
    timezone: f.timezone.trim() || DEFAULT_TIMEZONE, manager_name: t(f.manager_name), manager_phone: t(f.manager_phone),
    escalation_name: t(f.escalation_name), escalation_phone: t(f.escalation_phone),
    assistant_name: f.assistant_name.trim() || DEFAULT_ASSISTANT_NAME,
  };
}

type StoreLike = { name?: string | null; brand?: string | null; city?: string | null; state?: string | null; timezone?: string | null; manager_name?: string | null; manager_phone?: string | null };
export function storeMissingInfo(s: StoreLike): boolean {
  return !s.name?.trim() || !s.brand?.trim() || !s.city?.trim() || !s.state?.trim() || !s.timezone?.trim()
    || !s.manager_name?.trim() || !s.manager_phone?.trim() || !isValidUsPhone(s.manager_phone);
}

export function storeToForm(s?: Partial<Record<keyof StoreForm, string | null>>): StoreForm {
  const g = (k: keyof StoreForm, d = "") => (s?.[k] ?? d) as string;
  return {
    name: g("name"), brand: g("brand"), address: g("address"), city: g("city"), state: g("state"),
    timezone: g("timezone", DEFAULT_TIMEZONE), manager_name: g("manager_name"), manager_phone: g("manager_phone"),
    escalation_name: g("escalation_name"), escalation_phone: g("escalation_phone"), assistant_name: g("assistant_name", DEFAULT_ASSISTANT_NAME),
  };
}
