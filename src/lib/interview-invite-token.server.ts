import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({ interviewId: z.string().uuid(), memberId: z.string().uuid(), expires: z.number().int() });
const secret = () => process.env["CALENDAR_FEED_SECRET"] ?? process.env["EMAIL_UNSUBSCRIBE_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
function signature(payload: string) {
  const key = secret();
  if (!key) throw new Error("No calendar signing secret configured");
  return createHmac("sha256", key).update(`interview-invite|${payload}`).digest("base64url");
}
export function interviewInviteToken(interviewId: string, memberId: string, startsAt: string) {
  const data = payloadSchema.parse({ interviewId, memberId, expires: Date.parse(startsAt) + 7 * 86400e3 });
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readInterviewInviteToken(token: string, now = Date.now()) {
  if (token.length > 700) return null;
  const parts = token.replace(/\.ics$/i, "").split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  const expected = Buffer.from(signature(payload));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = payloadSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return data.expires > now ? data : null;
  } catch { return null; }
}