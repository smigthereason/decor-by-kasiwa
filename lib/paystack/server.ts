import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { upsertCustomerFromPurchase } from "@/lib/auth/sanity-users";
import { addInventoryMovementsToTransaction } from "@/lib/pos/ledger";
import { hasVariants, variantStockTotal } from "@/lib/inventory/stock";
import { serverClient } from "@/sanity/lib/serverClient";
import { getMainStore } from "@/lib/stores/main-store";
import { adjustLocationBalance, findLocationBalance, locationOnHand, type LocationBalance } from "@/lib/inventory/location-stock";
import { getQuantityUnitPrice } from "@/lib/product-pricing";
import { getDeliveryZoneById } from "@/lib/shipping-server";
import { sendOrderConfirmationEmail } from "@/lib/order-email";
import { createShortOrderNumber } from "@/lib/order-number";
import { workflowForProducts } from "@/lib/operations/workflow";
import {
  dbk64OnlineRequested, dbk64CreatePending, dbk64MarkInitFailed,
  dbk64GetPending, dbk64RecordVerifiedPayment,
  type DBK64CheckoutSnapshot,
} from "@/lib/db/dbk64-online-neon";
import { dbk64ValidReference, dbk64MoneyMinor, dbk64VerifiedOrder } from "@/lib/db/dbk64-online-core";


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
  size?: string;
  variantId?: string;
};

