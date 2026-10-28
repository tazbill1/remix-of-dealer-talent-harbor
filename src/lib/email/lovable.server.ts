// Server-only: reads LOVABLE_API_KEY. Never import from client components.
import { EmailAPIError, sendLovableEmail as sendLovableEmailApi } from "@lovable.dev/email-js";

const SITE_NAME = "WerkandMe";
// Verified sender subdomain delegated to Lovable's nameservers. Never the root domain.
const SENDER_DOMAIN = "notify.workwithwerk.com";
const FROM_ADDRESS = `penny@${SENDER_DOMAIN}`;

export interface SendLovableEmailInput {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Renders the plain template: the text split into paragraphs. */
function renderPlainTemplate(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px 0;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  return `<!doctype html>
<html lang="en" dir="ltr">
  <head><meta charset="utf-8" /></head>
  <body style="background-color:#ffffff;font-family:Arial,sans-serif;color:#1d224b;line-height:1.5;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      ${paragraphs}
    </div>
  </body>
</html>`;
}

/**
 * Sends one email through Lovable's app email using the single plain
 * template (the text as paragraphs). Resolves { id } on success and throws
 * on any failure — EmailAPIError exposes .code and .status for branching
 * (e.g. 'recipient_suppressed', 'domain_not_verified', 429 rate limits).
 */
export async function sendLovableEmail({
  to,
  subject,
  text,
  replyTo,
}: SendLovableEmailInput): Promise<{ id: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }
  if (!to) throw new Error("Recipient is required");

  const response = await sendLovableEmailApi(
    {
      to,
      from: { name: SITE_NAME, address: FROM_ADDRESS },
      sender_domain: SENDER_DOMAIN,
      subject,
      html: renderPlainTemplate(text),
      text,
      purpose: "transactional",
      idempotency_key: crypto.randomUUID(),
      ...(replyTo ? { reply_to: replyTo } : {}),
    },
    { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"] },
  );

  // The managed API accepts sends into its own delivery workflow and may return
  // only a workflow_id (status "queued") without a message_id.
  const r = response as { success?: boolean; message_id?: string; workflow_id?: string };
  const id = r.message_id ?? r.workflow_id;
  if (!r.success || !id) {
    throw new EmailAPIError(502, "Email send was not accepted", null, "send_not_accepted");
  }

  return { id };
}
