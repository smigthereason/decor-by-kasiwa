import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { upsertCustomerFromPurchase } from "@/lib/auth/sanity-users";
import { serverClient } from "@/sanity/lib/serverClient";

const PAYSTACK_API = "https://api.paystack.co";
const CURRENCY = "KES";

export type CheckoutAddress = {
  fullName: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  region: string;
  country: string;
};

export type CheckoutCartLine = {
  productId: string;
  quantity: number;
  colour?: string;
};

type RawCheckoutProduct = {
  _id: string;
  _rev: string;
  name?: string;
  price?: number;
  initialStock?: number;
  available?: boolean;
  category?: string;
};

type PendingOrderLine = {
  _key: string;
  productId: string;
  name: string;
  category: string;
  finish?: string;
  quantity: number;
  unitPrice: number;
};

type PendingOrder = {
  _id: string;
  _rev: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  deliveryLocation?: string;
  deliveryAddress?: CheckoutAddress;
  status?: string;
  paymentStatus?: string;
  subtotal: number;
  deliveryFee?: number;
  total: number;
  paymentReference?: string;
  paymentChannel?: string;
  paymentProvider?: string;
  currency?: string;
  paidAt?: string;
  lineItems?: PendingOrderLine[];
};

type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
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
    created_at?: string;
    gateway_response?: string | null;
    metadata?: unknown;
  };
};

export type VerifiedCheckoutOrder = {
  orderId: string;
  orderNumber: string;
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryAddress: CheckoutAddress;
  items: Array<{
    productId: string;
    name: string;
    finish?: string;
    quantity: number;
    unitPrice: number;
  }>;
};

function getSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!key) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is missing. Add your Paystack test secret key to .env before testing checkout.",
    );
  }

  return key;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function assertReference(reference: string) {
  if (!/^[A-Za-z0-9.=-]+$/.test(reference)) {
    throw new Error("Invalid Paystack reference.");
  }
}

function safeReferenceForDocumentId(reference: string) {
  return reference.replace(/[^A-Za-z0-9._-]/g, "-");
}

function createReference() {
  return `DBK-${Date.now()}-${randomBytes(5).toString("hex")}`;
}

function createOrderNumber(reference: string) {
  return reference;
}

function createLineKey(productId: string, finish: string | undefined, index: number) {
  return createHmac("sha256", "dbk-order-line")
    .update(`${productId}|${finish || ""}|${index}`)
    .digest("hex")
    .slice(0, 20);
}

function paymentChannelFor(method: string) {
  switch (method) {
    case "Mobile money":
      return "mobile_money";
    case "Bank transfer":
      return "bank_transfer";
    case "Card":
    default:
      return "card";
  }
}

function paymentLabel(channel?: string) {
  switch (channel) {
    case "mobile_money":
      return "Mobile money";
    case "bank_transfer":
      return "Bank transfer";
    case "card":
      return "Card";
    default:
      return channel || "Paystack";
  }
}

function buildDeliveryLocation(address: CheckoutAddress) {
  return [
    address.address1,
    address.address2,
    address.city,
    address.region,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function validateAddress(address: CheckoutAddress) {
  const required = [
    address.fullName,
    address.phone,
    address.address1,
    address.city,
    address.region,
    address.country,
  ];

  if (required.some((value) => !normalizeText(value))) {
    throw new Error("Complete all required delivery details before payment.");
  }
}

async function paystackRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.message || `Paystack request failed with HTTP ${response.status}.`,
    );
  }

  return payload;
}

async function fetchCheckoutProducts(productIds: string[]) {
  if (productIds.length === 0) return [];

  return serverClient.fetch<RawCheckoutProduct[]>(
    `*[_type == "product" && _id in $productIds]{
      _id,
      _rev,
      name,
      price,
      initialStock,
      available,
      "category": primaryCategory->title
    }`,
    { productIds },
    { cache: "no-store" },
  );
}

