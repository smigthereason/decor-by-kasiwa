#!/usr/bin/env node
// DBK-88: one-time reconciliation. Read-only unless explicitly authorized.
const PROJECT = "g34n810u";
const DATASET = "production";
const ORDER = "DBK-POS-2486-2026";
const RECEIPT = "RCT-DBK-POS-2486-2026";
const AUDIT_ID = "auditEvent.DBK-88-paybill-2486-payment-correction";
const token = process.env.SANITY_API_WRITE_TOKEN;

function check(condition, message) {
  if (!condition) throw Error("STOP: " + message);
}

check(token, "Missing Sanity production token");

const base = `https://${PROJECT}.api.sanity.io/v2025-02-19`;

async function request(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? {"Content-Type":"application/json"} : {})
    },
    ...(body ? {body:JSON.stringify(body)} : {}),
    cache:"no-store"
  });
  check(response.ok, `Sanity HTTP ${response.status}`);
  return response.json();
}

async function query(q, params = {}) {
  const url = new URL(`${base}/data/query/${DATASET}`);
  url.searchParams.set("query",q);
  url.searchParams.set("perspective","published");
  for (const [k,v] of Object.entries(params))
    url.searchParams.set("$"+k,JSON.stringify(v));
  return (await request(url)).result;
}

const cents = n => {
  check(typeof n === "number" && Number.isFinite(n),
    "Invalid currency amount");
  return Math.round(n*100);
};

check(
  !process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID === PROJECT,
  "Wrong Sanity project"
);

const orders = await query(
  `*[_type=="commerceOrder" && orderNumber==$n]{
    _id,_rev,_type,orderNumber,receiptNumber,status,
    paymentStatus,total,amountPaid,balanceDue,
    manualAmountReceived,manualPaymentReference,
    paymentProvider,paymentChannel,refundedAmount,
    "customerId":customer._ref
  }`, {n:ORDER}
);

check(orders.length===1,"Expected exactly one order");
const o=orders[0];

check(o.receiptNumber===RECEIPT && o._rev,
  "Order identity mismatch");

const payments = await query(
  `*[_type=="paymentTransaction" &&
    (order._ref==$id || orderNumber==$n)]{
    _id,_rev,_type,orderNumber,
    "orderId":order._ref,
    providerReceiptNumber,status,amount,provider,channel
  }`, {id:o._id,n:ORDER}
);

check(payments.length===1,"Expected one existing payment");
const p=payments[0];

check(p.orderId===o._id && p.orderNumber===ORDER && p._rev,
  "Payment/order mismatch");

const ref=o.manualPaymentReference;

check(
  typeof ref==="string" &&
  ref.length>=5 &&
  ref===p.providerReceiptNumber,
  "Paybill reference mismatch"
);

check(
  o.paymentProvider==="manual" &&
  o.paymentChannel==="external" &&
  p.provider==="manual" &&
  p.channel==="external",
  "Unexpected payment method"
);

const existingAudit=await query(
  `*[_id==$id][0]{_id}`,{id:AUDIT_ID}
);

if(existingAudit) {
  check(
    cents(o.amountPaid)===120000 &&
    cents(p.amount)===120000 &&
    cents(o.balanceDue)===0 &&
    o.paymentStatus==="paid" &&
    p.status==="paid",
    "Audit exists but ledger differs"
  );
  console.log("ALREADY CORRECTED — NO WRITES");
  process.exit(0);
}

check(
  o.status==="paid" &&
  o.paymentStatus==="partially_paid" &&
  p.status==="partially_paid",
  "Payment status changed"
);

check(
  cents(o.total)===120000 &&
  cents(o.amountPaid)===20000 &&
  cents(o.manualAmountReceived)===20000 &&
  cents(o.balanceDue)===100000 &&
  cents(p.amount)===20000,
  "Amounts differ from the verified snapshot"
);

check(cents(o.refundedAmount??0)===0,
  "Refund exists; manual investigation needed");

const duplicate=await query(
  `*[_type=="paymentTransaction" &&
    providerReceiptNumber==$ref]{_id}`,{ref}
);

check(
  duplicate.length===1 && duplicate[0]._id===p._id,
  "Payment reference is duplicated"
);

