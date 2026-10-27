/** Signed links to an offer (/api/public/offer/<token>), safe to text to the candidate. */
const secret = () =>
  process.env["OFFER_LINK_SECRET"] ??
  process.env["EMAIL_UNSUBSCRIBE_SECRET"] ??
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
  "";

async function sign(payload: string, kind = "offer") {
  const key = secret();
  if (!key) throw new Error("No signing secret configured");
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", key).update(`${kind}|${payload}`).digest("base64url").slice(0, 24);
}

async function idToken(id: string, kind: string) {
  const payload = Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url");
  return `${payload}.${await sign(payload, kind)}`;
}

export const offerToken = (offerId: string) => idToken(offerId, "offer");
/** One link per applicant to the page listing everything they still need to sign. */
export const docsToken = (applicationId: string) => idToken(applicationId, "docs");
export const readOfferToken = (token: string) => readIdToken(token, "offer");
/** The candidate's link to pick an interview time. */
export const bookToken = (applicationId: string) => idToken(applicationId, "book");
export const readBookToken = (token: string) => readIdToken(token, "book");
export const readDocsToken = (token: string) => readIdToken(token, "docs");

async function readIdToken(token: string, kind: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await sign(payload, kind);
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const hex = Buffer.from(payload, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