function normalizeCart(cart: CheckoutCartLine[]) {
  const normalized = new Map<
    string,
    { productId: string; quantity: number; colour?: string }
  >();

  cart.forEach((line) => {
    const productId = normalizeText(line.productId);
    const quantity = Number(line.quantity);
    const colour = normalizeText(line.colour) || undefined;

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Your bag contains an invalid product quantity.");
    }

    const key = `${productId}::${colour || ""}`;
    const existing = normalized.get(key);

    normalized.set(key, {
      productId,
      colour,
      quantity: (existing?.quantity || 0) + quantity,
    });
  });

  return [...normalized.values()];
}

async function buildAuthoritativeOrderLines(cart: CheckoutCartLine[]) {
  const normalizedCart = normalizeCart(cart);
  const productIds = [...new Set(normalizedCart.map((line) => line.productId))];
  const products = await fetchCheckoutProducts(productIds);
  const byId = new Map(products.map((product) => [product._id, product]));

  const lineItems: PendingOrderLine[] = normalizedCart.map((line, index) => {
    const product = byId.get(line.productId);

    if (!product) {
      throw new Error("A product in your bag is no longer available.");
    }

    if (product.available === false) {
      throw new Error(`${product.name || "A product"} is currently unavailable.`);
    }

    if (typeof product.price !== "number" || product.price <= 0) {
      throw new Error(`${product.name || "A product"} does not have a valid live price.`);
    }

    if (
      typeof product.initialStock === "number" &&
      product.initialStock < line.quantity
    ) {
      throw new Error(
        `${product.name || "A product"} only has ${Math.max(
          product.initialStock,
          0,
        )} unit(s) available.`,
      );
    }

    return {
      _key: createLineKey(line.productId, line.colour, index),
      productId: product._id,
      name: product.name?.trim() || "Product",
      category: product.category?.trim() || "Uncategorised",
      finish: line.colour,
      quantity: line.quantity,
      unitPrice: product.price,
    };
  });

  return { lineItems, products };
}

export async function initializePaystackCheckout({
  email,
  address,
  cart,
  paymentMethod,
  callbackBaseUrl,
}: {
  email: string;
  address: CheckoutAddress;
  cart: CheckoutCartLine[];
  paymentMethod: string;
  callbackBaseUrl: string;
}) {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    throw new Error("Enter a valid email address before payment.");
  }

  validateAddress(address);

  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error("Your bag is empty.");
  }

  const { lineItems } = await buildAuthoritativeOrderLines(cart);

  const subtotal = lineItems.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const deliveryFee = 0;
  const total = subtotal + deliveryFee;

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("Unable to calculate a valid order total.");
  }

  const reference = createReference();
  const documentReference = safeReferenceForDocumentId(reference);
  const orderId = `commerceOrder.paystack.${documentReference}`;
  const orderNumber = createOrderNumber(reference);
  const now = new Date().toISOString();
  const paymentChannel = paymentChannelFor(paymentMethod);
  const deliveryAddress: CheckoutAddress = {
    fullName: normalizeText(address.fullName),
    phone: normalizeText(address.phone),
    address1: normalizeText(address.address1),
    address2: normalizeText(address.address2) || undefined,
    city: normalizeText(address.city),
    region: normalizeText(address.region),
    country: normalizeText(address.country) || "Kenya",
  };

  await serverClient.create({
    _id: orderId,
    _type: "commerceOrder",
    orderNumber,
    customerName: deliveryAddress.fullName,
    customerEmail: normalizedEmail,
    customerPhone: deliveryAddress.phone,
    deliveryLocation: buildDeliveryLocation(deliveryAddress),
    deliveryAddress,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    paymentStatus: "pending",
    subtotal,
    deliveryFee,
    total,
    currency: CURRENCY,
    paymentReference: reference,
    paymentProvider: "paystack",
    paymentChannel,
    lineItems: lineItems.map((line) => ({
      _key: line._key,
      _type: "object",
      product: {
        _type: "reference",
        _ref: line.productId,
      },
      productId: line.productId,
      name: line.name,
      category: line.category,
      finish: line.finish,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
  });

  const cleanBase = callbackBaseUrl.replace(/\/+$/, "");

  try {
    const paystack = await paystackRequest<PaystackInitializeResponse>(
      "/transaction/initialize",
      {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          amount: String(Math.round(total * 100)),
          currency: CURRENCY,
          reference,
          callback_url: `${cleanBase}/checkout/success`,
          channels: [paymentChannel],
          metadata: JSON.stringify({
            order_number: orderNumber,
            customer_name: deliveryAddress.fullName,
            customer_phone: deliveryAddress.phone,
            cancel_action: `${cleanBase}/checkout?payment=cancelled`,
          }),
        }),
      },
    );

    if (!paystack.status || !paystack.data?.authorization_url) {
      throw new Error(paystack.message || "Paystack did not return a checkout URL.");
    }

    return {
      authorizationUrl: paystack.data.authorization_url,
      reference,
      orderNumber,
      total,
    };
  } catch (cause) {
    await serverClient
      .patch(orderId)
      .set({
        paymentStatus: "failed",
        status: "cancelled",
        failureReason:
          cause instanceof Error ? cause.message : "Paystack initialization failed.",
        updatedAt: new Date().toISOString(),
      })
      .commit();

    throw cause;
  }
}

