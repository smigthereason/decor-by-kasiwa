import Link from "next/link";

import PrintReceiptButton from "@/components/backoffice/PrintReceiptButton";
import { formatMoney } from "@/lib/money";
import { getPosReceipt } from "@/lib/pos/server";

export default async function PosReceiptPage({ orderId, basePath }: { orderId: string; basePath: "/admin" | "/store" }) {
  const receipt = await getPosReceipt(orderId);
  if (!receipt) {
    return <div className="p-8"><p className="text-sm">Receipt not found.</p></div>;
  }

  return (
    <main className="min-h-full bg-[var(--paper-2)] p-4 sm:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl rounded-2xl border hairline bg-[var(--paper)] p-6 sm:p-8 print:border-0 print:p-0">
        <div className="print:hidden mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href={`${basePath}/pos/operations`} className="text-xs font-semibold underline underline-offset-4">Back to POS operations</Link>
          <PrintReceiptButton />
        </div>

        <div className="border-b hairline pb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--deep-green)]">Decor by Kasiwa</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Sales Receipt</h1>
          <p className="mt-2 text-xs text-[var(--muted)]">{receipt.receiptNumber || `RCT-${receipt.orderNumber}`}</p>
        </div>

        <div className="grid gap-4 border-b hairline py-5 text-xs sm:grid-cols-2">
          <div><span className="text-[var(--muted)]">Customer</span><p className="mt-1 font-semibold">{receipt.customerName || "Customer"}</p><p>{receipt.customerPhone || ""}</p>{receipt.customerEmail && <p>{receipt.customerEmail}</p>}</div>
          <div className="sm:text-right"><span className="text-[var(--muted)]">Sale</span><p className="mt-1 font-semibold">{receipt.orderNumber}</p><p>{receipt.soldAt ? new Date(receipt.soldAt).toLocaleString("en-KE") : ""}</p><p>Cashier: {receipt.soldByName || "Staff"}</p></div>
        </div>

        <div className="divide-y hairline">
          {(receipt.lineItems || []).map((line) => (
            <div key={line._key} className="flex justify-between gap-5 py-4 text-xs">
              <div><p className="font-semibold">{line.quantity} × {line.name}</p><p className="mt-1 text-[var(--muted)]">{[line.finish, line.size].filter(Boolean).join(" · ") || "Standard"}</p></div>
              <span className="whitespace-nowrap font-semibold">{formatMoney(line.quantity * line.unitPrice)}</span>
            </div>
          ))}
        </div>

        <div className="border-t hairline pt-5 text-xs">
          <div className="flex justify-between py-1.5"><span>Subtotal</span><span>{formatMoney(Number(receipt.subtotal || 0))}</span></div>
          {Number(receipt.discountAmount || 0) > 0 && <div className="flex justify-between py-1.5"><span>Discount</span><span>-{formatMoney(Number(receipt.discountAmount || 0))}</span></div>}
          <div className="flex justify-between py-2 text-base font-semibold"><span>Total</span><span>{formatMoney(Number(receipt.total || 0))}</span></div>
          <div className="flex justify-between py-1.5"><span>Paid</span><span>{formatMoney(Number(receipt.amountPaid || 0))}</span></div>
          {Number(receipt.cashTendered || 0) > 0 && <div className="flex justify-between py-1.5"><span>Cash tendered</span><span>{formatMoney(Number(receipt.cashTendered || 0))}</span></div>}
          {Number(receipt.cashChangeDue || 0) > 0 && <div className="flex justify-between py-1.5 font-semibold text-emerald-700"><span>Change returned</span><span>{formatMoney(Number(receipt.cashChangeDue || 0))}</span></div>}
          {Number(receipt.balanceDue || 0) > 0 && <div className="flex justify-between py-1.5 font-semibold text-amber-700"><span>Balance due</span><span>{formatMoney(Number(receipt.balanceDue || 0))}</span></div>}
          {Number(receipt.refundedAmount || 0) > 0 && <div className="flex justify-between py-1.5"><span>Refunded</span><span>{formatMoney(Number(receipt.refundedAmount || 0))}</span></div>}
        </div>

        <div className="mt-6 rounded-xl bg-[var(--paper-2)] p-4 text-[11px] leading-5">
          <p><strong>Payment:</strong> {receipt.paymentChannel || "—"} · {receipt.paymentStatus || "—"}</p>
          <p><strong>Payment reference:</strong> {receipt.paymentReference || "—"}</p>
          {receipt.providerReceiptNumber && <p><strong>Provider transaction:</strong> {receipt.providerReceiptNumber}</p>}
        </div>

        <p className="mt-8 text-center text-[10px] text-[var(--muted)]">Thank you for shopping with Decor by Kasiwa.</p>
      </div>
    </main>
  );
}
