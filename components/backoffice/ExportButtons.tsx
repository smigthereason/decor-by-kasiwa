"use client";

import { FileDown, FileSpreadsheet } from "lucide-react";

import {
  downloadExcelReport,
  downloadPdfReport,
  type ExportColumn,
  type ExportRow,
} from "@/lib/export/client";

export default function ExportButtons({
  title,
  columns,
  rows,
  fileName,
  disabled = false,
}: {
  title: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  fileName?: string;
  disabled?: boolean;
}) {
  const unavailable = disabled || rows.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`${title} export options`}>
      <button
        type="button"
        disabled={unavailable}
        onClick={() => downloadPdfReport({ title, columns, rows, fileName })}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border hairline bg-[var(--paper)] px-4 text-[9px] font-semibold uppercase tracking-[0.08em] transition hover:border-[var(--deep-green)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FileDown size={13} /> PDF
      </button>
      <button
        type="button"
        disabled={unavailable}
        onClick={() => downloadExcelReport({ title, columns, rows, fileName })}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border hairline bg-[var(--paper)] px-4 text-[9px] font-semibold uppercase tracking-[0.08em] transition hover:border-[var(--deep-green)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FileSpreadsheet size={13} /> Excel
      </button>
    </div>
  );
}
