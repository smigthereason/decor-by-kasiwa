/**
 * DBK-35: One-time, audited correction of Paybill receipt RCT-DBK-POS-2204-2026.
 * DRY RUN by default. Never creates a payment or changes stock.
 * Only execute after authorized confirmation of original Safaricom Paybill record.
 */
import { getCliClient } from "sanity/cli";

const client = getCliClient().withConfig({ apiVersion: "2026-08-27", useCdn: false, perspective: "published" });
const ORDER_ID = "commerceOrder.pos.DBK-POS-a7c898fb-9869-40e5-86b3-123edf9602eb";
const PAYMENT_ID = "paymentTransaction.DBK-POS-a7c898fb-9869-40e5-86b3-123edf9602eb";
const AUDIT_ID = "auditEvent.DBK-35-paybill-2204-payment-correction";
const RECEIPT = "RCT-DBK-POS-2204-2026";
const ORDER = "DBK-POS-2204-2026";
const REF = "UJOL3BOW08";
const PREVIOUS = 2249.98;
const VERIFIED = 2250;
const write = process.env.DBK_35_APPLY === "1";
const approved = process.env.DBK_35_CONFIRM === "RCT-DBK-POS-2204-2026:UJOL3BOW08:2250";

type OrderRecord = {
  _id: string; _rev: string; _type: string; orderNumber: string; receiptNumber: string;
  total: number; amountPaid: number; balanceDue: number; manualAmountReceived: number;
  manualPaymentReference: string; paymentStatus: string; paymentProvider: string; paymentChannel: string;
  status: string; customer?: { _ref?: string };
};
type PaymentRecord = { _id: string; _rev: string; _type: string; orderNumber: string; providerReceiptNumber: string; amount: number; status: string; provider: string; channel: string; order?: { _ref?: string } };
type CustomerRecord = { _id: string; _rev: string; outstandingBalance?: number };

function cents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Financial record contains an invalid amount.");
  return Math.round(value * 100);
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`STOP: ${message}`); }

