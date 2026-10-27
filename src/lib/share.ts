/**
 * Ready-to-paste links for posting a job on free boards. Each link tags its source
 * (?source=linkedin), so applicants land in hireme and Analytics shows which boards
 * bring applicants and hires.
 */
export const BOARDS = [
  { source: "linkedin", label: "LinkedIn", tip: "Post a free job or a feed post and paste the link." },
  { source: "ziprecruiter", label: "ZipRecruiter", tip: "Use the link as the apply URL." },
  { source: "facebook", label: "Facebook", tip: "Share in local job groups or the store's page." },
  { source: "craigslist", label: "Craigslist", tip: "Paste the link in the posting body." },
  { source: "school", label: "Schools & tech programs", tip: "Send to UTI, Lincoln Tech, community colleges." },
  { source: "referral", label: "Employee referral", tip: "Text it to your team to share." },
  { source: "qr", label: "QR code (in store)", tip: "Print it for the service drive or showroom." },
] as const;
export type BoardSource = (typeof BOARDS)[number]["source"];

export function jobLink(origin: string, orgSlug: string, jobId: string, source?: string) {
  const u = new URL(`/c/${encodeURIComponent(orgSlug)}/jobs/${encodeURIComponent(jobId)}`, origin);
  if (source) u.searchParams.set("source", source);
  return u.toString();
}

/** A short post to paste into social media or a board's description field. */
export function postText(a: { title: string; store: string; pay: string | null; link: string }) {
  return [
    `We're hiring: ${a.title} at ${a.store}!`,
    a.pay ? `Pay: ${a.pay}.` : null,
    `Apply in a minute: ${a.link}`,
  ]
    .filter(Boolean)
    .join(" ");
}