async function fetchPendingOrder(reference: string) {
  return serverClient.fetch<PendingOrder | null>(
    `*[
      _type == "commerceOrder" &&
      paymentProvider == "paystack" &&
      paymentReference == $reference
    ][0]{
      _id,
      _rev,
      orderNumber,
      customerName,
      customerEmail,
      customerPhone,
      deliveryLocation,
      deliveryAddress,
      status,
      paymentStatus,
      subtotal,
      deliveryFee,
      total,
      paymentReference,
      paymentChannel,
      paymentProvider,
      currency,
      paidAt,
      "lineItems": lineItems[]{
        _key,
        "productId": coalesce(product._ref, productId),
        name,
        category,
        finish,
        quantity,
        unitPrice
      }
    }`,
    { reference },
    { cache: "no-store" },
  );
}

async function verifyWithPaystack(reference: string) {
  assertReference(reference);

  const payload = await paystackRequest<PaystackVerifyResponse>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
    },
  );

  if (!payload.status || !payload.data) {
    throw new Error(payload.message || "Paystack could not verify this payment.");
  }

  return payload.data;
}

function toVerifiedOrder(
  order: PendingOrder,
  paymentChannel?: string,
): VerifiedCheckoutOrder {
  const address =
    order.deliveryAddress ||
    ({
      fullName: order.customerName,
      phone: order.customerPhone || "",
      address1: order.deliveryLocation || "",
      address2: "",
      city: "",
      region: "",
      country: "Kenya",
    } satisfies CheckoutAddress);

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    reference: order.paymentReference || "",
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone || address.phone || "",
    paymentMethod: paymentLabel(paymentChannel || order.paymentChannel),
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    total: Number(order.total || 0),
    deliveryAddress: address,
    items: (order.lineItems || []).map((line) => ({
      productId: line.productId,
      name: line.name,
      finish: line.finish,
      quantity: Number(line.quantity || 0),
      unitPrice: Number(line.unitPrice || 0),
    })),
  };
}

