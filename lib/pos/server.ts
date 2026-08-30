import "server-only";

import { createHmac } from "node:crypto";

import { serverClient } from "@/sanity/lib/serverClient";
import type { ApiStaffRole } from "@/lib/auth/api-authorization";

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

export type PosSaleInput = {
  requestId: string;
  cart: PosCartLine[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  paymentMethod: "cash" | "mpesa";
  cashConfirmed?: boolean;
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
  total?: number;
  paymentReference?: string;
  paymentChannel?: string;
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

function lineKey(productId: string, variantId: string | undefined, index: number) {
  return createHmac("sha256", "dbk-pos-line")
    .update(`${productId}|${variantId || ""}|${index}`)
    .digest("hex")
    .slice(0, 20);
}

function getPaystackSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured for POS M-PESA payments.");
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

    throw new Error(`Paystack M-PESA: ${detail}`);
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
  throw new Error("Enter a valid Kenyan M-PESA phone number.");
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function customerDetails(input: PosSaleInput, options?: { mpesa?: boolean }) {
  const name = cleanText(input.customerName);
  if (!name) throw new Error("Customer name is required.");

  const rawPhone = cleanText(input.customerPhone);
  if (!rawPhone) throw new Error("Customer phone is required.");

  const email = cleanText(input.customerEmail).toLowerCase();
  if (email && !isEmail(email)) throw new Error("Enter a valid customer email or leave it blank.");

  return {
    name,
    email,
    phone: options?.mpesa ? normalizeKenyanPhone(rawPhone) : rawPhone,
  };
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

function totalFor(lines: PosLine[]) {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
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
      total,
      paymentReference,
      paymentChannel,
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
    reference: order.paymentReference || "",
    status: order.status || "pending",
    paymentStatus: order.paymentStatus || "pending",
    paymentChannel: order.paymentChannel || "",
    total: Number(order.total || 0),
    soldByName: order.soldByName || "Staff",
    soldAt: order.soldAt || "",
  };
}

export async function createPosCashSale(input: PosSaleInput, seller: PosSeller) {
  if (!input.cashConfirmed) throw new Error("Confirm that cash was received before completing the sale.");
  const customer = customerDetails(input);

  const reference = referenceFor(input.requestId);
  const existing = await fetchPosOrder(reference);
  if (existing?.paymentStatus === "paid") return summary(existing);

  const { lines, products } = await buildLines(input.cart);
  const total = totalFor(lines);
  const now = new Date().toISOString();
  const orderId = orderIdFor(reference);
  const transaction = serverClient.transaction();

  for (const product of products) {
    const soldQuantity = lines
      .filter((line) => line.productId === product._id)
      .reduce((sum, line) => sum + line.quantity, 0);
    if (typeof product.initialStock !== "number") continue;
    const nextStock = Math.max(0, product.initialStock - soldQuantity);
    const nextVariants = decrementVariantStock(product, lines);
    transaction.patch(product._id, (patch) =>
      patch.ifRevisionId(product._rev).set({
        initialStock: nextStock,
        ...(nextVariants ? { variants: nextVariants } : {}),
        ...(nextStock <= 0 ? { available: false } : {}),
      }),
    );
  }

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
    paymentStatus: "paid",
    subtotal: total,
    deliveryFee: 0,
    total,
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
    lineItems: orderLineDocuments(lines),
  });

  await transaction.commit();
  const created = await fetchPosOrder(reference);
  if (!created) throw new Error("POS cash sale completed but could not be reloaded.");
  return summary(created);
}

export async function createPosMpesaSale(input: PosSaleInput, seller: PosSeller) {
  const customer = customerDetails(input, { mpesa: true });
  const paystackEmail = customer.email || seller.email;
  if (!isEmail(paystackEmail)) throw new Error("A valid staff email is required to initiate the M-PESA charge.");

  const testMode = isPaystackTestMode();
  if (testMode && customer.phone !== "+254710000000") {
    throw new Error(
      "Paystack test mode only simulates Kenyan M-PESA with +254 710 000 000. Use that test number now; real customer STK pushes require live Paystack keys.",
    );
  }

  const reference = referenceFor(input.requestId);
  const existing = await fetchPosOrder(reference);
  if (existing) {
    return {
      ...summary(existing),
      displayText: existing.paymentStatus === "paid" ? "Payment already completed." : "Payment request already initiated. Check the customer's phone.",
    };
  }

  const { lines } = await buildLines(input.cart);
  const total = totalFor(lines);
  const now = new Date().toISOString();
  const orderId = orderIdFor(reference);

  await serverClient.create({
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
    subtotal: total,
    deliveryFee: 0,
    total,
    currency: CURRENCY,
    salesChannel: "POS",
    fulfilmentType: "IN_STORE",
    paymentReference: reference,
    paymentProvider: "paystack",
    paymentChannel: "mobile_money",
    cashReceived: false,
    soldBy: { _type: "reference", _ref: seller.id },
    soldByName: seller.name,
    soldByRole: seller.role,
    lineItems: orderLineDocuments(lines),
  });

  try {
    const payload = await paystackRequest<PaystackChargeResponse>("/charge", {
      method: "POST",
      body: JSON.stringify({
        email: paystackEmail,
        amount: String(Math.round(total * 100)),
        currency: CURRENCY,
        reference,
        mobile_money: { phone: customer.phone, provider: "mpesa" },
        metadata: {
          channel: "POS",
          sold_by: seller.name,
          seller_role: seller.role,
          order_number: reference,
        },
      }),
    });

    if (!payload.status || !payload.data?.reference) {
      throw new Error(payload.message || "Paystack did not start the M-PESA payment.");
    }

    return {
      orderNumber: reference,
      reference,
      status: payload.data.status || "pending",
      paymentStatus: "pending",
      paymentChannel: "mobile_money",
      total,
      soldByName: seller.name,
      soldAt: now,
      displayText: payload.data.display_text || "Ask the customer to complete the M-PESA prompt on their phone.",
      testMode,
    };
  } catch (cause) {
    await serverClient.patch(orderId).set({
      paymentStatus: "failed",
      status: "cancelled",
      failureReason: cause instanceof Error ? cause.message : "M-PESA STK initiation failed.",
      updatedAt: new Date().toISOString(),
    }).commit();
    throw cause;
  }
}

