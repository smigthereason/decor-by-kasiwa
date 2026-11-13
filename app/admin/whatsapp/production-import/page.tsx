'use client';
import {useEffect,useState} from 'react';

type Assessment={reference:string;receiptSuffix:string;amountKes:number;storeId:string;
  alreadyImported:boolean;blockers:string[];lines:{productId:string;variantId:string;quantity:number;unitPriceMinor:number}[];
  productionWritesPerformed:false;requiresIndependentTillReconciliation:true};
export default function WhatsAppProductionImportPage() {
 const [reference,setReference]=useState('');
 const [receipt,setReceipt]=useState('');
 const [confirm,setConfirm]=useState('');
 const [assessment,setAssessment]=useState<Assessment|null>(null);
 const [error,setError]=useState('');
 const [result,setResult]=useState('');
 const [busy,setBusy]=useState(false);
 const [history,setHistory]=useState<{reference:string;order_id:string;amount_minor:number;stock_status:string;receipt_suffix:string}[]>([]);
 useEffect(()=>{fetch('/api/backoffice/whatsapp/production-import',{cache:'no-store'})
   .then(r=>r.ok?r.json():null).then(d=>{if(d?.orders)setHistory(d.orders);}).catch(()=>{});},[]);
 async function review() {
  setBusy(true);setError('');setResult('');setAssessment(null);
  try {const r=await fetch(`/api/backoffice/whatsapp/production-import?reference=${encodeURIComponent(reference.trim())}`,{cache:'no-store'});
   const d=await r.json();if(!r.ok)throw new Error(d.error||'Readiness check failed');setAssessment(d);
  }catch(e){setError(e instanceof Error?e.message:'Readiness unavailable');}
  finally{setBusy(false);}
 }
 async function commit() {
  if (!assessment || busy || assessment.blockers.length) return;
  setBusy(true);setError('');setResult('');
  try {const r=await fetch('/api/backoffice/whatsapp/production-import',{method:'POST',
   headers:{'Content-Type':'application/json'},credentials:'same-origin',
   body:JSON.stringify({reference:assessment.reference,fullReceipt:receipt.trim(),
    confirmation:confirm.trim(),fulfillment:'collection'})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||'Posting needs reconciliation');
   setResult(`${d.orderId}: ${d.financialStatus}, stock ${d.stockStatus}${d.replayed?' (existing order)':''}`);
  }catch(e){setError(e instanceof Error?e.message:'Posting needs reconciliation');}
  finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-4xl space-y-5 p-6">
  <p className="text-xs uppercase tracking-wide text-stone-500">DBK-36 · Production operations</p>
  <h1 className="text-2xl font-semibold">Import verified WhatsApp payment</h1>
  <p className="text-sm text-stone-700">Administrator-only. Existing pilot orders only; collection, not delivery. This records a paid order in the production Neon ledger and attempts one stock deduction. It never requests another M-Pesa payment.</p>
  <section className="rounded-xl border bg-white p-4 space-y-3">
   <label className="block text-sm font-medium">WhatsApp payment reference
    <input className="mt-2 w-full rounded-lg border p-3" value={reference} onChange={e=>{setReference(e.target.value);setAssessment(null);}} placeholder="DBKWA…" autoCapitalize="characters"/></label>
   <button className="rounded-lg bg-stone-900 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={()=>void review()}>Check production stock and price</button>
  </section>
  {assessment&&<section className="space-y-3 rounded-xl border bg-white p-4 text-sm">
   <p><strong>Order:</strong> {assessment.reference} · KES {assessment.amountKes} · receipt ending {assessment.receiptSuffix}</p>
   <p><strong>Source store:</strong> {assessment.storeId}</p>
   {assessment.lines.map((l,i)=><p key={i}>{l.quantity} × {l.productId} · variant {l.variantId||'(default)'} · KES {(l.unitPriceMinor/100).toFixed(2)}</p>)}
   {assessment.blockers.length>0?<p className="font-semibold text-red-700">Blocked: {assessment.blockers.join(' · ')}</p>
    : <p className="text-amber-800">Price and stock mapped. Final release still requires independent Till receipt confirmation and enabled database cutover gates.</p>}
   <label className="block">M-Pesa receipt (check independently in the business Till)
    <input className="mt-2 w-full rounded-lg border p-3" value={receipt} onChange={e=>setReceipt(e.target.value)} autoComplete="off"/></label>
   <label className="block">Type <strong>IMPORT {assessment.reference}</strong> to acknowledge the verified receipt and collection-only fulfillment.
    <input className="mt-2 w-full rounded-lg border p-3" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="off"/></label>
   <button className="rounded-lg bg-green-700 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={()=>void commit()}
    disabled={busy||assessment.blockers.length>0||confirm!==`IMPORT ${assessment.reference}`||receipt.trim().slice(-4)!==assessment.receiptSuffix}>
    {busy?'Processing…':'Record verified paid order and settle stock'}</button>
  </section>}
  {history.length>0&&<section className="rounded-xl border bg-white p-4 space-y-2">
   <h2 className="font-semibold">Already imported to production</h2>
   {history.map(o=><p className="text-sm" key={o.reference}>{o.reference} · {o.order_id} · KES {(Number(o.amount_minor)/100).toFixed(2)} · {o.stock_status} · receipt ••••{o.receipt_suffix}</p>)}
  </section>}
  {error&&<p role="alert" className="rounded-lg border border-red-400 p-3 text-sm text-red-700">{error}</p>}
  {result&&<p role="status" className="rounded-lg border border-green-500 p-3 text-sm text-green-800">{result}</p>}
  <p className="text-xs text-stone-600">If stock is marked REVIEW_REQUIRED, do not ship until a manager resolves it. Never retry the M-Pesa payment or bypass the receipts ledger.</p>
 </main>;
}
