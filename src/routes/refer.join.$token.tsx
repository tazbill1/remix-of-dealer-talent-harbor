import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getReferralSignup, signupReferralEmployee } from "@/lib/referral-enrollment.functions";
import { referralLink } from "@/lib/referrals";
import { SITE_URL } from "@/lib/site";
import { Logo } from "@/components/brand";
import { QrCard } from "@/components/qr-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export const Route=createFileRoute("/refer/join/$token")({
 loader:({params})=>getReferralSignup({data:{token:params.token}}),
 head:({loaderData})=>{const title=`Employee referrals | ${loaderData?.group??"WerkandMe"}`;const description="Get your personal employee referral link and QR code.";return{meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"},{name:"robots",content:"noindex"}]};},
 component:Signup,
 errorComponent:()=> <p className="p-6">Employee signup couldn't be loaded. Please try again.</p>,
});
function Signup(){
 const info=Route.useLoaderData(),{token}=Route.useParams();const signup=useServerFn(signupReferralEmployee);
 const [f,setF]=useState({first:"",last:"",role:"",email:"",phone:""}),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [result,setResult]=useState<{code:string;existing:boolean;active:boolean;orgSlug:string}|null>(null);
 return <main className="min-h-dvh bg-muted px-5 py-8"><div className="mx-auto max-w-lg space-y-6"><Logo />
 {!info?<><h1 className="text-2xl">Employee signup is closed</h1><p className="text-muted-foreground">Contact HR for your referral link.</p></>:<>
 <div><p className="text-sm text-muted-foreground">{info.group}</p><h1 className="text-3xl">{info.store}</h1><h2 className="mt-3 text-xl">Employee referrals</h2></div>
 {result?<div className="space-y-4"><h2 className="text-xl">{result.existing?"Your existing referral link":"Your referral link is ready"}</h2>
 {!result.active?<p role="alert">Your existing referral link is inactive. Contact HR to reactivate it.</p>:<><QrCard name="Your referral link" link={referralLink(SITE_URL,result.orgSlug,result.code,"qr")} caption="Your personal referral QR" fileName="my-referral-qr.png" showLink /><Button asChild variant="outline" className="w-full"><a href={referralLink(SITE_URL,result.orgSlug,result.code)}>Open referral link</a></Button></>}
 <Button variant="ghost" onClick={()=>setResult(null)}>Back</Button></div>:<form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{setResult(await signup({data:{token,...f}}));}catch(e){setError(e instanceof Error?e.message:"Please check your details.");}finally{setBusy(false);}}}>
 <div className="grid grid-cols-2 gap-3">{(["first","last"] as const).map(k=><div key={k} className="min-w-0 space-y-1"><Label htmlFor={k}>{k==="first"?"First name":"Last name"}</Label><Input id={k} required maxLength={60} value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})} /></div>)}</div>
 <div className="space-y-1"><Label htmlFor="role">Role</Label><Input id="role" required maxLength={120} value={f.role} onChange={e=>setF({...f,role:e.target.value})} /></div>
 <div className="space-y-1"><Label htmlFor="email">Email</Label><Input id="email" type="email" maxLength={200} value={f.email} onChange={e=>setF({...f,email:e.target.value})} /></div>
 <div className="space-y-1"><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" maxLength={30} value={f.phone} onChange={e=>setF({...f,phone:e.target.value})} /></div>
 <p className="text-xs text-muted-foreground">Phone or email required.</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" className="w-full" disabled={busy}>{busy?"Creating…":"Get my referral link"}</Button>
 </form>}</>}
 </div></main>;
}