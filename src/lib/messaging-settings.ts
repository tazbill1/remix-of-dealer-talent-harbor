import { z } from "zod";

export const messagingSettingsSchema = z.object({
  mode: z.enum(["practice", "live"]).default("practice"),
  send_start: z.string().default("08:00"),
  send_end: z.string().default("18:00"),
  send_days: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5, 6]),
  nudge_after_hours: z.number().int().min(1).max(168).default(4),
  escalate_after_hours: z.number().int().min(1).max(336).default(24),
  ai_provider: z.enum(["lovable", "anthropic"]).default("lovable"),
});
export type MessagingSettings = z.infer<typeof messagingSettingsSchema>;
export const defaultMessagingSettings = () => messagingSettingsSchema.parse({});