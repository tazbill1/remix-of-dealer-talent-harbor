import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, Printer, QrCode, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrCard } from "@/components/qr-card";
import { previewReferralCsv, importReferralCsv } from "@/lib/referral-enrollment.functions";
import { storeSignupLink, type CsvPreviewRow } from "@/lib/referral-enrollment";

export function StoreReferralSignup({ stores }: { stores: { id: string; name: string; referral_signup_token: string }[] }) {
  const [storeId,setStoreId]=useState("");
  const [open,setOpen]=useState(false);
  const store=stores.find(s=>s.id===storeId) ?? stores[0];
  if (!store) return null;
  return <div className="flex min-w-0 flex-wrap gap-2">
    <select aria-label="Employee signup store" className="h-9 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm" value={store.id} onChange={e=>setStoreId(e.target.value)}>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(storeSignupLink(store.referral_signup_token));toast.success("Employee signup link copied");}catch{toast.error("Couldn't copy link");}}}><Copy />Signup link</Button>
    <Button variant="outline" onClick={()=>setOpen(true)}><QrCode />Signup QR</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Employee signup · {store.name}</DialogTitle></DialogHeader>
      <div data-referral-print className="space-y-3"><h2 className="text-center text-xl">{store.name}</h2><p className="text-center">Employee referral signup</p><QrCard name={store.name} link={storeSignupLink(store.referral_signup_token)} caption="Employee referral signup" fileName="employee-signup-qr.png" showLink /></div>
      <Button variant="outline" onClick={()=>window.print()}><Printer />Print QR</Button>
    </DialogContent></Dialog>
  </div>;
}

export function ReferralCsvUpload({ orgId, onSaved }: { orgId: string; onSaved:()=>void }) {
  const preview=useServerFn(previewReferralCsv), commit=useServerFn(importReferralCsv);
  const [open,setOpen]=useState(false),[rows,setRows]=useState<CsvPreviewRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[page,setPage]=useState(0);
  const [summary,setSummary]=useState("");
  async function load(file:File) {
    setBusy(true);setError("");setSummary("");setRows([]);setPage(0);
    try { if(file.size>2_000_000) throw new Error("CSV must be under 2 MB.");setRows(await preview({data:{orgId,csv:await file.text()}})); }
    catch(e){setError(e instanceof Error?e.message:"Could not preview CSV");}finally{setBusy(false);}
  }
  async function upload() {
    setBusy(true);setError("");let added=0,skipped=rows.filter(r=>r.status==="duplicate").length,failed=0;
    const ready=rows.filter(r=>r.status==="ready"&&r.input);
    const updated=[...rows];
    try {
      for(let i=0;i<ready.length;i+=250){
        const batch=ready.slice(i,i+250);
        const result=await commit({data:{orgId,rows:batch.flatMap(r=>r.input?[r.input]:[])}});
        added+=result.inserted;skipped+=result.skipped;failed+=result.failed;
        for(const outcome of result.rows){const original=batch[outcome.row-1];if(!original)continue;const index=updated.findIndex(r=>r.row===original.row);if(index<0)continue;updated[index]={...original,status:outcome.status==="error"?"error":outcome.status==="added"?"added":"duplicate",errors:outcome.error?[outcome.error]:[]};}
        setRows([...updated]);onSaved();
      }
      setSummary(`${added} added · ${skipped} duplicates skipped · ${failed} failed`);
    }catch(e){setError(`${e instanceof Error?e.message:"Import failed"} ${added} already added; retry safely skips them.`);}finally{setBusy(false);}
  }
  return <><Button variant="outline" onClick={()=>setOpen(true)}><Upload />Upload CSV</Button>
    <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Upload employees</DialogTitle></DialogHeader>
      <Button variant="outline" asChild><a href="/downloads/referral-employees-sample.csv" download="referral-employees-sample.csv"><Download />Sample CSV</a></Button>
      <input aria-label="Employee CSV" type="file" accept=".csv,text/csv" disabled={busy} className="w-full min-w-0 text-sm" onChange={e=>{const f=e.target.files?.[0];if(f)void load(f);e.target.value="";}} />
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {summary&&<p role="status" className="text-sm font-semibold">{summary}</p>}
      {busy&&<p role="status">{rows.length?"Importing…":"Checking CSV…"}</p>}
      {!!rows.length&&<><p className="text-sm">{rows.filter(r=>r.status==="ready").length} ready · {rows.filter(r=>r.status==="duplicate").length} duplicates · {rows.filter(r=>r.status==="error").length} errors</p>
      <div className="divide-y rounded-md border">{rows.slice(page*25,page*25+25).map(r=><div key={r.row} className="p-2 text-sm"><div className="flex flex-wrap justify-between gap-1"><span className="font-semibold">Row {r.row} · {r.name||"No name"}</span><span className={r.status==="error"?"text-destructive":"text-muted-foreground"}>{r.status}</span></div><p className="text-xs text-muted-foreground">{r.store}</p>{r.errors.map((e,i)=><p key={i} className="text-xs text-destructive">{e}</p>)}</div>)}</div>
      <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</Button><span className="text-xs">{page+1} / {Math.ceil(rows.length/25)}</span><Button variant="outline" disabled={(page+1)*25>=rows.length} onClick={()=>setPage(page+1)}>Next</Button></div>
      <Button disabled={busy||!rows.some(r=>r.status==="ready")} onClick={upload}>Import {rows.filter(r=>r.status==="ready").length} employees</Button></>}
    </DialogContent></Dialog></>;
}