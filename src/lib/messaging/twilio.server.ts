/**
 * Thin Twilio adapter. All texting logic lives in hireme; Twilio only carries messages.
 * Turned on by setting TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN as Lovable secrets.
 */

export function twilioConfigured() {
  return !!process.env["TWILIO_ACCOUNT_SID"] && !!process.env["TWILIO_AUTH_TOKEN"];
}

export async function sendTwilio(input: {
  to: string;
  from: string;
  body: string;
  statusCallback?: string | undefined;
}) {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  if (!sid || !token) throw new Error("Twilio isn't connected yet");
  const form = new URLSearchParams({ To: input.to, From: input.from, Body: input.body });
  if (input.statusCallback) form.set("StatusCallback", input.statusCallback);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as {
    sid?: string;
    message?: string;
    code?: number;
  };
  if (!res.ok || !json.sid) throw new Error(json.message ?? `Twilio error ${res.status}`);
  return { providerMessageId: json.sid };
}

/** Twilio's request signature: HMAC-SHA1 over the URL plus sorted form params, base64. */
export async function twilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
) {
  const { createHmac } = await import("node:crypto");
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export async function verifyTwilioRequest(
  url: string,
  params: Record<string, string>,
  signature: string | null,
) {
  const token = process.env["TWILIO_AUTH_TOKEN"];
  if (!token || !signature) return false;
  const { timingSafeEqual } = await import("node:crypto");
  const expected = Buffer.from(await twilioSignature(url, params, token));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * The public URL Twilio called. Behind Lovable's proxy request.url can differ from what
 * Twilio signed, so PUBLIC_APP_URL (e.g. https://hireme.werkandme.com) wins when set.
 */
export function publicUrl(request: Request) {
  const u = new URL(request.url);
  const base = process.env["PUBLIC_APP_URL"]?.replace(/\/$/, "");
  return base ? `${base}${u.pathname}${u.search}` : u.toString();
}
