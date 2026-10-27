/**
 * BoldSign (e-signature). Uses the linked BoldSign connection (through Lovable's
 * connector gateway); a raw BOLDSIGN_API_KEY secret still works as a fallback.
 * BOLDSIGN_WEBHOOK_SECRET lets signing updates reach hireme.
 */
import { parseSignatureHeader } from "@/lib/offers";

const GATEWAY = "https://connector-gateway.lovable.dev/udc_boldsign";
export const boldsignConfigured = () =>
  !!(process.env["UDC_BOLDSIGN_API_KEY"] && process.env["LOVABLE_API_KEY"]) || !!process.env["BOLDSIGN_API_KEY"];

function target(): { base: string; headers: Record<string, string> } {
  const conn = process.env["UDC_BOLDSIGN_API_KEY"];
  const lovable = process.env["LOVABLE_API_KEY"];
  if (conn && lovable) return { base: GATEWAY, headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": conn } };
  const key = process.env["BOLDSIGN_API_KEY"];
  if (key)
    return {
      base: (process.env["BOLDSIGN_API_URL"] ?? "https://api.boldsign.com").replace(/\/$/, ""),
      headers: { "X-API-KEY": key },
    };
  throw new Error("BoldSign isn't connected yet.");
}

async function raw(path: string, init: RequestInit = {}) {
  const t = target();
  const res = await fetch(`${t.base}${path}`, {
    ...init,
    headers: { ...t.headers, accept: "application/json", "content-type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`BoldSign request failed [${res.status}]: ${text.slice(0, 500)}`);
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error?: string; message?: string; errors?: Record<string, string[]> };
      msg = j.error ?? j.message ?? Object.values(j.errors ?? {}).flat().join(" ") ?? msg;
    } catch {
      /* not JSON */
    }
    if (res.status === 401) msg = "BoldSign rejected the connection. Reconnect BoldSign.";
    throw new Error(`BoldSign [${res.status}]: ${msg || res.statusText}`);
  }
  return res;
}

async function call(path: string, init: RequestInit = {}) {
  const text = await (await raw(path, init)).text();
  return text ? (JSON.parse(text) as unknown) : null;
}

export type BoldTemplate = { id: string; name: string; description: string | null; updatedAt: string | null };

/** All templates in the BoldSign account (newest activity first). */
export async function listTemplates(): Promise<BoldTemplate[]> {
  const out: BoldTemplate[] = [];
  for (let page = 1; page <= 5; page++) {
    const r = (await call(`/v1/template/list?PageSize=100&Page=${page}`)) as {
      result?: { documentId?: string; templateId?: string; messageTitle?: string; templateName?: string; templateDescription?: string; activityDate?: string | number }[];
      pageDetails?: { totalPages?: number };
    } | null;
    for (const t of r?.result ?? []) {
      const id = t.documentId ?? t.templateId;
      if (!id) continue;
      out.push({
        id,
        name: t.templateName ?? t.messageTitle ?? "Untitled template",
        description: t.templateDescription ?? null,
        updatedAt: t.activityDate ? new Date(typeof t.activityDate === "number" ? t.activityDate * 1000 : t.activityDate).toISOString() : null,
      });
    }
    if (page >= (r?.pageDetails?.totalPages ?? 1)) break;
  }
  return out;
}

/** The signed PDF. */
export async function downloadDocument(documentId: string) {
  const res = await raw(`/v1/document/download?documentId=${encodeURIComponent(documentId)}`, {
    headers: { accept: "application/pdf" },
  });
  return new Uint8Array(await res.arrayBuffer());
}

/** The field IDs on a template, so hireme only fills fields that exist. Null if unknown. */
export async function templateFieldIds(templateId: string): Promise<Set<string> | null> {
  try {
    const r = (await call(`/v1/template/properties?templateId=${encodeURIComponent(templateId)}`)) as {
      roles?: { formFields?: { id?: string }[] }[];
      formFields?: { id?: string }[];
    } | null;
    const ids = [...(r?.formFields ?? []), ...(r?.roles ?? []).flatMap((x) => x.formFields ?? [])]
      .map((f) => f.id)
      .filter((id): id is string => !!id);
    return ids.length ? new Set(ids) : null;
  } catch {
    return null;
  }
}

export async function sendFromTemplate(a: {
  templateId: string;
  title: string;
  message: string;
  signerName: string;
  signerEmail: string;
  fields: { id: string; value: string }[];
}) {
  const known = await templateFieldIds(a.templateId);
  const fields = known ? a.fields.filter((f) => known.has(f.id)) : a.fields;
  const body = {
    title: a.title,
    message: a.message,
    roles: [
      {
        roleIndex: 1,
        signerName: a.signerName,
        signerEmail: a.signerEmail,
        ...(fields.length ? { existingFormFields: fields } : {}),
      },
    ],
    reminderSettings: { enableAutoReminder: true, reminderDays: 2, reminderCount: 3 },
  };
  const r = (await call(`/v1/template/send?templateId=${encodeURIComponent(a.templateId)}`, {
    method: "POST",
    body: JSON.stringify(body),
  })) as { documentId?: string } | null;
  if (!r?.documentId) throw new Error("BoldSign didn't return a document ID.");
  return r.documentId;
}

/** A fresh signing link (BoldSign's links expire, so this is fetched when tapped). */
export async function embeddedSignLink(documentId: string, signerEmail: string, redirectUrl: string) {
  const q = new URLSearchParams({
    documentId,
    signerEmail,
    redirectUrl,
    signLinkValidTill: new Date(Date.now() + 2 * 3600e3).toISOString(),
  });
  const r = (await call(`/v1/document/getEmbeddedSignLink?${q}`)) as { signLink?: string } | null;
  if (!r?.signLink) throw new Error("BoldSign didn't return a signing link.");
  return r.signLink;
}

export async function revokeDocument(documentId: string, message: string) {
  await call(`/v1/document/revoke?documentId=${encodeURIComponent(documentId)}`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/** Checks the X-BoldSign-Signature header against the raw body (5-minute window). */
export async function verifyWebhook(rawBody: string, header: string | null, now = Date.now()) {
  const secret = process.env["BOLDSIGN_WEBHOOK_SECRET"];
  if (!secret) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(now / 1000 - parsed.t) > 300) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret).update(`${parsed.t}.${rawBody}`, "utf8").digest("hex");
  return parsed.sigs.some(
    (s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)),
  );
}
