/**
 * Automatic texts the dealer group controls: on/off, wording and timing. Wording uses
 * fill-ins like {first}; anything inside [square brackets] is left out when a fill-in
 * in it is blank. Carrier rules are added automatically (program name on manager texts,
 * "Reply STOP" on the first text to a candidate), so edits can't break compliance.
 */
import { withAiDisclosure } from "@/lib/ai-notice";
import { z } from "zod";
import { statusRulesSchema } from "@/lib/status-rules";

export const BRAND = "hireme by WerkandMe";

type Timing = { label: string; default: number; min: number; max: number; unit: "hours before" | "texting hours" };
export type AutomationDef = {
  label: string;
  who: "candidate" | "manager";
  when: string;
  fields: string[];
  text: string;
  canTurnOff: boolean;
  timing?: Timing;
  /** Used when the link can't be made (e.g. invite asks for times instead). */
  noLinkText?: string;
};

export const AUTOMATIONS = {
  welcome: {
    label: "Welcome",
    who: "candidate",
    when: "Right after someone applies",
    fields: ["first", "store", "job", "assistant"],
    text: "Hi {first}! This is {assistant}, the hiring assistant for {store} (hireme by WerkandMe). Thanks for applying for {job}! A few quick questions so we can get you in front of the team. First: how many years of experience do you have? Reply STOP to opt out.",
    canTurnOff: true,
  },
  summary: {
    label: "New candidate summary",
    who: "manager",
    when: "When a candidate finishes screening",
    fields: ["name", "job", "store", "summary", "rating", "assistant"],
    text: "{name} applied for {job} at {store}. {summary}[ Fit: {rating}/5.] Reply 1 to interview, 2 to pass, or text me a question. Reply STOP to opt out.",
    canTurnOff: true,
  },
  nudge: {
    label: "Manager nudge",
    who: "manager",
    when: "If the manager hasn't replied",
    fields: ["name", "job"],
    text: "Friendly reminder, {name} ({job}) is waiting on you. Reply 1 to interview or 2 to pass.",
    canTurnOff: true,
    timing: { label: "Send after", default: 4, min: 1, max: 72, unit: "texting hours" },
  },
  escalation: {
    label: "Escalation",
    who: "manager",
    when: "If the manager still hasn't replied (goes to the escalation contact)",
    fields: ["manager", "name", "job", "hours"],
    text: "Heads up, {manager} hasn't answered about {name} ({job}) in {hours} texting hours. Reply 1 to interview or 2 to pass. Reply STOP to opt out.",
    canTurnOff: true,
    timing: { label: "Send after", default: 24, min: 2, max: 168, unit: "texting hours" },
  },
  invite: {
    label: "Interview invite",
    who: "candidate",
    when: "When the manager replies 1",
    fields: ["first", "store", "job", "link"],
    text: "Great news, {first}! The team at {store} would like to interview you. Pick a time that works for you: {link}",
    noLinkText: "Great news, {first}! The team at {store} would like to interview you. What days and times work best for you this week?",
    canTurnOff: true,
  },
  decline: {
    label: "Not moving forward",
    who: "candidate",
    when: "When the manager replies 2",
    fields: ["first", "job", "store"],
    text: "Hi {first}, thank you for your interest in the {job} role at {store}. We've decided to go another direction for now, but we'd love to keep you in mind for future openings.",
    canTurnOff: true,
  },
  booked: {
    label: "Interview booked (candidate)",
    who: "candidate",
    when: "When the candidate picks a time",
    fields: ["first", "store", "when", "address"],
    text: "You're booked, {first}! Your interview at {store} is {when}.[ Address: {address}.] Reply if you need to change it.",
    canTurnOff: true,
  },
  bookedManager: {
    label: "Interview booked (manager)",
    who: "manager",
    when: "When the candidate picks or changes a time",
    fields: ["name", "when", "job", "change"],
    text: "{name} {change} {when}[ ({job})]. It's on your hireme calendar.",
    canTurnOff: true,
  },
  reminderDay: {
    label: "Interview reminder",
    who: "candidate",
    when: "Before the interview",
    fields: ["first", "when", "store", "address"],
    text: "Hi {first}! Reminder: your interview at {store} is {when}.[ Address: {address}.] Reply if you need to reschedule.",
    canTurnOff: true,
    timing: { label: "Send", default: 24, min: 3, max: 72, unit: "hours before" },
  },
  reminderSoon: {
    label: "Day-of reminder",
    who: "candidate",
    when: "Shortly before the interview",
    fields: ["first", "when", "store"],
    text: "See you soon, {first}! Your interview at {store} is at {when}. Reply if you're running late.",
    canTurnOff: true,
    timing: { label: "Send", default: 2, min: 1, max: 6, unit: "hours before" },
  },
  reminderManager: {
    label: "Interview reminder (manager)",
    who: "manager",
    when: "Shortly before the interview",
    fields: ["name", "job", "when"],
    text: "Reminder, you're interviewing {name} for {job} at {when}.",
    canTurnOff: true,
    timing: { label: "Send", default: 2, min: 1, max: 24, unit: "hours before" },
  },
  offer: {
    label: "Offer letter link",
    who: "candidate",
    when: "When an offer letter is sent",
    fields: ["first", "store", "job", "link"],
    text: "Congrats {first}! {store} is offering you the {job} job. Review and sign your offer here: {link}",
    canTurnOff: true,
  },
  documents: {
    label: "Documents to sign",
    who: "candidate",
    when: "When documents are sent for signature",
    fields: ["first", "store", "documents", "link"],
    text: "{store}: Hi {first}, you have {documents} to review and sign. It takes a few minutes on your phone: {link}",
    canTurnOff: true,
  },
  checkin: {
    label: "New-hire check-in",
    who: "manager",
    when: "Days after a hire starts",
    fields: ["name", "days", "store"],
    text: "Quick {days}-day check-in. Is {name} still on your team at {store}? Reply Y or N. Reply STOP to opt out.",
    canTurnOff: true,
  },
} satisfies Record<string, AutomationDef>;

