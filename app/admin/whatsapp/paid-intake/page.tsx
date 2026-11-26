'use client';
import {useEffect,useState} from 'react';

type Intake={reference:string;amount_minor:number;intake_status:string;created_at:string;receipt_last4:string;customer_last4:string};
type Pending={reference:string;amount_kes:number;paid_at:string;receipt_last4:string;customer_last4:string};
type Response={orders?:Intake[];pending?:Pending[];error?:string;reference?:string;status?:string;replayed?:boolean};
function LegacyIntake(){
 const [items,setItems]=useState<Intake[]>([]);
 const [pending,setPending]=useState<Pending[]>([]);
 const [reference,setReference]=useState('');
 const [receipt,setReceipt]=useState('');
 const [confirmedKes,setConfirmedKes]=useState('');
 const [attested,setAttested]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 async function reload(){
   const r=await fetch('/api/backoffice/whatsapp/paid-intake?legacy=1',{cache:'no-store'});
   const v=(await r.json()) as Response;
   if(!r.ok) throw new Error(v.error||`HTTP ${r.status}`);
   setItems(v.orders||[]);setPending(v.pending||[]);
 }
 useEffect(()=>{let alive=true;void fetch('/api/backoffice/whatsapp/paid-intake?legacy=1',{cache:'no-store'})
   .then(async r=>{const v=(await r.json()) as Response;if(!r.ok)throw new Error(v.error||`HTTP ${r.status}`);if(alive){setItems(v.orders||[]);setPending(v.pending||[]);}})
   .catch(e=>{if(alive)setMessage(String(e instanceof Error?e.message:'Unable to load'));});
   return()=>{alive=false};},[]);
 async function record(){
   if(!attested){setMessage('Check the business Till first.');return;}
   setBusy(true);setMessage('');
   try{
     const r=await fetch('/api/backoffice/whatsapp/paid-intake',{
       method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({reference:reference.trim().toUpperCase(),receipt:receipt.trim(),
         confirmedKes:Number(confirmedKes),confirmation:`RECONCILE ${reference.trim().toUpperCase()}`,
         merchantTillChecked:true}),
     });
     const v=(await r.json()) as Response;
     if(!r.ok)throw new Error(v.error||`HTTP ${r.status}`);
     setMessage(`${v.reference} recorded: ${v.status}${v.replayed?' (existing record)':''}. No stock changed.`);
     await reload();
   }catch(e){setMessage(String(e instanceof Error?e.message:'Unable to record'));}
   finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-5xl space-y-6 px-5 py-10 text-neutral-900">
  <header><h1 className="text-2xl font-bold">WhatsApp paid-order intake</h1>
   <p className="mt-2 text-sm text-neutral-600">For verified existing payments only. Records paid orders in main Neon for staff stock review. Does not deduct or reserve stock, send WhatsApp messages, initiate payments, or activate POS cutover.</p>
  </header>
  <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
   <h2 className="font-semibold">Verified WhatsApp payments awaiting staff intake</h2>
   <p className="mt-1 text-sm text-neutral-600">Read-only from isolated DBK-36 staging. Selecting a row only fills reference and amount; the full merchant Till receipt must be checked independently before recording.</p>
   {pending.length===0 ? <p className="mt-3 text-sm text-neutral-500">No unrecorded verified payments in the latest source window.</p> :
    <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Reference</th><th className="p-2">Paid</th><th className="p-2">Receipt ending</th><th className="p-2">Customer</th><th className="p-2">Action</th></tr></thead><tbody>{pending.map(x=><tr key={x.reference} className="border-t"><td className="p-2">{x.reference}</td><td className="p-2">KES {Number(x.amount_kes)}</td><td className="p-2">••••{x.receipt_last4}</td><td className="p-2">••••{x.customer_last4}</td><td className="p-2"><button type="button" className="rounded border px-2 py-1" onClick={()=>{setReference(x.reference);setConfirmedKes(String(x.amount_kes));setReceipt('');setAttested(false);setMessage('Verify the merchant Till receipt before recording.');}}>Review</button></td></tr>)}</tbody></table></div>}
  </section>
  <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
   <h2 className="font-semibold">Record a reconciled payment</h2>
   <p className="mt-1 text-sm text-amber-700">Only continue after comparing the receipt and amount against the merchant M-Pesa Till independently of the bot.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-3">
    <label className="text-sm">WhatsApp reference<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="DBKWA..." className="mt-1 w-full rounded-lg border p-3"/></label>
    <label className="text-sm">Business Till receipt<input value={receipt} onChange={e=>setReceipt(e.target.value)} placeholder="M-Pesa receipt" className="mt-1 w-full rounded-lg border p-3"/></label>
    <label className="text-sm">Amount in KES<input value={confirmedKes} onChange={e=>setConfirmedKes(e.target.value)} type="number" min="1" max="500" step="1" className="mt-1 w-full rounded-lg border p-3"/></label>
   </div>
   <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)} className="mt-1"/> I independently verified the exact reference, receipt and amount against the business M-Pesa Till, and understand that inventory remains unchanged.</label>
   <button type="button" onClick={()=>void record()} disabled={busy || !attested || !reference || !receipt || !confirmedKes} className="mt-4 rounded-lg bg-neutral-950 px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Recording…':'Record into production intake'}</button>
   {message&&<p role="status" className="mt-3 whitespace-pre-wrap text-sm">{message}</p>}
  </section>
  <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Latest recorded orders</h2><button type="button" onClick={()=>void reload().catch(e=>setMessage(e.message))} className="rounded border px-3 py-2 text-sm">Refresh</button></div>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Reference</th><th className="p-2">Amount</th><th className="p-2">Receipt ending</th><th className="p-2">Status</th></tr></thead><tbody>{items.map(x=><tr key={x.reference} className="border-t"><td className="p-2">{x.reference}</td><td className="p-2">KES {Number(x.amount_minor)/100}</td><td className="p-2">••••{x.receipt_last4}</td><td className="p-2">{x.intake_status}</td></tr>)}</tbody></table>{!items.length&&<p className="py-4 text-sm text-neutral-500">No paid orders recorded. If the feature is disabled, request the controlled production activation.</p>}</div>
  </section>
 </main>;
}


