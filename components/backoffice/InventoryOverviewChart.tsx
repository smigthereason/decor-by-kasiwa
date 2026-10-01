"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";

import { formatKes } from "@/lib/operations/selectors";

type MonthRow = { key: string; label: string; sales: number; purchases: number };
type Overview = { months: MonthRow[]; stockValue: { cost: number; retail: number; potentialMargin: number } };

export default function InventoryOverviewChart() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/backoffice/inventory/overview", { cache: "no-store" });
      if (!response.ok) return;
      setData(await response.json() as Overview);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const maxValue = useMemo(() => Math.max(1, ...(data?.months || []).flatMap((row) => [row.sales, row.purchases])), [data]);
  const points = useMemo(() => (data?.months || []).map((row, index, all) => {
    const x = 70 + (index * 600) / Math.max(1, all.length - 1);
    const y = 245 - (row.purchases / maxValue) * 185;
    return `${x},${y}`;
  }).join(" "), [data, maxValue]);

  async function downloadPng() {
    if (!svgRef.current) return;
    const svg = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1400;
      canvas.height = 620;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const anchor = document.createElement("a");
      anchor.href = canvas.toDataURL("image/png");
      anchor.download = `decor-by-kasiwa-inventory-overview-${new Date().toISOString().slice(0, 10)}.png`;
      anchor.click();
    };
    image.src = url;
  }

  if (loading && !data) return <div className="rounded-2xl border hairline bg-[var(--paper)] p-6"><RefreshCw className="animate-spin" size={18}/></div>;
  if (!data) return null;

  const stockTotal = Math.max(1, data.stockValue.cost + Math.max(0, data.stockValue.retail - data.stockValue.cost));
  const costDegrees = Math.round((data.stockValue.cost / stockTotal) * 360);

  return (
    <section className="rounded-2xl border hairline bg-[var(--paper)] p-4 sm:p-6 print:border-0 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="kicker text-[var(--muted)]">Inventory intelligence</p><h2 className="mt-2 text-xl font-semibold">Stock overview</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Monthly paid sales versus stock received at procurement cost, plus current stock value.</p></div>
        <div className="flex gap-2 print:hidden">
          <button type="button" onClick={() => void downloadPng()} className="inline-flex min-h-10 items-center gap-2 rounded-full border hairline px-4 text-xs font-semibold"><Download size={14}/>PNG</button>
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-full border hairline px-4 text-xs font-semibold"><Printer size={14}/>Print / PDF</button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-x-auto rounded-xl border hairline bg-[var(--paper-2)] p-3">
          <svg ref={svgRef} viewBox="0 0 740 300" className="min-w-[680px] w-full" role="img" aria-label="Monthly sales and purchases chart">
            <rect x="0" y="0" width="740" height="300" fill="#ffffff" />
            {[0,1,2,3,4].map((tick) => {
              const y = 245 - tick * 46.25;
              const value = (maxValue * tick) / 4;
              return <g key={tick}><line x1="55" y1={y} x2="700" y2={y} stroke="#e5e1d8" strokeWidth="1"/><text x="8" y={y+4} fontSize="10" fill="#6f6b64">{Math.round(value/1000)}k</text></g>;
            })}
            {(data.months || []).map((row, index) => {
              const x = 70 + (index * 600) / Math.max(1, data.months.length - 1);
              const height = (row.sales / maxValue) * 185;
              return <g key={row.key}><rect x={x-15} y={245-height} width="30" height={height} rx="3" fill="#0b8f4f" opacity="0.86"/><text x={x} y="270" textAnchor="middle" fontSize="10" fill="#494640">{row.label.replace(" 2026", "")}</text></g>;
            })}
            <polyline points={points} fill="none" stroke="#8d5c45" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {(data.months || []).map((row, index) => {
              const x = 70 + (index * 600) / Math.max(1, data.months.length - 1);
              const y = 245 - (row.purchases / maxValue) * 185;
              return <circle key={row.key} cx={x} cy={y} r="4" fill="#fff" stroke="#8d5c45" strokeWidth="2"/>;
            })}
            <g transform="translate(470 20)"><rect width="12" height="12" rx="2" fill="#0b8f4f"/><text x="18" y="10" fontSize="11" fill="#494640">Sales</text><line x1="85" y1="6" x2="104" y2="6" stroke="#8d5c45" strokeWidth="3"/><text x="110" y="10" fontSize="11" fill="#494640">Stock received</text></g>
          </svg>
        </div>

        <div className="rounded-xl border hairline bg-[var(--paper-2)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Current stock value</p>
          <div className="mx-auto mt-5 size-40 rounded-full" style={{ background: `conic-gradient(var(--brand-green) 0deg ${costDegrees}deg, #d7c6a6 ${costDegrees}deg 360deg)` }} aria-label="Stock value comparison" />
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Procurement cost</dt><dd className="font-semibold">{formatKes(data.stockValue.cost)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Retail value</dt><dd className="font-semibold">{formatKes(data.stockValue.retail)}</dd></div>
            <div className="flex justify-between gap-4 border-t hairline pt-3"><dt>Potential margin</dt><dd className="font-bold text-[var(--brand-green)]">{formatKes(data.stockValue.potentialMargin)}</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}
