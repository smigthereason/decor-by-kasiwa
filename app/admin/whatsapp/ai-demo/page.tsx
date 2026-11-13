'use client';
import {useEffect,useState} from 'react';
type Turn={role:'user'|'assistant';content:string};
type Reply={answer?:string;error?:string;enabled?:boolean;model?:string;realAI?:boolean};
const API='/api/backoffice/whatsapp/ai-demo';
const prompts=[
  'Help me style a warm, elegant living room under KES 5,000.',
  'I want a thoughtful home gift. What do you recommend?',
  'Suggest a few pieces that work together for a modern bedroom.',
];
export default function WhatsAppAiDemoPage(){
  const [messages,setMessages]=useState<Turn[]>([]),[question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false),[enabled,setEnabled]=useState<boolean|null>(null),[error,setError]=useState('');
  useEffect(()=>{void fetch(API,{cache:'no-store'}).then(async r=>{
    const data=await r.json() as Reply;
    if(!r.ok)throw new Error(data.error||'ACCESS_DENIED');setEnabled(Boolean(data.enabled));
  }).catch(e=>{setError(String(e instanceof Error?e.message:e));setEnabled(false);});},[]);
  async function send(raw:string){
    const text=raw.trim();if(!text||busy||enabled!==true)return;
    const history=messages.slice(-6);setMessages([...messages,{role:'user',content:text}]);setQuestion('');setBusy(true);setError('');
    try{
      const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
        body:JSON.stringify({question:text,turns:history})});
      const response=await r.json() as Reply;
      if(!r.ok||!response.answer||response.realAI!==true)throw new Error(response.error||'AI_UNAVAILABLE');
      setMessages(prev=>[...prev,{role:'assistant',content:response.answer!}]);
    }catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-4xl space-y-6 px-5 py-10 text-neutral-900">
    <header className="space-y-2"><span className="rounded-full border px-3 py-1 text-xs font-medium">ADMIN-ONLY · REAL AI DEMO</span>
      <h1 className="text-3xl font-semibold tracking-tight">Decor By Kasiwa · AI Shopping Adviser</h1>
      <p className="text-sm text-neutral-600">Live production catalogue, real AI recommendations, no M-Pesa charges, no inventory changes. This is a stakeholder demonstration—not a customer WhatsApp channel.</p>
      <a href="/admin/whatsapp/paid-intake/fulfillment" className="text-sm underline">View production fulfillment</a>
    </header>
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-500">{enabled===null?'Checking access…':enabled?'AI configured · gpt-4.1-mini':'AI demo not enabled or access denied'}</p>
      <div className="mb-4 flex flex-wrap gap-2">{prompts.map(p=><button key={p} disabled={busy||enabled!==true} onClick={()=>void send(p)} className="rounded-lg border px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-50">{p}</button>)}</div>
      <div aria-live="polite" className="min-h-52 space-y-4 rounded-xl bg-neutral-50 p-4">
        {messages.length===0&&<p className="text-sm text-neutral-500">Choose an example or ask about décor. The AI will recommend only products returned by the store catalogue.</p>}
        {messages.map((m,i)=><div key={i} className={m.role==='user'?'ml-auto max-w-[85%] rounded-xl bg-neutral-900 p-3 text-sm text-white':'mr-auto max-w-[90%] rounded-xl border bg-white p-3 text-sm whitespace-pre-wrap'}>{m.content}</div>)}
        {busy&&<p className="text-sm text-neutral-500">Checking the catalogue and preparing a recommendation…</p>}
      </div>
      <form onSubmit={e=>{e.preventDefault();void send(question);}} className="mt-4 flex gap-2">
        <input aria-label="Ask the AI shopping adviser" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={400} disabled={enabled!==true||busy} placeholder="Ask about products, styles, budgets…" className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"/>
        <button type="submit" disabled={enabled!==true||busy||!question.trim()} className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">Send</button>
      </form>
      {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
    <p className="text-xs text-neutral-500">AI suggestions are advisory. Product availability and prices are checked again at checkout. Orders, refunds, stock and payment records cannot be changed from this demo.</p>
  </main>;
}
