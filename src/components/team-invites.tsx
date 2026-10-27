import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Mail, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cancelInvite, createInvite } from "@/lib/team.functions";
import { inviteStatus, isScopedRole, roleLabel, ROLES, type Role, type Scope } from "@/lib/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Option = { id: string; name: string };

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Invite link copied");
  } catch {
    toast.message(text);
  }
}

/** Invite someone with a role and the stores/regions they cover, and list open invites. */
export function TeamInvites({
  orgId,
  stores,
  regions,
}: {
  orgId: string;
  stores: Option[];
  regions: Option[];
}) {
  const qc = useQueryClient();
  const invite = useServerFn(createInvite);
  const cancel = useServerFn(cancelInvite);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("hiring_manager");
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{
    email: string;
    link: string;
    note: string | null;
  } | null>(null);

  const key = ["invites", orgId];
  const { data: invites = [] } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (
        await supabase
          .from("org_invites")
          .select("id, email, role, scopes, token, expires_at, accepted_at, revoked_at, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(50)
      ).data ?? [],
  });
  const open = invites.filter((i) => inviteStatus(i) === "open");

  const scoped = isScopedRole(role);
  const label = (s: Scope) =>
    "region_id" in s
      ? `${regions.find((r) => r.id === s.region_id)?.name ?? "Region"} region`
      : (stores.find((d) => d.id === s.dealership_id)?.name ?? "Store");
  function addScope(value: string) {
    if (!value) return;
    const [kind, id = ""] = value.split(":");
    const next: Scope = kind === "r" ? { region_id: id } : { dealership_id: id };
    if (scopes.some((s) => JSON.stringify(s) === JSON.stringify(next))) return;
    setScopes([...scopes, next]);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (scoped && !scopes.length)
      return toast.error("Pick at least one store or region they cover.");
    setBusy(true);
    try {
      const r = await invite({ data: { orgId, email, role, scopes: scoped ? scopes : [] } });
      setLastLink({ email, link: r.link, note: r.emailed ? null : r.emailNote });
      toast.success(r.emailed ? `Invite emailed to ${email}` : "Invite ready: copy the link below");
      setEmail("");
      setScopes([]);
      qc.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  }

  const base = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <section className="space-y-4 rounded-2xl bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2 font-semibold">
        <UserPlus className="size-4 text-sapphire" />
        Invite someone
      </div>
      <form onSubmit={send} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
          <Input
            type="email"
            required
            placeholder="Work email (e.g. dana@grandrapidsford.com)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            aria-label="Role"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r.v} value={r.v}>
                {r.l}
              </option>
            ))}
          </select>
        </div>
        {scoped ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Covers:</span>
            {scopes.map((s) => (
              <span
                key={JSON.stringify(s)}
                className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
              >
                {label(s)}
                <button
                  type="button"
                  aria-label={`Remove ${label(s)}`}
                  onClick={() => setScopes(scopes.filter((x) => x !== s))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <select
              aria-label="Add a store or region"
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value=""
              onChange={(e) => addScope(e.target.value)}
            >
              <option value="">+ Add region or store</option>
              {regions.length > 0 && (
                <optgroup label="Regions">
                  {regions.map((r) => (
                    <option key={r.id} value={`r:${r.id}`}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Stores">
                {stores.map((d) => (
                  <option key={d.id} value={`s:${d.id}`}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            </select>
            {!scopes.length && (
              <span className="text-xs text-destructive">Required for this role</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {roleLabel(role)} sees every store in the group.
          </p>
        )}
        <Button type="submit" disabled={busy}>
          <Mail />
          {busy ? "Sending…" : "Send invite"}
        </Button>
      </form>

      {lastLink && (
        <div className="space-y-1 rounded-xl bg-accent p-3 text-sm">
          <div className="font-medium">Invite link for {lastLink.email}</div>
          {lastLink.note && <div className="text-xs text-muted-foreground">{lastLink.note}</div>}
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-xs">{lastLink.link}</code>
            <Button size="sm" variant="outline" type="button" onClick={() => copy(lastLink.link)}>
              <Copy />
              Copy
            </Button>
          </div>
        </div>
      )}

      {open.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Waiting to join</div>
          {open.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{i.email}</span>{" "}
                <span className="text-muted-foreground">
                  · {roleLabel(i.role)} · expires {new Date(i.expires_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => copy(`${base}/invite/${i.token}`)}
                >
                  <Copy />
                  Copy link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={async () => {
                    await cancel({ data: { orgId, inviteId: i.id } });
                    qc.invalidateQueries({ queryKey: key });
                  }}
                >
                  <X />
                  Cancel
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
