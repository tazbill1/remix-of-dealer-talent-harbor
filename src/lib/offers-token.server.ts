/** Signed links to an offer (/api/public/offer/<token>), safe to text to the candidate. */
const secret = () =>
  process.env["OFFER_LINK_SECRET"] ??
  process.env["EMAIL_UNSUBSCRIBE_SECRET"] ??
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
  "";

async function sign(payload: string) {
  const key = secret();
  if (!key) throw new Error("No signing secret configured");
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", key).update(`offer|${payload}`).digest("base64url").slice(0, 24);
}

export async function offerToken(offerId: string) {
  const payload = Buffer.from(offerId.replace(/-/g, ""), "hex").toString("base64url");
  return `${payload}.${await sign(payload)}`;
}

export async function readOfferToken(token: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const hex = Buffer.from(payload, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
