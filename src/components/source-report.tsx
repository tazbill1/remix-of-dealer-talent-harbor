import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sourceReport, type SourceRow } from "@/lib/sources";

// Reads the applicant_source_counts view, which runs with the viewer's own access (managers see only their stores).
export function SourceReport({ orgId, stores }: { orgId: string; stores: { id: string; name: string }[] }) {
  const [storeId, setStoreId] = useState("all");
  const { data: rows = [] } = useQuery({
    queryKey: ["source-report", orgId],
    queryFn: async () => ((await supabase.from("applicant_source_counts").select("store_id, source, applicants, hires, org_total").eq("org_id", orgId)).data ?? []) as SourceRow[],
  });
  const report = sourceReport(rows, storeId);
  const { data: scans = [] } = useQuery({
    queryKey: ["scan-report", orgId],
    queryFn: async () => (await supabase.from("applicant_scan_counts").select("kind, event_id, event_name, store_id, applicants, hires").eq("org_id", orgId)).data ?? [],
  });
  const scanRows = (() => {
    const m = new Map<string, { id: string; label: string; applicants: number; hires: number; stores: { id: string; name: string; applicants: number; hires: number }[] }>();
    for (const r of scans) {
      if (storeId !== "all" && r.store_id !== storeId) continue;
      const k = r.kind === "event" ? `e:${r.event_id}` : `s:${r.store_id}`;
      const label = r.kind === "event" ? `Event: ${r.event_name ?? ""}` : `Store QR: ${stores.find((s) => s.id === r.store_id)?.name ?? "Store"}`;
      const x = m.get(k) ?? { id: k, label, applicants: 0, hires: 0, stores: [] };
      if (r.kind === "event" && r.store_id) x.stores.push({ id: r.store_id, name: stores.find((s) => s.id === r.store_id)?.name ?? "Store", applicants: r.applicants ?? 0, hires: r.hires ?? 0 });
      x.applicants += r.applicants ?? 0; x.hires += r.hires ?? 0; m.set(k, x);
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
  })();
  return (
    <section className="rounded-2xl bg-background p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">Source report</h2>
        <select aria-label="Store" className="h-9 rounded-md border bg-background px-2 text-sm" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="all">All stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {report.length === 0 ? <p className="text-sm text-muted-foreground">No applicants yet.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Source</th><th className="py-2 text-right">Applicants</th><th className="py-2 text-right">Hires</th><th className="py-2 text-right">Hire rate</th></tr></thead>
          <tbody>{report.map((r) => (
            <tr key={r.source} className="border-b last:border-0"><td className="py-2">{r.source}</td><td className="py-2 text-right">{r.applicants}</td><td className="py-2 text-right">{r.hires}</td><td className="py-2 text-right">{r.hireRate}%</td></tr>
          ))}</tbody>
        </table>
      )}
      {scanRows.length > 0 && (
        <table className="mt-5 w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Event or store QR code</th><th className="py-2 text-right">Applicants</th><th className="py-2 text-right">Hires</th><th className="py-2 text-right">Hire rate</th></tr></thead>
          <tbody>{scanRows.map((r) => (
            <tr key={r.id} className="border-b last:border-0"><td className="py-2">{r.label}{r.stores.length > 0 && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">By store</summary>{r.stores.map((s) => <div key={s.id}>{s.name}: {s.applicants} applicants · {s.hires} hires</div>)}</details>}</td><td className="py-2 text-right">{r.applicants}</td><td className="py-2 text-right">{r.hires}</td><td className="py-2 text-right">{r.applicants ? Math.round((r.hires / r.applicants) * 100) : 0}%</td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
