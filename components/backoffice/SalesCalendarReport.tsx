"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { calendarMonth, shiftMonth } from "@/lib/pos/dbk122-calendar-core";
import { formatMoney } from "@/lib/money";

type DaySummary = {date:string;orders:number;revenue:number;deliveryPayables:number;moneyIn:number};
type Report = {orders:number;totalSales:number;moneyIn:number;byDate:DaySummary[]};

function currentNairobiMonth() {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit"}).formatToParts(new Date());
  const y=parts.find(x=>x.type==="year")?.value;
  const m=parts.find(x=>x.type==="month")?.value;
  return `${y}-${m}`;
}

export default function SalesCalendarReport({storeId}:{storeId:string}) {
  const [month,setMonth]=useState(currentNairobiMonth);
  const [report,setReport]=useState<Report|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const range=useMemo(()=>calendarMonth(month),[month]);
  const days=useMemo(()=>new Map((report?.byDate||[]).map(x=>[x.date,x])),[report]);
  const selectedDay=selected?days.get(selected):null;

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError("");setReport(null);setSelected(null);
    const qs=new URLSearchParams({period:"month",from:range.first,to:range.last});
    if(storeId)qs.set("store",storeId);
    void fetch(`/api/backoffice/pos/reports?${qs}`,{cache:"no-store",signal:controller.signal})
      .then(async r=>{
        const payload=await r.json() as {report?:Report;message?:string;code?:string};
        if(!r.ok||!payload.report)throw Error(payload.message||`Calendar reporting unavailable (HTTP ${r.status})`);
        return payload.report;
      })
      .then(r=>{if(!controller.signal.aborted)setReport(r);})
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Calendar reporting unavailable");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[range.first,range.last,storeId]);

  return <section aria-label="Monthly sales calendar" className="rounded-2xl border hairline bg-[var(--paper)] p-4 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-base font-semibold"><CalendarDays size={18}/> Sales calendar</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">Daily orders, verified business revenue and money received · Africa/Nairobi</p></div>
      <div className="flex items-center gap-2">
        <button aria-label="Previous month" type="button" onClick={()=>setMonth(m=>shiftMonth(m,-1))} className="rounded-full border hairline p-2"><ChevronLeft size={17}/></button>
        <span className="min-w-36 text-center text-sm font-semibold">{new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-KE",{month:"long",year:"numeric",timeZone:"Africa/Nairobi"})}</span>
        <button aria-label="Next month" type="button" onClick={()=>setMonth(m=>shiftMonth(m,1))} className="rounded-full border hairline p-2"><ChevronRight size={17}/></button>
      </div>
    </header>
    {loading?<p role="status" className="mt-4 text-sm">Loading calendar…</p>:
      error?<p role="alert" className="mt-4 rounded-lg border border-red-300 p-3 text-sm text-red-700">{error} No financial totals were inferred.</p>:
      report&&<>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--paper-2)] p-3 text-xs">Revenue <strong className="mt-1 block text-base">{formatMoney(report.totalSales)}</strong></div>
          <div className="rounded-xl bg-[var(--paper-2)] p-3 text-xs">Money in <strong className="mt-1 block text-base">{formatMoney(report.moneyIn)}</strong></div>
          <div className="rounded-xl bg-[var(--paper-2)] p-3 text-xs">Orders <strong className="mt-1 block text-base">{report.orders}</strong></div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[var(--muted)] sm:text-xs">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {range.cells.map((cell,i)=>cell?<button key={cell.date} type="button" onClick={()=>setSelected(cell.date)}
            aria-label={`${cell.date}: ${days.get(cell.date)?.orders||0} orders; revenue ${formatMoney(days.get(cell.date)?.revenue||0)}`}
            aria-pressed={selected===cell.date}
            className={`min-h-20 rounded-lg border p-1 text-left text-[10px] transition sm:min-h-24 sm:p-2 ${selected===cell.date?'border-[var(--brand-green)] bg-[var(--paper-2)]':'hairline hover:bg-[var(--paper-2)]'}`}>
            <span className="block font-semibold">{cell.day}</span>
            <span className="mt-1 block tabular-nums">{formatMoney(days.get(cell.date)?.revenue||0)}</span>
            <span className="mt-1 block text-[var(--muted)]">{days.get(cell.date)?.orders||0} orders</span>
          </button>:<div key={`pad-${i}`} aria-hidden="true" className="min-h-20 sm:min-h-24"/>)}
        </div>
        {selected&&<div className="mt-3 rounded-lg border hairline bg-[var(--paper-2)] p-3 text-xs" role="status">
          <strong>{selected}</strong> · {selectedDay?.orders||0} orders · Revenue {formatMoney(selectedDay?.revenue||0)} · Money in {formatMoney(selectedDay?.moneyIn||0)} · Delivery payable {formatMoney(selectedDay?.deliveryPayables||0)}
        </div>}
        <p className="mt-3 text-[11px] text-[var(--muted)]">Calendar cells reflect the selected month and store only. Days without records show zero. The report remains unavailable if any financial source fails; no source is silently excluded.</p>
      </>}
  </section>;
}
