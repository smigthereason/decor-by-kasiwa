import "server-only";

import { createHash, createHmac } from "node:crypto";

import { upsertPosCustomerFromPurchase } from "@/lib/auth/sanity-users";
import type { ApiStaffRole } from "@/lib/auth/api-authorization";
import { addInventoryMovementsToTransaction, recordAuditEvent } from "@/lib/pos/ledger";
import { serverClient } from "@/sanity/lib/serverClient";

const PAYSTACK_API = "https://api.paystack.co";
const CURRENCY = "KES";

export type PosCartLine = {
  productId: string;
  quantity: number;
  colour?: string;
  size?: string;
  variantId?: string;
};

export type PosSeller = {
  id: string;
  name: string;
  email: string;
  role: ApiStaffRole;
};

export type PosDiscountInput = {
  type: "percent" | "fixed";
  value: number;
  reason: string;
};

export type PosSaleInput = {
  requestId: string;
  cart: PosCartLine[];
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  paymentMethod: "cash" | "mpesa" | "paystack";
  cashConfirmed?: boolean;
  cashAmountReceived?: number;
  discount?: PosDiscountInput | null;
};

type RawProduct = {
  _id: string;
  _rev: string;
  name?: string;
  price?: number;
  initialStock?: number;
  available?: boolean;
  category?: string;
  variants?: Array<{
    _key?: string;
    _type?: string;
    title?: string;
    colour?: string;
    size?: string;
    sku?: string;
    price?: number;
    stockQuantity?: number;
    image?: unknown;
    [key: string]: unknown;
  }>;
};

type PosLine = {
  _key: string;
  productId: string;
  name: string;
  category: string;
  finish?: string;
  size?: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
};

type PosOrder = {
  _id: string;
  _rev: string;
  orderNumber: string;
  paymentStatus?: string;
  status?: string;
  subtotal?: number;
  discountAmount?: number;
  total?: number;
  amountPaid?: number;
  balanceDue?: number;
  cashTendered?: number;
  cashChangeDue?: number;
  receiptNumber?: string;
  paymentReference?: string;
  paymentProvider?: string;
  paymentChannel?: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  soldByName?: string;
  soldAt?: string;
  lineItems?: PosLine[];
};

type PaystackChargeResponse = {
  status: boolean;
  message: string;
  data?: {
    reference?: string;
    status?: string;
    display_text?: string;
    message?: string;
    gateway_response?: string | null;
  };
};

type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
};

type PaystackChargeStatusResponse = {
  status: boolean;
  message: string;
  data?: {
    id?: number;
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    paid_at?: string | null;
    gateway_response?: string | null;
    message?: string;
  };
};

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data?: {
    id: number;
    status: string;
    reference: string;
    amount: number;
    currency: string;
    channel?: string;
    paid_at?: string | null;
    gateway_response?: string | null;
  };
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

function hashId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function assertRequestId(value: string) {
  if (!value || !/^[A-Za-z0-9-]{8,80}$/.test(value)) {
    throw new Error("A valid POS request ID is required.");
  }
}

function referenceFor(requestId: string) {
  assertRequestId(requestId);
  return `DBK-POS-${safeId(requestId)}`;
}

function orderIdFor(reference: string) {
  return `commerceOrder.pos.${safeId(reference)}`;
}

function receiptNumberFor(reference: string) {
  return `RCT-${reference}`;
}

function paymentTransactionId(reference: string) {
  return `paymentTransaction.${safeId(reference)}`;
}

function auditId(key: string) {
  return `auditEvent.${hashId(key)}`;
}

function lineKey(productId: string, variantId: string | undefined, index: number) {
  return createHmac("sha256", "dbk-pos-line")
    .update(`${productId}|${variantId || ""}|${index}`)
    .digest("hex")
    .slice(0, 20);
}

function getPaystackSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured for POS payments.");
  return key;
}

