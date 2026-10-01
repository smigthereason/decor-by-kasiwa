import Image from "next/image";
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

function discountDescription(type?: "percent" | "fixed", value?: number, reason?: string) {
  const cleanReason = reason?.trim();
  let rule = "";
  if (type === "percent" && Number(value) > 0) rule = `${Number(value)}%`;
  if (type === "fixed" && Number(value) > 0) rule = `${formatMoney(Number(value))} fixed`;
  return [rule, cleanReason].filter(Boolean).join(" · ");
}

export default async function PosReceiptPage({ orderId, basePath }: { orderId: string; basePath: "/admin" | "/store" }) {
  const receipt = await getPosReceipt(orderId);
  if (!receipt) {
    return <div className="p-8"><p className="text-sm">Receipt not found.</p></div>;
  }

  const printable = receipt.paymentStatus === "paid" || receipt.paymentStatus === "partially_paid";
  const delivery = receipt.deliveryAddress;
  const hasCapturedDelivery = Boolean(
    receipt.fulfilmentType === "DELIVERY" ||
    Number(receipt.deliveryFee || 0) > 0 ||
    delivery?.address1 ||
    delivery?.address2 ||
    delivery?.city ||
    delivery?.region ||
    (receipt.deliveryLocation && receipt.deliveryLocation !== "In-store purchase"),
  );
  const transactionReference = receipt.providerReceiptNumber || receipt.manualPaymentReference || receipt.paymentReference;
  const discountDetail = discountDescription(receipt.discountType, receipt.discountValue, receipt.discountReason);

  return (
    <main className="min-h-full bg-[var(--paper-2)] p-4 sm:p-8 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 2mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .pos-receipt-paper, .pos-receipt-paper * { visibility: visible !important; }
          .pos-receipt-paper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 72mm !important;
            max-width: 72mm !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #000 !important;
            font-size: 10px !important;
          }
          .pos-receipt-paper header { padding-bottom: 2mm !important; }
          .pos-receipt-paper section { padding-top: 1.6mm !important; padding-bottom: 1.6mm !important; }
          .pos-receipt-paper footer { margin-top: 2mm !important; padding-top: 1.5mm !important; }
          .pos-receipt-paper .receipt-logo { width: 28mm !important; }
          .pos-receipt-paper .receipt-title { margin-top: 1mm !important; font-size: 14px !important; }
          .pos-receipt-paper .receipt-items { font-size: 9px !important; }
          .pos-receipt-paper .receipt-payment-box { margin-top: 1.5mm !important; padding: 1.8mm !important; border-radius: 0 !important; }
          .pos-receipt-paper .receipt-muted { color: #333 !important; }
        }
      `}</style>

      <div className="pos-receipt-paper mx-auto max-w-xl rounded-2xl border hairline bg-[var(--paper)] p-5 sm:p-7 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={`${basePath}/pos/operations`} className="text-xs font-semibold underline underline-offset-4">Back to POS operations</Link>
          {printable ? <PrintReceiptButton /> : <span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-800">Payment not confirmed</span>}
        </div>

        <header className="border-b-2 border-[var(--ink)]/15 pb-4 text-center">
          <Image
            src="/logo.png"
            alt="Decor by Kasiwa"
            width={1792}
            height={1008}
            className="receipt-logo mx-auto h-auto w-[140px] object-contain sm:w-[160px] print:w-[106px]"
            priority
          />
          <h1 className="receipt-title mt-2 text-xl font-semibold tracking-[-0.04em]">POS Receipt</h1>
          <p className="mt-1 text-xs font-semibold">{receipt.receiptNumber || `RCT-${receipt.orderNumber}`}</p>
          <div className="receipt-muted mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[9px] text-[var(--muted)]">
            {receipt.businessPhone && <span>{receipt.businessPhone}</span>}
            {receipt.businessEmail && <span>{receipt.businessEmail}</span>}
            {receipt.businessWebsite && <span>{receipt.businessWebsite}</span>}
          </div>
        </header>

        <section className="grid gap-2 border-b hairline py-3 text-[11px] sm:grid-cols-2 print:grid-cols-1">
          <div>
            <p className="receipt-muted text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Customer</p>
            <p className="mt-1 font-semibold">{receipt.customerName || "Walk-in customer"}</p>
            {receipt.customerPhone && <p className="mt-0.5">{receipt.customerPhone}</p>}
            {receipt.customerEmail && <p className="mt-0.5 break-all">{receipt.customerEmail}</p>}
          </div>
          <div className="sm:text-right print:text-left">
            <p className="receipt-muted text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Sale details</p>
            <p className="mt-1 font-semibold">{receipt.orderNumber}</p>
            <p className="mt-0.5">{receipt.soldAt ? new Date(receipt.soldAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) : ""}</p>
            <p className="mt-0.5"><strong>Served by:</strong> {receipt.soldByName || "Staff"}</p>
            <p className="receipt-muted mt-0.5 text-[var(--muted)]">{displayRole(receipt.soldByRole)}</p>
          </div>
        </section>

        {hasCapturedDelivery && (
          <section className="border-b hairline py-3 text-[11px]">
            <p className="receipt-muted text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Delivery details</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 print:grid-cols-1">
              <div>
                <p className="font-semibold">{delivery?.fullName || receipt.customerName || "Recipient"}</p>
                {(delivery?.phone || receipt.customerPhone) && <p className="mt-0.5">{delivery?.phone || receipt.customerPhone}</p>}
              </div>
              <div className="sm:text-right print:text-left">
                <p>{delivery?.address1 || receipt.deliveryLocation || "—"}</p>
                {delivery?.address2 && <p className="mt-0.5">{delivery.address2}</p>}
                <p className="mt-0.5">{[delivery?.city, delivery?.region, delivery?.country].filter(Boolean).join(", ") || receipt.deliveryLocation || "Kenya"}</p>
              </div>
            </div>
          </section>
        )}

        <section className="receipt-items py-2">
          <div className="grid grid-cols-[1fr_34px_76px] gap-2 border-b hairline py-2 text-[8px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] sm:grid-cols-[1fr_54px_92px]">
            <span>Item</span><span className="text-center">Qty</span><span className="text-right">Amount</span>
          </div>
          <div className="divide-y hairline">
            {(receipt.lineItems || []).map((line) => (
              <div key={line._key} className="grid grid-cols-[1fr_34px_76px] items-start gap-2 py-1.5 text-[10px] sm:grid-cols-[1fr_54px_92px]">
                <div className="min-w-0">
                  <p className="font-semibold">{line.name}</p>
                  <p className="receipt-muted mt-0.5 text-[8px] text-[var(--muted)]">{[line.finish, line.size].filter(Boolean).join(" · ") || line.category || "Standard"}</p>
                  <p className="receipt-muted mt-0.5 text-[8px] text-[var(--muted)]">@ {formatMoney(line.unitPrice)}</p>
                </div>
                <span className="text-center">{line.quantity}</span>
                <span className="text-right font-semibold">{formatMoney(line.quantity * line.unitPrice)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t-2 border-[var(--ink)]/15 pt-3 text-[11px]">
          <div className="ml-auto max-w-sm space-y-0.5">
            <div className="flex justify-between gap-4 py-0.5"><span>Subtotal</span><span>{formatMoney(Number(receipt.subtotal || 0))}</span></div>
            {Number(receipt.discountAmount || 0) > 0 && (
              <>
                <div className="flex justify-between gap-4 py-0.5 font-semibold">
                  <span>Discount{discountDetail ? ` (${discountDetail})` : ""}</span>
                  <span>-{formatMoney(Number(receipt.discountAmount || 0))}</span>
                </div>
                {receipt.discountAuthorizedByName && <p className="receipt-muted text-[8px] text-[var(--muted)]">Discount authorised by {receipt.discountAuthorizedByName}</p>}
              </>
            )}
            {hasCapturedDelivery && <div className="flex justify-between gap-4 py-0.5"><span>Delivery</span><span>{formatMoney(Number(receipt.deliveryFee || 0))}</span></div>}
            <div className="mt-1 flex justify-between gap-4 border-t hairline py-2 text-sm font-semibold"><span>Total</span><span>{formatMoney(Number(receipt.total || 0))}</span></div>
            <div className="flex justify-between gap-4 py-0.5"><span>Paid</span><span>{formatMoney(Number(receipt.amountPaid || 0))}</span></div>
            {Number(receipt.cashTendered || 0) > 0 && <div className="flex justify-between gap-4 py-0.5"><span>Cash tendered</span><span>{formatMoney(Number(receipt.cashTendered || 0))}</span></div>}
            {Number(receipt.cashChangeDue || 0) > 0 && <div className="flex justify-between gap-4 py-0.5 font-semibold"><span>Change</span><span>{formatMoney(Number(receipt.cashChangeDue || 0))}</span></div>}
            {Number(receipt.balanceDue || 0) > 0 && <div className="flex justify-between gap-4 py-0.5 font-semibold"><span>Balance due</span><span>{formatMoney(Number(receipt.balanceDue || 0))}</span></div>}
            {Number(receipt.refundedAmount || 0) > 0 && <div className="flex justify-between gap-4 py-0.5"><span>Refunded</span><span>{formatMoney(Number(receipt.refundedAmount || 0))}</span></div>}
          </div>
        </section>

        <section className="receipt-payment-box mt-3 rounded-xl border hairline bg-[var(--paper-2)] p-2.5 text-[10px] leading-4 print:bg-white">
          <p><strong>Payment:</strong> {paymentLabel(receipt.paymentProvider, receipt.paymentChannel)} · <span className="capitalize">{receipt.paymentStatus || "—"}</span></p>
          <p className="mt-1 break-all"><strong>Reference:</strong> {transactionReference || "—"}</p>
          {receipt.paymentProvider === "daraja" && receipt.providerReceiptNumber && <p className="mt-1"><strong>M-PESA receipt:</strong> {receipt.providerReceiptNumber}</p>}
          {receipt.manualPaymentName && <p className="mt-1"><strong>Payer:</strong> {receipt.manualPaymentName}</p>}
        </section>

        <footer className="mt-3 border-t hairline pt-3 text-center">
          <p className="text-[11px] font-semibold">Thank you for shopping with {receipt.businessName}.</p>
          <p className="receipt-muted mt-1 text-[8px] leading-3 text-[var(--muted)]">Please retain this receipt for payment, order and delivery reference.</p>
        </footer>
      </div>
    </main>
  );
}
