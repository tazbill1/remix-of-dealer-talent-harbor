export type JobManagerOption = { user_id: string; store_id: string; name: string; email: string | null };
export type JobEscalationOption = { store_id: string; user_id: string; name: string; phone: string | null };
export type JobContactOptions = { managers: JobManagerOption[]; escalations: JobEscalationOption[] };

/** Multi-store postings must use an account assigned to every selected store. */
export function managersForStores(managers: JobManagerOption[], stores: string[]) {
  if (!stores.length) return [];
  const unique = new Map(managers.map((m) => [m.user_id, m]));
  return [...unique.values()].filter((m) => stores.every((store) => managers.some((x) => x.user_id === m.user_id && x.store_id === store)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function escalationForStores(contacts: JobEscalationOption[], stores: string[]) {
  const found = stores.map((id) => contacts.find((c) => c.store_id === id));
  const first = found[0];
  return first && found.every((c) => c?.user_id === first.user_id) ? first : null;
}