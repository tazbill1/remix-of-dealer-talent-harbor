import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { canPostJobs } from "@/lib/jobs";
import { ITEM_TYPES, ITEM_TYPE_LABEL, WHO_LABEL, type ItemType, type Who } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/onboarding-templates")({
  head: () => ({ meta: [
    { title: "Onboarding templates | WerkandMe Hiring" }, { name: "description", content: "Edit the onboarding checklist new hires get." },
    { property: "og:title", content: "Onboarding templates | WerkandMe Hiring" }, { property: "og:description", content: "Edit the onboarding checklist new hires get." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Templates,
});

const selectCls = "h-8 rounded-md border bg-background px-2 text-sm";

function Templates() {
  const org = useOrg();
  const qc = useQueryClient();
  const canEdit = canPostJobs(org.role, org.isPlatformAdmin);
  const key = ["onboarding-templates", org.orgId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [t, i, s] = await Promise.all([
        supabase.from("onboarding_templates").select("id, name, store_id, is_default").eq("org_id", org.orgId).order("created_at"),
        supabase.from("onboarding_template_items").select("*").eq("org_id", org.orgId).order("sort_order"),
        supabase.from("dealerships").select("id, name").eq("org_id", org.orgId).order("name"),
      ]);
      return { templates: t.data ?? [], items: i.data ?? [], stores: s.data ?? [] };
    },
  });
  const [newStore, setNewStore] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const check = (error: { message: string } | null, ok: unknown) => {
    if (error || !ok) { toast.error(error?.message ?? "Couldn't save. Please try again."); return false; }
    return true;
  };

  async function addStoreTemplate() {
    if (!newStore || !data) return;
    const base = data.templates.find((t) => !t.store_id && t.is_default);
    const store = data.stores.find((s) => s.id === newStore);
    const { data: t, error } = await supabase.from("onboarding_templates")
      .insert({ org_id: org.orgId, store_id: newStore, name: `${store?.name ?? "Store"} onboarding`, is_default: true }).select("id").maybeSingle();
    if (!check(error, t)) return;
    const copy = data.items.filter((i) => i.template_id === base?.id).map(({ id: _id, created_at: _c, template_id: _t, ...rest }) => ({ ...rest, template_id: t!.id }));
    if (copy.length) await supabase.from("onboarding_template_items").insert(copy);
    setNewStore(""); toast.success("Store template added, copied from the default"); await refresh();
  }

  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  const usedStores = new Set(data.templates.map((t) => t.store_id).filter(Boolean));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl"><ClipboardCheck className="size-7 text-sapphire" />Onboarding templates</h1>
        <p className="text-muted-foreground">
          New hires get their store's template, or the default if their store doesn't have one. Changes apply to future hires only.{" "}
          {canEdit ? "" : "Only Recruiting/HR and group admins can make changes."} <Link to="/onboarding" className="text-sapphire underline">Back to Onboarding</Link>
        </p>
      </div>
      {data.templates.map((t) => (
        <TemplateCard key={t.id} canEdit={canEdit} orgId={org.orgId} title={t.store_id ? data.stores.find((s) => s.id === t.store_id)?.name ?? t.name : "Default (all stores)"}
          template={t} items={data.items.filter((i) => i.template_id === t.id)} onChange={refresh} check={check} />
      ))}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectCls} value={newStore} onChange={(e) => setNewStore(e.target.value)}>
            <option value="">Pick a store…</option>
            {data.stores.filter((s) => !usedStores.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button variant="outline" disabled={!newStore} onClick={addStoreTemplate}><Plus />Add store template</Button>
        </div>
      )}
    </div>
  );
}

type Item = { id: string; title: string; description: string | null; item_type: string; who_completes: string; required: boolean; due_business_days: number | null; sort_order: number };