type ProductionPayment={reference:string;amount_minor:number;intake_status:string;paid_at:string;
  verification_mode:string;receipt_last4?:string;receipt?:string;payment_status:string|null;
  payment_stock_state:string|null;fulfillment_stock_state:string|null;fulfillment_state:string|null;order_id:string|null};
const productionApi='/api/backoffice/whatsapp/paid-intake';
export default function WhatsAppPaidIntakePage(){
  const [orders,setOrders]=useState<ProductionPayment[]>([]),[reference,setReference]=useState(''),[amount,setAmount]=useState('');
  const [found,setFound]=useState<ProductionPayment|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [legacy,setLegacy]=useState(false);
  async function refresh(){
    const r=await fetch(productionApi,{cache:'no-store'});const v=await r.json();
    if(!r.ok)throw new Error(v.error||'Unable to load production payments');setOrders(v.orders||[]);
  }
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
  async function lookup(ref=reference,kes=amount){
    setFound(null);setError('');setBusy(true);
    try{
      const q=new URLSearchParams({reference:ref.trim().toUpperCase(),amount:kes});
      const r=await fetch(`${productionApi}?${q}`,{cache:'no-store'});const v=await r.json();
      if(!r.ok)throw new Error(v.error==='VERIFIED_PAYMENT_NOT_FOUND'?'No verified payment matches that reference and amount.':v.error||'Lookup failed');
      setFound(v.payment);
    }catch(e){setError(e instanceof Error?e.message:'Lookup failed');}finally{setBusy(false);}
  }
  const money=(minor:number)=>`KES ${(Number(minor)/100).toLocaleString('en-KE',{minimumFractionDigits:2})}`;
  const stock=(p:ProductionPayment)=>p.fulfillment_stock_state||p.payment_stock_state||'AWAITING_STAFF';
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10 text-neutral-900">
    <header><h1 className="text-2xl font-bold">WhatsApp Paid Orders</h1><p className="mt-2 text-sm text-neutral-600">Production payment records. Look up a verified payment before reviewing stock or collection. No payment or stock change occurs here.</p></header>
    <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Find a payment</h2>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();void lookup();}}>
        <label className="text-sm">WhatsApp reference<input value={reference} disabled={busy} onChange={e=>{setReference(e.target.value);setFound(null);}} required placeholder="DBKWA..." className="mt-1 w-full rounded-lg border p-3"/></label>
        <label className="text-sm">Amount in KES<input value={amount} disabled={busy} onChange={e=>{setAmount(e.target.value);setFound(null);}} type="number" min="1" step="1" required className="mt-1 w-full rounded-lg border p-3"/></label>
        <button disabled={busy||!reference||!amount} className="self-end rounded-lg bg-neutral-950 px-4 py-3 text-white disabled:opacity-40">{busy?'Finding…':'Find verified payment'}</button>
      </form>
      {found&&<div className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">{found.reference} · {money(found.amount_minor)}</h3>
        <p className="text-sm">Till receipt: <strong>{found.receipt}</strong></p><p className="text-sm">Verification: {found.verification_mode==='daraja_api_verified'?'Daraja verified':'Staff Till attested'}</p>
        <p className="text-sm">Stock: {stock(found)} · Fulfilment: {found.fulfillment_state||'Awaiting review'}</p>
        <p className="text-sm text-neutral-600">Already recorded. Do not record or charge again.</p>
        <a className="inline-block rounded border px-3 py-2 text-sm" href="/admin/whatsapp/paid-intake/fulfillment">Review fulfilment</a>
      </div>}
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Latest recorded production payments</h2><button disabled={busy} onClick={()=>{setError('');void refresh().catch(e=>setError(e.message));}} className="rounded border px-3 py-2">Refresh</button></div>
      <div className="overflow-x-auto"><table className="mt-3 w-full text-left text-sm"><thead><tr>{['Reference','Amount','Till receipt','Verification','Stock','Action'].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{orders.map(o=><tr key={o.reference} className="border-t"><td className="p-2">{o.reference}</td><td className="p-2">{money(o.amount_minor)}</td><td className="p-2">••••{o.receipt_last4}</td><td className="p-2">{o.verification_mode==='daraja_api_verified'?'Daraja verified':'Staff Till attested'}</td><td className="p-2">{stock(o)}</td><td className="p-2"><button disabled={busy} className="rounded border px-2 py-1" onClick={()=>{const k=String(Number(o.amount_minor)/100);setReference(o.reference);setAmount(k);void lookup(o.reference,k);}}>View receipt</button></td></tr>)}</tbody></table></div>
      {!orders.length&&!error&&<p className="mt-3 text-sm text-neutral-500">No recorded payments returned.</p>}
    </section>
    <button className="rounded border px-3 py-2 text-sm" onClick={()=>setLegacy(v=>!v)}>{legacy?'Hide legacy staging intake':'Legacy staging intake (historical payments only)'}</button>
    {legacy&&<LegacyIntake/>}
  </main>;
}
