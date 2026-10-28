import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Header bell: the signed-in person's own alerts, newest first. */
export function NotificationBell({ userId, orgId }: { userId: string; orgId: string | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const key = ["notifications", userId, orgId];
  const { data = [] } = useQuery({
    queryKey: key,
    enabled: !!orgId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, message, application_id, read_at, created_at")
        .eq("recipient_id", userId)
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });
  const unread = data.filter((n) => !n.read_at).length;
  async function markRead(ids: string[]) {
    if (!ids.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    qc.invalidateQueries({ queryKey: key });
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}>
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-destructive px-1 text-center text-[11px] font-bold leading-5 text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Alerts</span>
          <button className="text-xs text-sapphire underline disabled:opacity-50" disabled={!unread}
            onClick={() => markRead(data.filter((n) => !n.read_at).map((n) => n.id))}>Mark all read</button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {data.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No alerts yet.</p>}
          {data.map((n) => (
            <button key={n.id} className={cn("block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent", !n.read_at && "bg-accent/50 font-medium")}
              onClick={() => {
                void markRead(n.read_at ? [] : [n.id]);
                setOpen(false);
                if (n.application_id) void navigate({ to: "/applicants", search: { applicant: n.application_id, tab: n.type === "status_reminder" ? "overview" : "messages" } });
              }}>
              <div>{n.message}</div>
              <div className="text-xs font-normal text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