async function paystackRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${getPaystackSecret()}`,
      "Content-Type": "application/json",
    },
  });

  const payload = (await response.json()) as T & {
    message?: string;
    code?: string;
    data?: {
      message?: string;
      gateway_response?: string | null;
    };
  };

  if (!response.ok) {
    const detail =
      cleanText(payload.data?.message) ||
      cleanText(payload.data?.gateway_response) ||
      cleanText(payload.message) ||
      `Paystack request failed with HTTP ${response.status}.`;

    throw new Error(`Paystack: ${detail}`);
  }

  return payload;
}

function isPaystackTestMode() {
  return getPaystackSecret().startsWith("sk_test_");
}

function normalizeKenyanPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^2547\d{8}$/.test(digits) || /^2541\d{8}$/.test(digits)) return `+${digits}`;
  if (/^07\d{8}$/.test(digits) || /^01\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^7\d{8}$/.test(digits) || /^1\d{8}$/.test(digits)) return `+254${digits}`;
  throw new Error("Enter a valid Kenyan customer phone number.");
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function customerDetails(input: PosSaleInput) {
  const name = cleanText(input.customerName);
  if (!name) throw new Error("Customer name is required.");

  const rawPhone = cleanText(input.customerPhone);
  if (!rawPhone) throw new Error("Customer phone is required.");
  const phone = normalizeKenyanPhone(rawPhone);

  const email = cleanText(input.customerEmail).toLowerCase();
  if (email && !isEmail(email)) throw new Error("Enter a valid customer email or leave it blank.");

  return { id: cleanText(input.customerId) || undefined, name, email, phone };
}

async function fetchProducts(productIds: string[]) {
  return serverClient.fetch<RawProduct[]>(
    `*[_type == "product" && _id in $ids]{
      _id,
      _rev,
      name,
      price,
      initialStock,
      available,
      "category": primaryCategory->title,
      variants
    }`,
    { ids: productIds },
    { cache: "no-store" },
  );
}

function normalizeCart(cart: PosCartLine[]) {
  if (!Array.isArray(cart) || cart.length === 0) throw new Error("Add at least one product to the POS sale.");

  const merged = new Map<string, PosCartLine>();
  for (const row of cart) {
    const productId = cleanText(row.productId);
    const quantity = Number(row.quantity);
    const colour = cleanText(row.colour) || undefined;
    const size = cleanText(row.size) || undefined;
    const variantId = cleanText(row.variantId) || undefined;

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("The POS cart contains an invalid quantity.");
    }

    const key = `${productId}|${variantId || ""}|${colour || ""}|${size || ""}`;
    const current = merged.get(key);
    merged.set(key, {
      productId,
      quantity: (current?.quantity || 0) + quantity,
      colour,
      size,
      variantId,
    });
  }

  return [...merged.values()];
}

async function buildLines(cart: PosCartLine[]) {
  const normalized = normalizeCart(cart);
  const ids = [...new Set(normalized.map((line) => line.productId))];
  const products = await fetchProducts(ids);
  const byId = new Map(products.map((product) => [product._id, product]));

  const lines: PosLine[] = normalized.map((line, index) => {
    const product = byId.get(line.productId);
    if (!product) throw new Error("A POS product could not be found in the live catalogue.");
    if (product.available === false) throw new Error(`${product.name || "Product"} is unavailable.`);
    if (typeof product.price !== "number" || product.price <= 0) throw new Error(`${product.name || "Product"} has no valid price.`);
    if (typeof product.initialStock === "number" && product.initialStock < line.quantity) {
      throw new Error(`${product.name || "Product"} only has ${Math.max(product.initialStock, 0)} unit(s) available.`);
    }

    const variant = line.variantId
      ? product.variants?.find((item) => item._key === line.variantId)
      : product.variants?.find(
          (item) =>
            (!line.colour || item.colour === line.colour) &&
            (!line.size || item.size === line.size),
        );

    if (line.variantId && !variant) throw new Error(`${product.name || "Product"} variant is no longer available.`);
    if (variant && typeof variant.stockQuantity === "number" && variant.stockQuantity < line.quantity) {
      throw new Error(`${product.name || "Product"} selected variant only has ${Math.max(variant.stockQuantity, 0)} unit(s) available.`);
    }

    return {
      _key: lineKey(product._id, line.variantId || variant?._key, index),
      productId: product._id,
      name: cleanText(product.name) || "Product",
      category: cleanText(product.category) || "Uncategorised",
      finish: line.colour || variant?.colour,
      size: line.size || variant?.size,
      variantId: line.variantId || variant?._key,
      quantity: line.quantity,
      unitPrice: typeof variant?.price === "number" ? variant.price : product.price,
    };
  });

  return { lines, products };
}

function orderLineDocuments(lines: PosLine[]) {
  return lines.map((line) => ({
    _key: line._key,
    _type: "object",
    product: { _type: "reference", _ref: line.productId },
    productId: line.productId,
    name: line.name,
    category: line.category,
    finish: line.finish,
    size: line.size,
    variantId: line.variantId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
  }));
}

function subtotalFor(lines: PosLine[]) {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

type PosDiscountResult = {
  discountAmount: number;
  discountType?: PosDiscountInput["type"];
  discountValue?: number;
  discountReason?: string;
};

function calculateDiscount(
  subtotal: number,
  input: PosDiscountInput | null | undefined,
  seller: PosSeller,
): PosDiscountResult {
  if (!input || !Number(input.value)) return { discountAmount: 0 };
  if (seller.role !== "ADMIN" && seller.role !== "STORE") {
    throw new Error("Only an Admin or Store Manager can authorise POS discounts.");
  }

  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid discount value.");
  const reason = cleanText(input.reason);
  if (!reason) throw new Error("A reason is required for every authorised discount.");

  let discountAmount = 0;
  if (input.type === "percent") {
    if (value > 100) throw new Error("Percentage discount cannot exceed 100%.");
    discountAmount = subtotal * (value / 100);
  } else if (input.type === "fixed") {
    if (value > subtotal) throw new Error("Fixed discount cannot exceed the sale subtotal.");
    discountAmount = value;
  } else {
    throw new Error("Select a valid discount type.");
  }

  return {
    discountAmount: Math.round(discountAmount * 100) / 100,
    discountType: input.type,
    discountValue: value,
    discountReason: reason,
  };
}

function decrementVariantStock(product: RawProduct, lines: PosLine[]) {
  if (!product.variants?.length) return undefined;

  let changed = false;
  const nextVariants = product.variants.map((variant) => {
    if (!variant._key || typeof variant.stockQuantity !== "number") return variant;
    const soldQuantity = lines
      .filter((line) => line.productId === product._id && line.variantId === variant._key)
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    if (soldQuantity <= 0) return variant;
    changed = true;
    return { ...variant, stockQuantity: Math.max(0, variant.stockQuantity - soldQuantity) };
  });

  return changed ? nextVariants : undefined;
}

async function fetchPosOrder(reference: string) {
  return serverClient.fetch<PosOrder | null>(
    `*[_type == "commerceOrder" && salesChannel == "POS" && paymentReference == $reference][0]{
      _id,
      _rev,
      orderNumber,
      paymentStatus,
      status,
      subtotal,
      discountAmount,
      total,
      amountPaid,
      balanceDue,
      cashTendered,
      cashChangeDue,
      receiptNumber,
      paymentReference,
      paymentProvider,
      paymentChannel,
      "customerId": customer._ref,
      customerName,
      customerEmail,
      customerPhone,
      soldByName,
      soldAt,
      "lineItems": lineItems[]{
        _key,
        "productId": coalesce(product._ref, productId),
        name,
        category,
        finish,
        size,
        variantId,
        quantity,
        unitPrice
      }
    }`,
    { reference },
    { cache: "no-store" },
  );
}

function summary(order: PosOrder) {
  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    receiptNumber: order.receiptNumber || receiptNumberFor(order.orderNumber),
    reference: order.paymentReference || "",
    status: order.status || "pending",
    paymentStatus: order.paymentStatus || "pending",
    paymentChannel: order.paymentChannel || "",
    subtotal: Number(order.subtotal || 0),
    discountAmount: Number(order.discountAmount || 0),
    total: Number(order.total || 0),
    amountPaid: Number(order.amountPaid || 0),
    balanceDue: Number(order.balanceDue || 0),
    cashTendered: Number(order.cashTendered || 0),
    cashChangeDue: Number(order.cashChangeDue || 0),
    soldByName: order.soldByName || "Staff",
    soldAt: order.soldAt || "",
  };
}

function addSaleInventoryMutations(
  transaction: ReturnType<typeof serverClient.transaction>,
  products: RawProduct[],
  lines: PosLine[],
  orderId: string,
  orderNumber: string,
  seller: PosSeller,
  now: string,
) {
  const movements: Array<{ productId: string; productName: string; variantId?: string; quantityChange: number; stockBefore?: number; stockAfter?: number }> = [];

  for (const product of products) {
    const productLines = lines.filter((line) => line.productId === product._id);
    const soldQuantity = productLines.reduce((sum, line) => sum + line.quantity, 0);
    if (soldQuantity <= 0) continue;

    if (typeof product.initialStock === "number") {
      if (product.initialStock < soldQuantity) throw new Error(`${product.name || "Product"} no longer has enough stock.`);
      const nextStock = product.initialStock - soldQuantity;
      const nextVariants = decrementVariantStock(product, lines);
      transaction.patch(product._id, (patch) =>
        patch.ifRevisionId(product._rev).set({
          initialStock: nextStock,
          ...(nextVariants ? { variants: nextVariants } : {}),
          ...(nextStock <= 0 ? { available: false } : {}),
        }),
      );
      productLines.forEach((line) => movements.push({
        productId: product._id,
        productName: product.name || "Product",
        variantId: line.variantId,
        quantityChange: -line.quantity,
        stockBefore: product.initialStock,
        stockAfter: nextStock,
      }));
    }
  }

  addInventoryMovementsToTransaction({
    transaction,
    movementKey: `sale|${orderNumber}`,
    movementType: "SALE",
    orderId,
    orderNumber,
    actor: seller,
    movements,
    note: "Inventory deducted after confirmed POS sale/payment.",
    createdAt: now,
  });
}

function addPaymentRecordToTransaction({
  transaction,
  reference,
  orderId,
  orderNumber,
  customerName,
  customerPhone,
  provider,
  channel,
  status,
  amount,
  seller,
  now,
}: {
  transaction: ReturnType<typeof serverClient.transaction>;
  reference: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  provider: string;
  channel: string;
  status: "pending" | "paid" | "partially_paid" | "failed";
  amount: number;
  seller: PosSeller;
  now: string;
}) {
  transaction.createIfNotExists({
    _id: paymentTransactionId(reference),
    _type: "paymentTransaction",
    reference,
    order: { _type: "reference", _ref: orderId },
    orderNumber,
    customerName,
    customerPhone,
    salesChannel: "POS",
    provider,
    channel,
    status,
    amount,
    currency: CURRENCY,
    processedBy: { _type: "reference", _ref: seller.id },
    processedByName: seller.name,
    processedByRole: seller.role,
    createdAt: now,
    updatedAt: now,
    ...(status === "paid" || status === "partially_paid" ? { paidAt: now } : {}),
  });
}

function addAuditToTransaction({
  transaction,
  key,
  eventType,
  entityId,
  entityLabel,
  seller,
  detail,
  now,
}: {
  transaction: ReturnType<typeof serverClient.transaction>;
  key: string;
  eventType: string;
  entityId: string;
  entityLabel: string;
  seller: PosSeller;
  detail: string;
  now: string;
}) {
  const id = auditId(key);
  transaction.createIfNotExists({
    _id: id,
    _type: "auditEvent",
    eventNumber: `AUD-${hashId(key).slice(0, 12).toUpperCase()}`,
    eventType,
    entityType: "commerceOrder",
    entityId,
    entityLabel,
    actor: { _type: "reference", _ref: seller.id },
    actorName: seller.name,
    actorRole: seller.role,
    detail,
    createdAt: now,
  });
}

async function linkCustomerToCompletedSale(order: PosOrder, customerInput: ReturnType<typeof customerDetails>) {
  const balanceDue = Number(order.balanceDue || 0);
  const customer = await upsertPosCustomerFromPurchase({
    customerId: customerInput.id,
    name: customerInput.name,
    email: customerInput.email || undefined,
    phone: customerInput.phone,
    purchasedAt: order.soldAt || new Date().toISOString(),
    balanceDelta: balanceDue,
  });

  const patches = [
    serverClient.patch(order._id).set({ customer: { _type: "reference", _ref: customer._id }, updatedAt: new Date().toISOString() }).commit(),
    serverClient.patch(paymentTransactionId(order.paymentReference || order.orderNumber)).set({ customer: { _type: "reference", _ref: customer._id }, updatedAt: new Date().toISOString() }).commit(),
  ];
  await Promise.allSettled(patches);
  return customer;
}

export async function createPosCashSale(input: PosSaleInput, seller: PosSeller) {
  if (!input.cashConfirmed) throw new Error("Confirm that cash was received before completing the sale.");
  const customer = customerDetails(input);

  const reference = referenceFor(input.requestId);
  const existing = await fetchPosOrder(reference);
  if (existing && ["paid", "partially_paid"].includes(existing.paymentStatus || "")) return summary(existing);

  const { lines, products } = await buildLines(input.cart);
  const subtotal = subtotalFor(lines);
  const discount = calculateDiscount(subtotal, input.discount, seller);
  const total = Math.max(0, subtotal - discount.discountAmount);
  const requestedPayment = Number(input.cashAmountReceived ?? total);
  if (!Number.isFinite(requestedPayment) || requestedPayment <= 0) throw new Error("Enter the cash amount received.");
  const amountPaid = Math.min(requestedPayment, total);
  const balanceDue = Math.max(0, total - amountPaid);
  const cashChangeDue = Math.max(0, requestedPayment - total);
  const paymentStatus = balanceDue > 0 ? "partially_paid" : "paid";
  const now = new Date().toISOString();
  const orderId = orderIdFor(reference);
  const receiptNumber = receiptNumberFor(reference);
  const transaction = serverClient.transaction();

  addSaleInventoryMutations(transaction, products, lines, orderId, reference, seller, now);

  transaction.create({
    _id: orderId,
    _type: "commerceOrder",
    orderNumber: reference,
    customerName: customer.name,
    customerEmail: customer.email || undefined,
    customerPhone: customer.phone,
    deliveryLocation: "In-store purchase",
    createdAt: now,
    updatedAt: now,
    paidAt: now,
    soldAt: now,
    status: "delivered",
    paymentStatus,
    subtotal,
    deliveryFee: 0,
    ...discount,
    total,
    amountPaid,
    balanceDue,
    cashTendered: requestedPayment,
    cashChangeDue,
    refundedAmount: 0,
    receiptNumber,
    currency: CURRENCY,
    salesChannel: "POS",
    fulfilmentType: "IN_STORE",
    paymentReference: reference,
    paymentProvider: "cash",
    paymentChannel: "cash",
    cashReceived: true,
    soldBy: { _type: "reference", _ref: seller.id },
    soldByName: seller.name,
    soldByRole: seller.role,
    ...(discount.discountAmount > 0 ? {
      discountAuthorizedBy: { _type: "reference", _ref: seller.id },
      discountAuthorizedByName: seller.name,
    } : {}),
    lineItems: orderLineDocuments(lines),
  });

  addPaymentRecordToTransaction({
    transaction,
    reference,
    orderId,
    orderNumber: reference,
    customerName: customer.name,
    customerPhone: customer.phone,
    provider: "cash",
    channel: "cash",
    status: paymentStatus,
    amount: amountPaid,
    seller,
    now,
  });
  addAuditToTransaction({
    transaction,
    key: `pos-sale|${reference}`,
    eventType: "POS_SALE_RECORDED",
    entityId: orderId,
    entityLabel: reference,
    seller,
    detail: `${paymentStatus === "partially_paid" ? "Partially paid" : "Paid"} cash sale · total KES ${total.toLocaleString("en-KE")} · tendered KES ${requestedPayment.toLocaleString("en-KE")} · change KES ${cashChangeDue.toLocaleString("en-KE")} · balance KES ${balanceDue.toLocaleString("en-KE")}`,
    now,
  });

  await transaction.commit();
  const created = await fetchPosOrder(reference);
  if (!created) throw new Error("POS cash sale completed but could not be reloaded.");
  await linkCustomerToCompletedSale(created, customer);
  return summary(created);
}

async function createPendingPaystackOrder(input: PosSaleInput, seller: PosSeller, channel: "mobile_money" | "card") {
  const customer = customerDetails(input);
  const reference = referenceFor(input.requestId);
  const existing = await fetchPosOrder(reference);
  if (existing) return { existing, customer };

  const { lines } = await buildLines(input.cart);
  const subtotal = subtotalFor(lines);
  const discount = calculateDiscount(subtotal, input.discount, seller);
  const total = Math.max(0, subtotal - discount.discountAmount);
  if (total <= 0) throw new Error("Paystack payment total must be greater than zero.");
  const now = new Date().toISOString();
  const orderId = orderIdFor(reference);
  const transaction = serverClient.transaction();

  transaction.create({
    _id: orderId,
    _type: "commerceOrder",
    orderNumber: reference,
    customerName: customer.name,
    customerEmail: customer.email || undefined,
    customerPhone: customer.phone,
    deliveryLocation: "In-store purchase",
    createdAt: now,
    updatedAt: now,
    soldAt: now,
    status: "pending",
    paymentStatus: "pending",
    subtotal,
    deliveryFee: 0,
    ...discount,
    total,
    amountPaid: 0,
    balanceDue: total,
    refundedAmount: 0,
    receiptNumber: receiptNumberFor(reference),
    currency: CURRENCY,
    salesChannel: "POS",
    fulfilmentType: "IN_STORE",
    paymentReference: reference,
    paymentProvider: "paystack",
    paymentChannel: channel,
    cashReceived: false,
    soldBy: { _type: "reference", _ref: seller.id },
    soldByName: seller.name,
    soldByRole: seller.role,
    ...(discount.discountAmount > 0 ? {
      discountAuthorizedBy: { _type: "reference", _ref: seller.id },
      discountAuthorizedByName: seller.name,
    } : {}),
    lineItems: orderLineDocuments(lines),
  });
  addPaymentRecordToTransaction({
    transaction,
    reference,
    orderId,
    orderNumber: reference,
    customerName: customer.name,
    customerPhone: customer.phone,
    provider: "paystack",
    channel,
    status: "pending",
    amount: total,
    seller,
    now,
  });
  addAuditToTransaction({
    transaction,
    key: `pos-payment-init|${reference}`,
    eventType: "POS_PAYMENT_INITIATED",
    entityId: orderId,
    entityLabel: reference,
    seller,
    detail: `Paystack ${channel === "mobile_money" ? "M-PESA" : "card"} payment initiated for KES ${total.toLocaleString("en-KE")}.`,
    now,
  });
  await transaction.commit();
  return { existing: await fetchPosOrder(reference), customer };
}

export async function createPosMpesaSale(input: PosSaleInput, seller: PosSeller) {
  const { existing: order, customer } = await createPendingPaystackOrder(input, seller, "mobile_money");
  if (!order) throw new Error("POS M-PESA order could not be created.");
  if (order.paymentStatus === "paid") return { ...summary(order), displayText: "Payment already completed." };

  const testMode = isPaystackTestMode();
  if (testMode && customer.phone !== "+254710000000") {
    throw new Error("Paystack test mode only simulates Kenyan M-PESA with +254 710 000 000. Real customer STK pushes require live Paystack keys.");
  }
  const paystackEmail = customer.email || seller.email;
  if (!isEmail(paystackEmail)) throw new Error("A valid staff or customer email is required to initiate the M-PESA charge.");

  try {
    const payload = await paystackRequest<PaystackChargeResponse>("/charge", {
      method: "POST",
      body: JSON.stringify({
        email: paystackEmail,
        amount: String(Math.round(Number(order.total || 0) * 100)),
        currency: CURRENCY,
        reference: order.paymentReference,
        mobile_money: { phone: customer.phone, provider: "mpesa" },
        metadata: { channel: "POS", sold_by: seller.name, seller_role: seller.role, order_number: order.orderNumber },
      }),
    });

    if (!payload.status || !payload.data?.reference) throw new Error(payload.message || "Paystack did not start the M-PESA payment.");
    return {
      ...summary(order),
      status: payload.data.status || "pending",
      displayText: payload.data.display_text || "Ask the customer to complete the M-PESA prompt on their phone.",
      testMode,
    };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "M-PESA STK initiation failed.";
    await Promise.all([
      serverClient.patch(order._id).set({ paymentStatus: "failed", status: "cancelled", failureReason: reason, updatedAt: new Date().toISOString() }).commit(),
      serverClient.patch(paymentTransactionId(order.paymentReference || order.orderNumber)).set({ status: "failed", failureReason: reason, updatedAt: new Date().toISOString() }).commit(),
    ]);
    throw cause;
  }
}

export async function createPosPaystackSale(input: PosSaleInput, seller: PosSeller, callbackBaseUrl: string) {
  const { existing: order, customer } = await createPendingPaystackOrder(input, seller, "card");
  if (!order) throw new Error("POS Paystack order could not be created.");
  if (order.paymentStatus === "paid") return { ...summary(order), displayText: "Payment already completed." };
  const paystackEmail = customer.email || seller.email;
  if (!isEmail(paystackEmail)) throw new Error("A valid staff or customer email is required to start Paystack payment.");

  try {
    const payload = await paystackRequest<PaystackInitializeResponse>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: paystackEmail,
        amount: String(Math.round(Number(order.total || 0) * 100)),
        currency: CURRENCY,
        reference: order.paymentReference,
        channels: ["card"],
        callback_url: `${callbackBaseUrl.replace(/\/+$/, "")}/pos-payment-complete?reference=${encodeURIComponent(order.paymentReference || order.orderNumber)}`,
        metadata: JSON.stringify({ channel: "POS", sold_by: seller.name, seller_role: seller.role, customer_phone: customer.phone, order_number: order.orderNumber }),
      }),
    });
    if (!payload.status || !payload.data?.authorization_url) throw new Error(payload.message || "Paystack did not return a payment page.");
    return { ...summary(order), authorizationUrl: payload.data.authorization_url, displayText: "Complete the Paystack payment in the secure payment window.", testMode: isPaystackTestMode() };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "Paystack initialization failed.";
    await Promise.all([
      serverClient.patch(order._id).set({ paymentStatus: "failed", status: "cancelled", failureReason: reason, updatedAt: new Date().toISOString() }).commit(),
      serverClient.patch(paymentTransactionId(order.paymentReference || order.orderNumber)).set({ status: "failed", failureReason: reason, updatedAt: new Date().toISOString() }).commit(),
    ]);
    throw cause;
  }
}

async function failPosPayment(order: PosOrder, reason: string) {
  const now = new Date().toISOString();
  await Promise.all([
    serverClient.patch(order._id).ifRevisionId(order._rev).set({ paymentStatus: "failed", status: "cancelled", failureReason: reason, updatedAt: now }).commit(),
    serverClient.patch(paymentTransactionId(order.paymentReference || order.orderNumber)).set({ status: "failed", failureReason: reason, updatedAt: now }).commit(),
  ]);
}

async function finalizeVerifiedPosPayment(order: PosOrder, payment: NonNullable<PaystackVerifyResponse["data"]>) {
  const reference = order.paymentReference || order.orderNumber;
  const expectedAmount = Math.round(Number(order.total || 0) * 100);
  if (payment.reference !== reference || payment.currency !== CURRENCY || Number(payment.amount) !== expectedAmount) {
    throw new Error("Paystack verification did not match the POS order.");
  }
  if (payment.status !== "success") throw new Error(`Paystack payment is currently ${payment.status}.`);

  const ids = [...new Set((order.lineItems || []).map((line) => line.productId))];
  const products = await fetchProducts(ids);
  const now = new Date().toISOString();
  const transaction = serverClient.transaction();
  const seller: PosSeller = {
    id: "",
    name: order.soldByName || "POS Staff",
    email: "",
    role: "STORE_STAFF",
  };

  // Use the stored seller reference when adding movements/audit where available is not required for correctness.
  const storedSeller = await serverClient.fetch<{ id?: string; role?: ApiStaffRole; email?: string } | null>(
    `*[_id == $id][0]{"id": soldBy._ref, "role": soldByRole, "email": soldBy->email}`,
    { id: order._id },
    { cache: "no-store" },
  );
  seller.id = storedSeller?.id || "";
  seller.role = storedSeller?.role || "STORE_STAFF";
  seller.email = storedSeller?.email || "";

  addSaleInventoryMutations(transaction, products, order.lineItems || [], order._id, order.orderNumber, seller, now);
  transaction.patch(order._id, (patch) =>
    patch.ifRevisionId(order._rev).set({
      paymentStatus: "paid",
      status: "delivered",
      paymentChannel: payment.channel || order.paymentChannel || "paystack",
      paystackTransactionId: String(payment.id),
      providerReceiptNumber: String(payment.id),
      amountPaid: Number(order.total || 0),
      balanceDue: 0,
      paidAt: payment.paid_at || now,
      updatedAt: now,
      failureReason: "",
    }),
  );
  transaction.patch(paymentTransactionId(reference), (patch) => patch.set({
    status: "paid",
    channel: payment.channel || order.paymentChannel || "paystack",
    providerTransactionId: String(payment.id),
    providerReceiptNumber: String(payment.id),
    paidAt: payment.paid_at || now,
    updatedAt: now,
    failureReason: "",
  }));
  addAuditToTransaction({
    transaction,
    key: `pos-payment-paid|${reference}`,
    eventType: "POS_PAYMENT_CONFIRMED",
    entityId: order._id,
    entityLabel: order.orderNumber,
    seller,
    detail: `${order.paymentChannel === "mobile_money" ? "M-PESA" : "Paystack"} payment confirmed · provider transaction ${payment.id}.`,
    now,
  });

  try {
    await transaction.commit();
  } catch (cause) {
    const concurrent = await fetchPosOrder(reference);
    if (concurrent?.paymentStatus === "paid") return concurrent;
    throw cause;
  }

  const finalized = await fetchPosOrder(reference);
  if (!finalized) throw new Error("Payment was confirmed but the POS order could not be reloaded.");
  const customer = customerDetails({
    requestId: reference.replace(/^DBK-POS-/, ""),
    cart: [],
    paymentMethod: "cash",
    customerId: finalized.customerId,
    customerName: finalized.customerName,
    customerEmail: finalized.customerEmail,
    customerPhone: finalized.customerPhone,
  });
  await linkCustomerToCompletedSale(finalized, customer);
  return finalized;
}

export async function verifyPosPayment(reference: string) {
  if (!/^DBK-POS-[A-Za-z0-9-]+$/.test(reference)) throw new Error("Invalid POS payment reference.");
  const order = await fetchPosOrder(reference);
  if (!order) throw new Error("POS order not found.");
  if (order.paymentStatus === "paid") return { state: "paid" as const, order: summary(order) };
  if (order.paymentStatus === "failed") return { state: "failed" as const, order: summary(order), message: "Payment failed." };

  if (order.paymentChannel === "mobile_money") {
    const charge = await paystackRequest<PaystackChargeStatusResponse>(`/charge/${encodeURIComponent(reference)}`, { method: "GET" });
    if (!charge.status || !charge.data) throw new Error(charge.message || "Unable to check the M-PESA charge.");
    const status = cleanText(charge.data.status).toLowerCase();
    if (["failed", "abandoned", "reversed"].includes(status)) {
      const reason = cleanText(charge.data.gateway_response) || cleanText(charge.data.message) || `Paystack status: ${status}`;
      await failPosPayment(order, reason);
      return { state: "failed" as const, order: summary(order), message: reason };
    }
    if (status !== "success") {
      return { state: "pending" as const, order: summary(order), message: cleanText(charge.data.message) || "Waiting for the customer to approve the M-PESA STK prompt." };
    }
  }

  const verified = await paystackRequest<PaystackVerifyResponse>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
  if (!verified.status || !verified.data) throw new Error(verified.message || "Unable to verify Paystack payment.");
  const status = cleanText(verified.data.status).toLowerCase();
  if (["failed", "abandoned", "reversed"].includes(status)) {
    const reason = cleanText(verified.data.gateway_response) || `Paystack status: ${status}`;
    await failPosPayment(order, reason);
    return { state: "failed" as const, order: summary(order), message: reason };
  }
  if (status !== "success") return { state: "pending" as const, order: summary(order), message: `Paystack payment is currently ${status || "pending"}.` };

  const finalized = await finalizeVerifiedPosPayment(order, verified.data);
  return { state: "paid" as const, order: summary(finalized) };
}

// Kept for the existing Paystack webhook import; both M-PESA and hosted Paystack
// POS payments now flow through the same idempotent verifier.
export const verifyPosMpesaSale = verifyPosPayment;

export async function markPosPaymentTimedOut(reference: string, seller?: PosSeller) {
  if (!/^DBK-POS-[A-Za-z0-9-]+$/.test(reference)) throw new Error("Invalid POS payment reference.");
  const order = await fetchPosOrder(reference);
  if (!order) throw new Error("POS order not found.");
  if (order.paymentStatus === "paid" || order.paymentStatus === "failed") {
    return { state: order.paymentStatus, order: summary(order) };
  }

  const now = new Date().toISOString();
  const note = "POS payment confirmation timed out and requires reconciliation. A later provider callback may still confirm the payment.";
  await Promise.all([
    serverClient.patch(order._id).ifRevisionId(order._rev).set({ failureReason: note, updatedAt: now }).commit(),
    serverClient.patch(paymentTransactionId(reference)).set({ status: "timed_out", failureReason: note, updatedAt: now }).commit(),
  ]);

  if (seller?.id) {
    await recordAuditEvent({
      key: `pos-payment-timeout|${reference}`,
      eventType: "POS_PAYMENT_TIMEOUT",
      entityType: "commerceOrder",
      entityId: order._id,
      entityLabel: order.orderNumber,
      actor: seller,
      detail: note,
      createdAt: now,
    });
  }

  return { state: "timed_out" as const, order: summary(order), message: note };
}

export async function getPosReceipt(orderId: string) {
  return serverClient.fetch<{
    _id: string;
    orderNumber: string;
    receiptNumber?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    subtotal?: number;
    discountAmount?: number;
    total?: number;
    amountPaid?: number;
    balanceDue?: number;
    cashTendered?: number;
    cashChangeDue?: number;
    refundedAmount?: number;
    paymentStatus?: string;
    paymentChannel?: string;
    paymentReference?: string;
    providerReceiptNumber?: string;
    soldByName?: string;
    soldAt?: string;
    lineItems?: PosLine[];
  } | null>(
    `*[_type == "commerceOrder" && _id == $orderId][0]{
      _id,orderNumber,receiptNumber,customerName,customerPhone,customerEmail,subtotal,discountAmount,total,
      amountPaid,balanceDue,cashTendered,cashChangeDue,refundedAmount,paymentStatus,paymentChannel,paymentReference,providerReceiptNumber,
      soldByName,soldAt,"lineItems": lineItems[]{_key,"productId":coalesce(product._ref,productId),name,category,finish,size,variantId,quantity,unitPrice}
    }`,
    { orderId },
    { cache: "no-store" },
  );
}

export async function recordOutstandingCashPayment({ orderId, amount, seller }: { orderId: string; amount: number; seller: PosSeller }) {
  const order = await serverClient.fetch<PosOrder | null>(
    `*[_type == "commerceOrder" && _id == $orderId][0]{_id,_rev,orderNumber,paymentStatus,status,total,amountPaid,balanceDue,receiptNumber,paymentReference,paymentChannel,customerName,customerEmail,customerPhone,"customerId":customer._ref,soldByName,soldAt}`,
    { orderId },
    { cache: "no-store" },
  );
  if (!order) throw new Error("Order not found.");
  const balance = Number(order.balanceDue || 0);
  if (balance <= 0) throw new Error("This order has no outstanding balance.");
  const payment = Number(amount);
  if (!Number.isFinite(payment) || payment <= 0 || payment > balance) throw new Error("Enter a payment amount up to the outstanding balance.");

  const nextPaid = Number(order.amountPaid || 0) + payment;
  const nextBalance = Math.max(0, Number(order.total || 0) - nextPaid);
  const nextStatus = nextBalance > 0 ? "partially_paid" : "paid";
  const now = new Date().toISOString();
  const reference = `${order.orderNumber}-PAY-${Date.now()}`;
  const transaction = serverClient.transaction();
  transaction.patch(order._id, (patch) => patch.ifRevisionId(order._rev).set({
    amountPaid: nextPaid,
    balanceDue: nextBalance,
    paymentStatus: nextStatus,
    ...(nextBalance <= 0 ? { paidAt: now } : {}),
    updatedAt: now,
  }));
  addPaymentRecordToTransaction({
    transaction,
    reference,
    orderId: order._id,
    orderNumber: order.orderNumber,
    customerName: order.customerName || "Customer",
    customerPhone: order.customerPhone || "",
    provider: "cash",
    channel: "cash",
    status: nextStatus,
    amount: payment,
    seller,
    now,
  });
  addAuditToTransaction({ transaction, key: `receivable-payment|${reference}`, eventType: "RECEIVABLE_PAYMENT_RECORDED", entityId: order._id, entityLabel: order.orderNumber, seller, detail: `Cash balance payment KES ${payment.toLocaleString("en-KE")} recorded. Remaining KES ${nextBalance.toLocaleString("en-KE")}.`, now });
  await transaction.commit();

  if (order.customerId) {
    const currentBalance = await serverClient.fetch<number>(`coalesce(*[_id == $id][0].outstandingBalance,0)`, { id: order.customerId });
    await serverClient.patch(order.customerId).set({ outstandingBalance: Math.max(0, Number(currentBalance || 0) - payment), updatedAt: now }).commit();
  }
  const updated = await serverClient.fetch<PosOrder | null>(`*[_id == $orderId][0]{_id,_rev,orderNumber,paymentStatus,status,total,amountPaid,balanceDue,receiptNumber,paymentReference,paymentChannel,customerName,customerEmail,customerPhone,"customerId":customer._ref,soldByName,soldAt}`, { orderId });
  if (!updated) throw new Error("Payment was recorded but the order could not be reloaded.");
  return summary(updated);
}

export async function logPosAudit(key: string, eventType: string, entityId: string, label: string, seller: PosSeller, detail: string) {
  return recordAuditEvent({ key, eventType, entityType: "commerceOrder", entityId, entityLabel: label, actor: seller, detail });
}
