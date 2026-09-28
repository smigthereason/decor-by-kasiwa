import Link from "next/link";

import PrintReceiptButton from "@/components/backoffice/PrintReceiptButton";
import { formatMoney } from "@/lib/money";
import { getPosReceipt } from "@/lib/pos/server";

function paymentLabel(provider?: string, channel?: string) {
  if (provider === "daraja") return "Safaricom M-PESA";
  if (provider === "manual") return "Manual / external payment";
  if (provider === "paystack") return channel === "mobile_money" ? "M-PESA (legacy Paystack)" : "Paystack";
  if (channel === "mobile_money") return "M-PESA";
  return channel || provider || "Payment";
}

function displayRole(role?: string) {
  return (role || "Staff").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (value) => value.toUpperCase());
}

export default async function PosReceiptPage({ orderId, basePath }: { orderId: string; basePath: "/admin" | "/store" }) {
  const receipt = await getPosReceipt(orderId);
  if (!receipt) {
    return <div className="p-8"><p className="text-sm">Receipt not found.</p></div>;
  }

  const printable = receipt.paymentStatus === "paid" || receipt.paymentStatus === "partially_paid";
  const isDelivery = receipt.fulfilmentType === "DELIVERY" || Number(receipt.deliveryFee || 0) > 0;
  const delivery = receipt.deliveryAddress;
  const transactionReference = receipt.providerReceiptNumber || receipt.manualPaymentReference || receipt.paymentReference;

  return (
    <main className="min-h-full bg-[var(--paper-2)] p-4 sm:p-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl rounded-2xl border hairline bg-[var(--paper)] p-5 sm:p-8 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={`${basePath}/pos/operations`} className="text-xs font-semibold underline underline-offset-4">Back to POS operations</Link>
          {printable ? <PrintReceiptButton /> : <span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-800">Payment not confirmed</span>}
        </div>

        <header className="border-b-2 border-[var(--ink)]/15 pb-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand-green)]">{receipt.businessName}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Sales Receipt</h1>
          <p className="mt-2 text-sm font-semibold">{receipt.receiptNumber || `RCT-${receipt.orderNumber}`}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-[var(--muted)]">
            {receipt.businessPhone && <span>{receipt.businessPhone}</span>}
            {receipt.businessEmail && <span>{receipt.businessEmail}</span>}
            {receipt.businessWebsite && <span>{receipt.businessWebsite}</span>}
          </div>
        </header>

        <section className="grid gap-5 border-b hairline py-5 text-xs sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Customer</p>
            <p className="mt-2 text-sm font-semibold">{receipt.customerName || "Walk-in customer"}</p>
            {receipt.customerPhone && <p className="mt-1">{receipt.customerPhone}</p>}
            {receipt.customerEmail && <p className="mt-1 break-all">{receipt.customerEmail}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Sale details</p>
            <p className="mt-2 font-semibold">Order {receipt.orderNumber}</p>
            <p className="mt-1">{receipt.soldAt ? new Date(receipt.soldAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) : ""}</p>
            <p className="mt-1"><strong>Served by:</strong> {receipt.soldByName || "Staff"}</p>
            <p className="mt-1 text-[var(--muted)]">{displayRole(receipt.soldByRole)}</p>
          </div>
        </section>

        {isDelivery && (
          <section className="border-b hairline py-5 text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Delivery details</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-semibold">{delivery?.fullName || receipt.customerName || "Recipient"}</p>
                <p className="mt-1">{delivery?.phone || receipt.customerPhone || "—"}</p>
              </div>
              <div className="sm:text-right">
                <p>{delivery?.address1 || receipt.deliveryLocation || "—"}</p>
                {delivery?.address2 && <p className="mt-1">{delivery.address2}</p>}
                <p className="mt-1">{[delivery?.city, delivery?.region, delivery?.country].filter(Boolean).join(", ") || receipt.deliveryLocation || "Kenya"}</p>
              </div>
            </div>
          </section>
        )}

        <section className="py-2">
          <div className="hidden grid-cols-[1fr_64px_110px_120px] gap-3 border-b hairline py-3 text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)] sm:grid">
            <span>Item</span><span className="text-center">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span>
          </div>
          <div className="divide-y hairline">
            {(receipt.lineItems || []).map((line) => (
              <div key={line._key} className="grid gap-2 py-4 text-xs sm:grid-cols-[1fr_64px_110px_120px] sm:items-center sm:gap-3">
                <div>
                  <p className="font-semibold">{line.name}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{[line.finish, line.size].filter(Boolean).join(" · ") || line.category || "Standard"}</p>
                </div>
                <div className="flex justify-between sm:block sm:text-center"><span className="text-[var(--muted)] sm:hidden">Quantity</span><span>{line.quantity}</span></div>
                <div className="flex justify-between sm:block sm:text-right"><span className="text-[var(--muted)] sm:hidden">Unit price</span><span>{formatMoney(line.unitPrice)}</span></div>
                <div className="flex justify-between font-semibold sm:block sm:text-right"><span className="text-[var(--muted)] sm:hidden">Amount</span><span>{formatMoney(line.quantity * line.unitPrice)}</span></div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t-2 border-[var(--ink)]/15 pt-5 text-xs">
          <div className="ml-auto max-w-sm space-y-1">
            <div className="flex justify-between gap-5 py-1"><span>Subtotal</span><span>{formatMoney(Number(receipt.subtotal || 0))}</span></div>
            {Number(receipt.discountAmount || 0) > 0 && <div className="flex justify-between gap-5 py-1"><span>Discount{receipt.discountReason ? ` · ${receipt.discountReason}` : ""}</span><span>-{formatMoney(Number(receipt.discountAmount || 0))}</span></div>}
            {Number(receipt.deliveryFee || 0) > 0 && <div className="flex justify-between gap-5 py-1"><span>Delivery</span><span>{formatMoney(Number(receipt.deliveryFee || 0))}</span></div>}
            <div className="mt-2 flex justify-between gap-5 border-t hairline py-3 text-base font-semibold"><span>Total</span><span>{formatMoney(Number(receipt.total || 0))}</span></div>
            <div className="flex justify-between gap-5 py-1"><span>Paid</span><span>{formatMoney(Number(receipt.amountPaid || 0))}</span></div>
            {Number(receipt.cashTendered || 0) > 0 && <div className="flex justify-between gap-5 py-1"><span>Cash tendered</span><span>{formatMoney(Number(receipt.cashTendered || 0))}</span></div>}
            {Number(receipt.cashChangeDue || 0) > 0 && <div className="flex justify-between gap-5 py-1 font-semibold"><span>Change returned</span><span>{formatMoney(Number(receipt.cashChangeDue || 0))}</span></div>}
            {Number(receipt.balanceDue || 0) > 0 && <div className="flex justify-between gap-5 py-1 font-semibold"><span>Balance due</span><span>{formatMoney(Number(receipt.balanceDue || 0))}</span></div>}
            {Number(receipt.refundedAmount || 0) > 0 && <div className="flex justify-between gap-5 py-1"><span>Refunded</span><span>{formatMoney(Number(receipt.refundedAmount || 0))}</span></div>}
          </div>
        </section>

        <section className="mt-6 rounded-xl border hairline bg-[var(--paper-2)] p-4 text-[11px] leading-5 print:bg-white">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Payment method</p>
              <p className="mt-1 font-semibold">{paymentLabel(receipt.paymentProvider, receipt.paymentChannel)}</p>
              <p className="mt-1 capitalize">Status: {receipt.paymentStatus || "—"}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Transaction reference</p>
              <p className="mt-1 break-all font-mono font-semibold">{transactionReference || "—"}</p>
              {receipt.paymentProvider === "daraja" && receipt.providerReceiptNumber && <p className="mt-1"><strong>M-PESA receipt:</strong> {receipt.providerReceiptNumber}</p>}
            </div>
          </div>
          {receipt.manualPaymentName && <p className="mt-3"><strong>Payer:</strong> {receipt.manualPaymentName}</p>}
        </section>

        <footer className="mt-8 border-t hairline pt-5 text-center">
          <p className="text-xs font-semibold">Thank you for shopping with {receipt.businessName}.</p>
          <p className="mt-2 text-[9px] leading-4 text-[var(--muted)]">Please retain this receipt for order, payment and delivery reference.</p>
        </footer>
      </div>
    </main>
  );
}
