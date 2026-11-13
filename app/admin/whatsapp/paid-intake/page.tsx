'use client';
import {useEffect,useState} from 'react';

type Intake={reference:string;amount_minor:number;intake_status:string;created_at:string;receipt_last4:string;customer_last4:string};
type Pending={reference:string;amount_kes:number;paid_at:string;receipt_last4:string;customer_last4:string};
type Response={orders?:Intake[];pending?:Pending[];error?:string;reference?:string;status?:string;replayed?:boolean};
export default function WhatsAppPaidIntakePage(){
 const [items,setItems]=useState<Intake[]>([]);
 const [pending,setPending]=useState<Pending[]>([]);
 const [reference,setReference]=useState('');
 const [receipt,setReceipt]=useState('');
 const [confirmedKes,setConfirmedKes]=useState('');
 const [attested,setAttested]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 async function reload(){
   const r=await fetch('/api/backoffice/whatsapp/paid-intake',{cache:'no-store'});
   const v=(await r.json()) as Response;
   if(!r.ok) throw new Error(v.error||`HTTP ${r.status}`);
   setItems(v.orders||[]);setPending(v.pending||[]);
 }
 useEffect(()=>{let alive=true;void fetch('/api/backoffice/whatsapp/paid-intake',{cache:'no-store'})
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
