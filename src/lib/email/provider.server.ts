/**
 * Email provider (Resend) and signed unsubscribe links. Server only.
 * Nothing here runs in practice mode: the outbox marks practice emails "simulated".
 */
import { textToHtml } from "@/lib/email/core";

export const emailConfigured = () => !!process.env["RESEND_API_KEY"] && !!process.env["EMAIL_FROM"];

export async function sendResend(input: {
  fromName: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  unsubscribeUrl?: string;
}) {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];
  if (!key || !from) throw new Error("Email provider isn't connected yet");
  const safeName = input.fromName.replace(/["<>]/g, "").trim() || "Hiring team";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${safeName} <${from}>`,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: textToHtml(input.text),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.unsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !json.id) throw new Error(json.message ?? `Email provider error (${res.status})`);
  return { providerMessageId: json.id };
}

// ---------------------------------------------------------------------------
// Unsubscribe links: /u/<token>, where the token is signed so it can't be forged.
// ---------------------------------------------------------------------------

const secret = () =>
  process.env["EMAIL_UNSUBSCRIBE_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

async function sign(payload: string) {
  const key = secret();
  if (!key) throw new Error("No signing secret configured");
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", key).update(payload).digest("base64url").slice(0, 32);
}

export async function unsubscribeToken(orgId: string, email: string) {
  const payload = b64url(`${orgId}|${email}`);
  return `${payload}.${await sign(payload)}`;
}

export async function readUnsubscribeToken(token: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [orgId, email] = Buffer.from(payload, "base64url").toString("utf8").split("|");
  return orgId && email ? { orgId, email } : null;
}

export function appBaseUrl(request?: Request) {
  const env = process.env["PUBLIC_APP_URL"]?.replace(/\/$/, "");
  if (env) return env;
  return request ? new URL(request.url).origin : "";
}
