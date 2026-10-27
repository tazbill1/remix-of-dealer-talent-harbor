/**
 * Email basics shared by the app and the server: address checks, merge fields,
 * the footer every email carries, and plain-text → HTML. No secrets here.
 */

export function normalizeEmail(raw: string | null | undefined) {
  const e = raw?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

/** Fields a template can use, e.g. "Hi {first_name}". */
export const MERGE_FIELDS = [
  { key: "first_name", label: "First name" },
  { key: "full_name", label: "Full name" },
  { key: "job_title", label: "Job" },
  { key: "store_name", label: "Store" },
] as const;
export type MergeKey = (typeof MERGE_FIELDS)[number]["key"];
export type MergeValues = Partial<Record<MergeKey, string>>;

export function renderTemplate(text: string, values: MergeValues) {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = values[key as MergeKey];
    return v === undefined ? whole : v;
  });
}

/** Merge fields that a template uses but this app has no value for. */
export function unknownFields(text: string) {
  const known = new Set<string>(MERGE_FIELDS.map((f) => f.key));
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].filter(
    (k) => !known.has(k),
  );
}

export function mergeValues(a: {
  full_name: string;
  job_title?: string | null;
  store_name?: string | null;
}): MergeValues {
  return {
    first_name: a.full_name.trim().split(/\s+/)[0] || "there",
    full_name: a.full_name.trim(),
    job_title: a.job_title ?? "the role",
    store_name: a.store_name ?? "our team",
  };
}

/** Every email ends with who sent it, where they are, and how to stop emails. */
export function emailFooter(a: {
  storeName: string;
  address: string | null;
  unsubscribeUrl: string;
}) {
  return [
    "—",
    `${a.storeName}${a.address ? ` · ${a.address}` : ""}`,
    `Don't want these emails? Unsubscribe: ${a.unsubscribeUrl}`,
  ].join("\n");
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text (as written in the app) to simple, safe HTML. Links become clickable. */
export function textToHtml(text: string) {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) =>
      escape(p)
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
        .replace(/\n/g, "<br>"),
    );
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">${paragraphs
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join("")}</div>`;
}
