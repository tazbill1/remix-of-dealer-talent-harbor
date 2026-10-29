/** Short, plain-English delivery status shown under each outgoing text. */
export function deliveryLabel(
  m: { direction: string; status: string; scheduled_for: string | null; error: string | null },
  now = Date.now(),
  timeZone?: string,
) {
  if (m.direction !== "out") return null;
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
  switch (m.status) {
    case "queued":
      return m.scheduled_for && Date.parse(m.scheduled_for) > now
        ? `Held until ${when(m.scheduled_for)}`
        : "Sending…";
    case "sending":
      return "Sending…";
    case "simulated":
      return m.error ? `Sent (demo) · ${m.error}` : "Sent (demo)";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "failed":
      return `Failed${m.error ? `: ${m.error}` : ""}`;
    case "blocked":
      return `Not sent: ${m.error ?? "blocked"}`;
    default:
      return null; // "logged": texts from before delivery tracking
  }
}