export async function verifyPosMpesaSale(reference: string) {
  if (!/^DBK-POS-[A-Za-z0-9-]+$/.test(reference)) throw new Error("Invalid POS payment reference.");

  const order = await fetchPosOrder(reference);
  if (!order) throw new Error("POS order not found.");
  if (order.paymentStatus === "paid") return { state: "paid" as const, order: summary(order) };
  if (order.paymentStatus === "failed") return { state: "failed" as const, order: summary(order), message: "Payment failed." };

  const charge = await paystackRequest<PaystackChargeStatusResponse>(
    `/charge/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );

  if (!charge.status || !charge.data) throw new Error(charge.message || "Unable to check the M-PESA charge.");
  const chargeStatus = cleanText(charge.data.status).toLowerCase();

  if (["failed", "abandoned", "reversed"].includes(chargeStatus)) {
    const reason = cleanText(charge.data.gateway_response) || cleanText(charge.data.message) || `Paystack status: ${chargeStatus}`;
    await serverClient.patch(order._id).ifRevisionId(order._rev).set({
      paymentStatus: "failed",
      status: "cancelled",
      failureReason: reason,
      updatedAt: new Date().toISOString(),
    }).commit();
    const failed = await fetchPosOrder(reference);
    return { state: "failed" as const, order: failed ? summary(failed) : summary(order), message: reason };
  }

  if (chargeStatus !== "success") {
    return {
      state: "pending" as const,
      order: summary(order),
      message: cleanText(charge.data.message) || "Waiting for the customer to approve the M-PESA STK prompt.",
    };
  }

  // Once the mobile-money charge reports success, verify the final transaction
  // before changing stock or marking the POS order as paid.
  const verified = await paystackRequest<PaystackVerifyResponse>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );

  if (!verified.status || !verified.data) throw new Error(verified.message || "Unable to verify M-PESA payment.");
  const payment = verified.data;
  const expectedAmount = Math.round(Number(order.total || 0) * 100);

  if (payment.reference !== reference || payment.currency !== CURRENCY || Number(payment.amount) !== expectedAmount) {
    throw new Error("M-PESA verification did not match the POS order.");
  }

  if (payment.status !== "success") {
    return {
      state: "pending" as const,
      order: summary(order),
      message: "M-PESA charge is complete but transaction verification is still pending.",
    };
  }

  const ids = [...new Set((order.lineItems || []).map((line) => line.productId))];
  const products = await fetchProducts(ids);
  const now = new Date().toISOString();
  const transaction = serverClient.transaction();

  for (const product of products) {
    const soldQuantity = (order.lineItems || [])
      .filter((line) => line.productId === product._id)
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    if (typeof product.initialStock !== "number") continue;
    const nextStock = Math.max(0, product.initialStock - soldQuantity);
    const nextVariants = decrementVariantStock(product, order.lineItems || []);
    transaction.patch(product._id, (patch) =>
      patch.ifRevisionId(product._rev).set({
        initialStock: nextStock,
        ...(nextVariants ? { variants: nextVariants } : {}),
        ...(nextStock <= 0 ? { available: false } : {}),
      }),
    );
  }

  transaction.patch(order._id, (patch) =>
    patch.ifRevisionId(order._rev).set({
      paymentStatus: "paid",
      status: "delivered",
      paymentChannel: payment.channel || "mobile_money",
      paystackTransactionId: String(payment.id),
      paidAt: payment.paid_at || now,
      updatedAt: now,
      failureReason: "",
    }),
  );

  try {
    await transaction.commit();
  } catch (cause) {
    const concurrent = await fetchPosOrder(reference);
    if (concurrent?.paymentStatus === "paid") return { state: "paid" as const, order: summary(concurrent) };
    throw cause;
  }

  const finalized = await fetchPosOrder(reference);
  if (!finalized) throw new Error("M-PESA was paid but the POS order could not be reloaded.");
  return { state: "paid" as const, order: summary(finalized) };
}