export type AutomationKey = keyof typeof AUTOMATIONS;
export const AUTOMATION_KEYS = Object.keys(AUTOMATIONS) as AutomationKey[];

/** Friendly descriptions of each fill-in, for the settings screen. */
export const FIELD_HELP: Record<string, string> = {
  first: "candidate's first name",
  name: "candidate's full name",
  store: "store name",
  job: "job title",
  assistant: "the store's assistant name",
  summary: "AI summary of the candidate",
  rating: "fit rating (1-5)",
  manager: "hiring manager's name",
  hours: "hours waited",
  link: "the link (booking, offer or documents)",
  when: "interview day and time",
  address: "store address",
  change: '"booked an interview for" or "moved their interview to"',
  documents: '"a document" or "3 documents"',
  days: "30, 60 or 90",
};

const textSetting = z.object({
  enabled: z.boolean().optional(),
  text: z.string().trim().max(600).optional(),
  hours: z.number().finite().optional(),
});
export const automationsSchema = z.object({
  texts: z.record(z.string(), textSetting).default({}),
  checkinDays: z.array(z.number().int().min(1).max(365)).max(6).optional(),
  booking: z
    .object({
      leadHours: z.number().int().min(1).max(72).optional(),
      daysAhead: z.number().int().min(1).max(30).optional(),
    })
    .optional(),
  assistant: z
    .object({
      tone: z.enum(["upbeat", "friendly", "professional"]).optional(),
      facts: z.string().max(4000).optional(),
      screening: z.string().max(1500).optional(),
      handoff: z.string().max(1500).optional(),
      pauseOnHandoff: z.boolean().optional(),
      instructions: z.string().max(1500).optional(),
    })
    .optional(),
  weeklySummary: z
    .object({
      enabled: z.boolean().optional(),
      day: z.number().int().min(1).max(7).optional(),
      hour: z.number().int().min(0).max(23).optional(),
    })
    .optional(),
  /** Email alert to managers when a candidate replies HUMAN. Off unless turned on. */
  humanAlert: z.object({ email: z.boolean().optional() }).optional(),
  /** Saved from the Status rules page (saveStatusRules), never from Automatic texts. */
  statusRules: statusRulesSchema.optional(),
});
export type Automations = z.infer<typeof automationsSchema>;

export function parseAutomations(raw: unknown): Automations {
  const r = automationsSchema.safeParse(raw ?? {});
  return r.success ? r.data : { texts: {} };
}

export const DEFAULT_CHECKIN_DAYS = [30, 60, 90];
export const checkinDays = (a: Automations) =>
  [...new Set(a.checkinDays?.length ? a.checkinDays : DEFAULT_CHECKIN_DAYS)].sort((x, y) => x - y);
export const bookingLeadHours = (a: Automations) => a.booking?.leadHours ?? 12;
export const bookingDaysAhead = (a: Automations) => a.booking?.daysAhead ?? 7;

export const isOn = (a: Automations, key: AutomationKey) => a.texts[key]?.enabled !== false;

export function hoursFor(a: Automations, key: AutomationKey) {
  const def: AutomationDef = AUTOMATIONS[key];
  if (!def.timing) return 0;
  const h = a.texts[key]?.hours ?? def.timing.default;
  return Math.min(def.timing.max, Math.max(def.timing.min, h));
}

/** Fill in {fields}; drop any [optional part] whose fill-ins are blank. */
export function render(template: string, vars: Record<string, string | number | null | undefined>) {
  const val = (k: string) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v).trim();
  };
  const withOptional = template.replace(/\[([^\]]*)\]/g, (_, inner: string) => {
    const keys = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
    return keys.some((k) => !val(k)) ? "" : inner;
  });
  return withOptional
    .replace(/\{(\w+)\}/g, (_, k: string) => val(k))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

