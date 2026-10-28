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
    </section>
  );
}
