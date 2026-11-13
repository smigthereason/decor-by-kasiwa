'use client';
import {useEffect,useState} from 'react';
type Order={reference:string;amount_minor:number;intake_status:string;receipt_suffix:string;
  customer_suffix:string;order_id:string|null;stock_state:string|null;fulfillment_state:string|null;
  last_error_code:string|null};
type Response={orders?:Order[];stockCommitEnabled?:boolean;error?:string;stockState?:string;orderId?:string;
  status?:string;amountKes?:number;lineCount?:number;products?:number;storeId?:string;actionRequired?:boolean};
const api='/api/backoffice/whatsapp/paid-intake/fulfillment';
export default function WhatsAppFulfillment(){
  const [orders,setOrders]=useState<Order[]>([]),[selected,setSelected]=useState('');
  const [preview,setPreview]=useState<Response|null>(null),[approved,setApproved]=useState(false);
  const [busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[message,setMessage]=useState('');
  async function refresh(){
    const r=await fetch(api,{cache:'no-store'});const x=await r.json() as Response;
    if(!r.ok)throw new Error(x.error||'Unable to load');
    setOrders(x.orders||[]);setEnabled(x.stockCommitEnabled===true);
  }
  useEffect(()=>{void refresh().catch(e=>setMessage(String(e)));},[]);
  async function inspect(ref:string){
    setBusy(true);setApproved(false);setSelected(ref);setPreview(null);setMessage('');
    try{
      const r=await fetch(`${api}?reference=${encodeURIComponent(ref)}`,{cache:'no-store'});
      const x=await r.json() as Response;
      if(!r.ok)throw new Error(x.error||'Unable to inspect');setPreview(x);
    }catch(e){setMessage(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function submit(action:'COMMIT_STOCK'|'SET_FULFILLMENT',state?:string){
    if(!selected)return;setBusy(true);setMessage('');
    try{
      const body={reference:selected,action,
        confirmation:action==='COMMIT_STOCK'?`COMMIT ${selected}`:`SET ${selected} ${state}`,
        ...(action==='COMMIT_STOCK'?{stockReviewed:true}:{state})};
      const r=await fetch(api,{method:'POST',credentials:'same-origin',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const x=await r.json() as Response;
      if(!r.ok)throw new Error(x.error||'Action requires reconciliation');
      setMessage(`Order ${selected}: ${x.stockState||x.status||'updated'}.`);
      setApproved(false);await refresh();await inspect(selected);
    }catch(e){setMessage(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  const canPost=enabled&&preview?.stockState==='READY_FOR_STAFF_APPROVAL'&&approved;
  const current=orders.find(x=>x.reference===selected);
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-10 text-neutral-900">
    <header className="space-y-2"><h1 className="text-2xl font-bold">WhatsApp payment fulfillment</h1>
      <p className="text-sm text-neutral-600">Separate Neon order ledger. Stock changes occur only after Till-attested intake, explicit administrator approval and successful Sanity revision checks. This does not issue refunds, M-Pesa charges or enable public checkout.</p>
      <a href="/admin/whatsapp/paid-intake" className="text-sm underline">Back to Till reconciliation</a>
    </header>
    <p className="text-sm font-medium">Stock posting: {enabled?'Approved production gate enabled':'DISABLED — read-only review'}</p>
    <section className="overflow-x-auto rounded-xl border p-4"><h2 className="mb-3 font-semibold">Recorded paid orders</h2>
      <table className="w-full text-left text-sm"><thead><tr><th className="p-2">Reference</th><th className="p-2">KES</th><th className="p-2">Receipt</th><th className="p-2">Stock</th><th className="p-2">Fulfillment</th><th className="p-2">Action</th></tr></thead><tbody>
        {orders.map(o=><tr key={o.reference} className="border-t"><td className="p-2">{o.reference}</td><td className="p-2">{Number(o.amount_minor)/100}</td>
        <td className="p-2">••••{o.receipt_suffix}</td><td className="p-2">{o.stock_state||'AWAITING_STAFF'}</td>
        <td className="p-2">{o.fulfillment_state||'—'}</td><td className="p-2"><button type="button" className="rounded border px-2 py-1" onClick={()=>void inspect(o.reference)} disabled={busy}>Review</button></td></tr>)}
      </tbody></table>{orders.length===0&&<p className="p-2 text-sm text-neutral-500">No Till-attested orders yet. Do not enter a payment that hasn't been independently verified.</p>}</section>
    {preview&&<section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">Order {selected}</h2>
      <p className="text-sm">{preview.stockState} {preview.orderId?`· ${preview.orderId}`:''}</p>
      {preview.stockState==='READY_FOR_STAFF_APPROVAL'&&<><p className="text-sm">Amount KES {preview.amountKes}; {preview.lineCount} cart line(s). Stock is checked again when committing. Payment is already recorded; this action does not charge the customer.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
          I reviewed the Till-attested payment, customer products, store stock, and understand a one-time deduction may require manual reconciliation if the network fails.</label>
        <button type="button" disabled={!canPost||busy} className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40" onClick={()=>void submit('COMMIT_STOCK')}>Post order and deduct stock once</button></>}
      {current?.stock_state==='COMMITTED'&&<div className="flex flex-wrap gap-2">
        {(['PREPARING','READY_FOR_PICKUP','HANDED_OVER','REFUND_REVIEW'] as const).map(s=><button key={s} type="button" disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={()=>void submit('SET_FULFILLMENT',s)}>{s.replaceAll('_',' ')}</button>)}
      </div>}
      {preview.stockState==='REVIEW_REQUIRED'||preview.stockState==='CLAIMED'?<p className="text-sm font-medium text-amber-700">Stock outcome is uncertain or claimed. Do not retry this order. Reconcile Sanity and Neon records manually.</p>:null}
    </section>}
    {message&&<p role="status" className="whitespace-pre-wrap text-sm">{message}</p>}
  </main>;
}
