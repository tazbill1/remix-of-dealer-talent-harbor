import { Input } from "@/components/ui/input";
import type { StoreErrors, StoreForm } from "@/lib/store-validation";

type Key = keyof StoreForm;
const FIELDS: { key: Key; label: string; required?: boolean; type?: string; helper?: string; placeholder?: string; half?: boolean }[] = [
  { key: "name", label: "Store name", required: true },
  { key: "brand", label: "Brand (e.g. Toyota)", required: true },
  { key: "address", label: "Street address" },
  { key: "city", label: "City", required: true, half: true },
  { key: "state", label: "State", required: true, half: true },
  { key: "timezone", label: "Time zone", required: true, placeholder: "America/Chicago" },
  { key: "manager_name", label: "Store manager name", required: true },
  { key: "manager_phone", label: "Store manager phone", required: true, type: "tel" },
  { key: "escalation_name", label: "Escalation contact name", helper: "Leave blank to use the store manager" },
  { key: "escalation_phone", label: "Escalation contact phone", type: "tel", helper: "Leave blank to use the store manager" },
  { key: "assistant_name", label: "AI assistant's name", placeholder: "Penny", helper: "Leave blank to use Penny" },
];

export function StoreFormFields({ f, setF, errors }: { f: StoreForm; setF: (f: StoreForm) => void; errors: StoreErrors }) {
  const render = ({ key, label, required, type, helper, placeholder }: (typeof FIELDS)[number]) => (
    <label key={key} className="block space-y-1.5 text-sm">
      <span>{label}{required && <span className="text-destructive"> *</span>}</span>
      <Input aria-label={label} aria-invalid={!!errors[key]} type={type ?? "text"} placeholder={placeholder} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      {errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </label>
  );
  const halves = FIELDS.filter((x) => x.half);
  return <>
    {FIELDS.map((x) => x.key === "city" ? <div key="cs" className="grid grid-cols-2 gap-3">{halves.map(render)}</div> : x.half ? null : render(x))}
  </>;
}