function TemplateCard({ title, template, items, canEdit, orgId, onChange, check }: {
  title: string; template: { id: string; store_id: string | null }; items: Item[]; canEdit: boolean; orgId: string;
  onChange: () => Promise<void>; check: (e: { message: string } | null, ok: unknown) => boolean;
}) {
  async function save(id: string, patch: Partial<Item>) {
    const { data, error } = await supabase.from("onboarding_template_items").update(patch).eq("id", id).select("id").maybeSingle();
    if (check(error, data)) await onChange();
  }
  async function add() {
    const { data, error } = await supabase.from("onboarding_template_items").insert({ org_id: orgId, template_id: template.id, title: "New item",
      item_type: "document_upload", who_completes: "new_hire", required: true, sort_order: (items.at(-1)?.sort_order ?? 0) + 1 }).select("id").maybeSingle();
    if (check(error, data)) await onChange();
  }
  async function remove(id: string) {
    if (!window.confirm("Remove this item from the template? Existing checklists keep it.")) return;
    const { error } = await supabase.from("onboarding_template_items").delete().eq("id", id);
    if (check(error, true)) await onChange();
  }
  async function move(idx: number, d: -1 | 1) {
    const a = items[idx], b = items[idx + d];
    if (!a || !b) return;
    await supabase.from("onboarding_template_items").update({ sort_order: b.sort_order }).eq("id", a.id);
    await supabase.from("onboarding_template_items").update({ sort_order: a.sort_order === b.sort_order ? a.sort_order + d : a.sort_order }).eq("id", b.id);
    await onChange();
  }
  async function removeTemplate() {
    if (!window.confirm("Remove this store template? The store will use the default.")) return;
    const { error } = await supabase.from("onboarding_templates").delete().eq("id", template.id);
    if (check(error, true)) await onChange();
  }

  return (
    <section className="space-y-3 rounded-2xl bg-background p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl">{title}</h2>
        {canEdit && template.store_id && <Button size="sm" variant="ghost" onClick={removeTemplate}><Trash2 />Remove</Button>}
      </div>
      <ol className="space-y-2">
        {items.map((i, idx) => (
          <li key={i.id} className="space-y-2 rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-8 min-w-48 flex-1" defaultValue={i.title} disabled={!canEdit}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== i.title) void save(i.id, { title: v }); }} />
              {canEdit && <>
                <Button size="icon" variant="ghost" aria-label="Move up" disabled={idx === 0} onClick={() => move(idx, -1)}><ArrowUp /></Button>
                <Button size="icon" variant="ghost" aria-label="Move down" disabled={idx === items.length - 1} onClick={() => move(idx, 1)}><ArrowDown /></Button>
                <Button size="icon" variant="ghost" aria-label="Remove item" onClick={() => remove(i.id)}><Trash2 /></Button>
              </>}
            </div>
            <Input className="h-8" placeholder="Description (optional)" defaultValue={i.description ?? ""} disabled={!canEdit}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (i.description ?? "")) void save(i.id, { description: v || null }); }} />
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
              <select aria-label="Type" className={selectCls} disabled={!canEdit} value={i.item_type}
                onChange={(e) => void save(i.id, { item_type: e.target.value, ...(e.target.value === "manager_task" ? { who_completes: "manager" } : {}) })}>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_LABEL[t as ItemType]}</option>)}
              </select>
              <select aria-label="Who completes" className={selectCls} disabled={!canEdit} value={i.who_completes} onChange={(e) => void save(i.id, { who_completes: e.target.value })}>
                {(["new_hire", "manager"] as Who[]).map((w) => <option key={w} value={w}>{WHO_LABEL[w]}</option>)}
              </select>
              <label className="flex items-center gap-2">Required <Switch disabled={!canEdit} checked={i.required} onCheckedChange={(c) => void save(i.id, { required: c })} /></label>
              <label className="flex items-center gap-2">Due
                <Input type="number" min={0} max={60} className="h-8 w-16" placeholder="—" disabled={!canEdit} defaultValue={i.due_business_days ?? ""}
                  onBlur={(e) => { const n = e.target.value === "" ? null : Number(e.target.value); if (n !== i.due_business_days && (n === null || (Number.isInteger(n) && n >= 0 && n <= 60))) void save(i.id, { due_business_days: n }); }} />
                business days after start</label>
            </div>
          </li>
        ))}
      </ol>
      {canEdit && <Button size="sm" variant="outline" onClick={add}><Plus />Add item</Button>}
    </section>
  );
}
