import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarCheck, Clock, MapPin } from "lucide-react";
import { bookInterview, getBooking } from "@/lib/booking.functions";
import { dayLabel, slotLabel, timeLabel } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book/$token")({
  loader: ({ params }) => getBooking({ data: { token: params.token } }),
  head: () => ({ meta: [{ title: "Pick your interview time" }, { name: "robots", content: "noindex" }] }),
  component: BookPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-secondary/40 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <Logo />
        <div className="space-y-4 rounded-2xl bg-background p-5 shadow-sm">{children}</div>
      </div>
    </div>
  );
}

function BookPage() {
  const data = Route.useLoaderData();
  const { token } = Route.useParams();
  const book = bookInterview;
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ when: string } | null>(null);
  const [changing, setChanging] = useState(false);

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of data?.slots ?? []) {
      const k = dayLabel(Date.parse(s), data!.timeZone);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [data]);
  const [day, setDay] = useState(0);

  if (!data)
    return (
      <Shell>
        <h1 className="text-xl font-bold">Link not found</h1>
        <p className="text-sm text-muted-foreground">This booking link isn't valid. Check the text from the dealership.</p>
      </Shell>
    );
  if (data.closed)
    return (
      <Shell>
        <h1 className="text-xl font-bold">This request is closed</h1>
        <p className="text-sm text-muted-foreground">Please reach out to {data.store} with any questions.</p>
      </Shell>
    );
  if (done)
    return (
      <Shell>
        <CalendarCheck className="size-8 text-sapphire" />
        <h1 className="text-xl font-bold">You're booked, {data.first}!</h1>
        <p>
          Your interview at <b>{data.store}</b> is <b>{done.when}</b>.
        </p>
        {data.address && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {data.address}
          </p>
        )}
        <p className="text-sm text-muted-foreground">We'll text you a reminder. Need to change it? Open this link again.</p>
      </Shell>
    );

  const tz = data.timeZone;
  if (data.upcoming && !changing)
    return (
      <Shell>
        <h1 className="text-xl font-bold">Hi {data.first}, you're all set</h1>
        <p>
          Your interview at <b>{data.store}</b> is <b>{slotLabel(Date.parse(data.upcoming), tz)}</b>.
        </p>
        {data.address && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {data.address}
          </p>
        )}
        <Button variant="outline" className="w-full" onClick={() => setChanging(true)}>
          Pick a different time
        </Button>
      </Shell>
    );

  const times = byDay[day]?.[1] ?? [];
  return (
    <Shell>
      <div>
        <h1 className="text-xl font-bold">Hi {data.first}! Pick your interview time</h1>
        <p className="text-sm text-muted-foreground">
          {data.job ? `${data.job} at ` : ""}
          {data.store}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" />
          {data.minutes} minutes
        </span>
        {data.address && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" />
            {data.address}
          </span>
        )}
      </div>

      {byDay.length === 0 ? (
        <p className="rounded-xl bg-secondary p-4 text-sm">
          No open times this week. Reply to the text with days and times that work for you and the team will set it up.
        </p>
      ) : (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {byDay.map(([label], i) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setDay(i);
                  setPicked(null);
                }}
                className={cn(
                  "shrink-0 rounded-xl border px-3 py-2 text-sm font-medium",
                  i === day ? "border-sapphire bg-sapphire text-white" : "bg-background",
                )}
              >
                {label.split(",")[0]}
                <div className="text-xs font-normal opacity-80">{label.split(", ")[1]}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {times.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPicked(s)}
                className={cn(
                  "rounded-xl border py-3 text-sm font-medium",
                  picked === s ? "border-sapphire bg-sapphire/10 text-sapphire" : "bg-background",
                )}
              >
                {timeLabel(Date.parse(s), tz)}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            size="lg"
            disabled={!picked || busy}
            onClick={async () => {
              if (!picked) return;
              setBusy(true);
              setError(null);
              try {
                setDone(await book({ data: { token, startsAt: picked } }));
              } catch (e) {
                setError((e as Error).message);
                setPicked(null);
                router.invalidate();
              }
              setBusy(false);
            }}
          >
            {busy ? "Booking…" : picked ? `Book ${slotLabel(Date.parse(picked), tz)}` : "Pick a time"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Times shown in the store's local time.</p>
        </>
      )}
    </Shell>
  );
}
