/**
 * Email sending (Lovable's managed delivery) and signed unsubscribe links. Server only.
 * Nothing here runs in practice mode: the outbox marks practice emails "simulated".
 */
import { sendLovableEmail } from "@lovable.dev/email-js";
import { textToHtml } from "@/lib/email/core";

/** Managed sending runs on Lovable's own API key, which Lovable gives the app. */
export const emailConfigured = () => !!process.env["LOVABLE_API_KEY"];

/**
 * Send one email from the group's verified sending address. Lovable handles delivery,
 * retries, bounces and suppression; the sender domain must be verified first.
 */
export async function sendLovable(input: {
  fromAddress: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  idempotencyKey?: string;
}) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Email sending isn't connected yet");
  const senderDomain = input.fromAddress.split("@")[1] ?? "";
  const res = await sendLovableEmail(
    {
      to: input.to,
      from: {
        name: input.fromName.replace(/["<>]/g, "").trim() || "Hiring team",
        address: input.fromAddress,
      },
      sender_domain: senderDomain,
      subject: input.subject,
      text: input.text,
      html: textToHtml(input.text),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
    },
    { apiKey },
  );
  if (!res.success || !res.message_id) throw new Error("Email sending failed");
  return { providerMessageId: res.message_id };
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
