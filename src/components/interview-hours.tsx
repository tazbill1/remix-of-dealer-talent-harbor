import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { DAY_NAMES, parseHours, type InterviewHours } from "@/lib/booking";
import { saveInterviewHours } from "@/lib/booking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** When this store takes interviews; candidates pick from these times. */
export function InterviewHoursCard({
  orgId,
  storeId,
  hours: rawHours,
  minutes: rawMinutes,
  timeZone,
  onSaved,
}: {
  orgId: string;
  storeId: string;
  hours: unknown;
  minutes: number | null;
  timeZone: string;
  onSaved: () => void;
}) {
  const save = useServerFn(saveInterviewHours);
  const [hours, setHours] = useState<InterviewHours>(parseHours(rawHours));
  const [minutes, setMinutes] = useState(rawMinutes || 30);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setHours(parseHours(rawHours));
    setMinutes(rawMinutes || 30);
  }, [rawHours, rawMinutes]);

  return (
    <div className="space-y-3 rounded-2xl bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-5 text-sapphire" />
        <h2 className="text-lg">Interview hours</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        When a manager replies 1, the candidate gets a link to pick one of these times. Times already booked at this
        store are hidden, and nothing is offered within 12 hours. Times are in {timeZone.replace("_", " ")}.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DAY_NAMES.map((d, i) => {
          const on = hours.days.includes(i);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setHours({ ...hours, days: on ? hours.days.filter((x) => x !== i) : [...hours.days, i].sort() })
              }
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                on ? "border-sapphire bg-sapphire text-white" : "bg-background text-muted-foreground",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="time" step={900} value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="time" step={900} value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Each interview</span>
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {[15, 20, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={busy}
          onClick={async () => {
            if (!hours.days.length) return toast.error("Pick at least one day.");
            if (hours.start >= hours.end) return toast.error("End time must be after start time.");
            setBusy(true);
            try {
              await save({ data: { orgId, storeId, hours, minutes } });
              toast.success("Interview hours saved");
              onSaved();
            } catch (e) {
              toast.error((e as Error).message);
            }
            setBusy(false);
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
