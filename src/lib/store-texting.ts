/** Pure display helpers for store texting (managed by WerkandMe platform admins). */

export function formatPhone(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return input?.trim() ? input.trim() : null;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function textingStatusLine(store: { sms_number: string | null; live: boolean }): string {
  const phone = formatPhone(store.sms_number);
  if (!phone) return "Texting: Not set up yet · Managed by WerkandMe";
  return `Texting: ${phone} · ${store.live ? "Active" : "Practice"} · Managed by WerkandMe`;
}

export const PREVIEW_TEXT = (storeName: string) =>
  `hireme by WerkandMe: test text from ${storeName}'s texting number. No reply needed.`;