export async function finalizePaystackPayment(reference: string) {
  assertReference(reference);

  const order = await fetchPendingOrder(reference);

  if (!order) {
    throw new Error("The matching Decor by Kasiwa order could not be found.");
  }

  if (order.paymentStatus === "paid") {
    return toVerifiedOrder(order, order.paymentChannel);
  }

  const transaction = await verifyWithPaystack(reference);
  const expectedAmount = Math.round(Number(order.total || 0) * 100);

  if (transaction.reference !== reference) {
    throw new Error("Paystack returned an unexpected transaction reference.");
  }

  if (transaction.currency !== CURRENCY) {
    throw new Error(
      `Payment currency mismatch. Expected ${CURRENCY}, received ${transaction.currency}.`,
    );
  }

  if (Number(transaction.amount) !== expectedAmount) {
    throw new Error("Payment amount does not match the live order total.");
  }

  if (transaction.status !== "success") {
    if (["failed", "abandoned", "reversed"].includes(transaction.status)) {
      await serverClient
        .patch(order._id)
        .set({
          paymentStatus: "failed",
          failureReason:
            transaction.gateway_response || `Paystack status: ${transaction.status}`,
          updatedAt: new Date().toISOString(),
        })
        .commit();
    }

    throw new Error(`Paystack payment is currently ${transaction.status}.`);
  }

  const deliveryAddress =
    order.deliveryAddress ||
    ({
      fullName: order.customerName,
      phone: order.customerPhone || "",
      address1: order.deliveryLocation || "",
      address2: "",
      city: "",
      region: "",
      country: "Kenya",
    } satisfies CheckoutAddress);

  const paidAt =
    transaction.paid_at || new Date().toISOString();

  const customer = await upsertCustomerFromPurchase({
    name: order.customerName,
    email: order.customerEmail,
    phone: order.customerPhone || deliveryAddress.phone,
    address1: deliveryAddress.address1,
    address2: deliveryAddress.address2,
    city: deliveryAddress.city,
    region: deliveryAddress.region,
    country: deliveryAddress.country,
    purchasedAt: paidAt,
  });

  const productIds = [
    ...new Set((order.lineItems || []).map((line) => line.productId)),
  ];

  const liveProducts = await fetchCheckoutProducts(productIds);
  const productById = new Map(liveProducts.map((product) => [product._id, product]));
  const stockWarnings: string[] = [];

  const mutation = serverClient.transaction();

  for (const line of order.lineItems || []) {
    const product = productById.get(line.productId);

    if (!product || typeof product.initialStock !== "number") {
      continue;
    }

    const nextStock = Math.max(0, product.initialStock - line.quantity);

    if (product.initialStock < line.quantity) {
      stockWarnings.push(
        `${product.name || line.name}: paid quantity ${line.quantity}, available before finalisation ${product.initialStock}.`,
      );
    }

    mutation.patch(product._id, (patch) =>
      patch
        .ifRevisionId(product._rev)
        .set({
          initialStock: nextStock,
          ...(nextStock <= 0 ? { available: false } : {}),
        }),
    );
  }

  const shipmentId = `shipment.paystack.${safeReferenceForDocumentId(reference)}`;
  const totalUnits = (order.lineItems || []).reduce(
    (sum, line) => sum + Number(line.quantity || 0),
    0,
  );
  const now = new Date().toISOString();

  mutation.patch(order._id, (patch) =>
    patch
      .ifRevisionId(order._rev)
      .set({
        customer: {
          _type: "reference",
          _ref: customer._id,
        },
        paymentStatus: "paid",
        status: "ready_for_store",
        paymentProvider: "paystack",
        paymentReference: reference,
        paymentChannel: transaction.channel || order.paymentChannel || "paystack",
        paystackTransactionId: String(transaction.id),
        paidAt,
        currency: transaction.currency,
        failureReason: "",
        updatedAt: now,
      }),
  );

  mutation.create({
    _id: shipmentId,
    _type: "shipment",
    shipmentNumber: `SHP-${order.orderNumber}`,
    order: {
      _type: "reference",
      _ref: order._id,
    },
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    destination: order.deliveryLocation || buildDeliveryLocation(deliveryAddress),
    createdAt: now,
    updatedAt: now,
    status: stockWarnings.length > 0 ? "exception" : "awaiting_store",
    itemCount: (order.lineItems || []).length,
    totalUnits,
    notes:
      stockWarnings.length > 0
        ? `Automatic stock reconciliation required:\n${stockWarnings.join("\n")}`
        : "Created automatically after verified Paystack payment.",
  });

  try {
    await mutation.commit();
  } catch (cause) {
    const concurrentResult = await fetchPendingOrder(reference);

    if (concurrentResult?.paymentStatus === "paid") {
      return toVerifiedOrder(
        concurrentResult,
        transaction.channel || concurrentResult.paymentChannel,
      );
    }

    throw cause;
  }

  const finalized = await fetchPendingOrder(reference);

  if (!finalized) {
    throw new Error("Payment was processed but the finalized order could not be loaded.");
  }

  return toVerifiedOrder(finalized, transaction.channel);
}

export function verifyPaystackWebhookSignature(
  rawBody: string,
  signature: string | null,
) {
  if (!signature) return false;

  const expected = createHmac("sha512", getSecretKey())
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
