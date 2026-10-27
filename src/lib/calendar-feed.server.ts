/**
 * Signed, unguessable feed tokens: one per team member. Removing someone from the
 * team turns their feed off, because the token points at their membership.
 */
const secret = () =>
  process.env["CALENDAR_FEED_SECRET"] ??
  process.env["EMAIL_UNSUBSCRIBE_SECRET"] ??
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
  "";

async function sign(payload: string) {
  const key = secret();
  if (!key) throw new Error("No signing secret configured");
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", key).update(`calendar|${payload}`).digest("base64url").slice(0, 32);
}

export async function calendarToken(memberId: string) {
  const payload = Buffer.from(memberId, "utf8").toString("base64url");
  return `${payload}.${await sign(payload)}`;
}

export async function readCalendarToken(token: string) {
  const [payload, sig] = token.replace(/\.ics$/i, "").split(".");
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const memberId = Buffer.from(payload, "base64url").toString("utf8");
  return /^[0-9a-f-]{36}$/i.test(memberId) ? memberId : null;
}
