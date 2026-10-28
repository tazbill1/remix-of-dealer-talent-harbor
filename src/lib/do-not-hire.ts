/** "Do Not Hire" warning: is this person marked Do Not Hire on another application in the group? */
type Row = { id: string; status: string; email?: string | null; phone?: string | null; candidate_id?: string | null };

const keys = (r: Row) => {
  const out: string[] = [];
  if (r.candidate_id) out.push(`c:${r.candidate_id}`);
  const e = r.email?.trim().toLowerCase();
  if (e) out.push(`e:${e}`);
  const p = (r.phone ?? "").replace(/\D/g, "").slice(-10);
  if (p.length === 10) out.push(`p:${p}`);
  return out;
};

/** Ids of applications whose person was marked Do Not Hire on a different application. */
export function doNotHireRepeats(rows: Row[]): Set<string> {
  const flagged = new Map<string, string[]>();
  for (const r of rows) if (r.status === "do_not_hire") for (const k of keys(r)) flagged.set(k, [...(flagged.get(k) ?? []), r.id]);
  const out = new Set<string>();
  for (const r of rows) if (keys(r).some((k) => (flagged.get(k) ?? []).some((id) => id !== r.id))) out.add(r.id);
  return out;
}