const returns=await query(
  `count(*[_type=="returnTransaction" && order._ref==$id])`,
  {id:o._id}
);
check(returns===0,"Return record exists");

const customer=o.customerId
  ? await query(
      `*[_id==$id][0]{_id,_rev,outstandingBalance}`,
      {id:o.customerId}
    )
  : null;

check(!o.customerId || customer?._rev,
  "Linked customer missing");

let customerNewBalance=null;

if(customer) {
  const before=cents(customer.outstandingBalance??0);
  check(before>=100000,
    "Customer balance is less than KSh 1,000");
  customerNewBalance=(before-100000)/100;
}

const apply=process.env.DBK88_APPLY==="YES";

console.log(JSON.stringify({
  mode:apply?"WRITE_REQUESTED":"READ_ONLY",
  orderNumber:ORDER,
  receipt:RECEIPT,
  paymentReferenceEnding:"***"+ref.slice(-4),
  totalKES:1200,
  currentlyRecordedKES:200,
  correctedPaidKES:1200,
  correctedBalanceKES:0,
  customerOutstandingAfterKES:customerNewBalance,
  createsAnotherPayment:false,
  changesInventory:false
},null,2));

if(!apply) {
  console.log("DRY RUN COMPLETE — NO WRITES");
  process.exit(0);
}

check(
  process.env.DBK88_VERIFIED_PAYBILL_REF?.trim().toUpperCase()
    ===ref.toUpperCase(),
  "Independently verified full Paybill reference required"
);

check(
  process.env.DBK88_CONFIRMED_AMOUNT==="1200" &&
  process.env.DBK88_CONFIRM===`${RECEIPT}:1200`,
  "Explicit KSh 1,200 confirmation required"
);

const operator=process.env.DBK88_OPERATOR?.trim();
check(operator && operator.length>=3,
  "Authorized operator required");

const now=new Date().toISOString();

const mutations=[
  {patch:{
    id:o._id,
    ifRevisionID:o._rev,
    set:{
      amountPaid:1200,
      manualAmountReceived:1200,
      balanceDue:0,
      paymentStatus:"paid",
      updatedAt:now
    }
  }},
  {patch:{
    id:p._id,
    ifRevisionID:p._rev,
    set:{
      amount:1200,
      status:"paid",
      updatedAt:now
    }
  }}
];

if(customer) {
  mutations.push({patch:{
    id:customer._id,
    ifRevisionID:customer._rev,
    set:{
      outstandingBalance:customerNewBalance,
      updatedAt:now
    }
  }});
}

mutations.push({createIfNotExists:{
  _id:AUDIT_ID,
  _type:"auditEvent",
  eventNumber:"AUD-DBK-88-2486",
  eventType:"POS_MANUAL_PAYMENT_CORRECTED",
  entityType:"commerceOrder",
  entityId:o._id,
  entityLabel:ORDER,
  actorName:operator,
  actorRole:"ADMIN",
  createdAt:now,
  resolutionStatus:"RESOLVED",
  resolvedAt:now,
  detail:`Verified one KSh 1,200 Paybill payment.
Reference: ${ref}.
Corrected existing KSh 200 partial payment to KSh 1,200 paid.
Outstanding balance corrected from KSh 1,000 to zero.
No duplicate payment or stock movement created.
Order revision: ${o._rev}; payment revision: ${p._rev}.`
}});

const result=await request(
  `${base}/data/mutate/${DATASET}?returnIds=true`,
  {mutations}
);

check(
  Array.isArray(result.results) &&
  result.results.length===mutations.length,
  "Mutation response unexpected; verify before retry"
);

const updatedOrder=await query(
  `*[_id==$id][0]{amountPaid,balanceDue,paymentStatus}`,
  {id:o._id}
);

const updatedPayment=await query(
  `*[_id==$id][0]{amount,status}`,
  {id:p._id}
);

check(
  cents(updatedOrder.amountPaid)===120000 &&
  cents(updatedOrder.balanceDue)===0 &&
  updatedOrder.paymentStatus==="paid" &&
  cents(updatedPayment.amount)===120000 &&
  updatedPayment.status==="paid",
  "Post-write verification failed; do not retry"
);

console.log("DBK88 APPLIED_AND_VERIFIED");
console.log("Paid: KSh 1,200 | Balance: KSh 0");
console.log("No duplicate payment or stock changes.");