type RawCheckoutProduct = {
  _id: string;
  _rev: string;
  name?: string;
  slug?: string;
  price?: number;
  retailPrice?: number;
  onSale?: boolean;
  salePrice?: number;
  saleStartAt?: string;
  saleEndAt?: string;
  wholesalePrice?: number;
  wholesaleMinQuantity?: number;
  initialStock?: number;
  inventory?: { _id: string; _rev: string; locationBalances?: LocationBalance[] } | null;
  procurementCost?: number;
  available?: boolean;
  ecommerceEnabled?: boolean;
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

type PendingOrderLine = {
  _key: string;
  productId: string;
  name: string;
  category: string;
  finish?: string;
  size?: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

type PendingOrder = {
  _id: string;
  _rev: string;
  orderNumber: string;
  storeLocationId?: string;
  storeLocationName?: string;
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
  orderConfirmationEmailSentAt?: string;
  deliveryOptionLabel?: string;
  fulfilmentStages?: Array<"PRODUCTION" | "PACKAGING" | "DELIVERY">;
  currentFulfilmentStage?: "PRODUCTION" | "PACKAGING" | "DELIVERY" | "COMPLETED";
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
    size?: string;
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

function createLineKey(productId: string, finish: string | undefined, size: string | undefined, variantId: string | undefined, index: number) {
  return createHmac("sha256", "dbk-order-line")
    .update(`${productId}|${finish || ""}|${size || ""}|${variantId || ""}|${index}`)
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
      "slug": slug.current,
      price,
      "retailPrice": price,
      onSale,
      salePrice,
      saleStartAt,
      saleEndAt,
      wholesalePrice,
      wholesaleMinQuantity,
      initialStock,
      "inventory": *[_type == "inventoryRecord" && product._ref == ^._id][0]{_id,_rev,locationBalances},
      procurementCost,
      available,
      ecommerceEnabled,
      "category": primaryCategory->title,
      variants
    }`,
    { productIds },
    { cache: "no-store" },
  );
}

function normalizeCart(cart: CheckoutCartLine[]) {
  const normalized = new Map<
    string,
    { productId: string; quantity: number; colour?: string; size?: string; variantId?: string }
  >();

  cart.forEach((line) => {
    const productId = normalizeText(line.productId);
    const quantity = Number(line.quantity);
    const colour = normalizeText(line.colour) || undefined;
    const size = normalizeText(line.size) || undefined;
    const variantId = normalizeText(line.variantId) || undefined;

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Your bag contains an invalid product quantity.");
    }

    const key = `${productId}::${variantId || ""}::${colour || ""}::${size || ""}`;
    const existing = normalized.get(key);

    normalized.set(key, {
      productId,
      colour,
      size,
      variantId,
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

    if (product.available === false || product.ecommerceEnabled === false) {
      throw new Error(`${product.name || "A product"} is not available for online purchase.`);
    }

    if (typeof product.price !== "number" || product.price <= 0) {
      throw new Error(`${product.name || "A product"} does not have a valid live price.`);
    }

    const variantProduct = hasVariants(product.variants);
    if (
      !variantProduct &&
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

    if (variantProduct && !line.variantId) {
      throw new Error(
        `${product.name || "A product"} requires an available variant to be selected before checkout.`,
      );
    }

    const variant = line.variantId
      ? product.variants?.find((item) => item._key === line.variantId)
      : undefined;

    if (variantProduct && !variant) {
      throw new Error(`${product.name || "A product"} selected variant is no longer available.`);
    }

    if (variantProduct && variant) {
      const availableVariantStock = Number(variant.stockQuantity);
      const variantName = variant.title?.trim() || variant.colour?.trim() || variant.size?.trim() || "selected variant";

      if (!Number.isFinite(availableVariantStock) || availableVariantStock <= 0) {
        throw new Error(`${product.name || "A product"} (${variantName}) is out of stock.`);
      }

      if (availableVariantStock < line.quantity) {
        throw new Error(
          `${product.name || "A product"} (${variantName}) only has ${Math.max(availableVariantStock, 0)} unit(s) available.`,
        );
      }
    }

    return {
      _key: createLineKey(line.productId, line.colour, line.size, line.variantId, index),
      productId: product._id,
      name: product.name?.trim() || "Product",
      category: product.category?.trim() || "Uncategorised",
      finish: line.colour || variant?.colour,
      size: line.size || variant?.size,
      variantId: line.variantId || variant?._key,
      quantity: line.quantity,
      unitPrice: getQuantityUnitPrice(product, line.quantity, variant?.price),
      unitCost: Math.max(0, Number(product.procurementCost || 0)),
    };
  });

  return { lineItems, products };
}

function decrementVariantStock(
  product: RawCheckoutProduct,
  lines: PendingOrderLine[],
) {
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

export async function initializePaystackCheckout({
  email,
  address,
  cart,
  paymentMethod,
  deliveryOptionId,
  customerNote,
  callbackBaseUrl,
}: {
  email: string;
  address: CheckoutAddress;
  cart: CheckoutCartLine[];
  paymentMethod: string;
  deliveryOptionId?: string;
  customerNote?: string;
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

  const mainStore = await getMainStore();
  if (!mainStore) {
    throw new Error("Online checkout requires an active Main store. When multiple Main stores exist, configure DBK_MAIN_STORE_ID on the server.");
  }

  const { lineItems } = await buildAuthoritativeOrderLines(cart);
  const workflow = await workflowForProducts(lineItems.map((line) => line.productId));

  const subtotal = lineItems.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const deliveryOption = await getDeliveryZoneById(deliveryOptionId);
  if (!deliveryOption) {
    throw new Error("Select a valid shipping / delivery option before payment.");
  }
  const deliveryFee = deliveryOption.fee;
  const total = subtotal + deliveryFee;

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("Unable to calculate a valid order total.");
  }

  const neonCheckout = dbk64OnlineRequested();
  if (!neonCheckout && process.env.DBK62_POS_BACKEND === 'neon') {
    throw new Error('Online checkout is temporarily unavailable during Neon cutover; no Sanity stock writes are permitted.');
  }
  const reference = neonCheckout
    ? `DBK64-${Date.now()}-${randomBytes(5).toString("hex")}`
    : createReference();
  const documentReference = safeReferenceForDocumentId(reference);
  const orderId = neonCheckout
    ? `dbk64.order.${reference}`
    : `commerceOrder.paystack.${documentReference}`;
  // Neon checkout must not mutate the Sanity order-number counter.
  const orderNumber = neonCheckout
    ? `DBK-COM-${Date.now()}-${randomBytes(4).toString("hex")}`
    : await createShortOrderNumber("COM", reference);
  const now = new Date().toISOString();
  const paymentChannel = paymentChannelFor(paymentMethod);
  const normalizedCustomerNote = normalizeText(customerNote || "");
  if (normalizedCustomerNote.length > 20) {
    throw new Error("Order note must be 20 characters or fewer.");
  }

  const deliveryAddress: CheckoutAddress = {
    fullName: normalizeText(address.fullName),
    phone: normalizeText(address.phone),
    address1: normalizeText(address.address1),
    address2: normalizeText(address.address2) || undefined,
    city: normalizeText(address.city),
    region: normalizeText(address.region),
    country: normalizeText(address.country) || "Kenya",
  };

  if (neonCheckout) {
    // All pending order/payment state is written to Neon BEFORE contacting Paystack.
    // If anything fails, we never create an orphan Sanity order as a fallback.
    const snapshot: DBK64CheckoutSnapshot = {
      reference, orderId, orderNumber, storeId: mainStore.id, storeName: mainStore.name,
      customerName: deliveryAddress.fullName, customerEmail: normalizedEmail,
      customerPhone: deliveryAddress.phone, paymentChannel: paymentLabel(paymentChannel),
      subtotalMinor: dbk64MoneyMinor(subtotal),
      deliveryMinor: dbk64MoneyMinor(deliveryFee),
      totalMinor: dbk64MoneyMinor(total),
      deliveryAddress, deliveryLocation: `${deliveryOption.label} · ${buildDeliveryLocation(deliveryAddress)}`,
      lines: lineItems.map(line => ({
        productId: line.productId, variantId: line.variantId || "", quantity: line.quantity,
        unitPriceMinor: dbk64MoneyMinor(line.unitPrice), name: line.name,
        finish: line.finish, size: line.size,
      })),
    };
    await dbk64CreatePending(snapshot);
    const cleanBase = callbackBaseUrl.replace(/\/+$/, "");
    try {
      const provider = await paystackRequest<PaystackInitializeResponse>(
        "/transaction/initialize", {
          method: "POST",
          body: JSON.stringify({
            email: normalizedEmail, amount: String(snapshot.totalMinor),
            currency: CURRENCY, reference,
            callback_url: `${cleanBase}/checkout/success`,
            channels: [paymentChannel],
            metadata: JSON.stringify({ order_number: orderNumber,
              customer_name: deliveryAddress.fullName,
              customer_phone: deliveryAddress.phone,
              cancel_action: `${cleanBase}/checkout?payment=cancelled` }),
          }),
        },
      );
      if (!provider.status || !provider.data?.authorization_url ||
          provider.data.reference !== reference) {
        throw new Error("Paystack returned an invalid checkout authorization");
      }
      return { authorizationUrl: provider.data.authorization_url, reference, orderNumber, total };
    } catch (cause) {
      try { await dbk64MarkInitFailed(reference); }
      catch (markError) { console.error("DBK-64 pending checkout requires reconciliation", markError); }
      throw cause;
    }
  }

  await serverClient.create({
    _id: orderId,
    _type: "commerceOrder",
    orderNumber,
    customerName: deliveryAddress.fullName,
    customerEmail: normalizedEmail,
    customerPhone: deliveryAddress.phone,
    ...(normalizedCustomerNote ? { customerNote: normalizedCustomerNote } : {}),
    deliveryLocation: `${deliveryOption.label} · ${buildDeliveryLocation(deliveryAddress)}`,
    deliveryOptionId: deliveryOption.id,
    deliveryOptionLabel: deliveryOption.label,
    deliveryAddress,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    paymentStatus: "pending",
    subtotal,
    deliveryFee,
    discountAmount: 0,
    total,
    amountPaid: 0,
    balanceDue: total,
    refundedAmount: 0,
    receiptNumber: `RCT-${orderNumber}`,
    currency: CURRENCY,
    salesChannel: "ONLINE",
    storeLocation: { _type: "reference", _ref: mainStore.id },
    assignedStore: mainStore.name,
    fulfilmentType: "DELIVERY",
    fulfilmentStages: workflow.fulfilmentStages,
    ...(workflow.currentFulfilmentStage ? { currentFulfilmentStage: workflow.currentFulfilmentStage } : {}),
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
      size: line.size,
      variantId: line.variantId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: line.unitCost,
    })),
  });

  await serverClient.createIfNotExists({
    _id: `paymentTransaction.${documentReference}`,
    _type: "paymentTransaction",
    reference,
    order: { _type: "reference", _ref: orderId },
    orderNumber,
    customerName: deliveryAddress.fullName,
    customerPhone: deliveryAddress.phone,
    salesChannel: "ONLINE",
    provider: "paystack",
    channel: paymentChannel,
    status: "pending",
    amount: total,
    currency: CURRENCY,
    createdAt: now,
    updatedAt: now,
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
    const failureReason = cause instanceof Error ? cause.message : "Paystack initialization failed.";
    const failedAt = new Date().toISOString();
    await Promise.all([
      serverClient.patch(orderId).set({ paymentStatus: "failed", status: "cancelled", failureReason, updatedAt: failedAt }).commit(),
      serverClient.patch(`paymentTransaction.${documentReference}`).set({ status: "failed", failureReason, updatedAt: failedAt }).commit(),
    ]);

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
      "storeLocationId": storeLocation._ref,
      "storeLocationName": coalesce(storeLocation->name,assignedStore,""),
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
      orderConfirmationEmailSentAt,
      deliveryOptionLabel,
      fulfilmentStages,
      currentFulfilmentStage,
      "lineItems": lineItems[]{
        _key,
        "productId": coalesce(product._ref, productId),
        name,
        category,
        finish,
        size,
        variantId,
        quantity,
        unitPrice,
        unitCost
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
      size: line.size,
      quantity: Number(line.quantity || 0),
      unitPrice: Number(line.unitPrice || 0),
    })),
  };
}

async function sendConfirmationIfNeeded(order: PendingOrder, paymentChannel?: string) {
  if (order.orderConfirmationEmailSentAt) return;
  try {
    await sendOrderConfirmationEmail({
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      deliveryLocation: order.deliveryLocation,
      subtotal: Number(order.subtotal || 0),
      deliveryFee: Number(order.deliveryFee || 0),
      total: Number(order.total || 0),
      paymentMethod: paymentLabel(paymentChannel || order.paymentChannel),
      items: (order.lineItems || []).map((line) => ({
        name: line.name, quantity: Number(line.quantity || 0), unitPrice: Number(line.unitPrice || 0), finish: line.finish, size: line.size,
      })),
    });
  } catch (cause) {
    console.error("Order confirmation email failed:", cause);
  }
}

export async function finalizePaystackPayment(reference: string) {
  assertReference(reference);
  if (reference.startsWith("DBK64-")) {
    // Verified checkout intentionally never falls back to Sanity, including
    // after operators disable the Neon feature during a recovery incident.
    if (!dbk64ValidReference(reference)) throw new Error("Invalid DBK-64 reference");
    const order = await dbk64GetPending(reference);
    if (!order) throw new Error("DBK-64 pending order is missing; reconcile before retrying");
    if (order.payment_status === "PAID") {
      return dbk64VerifiedOrder(order.snapshot);
    }
    const payment = await verifyWithPaystack(reference);
    if (payment.status !== "success") {
      throw new Error(`Paystack payment is currently ${payment.status}`);
    }
    if (payment.reference !== reference || payment.currency !== CURRENCY ||
        !Number.isSafeInteger(payment.amount) ||
        payment.amount !== Number(order.amount_minor) ||
        !Number.isSafeInteger(payment.id) || payment.id <= 0) {
      throw new Error("Paystack verified transaction does not match this Neon order");
    }
    const settled = await dbk64RecordVerifiedPayment({
      reference, id: String(payment.id), amountMinor: payment.amount,
      currency: payment.currency, paidAt: payment.paid_at || new Date().toISOString(),
      channel: payment.channel || "paystack",
    });
    if (settled.stockStatus === "REVIEW_REQUIRED") {
      console.error("[DBK-64] PAID online order requires inventory review", reference);
    }
    return dbk64VerifiedOrder(order.snapshot);
  }

  const order = await fetchPendingOrder(reference);

  if (!order) {
    throw new Error("The matching Decor by Kasiwa order could not be found.");
  }

  if (order.paymentStatus === "paid") {
    await sendConfirmationIfNeeded(order, order.paymentChannel);
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
      const failureReason = transaction.gateway_response || `Paystack status: ${transaction.status}`;
      const failedAt = new Date().toISOString();
      await Promise.all([
        serverClient.patch(order._id).set({ paymentStatus: "failed", failureReason, updatedAt: failedAt }).commit(),
        serverClient.patch(`paymentTransaction.${safeReferenceForDocumentId(reference)}`).set({ status: "failed", failureReason, updatedAt: failedAt }).commit(),
      ]);
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
  const stockMovements: Array<{ productId: string; productName: string; variantId?: string; quantityChange: number; stockBefore?: number; stockAfter?: number }> = [];

  for (const product of liveProducts) {
    const productLines = (order.lineItems || []).filter((line) => line.productId === product._id);
    const soldQuantity = productLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

    if (soldQuantity <= 0) continue;

    const variantProduct = hasVariants(product.variants);
    const currentStock = variantProduct ? variantStockTotal(product.variants) : Math.max(0, Number(product.initialStock || 0));
    const nextVariants = variantProduct ? decrementVariantStock(product, productLines) : undefined;

    if (variantProduct) {
      for (const line of productLines) {
        const variant = product.variants?.find((item) => item._key === line.variantId);
        const available = Math.max(0, Number(variant?.stockQuantity || 0));
        if (available < Number(line.quantity || 0)) {
          stockWarnings.push(`${product.name || "Product"}${variant?.title ? ` (${variant.title})` : ""}: paid quantity ${line.quantity}, variant stock before finalisation ${available}.`);
        }
      }
    } else if (currentStock < soldQuantity) {
      stockWarnings.push(
        `${product.name || "Product"}: paid quantity ${soldQuantity}, available before finalisation ${currentStock}.`,
      );
    }

    const nextStock = variantProduct
      ? variantStockTotal(nextVariants || product.variants)
      : Math.max(0, currentStock - soldQuantity);
    // Only modify a location ledger when its current balance can cover the
    // entire item quantity. Paid orders must remain paid even if stock needs
    // manual reconciliation; never fabricate/clip store stock to hide that.
    let storeDeducted = false;
    if (order.storeLocationId) {
      const inventory = product.inventory;
      const balances = inventory?.locationBalances || [];
      const currentLocation = findLocationBalance(balances, order.storeLocationId);
      const requestedByVariant = new Map<string, number>();
      for (const line of productLines) {
        const key = variantProduct ? (line.variantId || "") : "";
        requestedByVariant.set(key, (requestedByVariant.get(key) || 0) + Number(line.quantity || 0));
      }
      const sufficient = Boolean(inventory?._id && inventory?._rev) &&
        [...requestedByVariant].every(([variantId, qty]) => locationOnHand(currentLocation, variantId || undefined) >= qty);
      if (sufficient && inventory) {
        let nextLocationBalances = balances;
        for (const line of productLines) {
          nextLocationBalances = adjustLocationBalance(nextLocationBalances, {
            id: order.storeLocationId,
            name: order.storeLocationName || "Main store",
          }, {
            onHandDelta: -Number(line.quantity || 0),
            ...(variantProduct ? {
              variantId: line.variantId,
              variantLabel: product.variants?.find((item) => item._key === line.variantId)?.title,
            } : {}),
          });
        }
        mutation.patch(inventory._id, (patch) => patch.ifRevisionId(inventory._rev).set({ locationBalances: nextLocationBalances }));
        storeDeducted = true;
      } else {
        stockWarnings.push(`${product.name || "Product"}: online payment confirmed, but the assigned store has insufficient or unallocated inventory. Reconcile its store ledger before fulfilment.`);
      }
    }
    productLines.forEach((line) => stockMovements.push({
      productId: product._id,
      productName: product.name || "Product",
      variantId: line.variantId,
      quantityChange: -Number(line.quantity || 0),
      stockBefore: currentStock,
      stockAfter: nextStock,
      ...(storeDeducted ? { sourceStoreId: order.storeLocationId, sourceLocation: order.storeLocationName } : {}),
    }));
    mutation.patch(product._id, (patch) =>
      patch
        .ifRevisionId(product._rev)
        .set({
          initialStock: nextStock,
          ...(nextVariants ? { variants: nextVariants } : {}),
          available: nextStock > 0,
        }),
    );
  }

  const shipmentId = `shipment.paystack.${safeReferenceForDocumentId(reference)}`;
  const totalUnits = (order.lineItems || []).reduce(
    (sum, line) => sum + Number(line.quantity || 0),
    0,
  );
  const now = new Date().toISOString();

  mutation.patch(order._id, (patch) => {
    let next = patch
      .ifRevisionId(order._rev)
      .set({
        customer: {
          _type: "reference",
          _ref: customer._id,
        },
        paymentStatus: "paid",
        status: order.currentFulfilmentStage ? "processing" : "ready_for_store",
        paymentProvider: "paystack",
        paymentReference: reference,
        paymentChannel: transaction.channel || order.paymentChannel || "paystack",
        paystackTransactionId: String(transaction.id),
        providerReceiptNumber: String(transaction.id),
        amountPaid: Number(order.total || 0),
        balanceDue: 0,
        receiptNumber: `RCT-${order.orderNumber}`,
        paidAt,
        currency: transaction.currency,
        failureReason: "",
        inventoryReviewRequired: stockWarnings.length > 0,
        inventoryReconciliationReason: stockWarnings.length > 0
          ? `Payment was confirmed after stock changed. Review these items before fulfilment:\n${stockWarnings.join("\n")}`
          : "",
        updatedAt: now,
      });

    if (stockWarnings.length > 0) {
      next = next.set({ inventoryReviewRaisedAt: now });
    } else {
      next = next.unset(["inventoryReviewRaisedAt"]);
    }

    return next;
  });

  addInventoryMovementsToTransaction({
    transaction: mutation,
    movementKey: `online-sale|${order.orderNumber}`,
    movementType: "SALE",
    orderId: order._id,
    orderNumber: order.orderNumber,
    movements: stockMovements,
    note: "Inventory deducted after verified online Paystack payment.",
    createdAt: now,
  });

  mutation.createIfNotExists({
    _id: `paymentTransaction.${safeReferenceForDocumentId(reference)}`,
    _type: "paymentTransaction",
    reference,
    order: { _type: "reference", _ref: order._id },
    orderNumber: order.orderNumber,
    customer: { _type: "reference", _ref: customer._id },
    customerName: order.customerName,
    customerPhone: order.customerPhone || deliveryAddress.phone,
    salesChannel: "ONLINE",
    provider: "paystack",
    channel: transaction.channel || order.paymentChannel || "paystack",
    status: "paid",
    amount: Number(order.total || 0),
    currency: transaction.currency,
    providerTransactionId: String(transaction.id),
    providerReceiptNumber: String(transaction.id),
    createdAt: now,
    updatedAt: now,
    paidAt,
  });

  mutation.patch(`paymentTransaction.${safeReferenceForDocumentId(reference)}`, (patch) => patch.set({
    order: { _type: "reference", _ref: order._id },
    orderNumber: order.orderNumber,
    customer: { _type: "reference", _ref: customer._id },
    customerName: order.customerName,
    customerPhone: order.customerPhone || deliveryAddress.phone,
    salesChannel: "ONLINE",
    provider: "paystack",
    channel: transaction.channel || order.paymentChannel || "paystack",
    status: "paid",
    amount: Number(order.total || 0),
    currency: transaction.currency,
    providerTransactionId: String(transaction.id),
    providerReceiptNumber: String(transaction.id),
    updatedAt: now,
    paidAt,
    failureReason: "",
  }));

  mutation.createIfNotExists({
    _id: `auditEvent.online-${safeReferenceForDocumentId(reference)}`,
    _type: "auditEvent",
    eventNumber: `AUD-ONLINE-${safeReferenceForDocumentId(reference).slice(-10).toUpperCase()}`,
    eventType: "ONLINE_PAYMENT_CONFIRMED",
    entityType: "commerceOrder",
    entityId: order._id,
    entityLabel: order.orderNumber,
    actorName: "Online Shop",
    actorRole: "CUSTOMER",
    detail: `Verified Paystack payment · ${transaction.channel || order.paymentChannel || "paystack"} · transaction ${transaction.id}`,
    createdAt: now,
  });

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

  await sendConfirmationIfNeeded(finalized, transaction.channel);
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