/** Required wording the carriers check, added if an edit removed it. */
export function compliant(key: AutomationKey, body: string) {
  let out = body;
  const def: AutomationDef = AUTOMATIONS[key];
  if (def.who === "manager" && !out.toLowerCase().includes(BRAND.toLowerCase())) out = `${BRAND}: ${out}`;
  if (key === "welcome" && !/\bSTOP\b/i.test(out)) out = `${out} Reply STOP to opt out.`;
  return out;
}

/**
 * The text to send for an automation, or null when the group turned it off.
 * Falls back to the default wording if a custom one needs a fill-in that's blank
 * (e.g. a link couldn't be made).
 */
export function textFor(a: Automations, key: AutomationKey, vars: Record<string, string | number | null | undefined>) {
  if (!isOn(a, key)) return null;
  const def: AutomationDef = AUTOMATIONS[key];
  const custom = a.texts[key]?.text;
  const needsLink = (t: string) => /\{link\}/.test(t) && !vars["link"];
  let template = custom || def.text;
  if (needsLink(template)) template = !needsLink(def.text) ? def.text : (def.noLinkText ?? def.text);
  const out = compliant(key, render(template, vars));
  return key === "welcome" ? withAiDisclosure(out, String(vars["assistant"] ?? ""), String(vars["store"] ?? "")) : out;
}

/**
 * The group's wording for a text a person chose to send (a checkbox or button),
 * so it goes even when the automatic version is turned off.
 */
export function wordingFor(a: Automations, key: AutomationKey, vars: Record<string, string | number | null | undefined>) {
  return textFor({ ...a, texts: { ...a.texts, [key]: { ...a.texts[key], enabled: true } } }, key, vars)!;
}

/** Roughly how many text segments a message uses (160 chars, 70 if it has emoji). */
export function segments(body: string) {
  // eslint-disable-next-line no-control-regex
  const unicode = /[^\x00-\x7F]/.test(body);
  const per = unicode ? 67 : 153;
  return body.length <= (unicode ? 70 : 160) ? 1 : Math.ceil(body.length / per);
}

// ---------------------------------------------------------------------------
// The AI assistant: what it may say, what it asks, and when a person takes over.
// ---------------------------------------------------------------------------

export const TONES = {
  upbeat: { label: "Upbeat", prompt: "Bubbly, warm and super organized, like the HR assistant everyone loves. At most one emoji." },
  friendly: { label: "Friendly", prompt: "Warm, friendly and clear. Only use an emoji if the candidate does." },
  professional: { label: "Professional", prompt: "Polite, concise and professional. No emoji." },
} as const;
export type Tone = keyof typeof TONES;

export const DEFAULT_SCREENING = [
  "Years of experience in this kind of role",
  "Certifications (ASE, manufacturer/OEM)",
  "Availability, including Saturdays",
  "Earliest start date",
  "Pay expectations",
  "Valid driver's license",
].join("\n");

export const DEFAULT_HANDOFF = [
  "Negotiating pay or asking for a specific offer",
  "Anything legal: immigration, visas, background or criminal record, lawsuits",
  "Medical, disability or accommodation questions",
  "Complaints, or the candidate seems upset",
  "Questions the facts below don't answer",
].join("\n");

export function assistantSettings(a: Automations) {
  const x = a.assistant ?? {};
  return {
    tone: (x.tone ?? "upbeat") as Tone,
    facts: x.facts?.trim() ?? "",
    screening: x.screening?.trim() || DEFAULT_SCREENING,
    handoff: x.handoff?.trim() || DEFAULT_HANDOFF,
    pauseOnHandoff: x.pauseOnHandoff !== false,
    instructions: x.instructions?.trim() ?? "",
  };
}

const lines = (s: string) =>
  s
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\s]+/, "").trim())
    .filter(Boolean);

/** The group's rules for the assistant, as instructions for the AI. */
export function assistantRules(a: Automations, party: "candidate" | "manager") {
  const s = assistantSettings(a);
  const out = [`Tone: ${TONES[s.tone].prompt}`];
  if (party === "candidate") {
    out.push(
      `Screening: ask one simple question at a time about these, skipping anything already known:\n${lines(s.screening).map((l) => `- ${l}`).join("\n")}`,
      s.facts
        ? `Facts you may share with candidates (the ONLY source for pay, benefits, schedules and perks; never guess or promise anything beyond them):\n${s.facts}`
        : "No facts about pay, benefits or schedules were provided: never state or guess them; say the hiring team will share details.",
      `Hand off to a person (set handoff_reason, and reply only that someone from the team will follow up) when the candidate brings up:\n${lines(s.handoff).map((l) => `- ${l}`).join("\n")}`,
      "Never ask about or comment on age, race, religion, national origin, disability, pregnancy, marital or family status, or other protected traits. Never promise a job.",
    );
  }
  if (s.instructions) out.push(`Extra instructions from the dealer group: ${s.instructions}`);
  return out.join("\n\n");
}
