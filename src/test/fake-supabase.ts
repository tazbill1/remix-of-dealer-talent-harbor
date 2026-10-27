/**
 * Tiny in-memory stand-in for the Supabase query builder, enough to exercise the
 * outbox end to end in tests. Supports the filters the messaging code uses.
 */
type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

export function fakeSupabase(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]),
  );
  let n = 0;
  const id = () => `id-${++n}`;

  function from(table: string) {
    tables[table] ??= [];
    const rows = () => tables[table]!;
    const filters: Filter[] = [];
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let conflict: string[] = [];
    let order: { col: string; asc: boolean } | null = null;
    let limit = Infinity;
    let returning = false;

    const run = () => {
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({
          id: id(),
          created_at: new Date().toISOString(),
          ...r,
        }));
        rows().push(...list);
        return list;
      }
      if (op === "upsert") {
        const r = payload as Row;
        const hit = rows().find((x) => conflict.every((c) => x[c] === r[c]));
        if (hit) Object.assign(hit, r);
        else rows().push({ id: id(), ...r });
        return [hit ?? r];
      }
      let matched = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        matched.forEach((r) => Object.assign(r, payload));
        return matched;
      }
      if (op === "delete") {
        tables[table] = rows().filter((r) => !matched.includes(r));
        return matched;
      }
      if (order) {
        const { col, asc } = order;
        matched = [...matched].sort((a, b) => (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1));
      }
      return matched.slice(0, limit);
    };
    const result = (single: "one" | "maybe" | null) => {
      const data = run();
      if (op !== "select" && !returning && !single) return { data: null, error: null };
      if (single === "one")
        return data[0]
          ? { data: data[0], error: null }
          : { data: null, error: { message: "not found" } };
      if (single === "maybe") return { data: data[0] ?? null, error: null };
      return { data, error: null };
    };
    const q: any = {
      select: () => ((returning = op !== "select"), q),
      insert: (p: any) => ((op = "insert"), (payload = p), q),
      update: (p: any) => ((op = "update"), (payload = p), q),
      upsert: (p: any, o?: { onConflict?: string }) => (
        (op = "upsert"),
        (payload = p),
        (conflict = (o?.onConflict ?? "id").split(",")),
        q
      ),
      delete: () => ((op = "delete"), q),
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
      in: (c: string, v: any[]) => (filters.push((r) => v.includes(r[c])), q),
      lte: (c: string, v: any) => (filters.push((r) => r[c] != null && r[c] <= v), q),
      gte: (c: string, v: any) => (filters.push((r) => r[c] != null && r[c] >= v), q),
      range: (a: number, b: number) => ((limit = b - a + 1), q),
      is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), q),
      not: (c: string, _op: string, v: any) => (filters.push((r) => r[c] !== v && r[c] != null), q),
      order: (col: string, o?: { ascending?: boolean }) => (
        (order = { col, asc: o?.ascending !== false }),
        q
      ),
      limit: (k: number) => ((limit = k), q),
      single: () => Promise.resolve(result("one")),
      maybeSingle: () => Promise.resolve(result("maybe")),
      then: (res: any, rej: any) => Promise.resolve(result(null)).then(res, rej),
    };
    return q;
  }
  return { client: { from } as any, tables };
}