async function main() {
  const [order, payment, existingAudit] = await Promise.all([
    client.fetch<OrderRecord | null>(`*[_id == $id][0]{_id,_rev,_type,orderNumber,receiptNumber,total,amountPaid,balanceDue,manualAmountReceived,manualPaymentReference,paymentStatus,paymentProvider,paymentChannel,status,customer}`, { id: ORDER_ID }),
    client.fetch<PaymentRecord | null>(`*[_id == $id][0]{_id,_rev,_type,orderNumber,providerReceiptNumber,amount,status,provider,channel,order}`, { id: PAYMENT_ID }),
    client.fetch<{ _id: string } | null>(`*[_id == $id][0]{_id}`, { id: AUDIT_ID }),
  ]);
  if (existingAudit) {
    assert(order && payment && cents(order.amountPaid) === 225000 && cents(payment.amount) === 225000 && cents(order.balanceDue) === 0 && order.paymentStatus === "paid" && payment.status === "paid", "Existing correction audit found, but payment state does not match. Investigate manually.");
    console.log("ALREADY CORRECTED: audit exists and records match. No changes.");
    return;
  }
  assert(order && payment, "Order and/or payment transaction not found. No changes.");
  assert(order._id === ORDER_ID && order._type === "commerceOrder" && order.orderNumber === ORDER && order.receiptNumber === RECEIPT, "Order identity mismatch.");
  assert(payment._id === PAYMENT_ID && payment._type === "paymentTransaction" && payment.orderNumber === ORDER && payment.order?._ref === ORDER_ID, "Payment identity or order link mismatch.");
  assert(order.manualPaymentReference === REF && payment.providerReceiptNumber === REF, "Paybill reference mismatch.");
  assert(order.paymentProvider === "manual" && order.paymentChannel === "external" && payment.provider === "manual" && payment.channel === "external", "This is not the expected external manual Paybill payment.");
  assert(order.status === "paid" && order.paymentStatus === "partially_paid" && payment.status === "partially_paid", "Unexpected status. No changes.");
  assert(cents(order.total) === 225000 && cents(order.amountPaid) === cents(PREVIOUS) && cents(order.manualAmountReceived) === cents(PREVIOUS) && cents(payment.amount) === cents(PREVIOUS) && cents(order.balanceDue) === 2, "Amounts no longer match audited snapshot. No changes.");

  const customerId = order.customer?._ref;
  const customer = customerId ? await client.fetch<CustomerRecord | null>(`*[_id == $id][0]{_id,_rev,outstandingBalance}`, { id: customerId }) : null;
  if (customerId) assert(customer, "Linked customer no longer exists. No changes.");
  const customerOldBalance = customer ? Number(customer.outstandingBalance || 0) : null;
  if (customer) assert(customerOldBalance !== null && Number.isFinite(customerOldBalance) && customerOldBalance >= 0, "Invalid customer outstanding balance.");
  const customerNewBalance = customer ? Math.max(0, (Math.round(customerOldBalance! * 100) - 2) / 100) : null;

  console.log(JSON.stringify({ mode: write ? "WRITE REQUESTED" : "DRY RUN", order: ORDER, receipt: RECEIPT, providerReference: REF,
    verifiedPaybillKES: VERIFIED, orderAmountBeforeKES: order.amountPaid, paymentAmountBeforeKES: payment.amount,
    newAmountKES: VERIFIED, balanceBeforeKES: order.balanceDue, balanceAfterKES: 0,
    customerOutstandingBeforeKES: customerOldBalance, customerOutstandingAfterKES: customerNewBalance,
    willCreatePayment: false, willChangeStock: false, willCreateAudit: write }, null, 2));
  if (!write) return;
  assert(approved, "Write requires DBK_35_CONFIRM=RCT-DBK-POS-2204-2026:UJOL3BOW08:2250 after authenticating provider evidence.");
  const operator = process.env.DBK_35_OPERATOR?.trim();
  assert(operator && operator.length >= 3, "DBK_35_OPERATOR must identify the authorized admin executing the financial correction.");

  const now = new Date().toISOString();
  const tx = client.transaction();
  tx.patch(ORDER_ID, (patch) => patch.ifRevisionId(order._rev).set({ amountPaid: VERIFIED, manualAmountReceived: VERIFIED, balanceDue: 0, paymentStatus: "paid", updatedAt: now }));
  tx.patch(PAYMENT_ID, (patch) => patch.ifRevisionId(payment._rev).set({ amount: VERIFIED, status: "paid", updatedAt: now }));
  if (customer && customerNewBalance !== null && customerOldBalance !== null && customerNewBalance !== customerOldBalance) {
    tx.patch(customer._id, (patch) => patch.ifRevisionId(customer._rev).set({ outstandingBalance: customerNewBalance, updatedAt: now }));
  }
  tx.createIfNotExists({ _id: AUDIT_ID, _type: "auditEvent", eventNumber: "AUD-DBK-35-2204", eventType: "POS_MANUAL_PAYMENT_CORRECTED", entityType: "commerceOrder", entityId: ORDER_ID, entityLabel: ORDER,
    actorName: operator, actorRole: "ADMIN", createdAt: now, resolutionStatus: "RESOLVED", resolvedAt: now,
    detail: `Paybill evidence for ${REF} confirms KES ${VERIFIED.toFixed(2)} on 2026-10-24. Corrected existing ${RECEIPT} order and linked payment from KES ${PREVIOUS.toFixed(2)} (partial KES 0.02) to KES ${VERIFIED.toFixed(2)} (paid); ${customer ? `customer receivable reduced by KES ${(customerOldBalance! - customerNewBalance!).toFixed(2)}; ` : ""}no duplicate payment created; no stock changed. Original record revisions: order=${order._rev}, payment=${payment._rev}.` });
  await tx.commit();
  const [afterOrder, afterPayment] = await Promise.all([
    client.fetch<{ amountPaid:number; balanceDue:number; paymentStatus:string } | null>(`*[_id == $id][0]{amountPaid,balanceDue,paymentStatus}`, { id: ORDER_ID }),
    client.fetch<{ amount:number; status:string } | null>(`*[_id == $id][0]{amount,status}`, { id: PAYMENT_ID }),
  ]);
  assert(afterOrder && afterPayment && cents(afterOrder.amountPaid) === 225000 && cents(afterOrder.balanceDue) === 0 && afterOrder.paymentStatus === "paid" && cents(afterPayment.amount) === 225000 && afterPayment.status === "paid", "Write completed but post-write check did not match. Investigate transaction immediately.");
  console.log("SUCCESS: same receipt and payment reconciled; audit saved. No duplicate payment or inventory updates.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
