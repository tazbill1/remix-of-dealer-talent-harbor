import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkinSchedule, departureFromCheckin, ymd } from "@/lib/retention";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const show = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString();

type Props = {
  orgId: string;
  appId: string;
  name: string;
  startDate: string | null;
  hiredAt: string | null;
  departedAt: string | null;
  canRecord: boolean;
  onDeparted: (date: string) => void;
};

export function RetentionCheckins({
  orgId,
  appId,
  name,
  startDate,
  hiredAt,
  departedAt,
  canRecord,
  onDeparted,
}: Props) {
  const qc = useQueryClient();
  const key = ["checkins", appId];
  const { data: rows = [] } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await supabase.from("retention_checkins").select("*").eq("application_id", appId)).data ??
      [],
  });
  const schedule = checkinSchedule(startDate, hiredAt);
  if (!schedule.length) return null;
  const today = ymd(Date.now());

  async function record(mark: number, due: string, stillEmployed: boolean) {
    const existing = rows.find((r) => r.day_mark === mark);
    const patch = {
      still_employed: stillEmployed,
      responded_at: new Date().toISOString(),
      response: "Recorded by HR",
    };
    const { error } = existing
      ? await supabase.from("retention_checkins").update(patch).eq("id", existing.id)
      : await supabase
          .from("retention_checkins")
          .insert({ org_id: orgId, application_id: appId, day_mark: mark, due_on: due, ...patch });
    if (error) return toast.error(error.message);
    if (!stillEmployed && !departedAt) {
      onDeparted(departureFromCheckin(due, today));
      toast.success(`Recorded that ${name} left before the ${mark}-day mark.`);
    } else toast.success(`${mark}-day check-in recorded.`);
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">30/60/90 check-ins</div>
      {schedule.map(({ mark, due }) => {
        const row = rows.find((r) => r.day_mark === mark);
        const leftBefore = departedAt !== null && departedAt < due;
        const isDue = due <= today;
        return (
          <div
            key={mark}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm"
          >
            <span>
              <b>{mark}-day</b> <span className="text-muted-foreground">· {show(due)}</span>
            </span>
            {row?.still_employed === true ? (
              <span className="flex items-center gap-1 text-xs font-semibold">
                <Check className="size-3.5 text-lime" />
                Still on the team
              </span>
            ) : row?.still_employed === false || leftBefore ? (
              <span className="text-xs font-semibold text-destructive">Left before this mark</span>
            ) : isDue && canRecord ? (
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => record(mark, due, true)}
                >
                  <Check />
                  Still here
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => record(mark, due, false)}
                >
                  <X />
                  Left
                </Button>
              </span>
            ) : (
              <span className={cn("text-xs", isDue ? "font-semibold" : "text-muted-foreground")}>
                {isDue ? "Due" : "Upcoming"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
