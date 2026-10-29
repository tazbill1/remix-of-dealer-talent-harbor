import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canSeeNav } from "@/lib/nav";
import { RouteSpinner } from "@/components/route-spinner";

export const Route = createFileRoute("/_authenticated/sent-messages")({
  head: () => ({ meta: [
    { title: "Sent messages | hireme by WerkandMe" },
    { name: "description", content: "Bulk message history for your assigned stores." },
    { property: "og:title", content: "Sent messages | hireme by WerkandMe" },
    { property: "og:description", content: "Bulk message history for your assigned stores." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SentMessages,
  errorComponent: () => <p role="alert">Could not load sent messages. Please try again.</p>,
});

function SentMessages() {
  const org = useOrg();
  if (!canSeeNav("/sent-messages", org)) return <p>Sent messages are not available for your role.</p>;
  return <div className="space-y-5"><h1 className="text-3xl">Sent messages</h1><Suspense fallback={<RouteSpinner />}><History orgId={org.orgId} /></Suspense></div>;
}
function History({ orgId }: { orgId: string }) {
  const { data } = useSuspenseQuery({ queryKey: ["bulk-history", orgId], queryFn: async () => {
    const [sends, members, stores] = await Promise.all([
      supabase.from("bulk_sends").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("org_members").select("user_id, email").eq("org_id", orgId),
      supabase.from("dealerships").select("id, name").eq("org_id", orgId),
    ]);
    if (sends.error || stores.error) throw new Error("Could not load sent messages.");
    return { sends: sends.data ?? [], members: members.data ?? [], stores: stores.data ?? [] };
  } });
  if (!data.sends.length) return <p className="text-muted-foreground">No sent messages yet.</p>;
  const senders = new Map(data.members.map((m) => [m.user_id, m.email]));
  const stores = new Map(data.stores.map((s) => [s.id, s.name]));
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="border-b text-muted-foreground"><tr>{["Date", "Sender", "Store", "Channel", "Subject", "Sent", "Skipped", "Queued"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}</tr></thead>
    <tbody>{data.sends.map((s) => <tr key={s.id} className="border-b">
      <td className="whitespace-nowrap px-3 py-3">{new Date(s.sent_at ?? s.created_at).toLocaleString()}</td>
      <td className="px-3 py-3">{senders.get(s.sender_id) ?? `Staff (${s.sender_id.slice(0, 8)})`}</td>
      <td className="px-3 py-3">{stores.get(s.store_id) ?? "Store"}</td>
      <td className="whitespace-nowrap px-3 py-3">{s.channel === "both" ? `Email${s.email_demo ? " (demo)" : ""} + Text${s.text_demo ? " (demo)" : ""}` : `${s.channel === "email" ? "Email" : "Text"}${s.is_demo ? " (demo)" : ""}`}</td>
      <td className="max-w-xs break-words px-3 py-3">{s.subject || "—"}</td>
      <td className="px-3 py-3">{s.sent_count}</td><td className="px-3 py-3">{s.skipped_count}</td><td className="px-3 py-3">{s.queued_count}</td>
    </tr>)}</tbody>
  </table></div>;
}