/**
 * BoldSign (e-signature). Turned on by adding the BOLDSIGN_API_KEY secret, plus
 * BOLDSIGN_WEBHOOK_SECRET so signing updates reach hireme.
 */
import { parseSignatureHeader } from "@/lib/offers";

const API = () => (process.env["BOLDSIGN_API_URL"] ?? "https://api.boldsign.com").replace(/\/$/, "");
export const boldsignConfigured = () => !!process.env["BOLDSIGN_API_KEY"];

async function call(path: string, init: RequestInit = {}) {
  const key = process.env["BOLDSIGN_API_KEY"];
  if (!key) throw new Error("BoldSign isn't connected yet. Add the BOLDSIGN_API_KEY secret in Lovable.");
  const res = await fetch(`${API()}${path}`, {
    ...init,
    headers: { "X-API-KEY": key, accept: "application/json", "content-type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error?: string; message?: string; errors?: Record<string, string[]> };
      msg = j.error ?? j.message ?? Object.values(j.errors ?? {}).flat().join(" ") ?? msg;
    } catch {
      /* not JSON */
    }
    if (res.status === 401) msg = "BoldSign rejected the API key. Check BOLDSIGN_API_KEY.";
    throw new Error(`BoldSign: ${msg || res.statusText}`);
  }
  return text ? (JSON.parse(text) as unknown) : null;
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

/** Several templates as one envelope: one link, one signing session. */
export async function sendPacket(a: {
  templateIds: string[];
  title: string;
  message: string;
  signerName: string;
  signerEmail: string;
  fields: { id: string; value: string }[];
}) {
  if (a.templateIds.length === 1) return sendFromTemplate({ ...a, templateId: a.templateIds[0]! });
  const sets = await Promise.all(a.templateIds.map(templateFieldIds));
  const known = sets.every(Boolean) ? new Set(sets.flatMap((x) => [...(x ?? [])])) : null;
  const fields = known ? a.fields.filter((f) => known.has(f.id)) : a.fields;
  const r = (await call(`/v1-beta/template/mergeAndSend`, {
    method: "POST",
    body: JSON.stringify({
      templateIds: a.templateIds,
      title: a.title,
      message: a.message,
      roles: [
        {
          roleIndex: 1,
          signerName: a.signerName,
          signerEmail: a.signerEmail,
          signerType: "Signer",
          ...(fields.length ? { existingFormFields: fields } : {}),
        },
      ],
      reminderSettings: { enableAutoReminder: true, reminderDays: 2, reminderCount: 3 },
    }),
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
