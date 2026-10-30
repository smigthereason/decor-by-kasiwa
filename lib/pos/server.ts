import "server-only";

import { getMainStore, isLegacyStoreName } from "@/lib/stores/main-store";

import { createHash, createHmac } from "node:crypto";

import { upsertPosCustomerFromPurchase } from "@/lib/auth/sanity-users";
import type { ApiStaffRole } from "@/lib/auth/api-authorization";
import { addInventoryMovementsToTransaction, recordAuditEvent } from "@/lib/pos/ledger";
import { manualPaymentBreakdown, toCents } from "@/lib/pos/manual-payment";
import { hasVariants, variantStockTotal } from "@/lib/inventory/stock";
import { adjustLocationBalance, findLocationBalance, locationOnHand, type LocationBalance } from "@/lib/inventory/location-stock";
import { serverClient } from "@/sanity/lib/serverClient";
import { getQuantityUnitPrice } from "@/lib/product-pricing";
import { createShortOrderNumber } from "@/lib/order-number";
import { workflowForProducts } from "@/lib/operations/workflow";
import {
  callbackMetadata,
  darajaAccountReference,
  darajaTransactionDate,
  initiateDarajaStkPush,
  queryDarajaStkStatus,
  type DarajaStkCallbackPayload,
} from "@/lib/mpesa/daraja";

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
  storeLocationId?: string;
  storeLocationName?: string;
  storeLocationCode?: string;
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
  paymentMethod: "mpesa" | "paystack" | "manual";
  storeLocationId?: string;
  manualPaymentName?: string;
  manualPaymentReference?: string;
  manualAmountReceived?: number;
  manualPaymentConfirmed?: boolean;
  manualPartialPaymentConfirmed?: boolean;
  manualOverpaymentConfirmed?: boolean;
  deliveryLocation?: string;
  deliveryAddressLine?: string;
  deliveryRecipientName?: string;
  deliveryRecipientPhone?: string;
  deliveryFee?: number;
  discount?: PosDiscountInput | null;
};

type RawProduct = {
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
  procurementCost?: number;
  available?: boolean;
  posEnabled?: boolean;
  category?: string;
  inventory?: {
    _id?: string;
    locationBalances?: LocationBalance[];
  } | null;
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
  unitCost: number;
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
  deliveryFee?: number;
  deliveryLocation?: string;
  deliveryAddress?: {
    fullName?: string;
    phone?: string;
    address1?: string;
    address2?: string;
    city?: string;
    region?: string;
    country?: string;
  };
  fulfilmentType?: "DELIVERY" | "IN_STORE";
  fulfilmentStages?: Array<"PRODUCTION" | "PACKAGING" | "DELIVERY">;
  currentFulfilmentStage?: "PRODUCTION" | "PACKAGING" | "DELIVERY" | "COMPLETED";
  receiptNumber?: string;
  paymentReference?: string;
  paymentProvider?: string;
  paymentChannel?: string;
  providerReceiptNumber?: string;
  mpesaMerchantRequestId?: string;
  mpesaCheckoutRequestId?: string;
  mpesaResultCode?: number;
  mpesaResultDescription?: string;
  inventoryReviewRequired?: boolean;
  inventoryReconciliationReason?: string;
  inventoryReviewRaisedAt?: string;
  inventoryReconciledAt?: string;
  storeLocationId?: string;
  storeLocationName?: string;
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
    const code = cleanText(payload.code);
    console.error("[POS Paystack] request failed", { path, status: response.status, code: code || undefined, detail });
    throw new Error(`Paystack: ${detail}${code ? ` (${code})` : ""}`);
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
      procurementCost,
      available,
      posEnabled,
      "category": primaryCategory->title,
      variants,
      "inventory": *[_type == "inventoryRecord" && product._ref == ^._id][0]{
        _id,
        "locationBalances": locationBalances[]{_key,store,"storeId":coalesce(store._ref,storeId),"storeName":coalesce(store->name,storeName),"storeCode":coalesce(store->code,storeCode),onHand,incoming,variants[]{_key,variantId,variantLabel,onHand,incoming}}
      }
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

async function buildLines(cart: PosCartLine[], seller: PosSeller, options: { stockAuthority?: "sanity" | "neon" } = {}) {
  const normalized = normalizeCart(cart);
  const ids = [...new Set(normalized.map((line) => line.productId))];
  const products = await fetchProducts(ids);
  const byId = new Map(products.map((product) => [product._id, product]));

  const lines: PosLine[] = normalized.map((line, index) => {
    const product = byId.get(line.productId);
    if (!product) throw new Error("A POS product could not be found in the live catalogue.");
    if (product.available === false || product.posEnabled === false) throw new Error(`${product.name || "Product"} is not available on POS.`);
    if (typeof product.price !== "number" || product.price <= 0) throw new Error(`${product.name || "Product"} has no valid price.`);
    const variantProduct = hasVariants(product.variants);

    const variant = line.variantId
      ? product.variants?.find((item) => item._key === line.variantId)
      : product.variants?.find(
          (item) =>
            (!line.colour || item.colour === line.colour) &&
            (!line.size || item.size === line.size),
        );

    if (line.variantId && !variant) throw new Error(`${product.name || "Product"} variant is no longer available.`);
    if (variantProduct && !variant) throw new Error(`Select a valid ${product.name || "product"} variant before adding it to the sale.`);

    // Once inventory ownership is cut over, Sanity on-hand numbers are stale.
    // The DBK-57 atomic Neon transaction independently enforces available stock.
    if (options.stockAuthority === "neon") {
      // Product, variant, availability and prices were still checked above.
    } else if (seller.storeLocationId) {
      const balance = findLocationBalance(product.inventory?.locationBalances, seller.storeLocationId);
      const available = locationOnHand(balance, variant?._key);
      if (available < line.quantity) {
        const storeName = seller.storeLocationName || "assigned store";
        const variantName = variant?.title || [variant?.colour, variant?.size].filter(Boolean).join(" · ");
        throw new Error(`${product.name || "Product"}${variantName ? ` (${variantName})` : ""} only has ${available} unit(s) available at ${storeName}.`);
      }
    } else if (!variantProduct && typeof product.initialStock === "number" && product.initialStock < line.quantity) {
      throw new Error(`${product.name || "Product"} only has ${Math.max(product.initialStock, 0)} unit(s) available.`);
    } else if (variant && typeof variant.stockQuantity === "number" && variant.stockQuantity < line.quantity) {
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
      unitPrice: getQuantityUnitPrice(product, line.quantity, variant?.price),
      unitCost: Math.max(0, Number(product.procurementCost || 0)),
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
    unitCost: line.unitCost,
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
  if (!["ADMIN", "STORE", "MANAGER", "STORE_STAFF"].includes(seller.role)) {
    throw new Error("This staff role cannot authorise POS discounts.");
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

  // POS payments and the shop's thermal receipts operate in whole Kenya shillings.
  // Rounding here keeps the amount shown to the cashier identical to the amount
  // sent to Daraja, including percentage discounts that would otherwise create cents.
  return {
    discountAmount: Math.round(discountAmount),
    discountType: input.type,
    discountValue: value,
    discountReason: reason,
  };
}

function deliveryPayable(input: PosSaleInput) {
  const amount = Number(input.deliveryFee || 0);
  const location = cleanText(input.deliveryLocation);
  const addressLineInput = cleanText(input.deliveryAddressLine);
  const recipientNameInput = cleanText(input.deliveryRecipientName);
  const recipientPhoneInput = cleanText(input.deliveryRecipientPhone);
  const hasDeliveryDetails = Boolean(location || addressLineInput || recipientNameInput || recipientPhoneInput);

  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid delivery payable amount.");
  if (hasDeliveryDetails && !location) throw new Error("Enter the delivery destination for this order.");

  const recipientName = recipientNameInput || cleanText(input.customerName) || "Customer";
  const recipientPhoneRaw = recipientPhoneInput || cleanText(input.customerPhone);
  const recipientPhone = hasDeliveryDetails && recipientPhoneRaw ? normalizeKenyanPhone(recipientPhoneRaw) : "";
  const addressLine = addressLineInput || location;

  return {
    deliveryFee: Math.round(amount * 100) / 100,
    deliveryLocation: hasDeliveryDetails ? location : "In-store purchase",
    fulfilmentType: hasDeliveryDetails ? "DELIVERY" as const : "IN_STORE" as const,
    deliveryAddress: hasDeliveryDetails
      ? {
          fullName: recipientName,
          phone: recipientPhone,
          address1: addressLine,
          city: location,
          country: "Kenya",
        }
      : undefined,
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
      deliveryFee,
      deliveryLocation,
      deliveryAddress,
      fulfilmentType,
      fulfilmentStages,
      currentFulfilmentStage,
      receiptNumber,
      paymentReference,
      paymentProvider,
      paymentChannel,
      providerReceiptNumber,
      mpesaMerchantRequestId,
      mpesaCheckoutRequestId,
      mpesaResultCode,
      mpesaResultDescription,
      inventoryReviewRequired,
      inventoryReconciliationReason,
      inventoryReviewRaisedAt,
      inventoryReconciledAt,
      "customerId": customer._ref,
      customerName,
      customerEmail,
      customerPhone,
      soldByName,
      "storeLocationId": storeLocation._ref,
      "storeLocationName": coalesce(storeLocation->name, assignedStore, ""),
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
        unitPrice,
        unitCost
      }
    }`,
    { reference },
    { cache: "no-store" },
  );
}

async function fetchPosOrderByCheckoutRequestId(checkoutRequestId: string) {
  const direct = await serverClient.fetch<PosOrder | null>(
    `*[_type == "commerceOrder" && salesChannel == "POS" && mpesaCheckoutRequestId == $checkoutRequestId][0]{
      _id,_rev,orderNumber,paymentStatus,status,subtotal,discountAmount,total,amountPaid,balanceDue,cashTendered,cashChangeDue,
      deliveryFee,deliveryLocation,deliveryAddress,fulfilmentType,fulfilmentStages,currentFulfilmentStage,receiptNumber,
      paymentReference,paymentProvider,paymentChannel,providerReceiptNumber,mpesaMerchantRequestId,mpesaCheckoutRequestId,
      mpesaResultCode,mpesaResultDescription,inventoryReviewRequired,inventoryReconciliationReason,inventoryReviewRaisedAt,inventoryReconciledAt,"customerId":customer._ref,customerName,customerEmail,customerPhone,soldByName,"storeLocationId":storeLocation._ref,"storeLocationName":coalesce(storeLocation->name,assignedStore,""),soldAt,
      "lineItems":lineItems[]{_key,"productId":coalesce(product._ref,productId),name,category,finish,size,variantId,quantity,unitPrice,unitCost}
    }`,
    { checkoutRequestId },
    { cache: "no-store" },
  );
  if (direct) return direct;

  // Recovery path: the STK request can be accepted by Safaricom while the order
  // patch is temporarily unavailable. The payment transaction is persisted
  // separately, so callbacks can still resolve the correct order.
  return serverClient.fetch<PosOrder | null>(
    `*[_type == "paymentTransaction" && provider == "daraja" && providerTransactionId == $checkoutRequestId][0].order->{
      _id,_rev,orderNumber,paymentStatus,status,subtotal,discountAmount,total,amountPaid,balanceDue,cashTendered,cashChangeDue,
      deliveryFee,deliveryLocation,deliveryAddress,fulfilmentType,fulfilmentStages,currentFulfilmentStage,receiptNumber,
      paymentReference,paymentProvider,paymentChannel,providerReceiptNumber,mpesaMerchantRequestId,mpesaCheckoutRequestId,
      mpesaResultCode,mpesaResultDescription,inventoryReviewRequired,inventoryReconciliationReason,inventoryReviewRaisedAt,inventoryReconciledAt,"customerId":customer._ref,customerName,customerEmail,customerPhone,soldByName,"storeLocationId":storeLocation._ref,"storeLocationName":coalesce(storeLocation->name,assignedStore,""),soldAt,
      "lineItems":lineItems[]{_key,"productId":coalesce(product._ref,productId),name,category,finish,size,variantId,quantity,unitPrice,unitCost}
    }`,
    { checkoutRequestId },
    { cache: "no-store" },
  );
}

async function fetchDarajaCheckoutRequestId(reference: string) {
  return serverClient.fetch<string | null>(
    `*[_type == "paymentTransaction" && reference == $reference && provider == "daraja"][0].providerTransactionId`,
    { reference },
    { cache: "no-store" },
  );
}

async function settleWithRetry<T>(operation: () => Promise<T>, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (cause) {
      lastError = cause;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastError;
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
    providerReceiptNumber: order.providerReceiptNumber || "",
    subtotal: Number(order.subtotal || 0),
    discountAmount: Number(order.discountAmount || 0),
    total: Number(order.total || 0),
    amountPaid: Number(order.amountPaid || 0),
    balanceDue: Number(order.balanceDue || 0),
    cashTendered: Number(order.cashTendered || 0),
    cashChangeDue: Number(order.cashChangeDue || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    deliveryLocation: order.deliveryLocation || "",
    soldByName: order.soldByName || "Staff",
    soldAt: order.soldAt || "",
    inventoryReviewRequired: Boolean(order.inventoryReviewRequired),
    inventoryReconciliationReason: order.inventoryReconciliationReason || "",
    inventoryReviewRaisedAt: order.inventoryReviewRaisedAt || "",
    inventoryReconciledAt: order.inventoryReconciledAt || "",
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
  const movements: Array<{ productId: string; productName: string; variantId?: string; quantityChange: number; stockBefore?: number; stockAfter?: number; sourceStoreId?: string; sourceLocation?: string }> = [];

  for (const product of products) {
    const productLines = lines.filter((line) => line.productId === product._id);
    const soldQuantity = productLines.reduce((sum, line) => sum + line.quantity, 0);
    if (soldQuantity <= 0) continue;

    const variantProduct = hasVariants(product.variants);
    const currentStock = variantProduct ? variantStockTotal(product.variants) : Math.max(0, Number(product.initialStock || 0));
    let nextLocationBalances = product.inventory?.locationBalances || [];

    if (seller.storeLocationId) {
      const store = { id: seller.storeLocationId, name: seller.storeLocationName || "Assigned store", code: seller.storeLocationCode };
      const currentBalance = findLocationBalance(nextLocationBalances, seller.storeLocationId);
      for (const line of productLines) {
        const variantId = variantProduct ? line.variantId : undefined;
        const available = locationOnHand(currentBalance, variantId);
        if (available < line.quantity) {
          throw new Error(`${product.name || "Product"} no longer has enough stock at ${store.name}. Available: ${available}.`);
        }
      }
      for (const line of productLines) {
        nextLocationBalances = adjustLocationBalance(nextLocationBalances, store, {
          onHandDelta: -line.quantity,
          variantId: variantProduct ? line.variantId : undefined,
          variantLabel: line.finish || line.size,
        });
      }
      const inventoryId = product.inventory?._id;
      if (!inventoryId) throw new Error(`${product.name || "Product"} does not have a branch inventory record.`);
      transaction.patch(inventoryId, (patch) => patch.set({ location: "Multi-location", locationBalances: nextLocationBalances }));
    }

    const nextVariants = variantProduct ? decrementVariantStock(product, lines) : undefined;
    if (!seller.storeLocationId && !variantProduct && currentStock < soldQuantity) throw new Error(`${product.name || "Product"} no longer has enough stock.`);
    const nextStock = variantProduct
      ? variantStockTotal(nextVariants || product.variants)
      : Math.max(0, currentStock - soldQuantity);

    transaction.patch(product._id, (patch) =>
      patch.ifRevisionId(product._rev).set({
        initialStock: nextStock,
        ...(nextVariants ? { variants: nextVariants } : {}),
        available: nextStock > 0,
      }),
    );

    productLines.forEach((line) => {
      const branchBefore = seller.storeLocationId
        ? locationOnHand(findLocationBalance(product.inventory?.locationBalances, seller.storeLocationId), variantProduct ? line.variantId : undefined)
        : currentStock;
      movements.push({
        productId: product._id,
        productName: product.name || "Product",
        variantId: line.variantId,
        quantityChange: -line.quantity,
        stockBefore: branchBefore,
        stockAfter: Math.max(0, branchBefore - line.quantity),
        sourceStoreId: seller.storeLocationId,
        sourceLocation: seller.storeLocationName,
      });
    });
  }

  addInventoryMovementsToTransaction({
    transaction,
    movementKey: `sale|${orderNumber}`,
    movementType: "SALE",
    orderId,
    orderNumber,
    actor: seller,
    movements,
    note: seller.storeLocationName
      ? `Inventory deducted from ${seller.storeLocationName} after confirmed POS sale/payment.`
      : "Inventory deducted after confirmed POS sale/payment.",
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
  providerReceiptNumber,
  strictCreate,
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
  providerReceiptNumber?: string;
  strictCreate?: boolean;
}) {
  const record = {
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
    ...(providerReceiptNumber ? { providerReceiptNumber } : {}),
    status,
    amount,
    currency: CURRENCY,
    processedBy: { _type: "reference", _ref: seller.id },
    processedByName: seller.name,
    processedByRole: seller.role,
    createdAt: now,
    updatedAt: now,
    ...(status === "paid" || status === "partially_paid" ? { paidAt: now } : {}),
  };
  if (strictCreate) transaction.create(record);
  else transaction.createIfNotExists(record);
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

export async function createPosManualSale(input: PosSaleInput, seller: PosSeller) {
  const customer = customerDetails(input);
  const payerName = cleanText(input.manualPaymentName);
  const externalReference = cleanText(input.manualPaymentReference).toUpperCase();
  const requestedPayment = Number(input.manualAmountReceived);
  if (!payerName) throw new Error("Enter the name of the person who made the external payment.");
  if (externalReference.length < 5) throw new Error("Enter the M-PESA code or external payment reference.");
  if (!Number.isFinite(requestedPayment) || requestedPayment <= 0) throw new Error("Enter the amount received outside the system.");
  if (input.manualPaymentConfirmed !== true) {
    throw new Error("Confirm that the external payment was independently checked before recording it.");
  }

  const duplicateReference = await serverClient.fetch<{ _id: string } | null>(
    `*[
      (_type == "paymentTransaction" && providerReceiptNumber == $reference) ||
      (_type == "commerceOrder" && (providerReceiptNumber == $reference || manualPaymentReference == $reference))
    ][0]{_id}`,
    { reference: externalReference },
    { cache: "no-store" },
  );
  if (duplicateReference) throw new Error("That payment reference already exists in Decor by Kasiwa. Check Sales Operations before recording it again.");

  const reference = referenceFor(input.requestId);
  const existing = await fetchPosOrder(reference);
  if (existing && ["paid", "partially_paid"].includes(existing.paymentStatus || "")) return summary(existing);

  const { lines, products } = await buildLines(input.cart, seller);
  const subtotal = subtotalFor(lines);
  const discount = calculateDiscount(subtotal, input.discount, seller);
  const delivery = deliveryPayable(input);
  const calculatedTotal = Math.max(0, subtotal - discount.discountAmount + delivery.deliveryFee);
  const { total, received, amountPaid, balanceDue, overpaidAmount, paymentStatus } = manualPaymentBreakdown(calculatedTotal, requestedPayment);
  if (balanceDue > 0 && input.manualPartialPaymentConfirmed !== true) {
    throw new Error(`Confirm the partial payment: KES ${balanceDue.toFixed(2)} remains outstanding.`);
  }
  if (overpaidAmount > 0 && input.manualOverpaymentConfirmed !== true) {
    throw new Error(`Confirm the excess payment: KES ${overpaidAmount.toFixed(2)} must be reconciled or returned to the customer.`);
  }
  const workflow = await workflowForProducts(lines.map((line) => line.productId));
  const now = new Date().toISOString();
  const orderNumber = await createShortOrderNumber("POS", reference, new Date(now));
  const orderId = orderIdFor(reference);
  const receiptNumber = receiptNumberFor(orderNumber);
  const transaction = serverClient.transaction();

  addSaleInventoryMutations(transaction, products, lines, orderId, orderNumber, seller, now);

  transaction.create({
    _id: orderId,
    _type: "commerceOrder",
    orderNumber,
    customerName: customer.name,
    customerEmail: customer.email || undefined,
    customerPhone: customer.phone,
    deliveryLocation: delivery.deliveryLocation,
    ...(delivery.deliveryAddress ? { deliveryAddress: delivery.deliveryAddress } : {}),
    createdAt: now,
    updatedAt: now,
    paidAt: now,
    soldAt: now,
    status: workflow.currentFulfilmentStage ? "processing" : delivery.fulfilmentType === "IN_STORE" ? "delivered" : "paid",
    paymentStatus,
    subtotal,
    deliveryFee: delivery.deliveryFee,
    ...discount,
    total,
    amountPaid,
    balanceDue,
    overpaidAmount,
    manualPaymentName: payerName,
    manualPaymentReference: externalReference,
    manualAmountReceived: received,
    refundedAmount: 0,
    receiptNumber,
    currency: CURRENCY,
    salesChannel: "POS",
    fulfilmentType: delivery.fulfilmentType,
    fulfilmentStages: workflow.fulfilmentStages,
    ...(workflow.currentFulfilmentStage ? { currentFulfilmentStage: workflow.currentFulfilmentStage } : {}),
    paymentReference: reference,
    paymentProvider: "manual",
    paymentChannel: "external",
    soldBy: { _type: "reference", _ref: seller.id },
    soldByName: seller.name,
    soldByRole: seller.role,
    ...(seller.storeLocationId ? { storeLocation: { _type: "reference", _ref: seller.storeLocationId }, assignedStore: seller.storeLocationName || seller.storeLocationCode || "Store" } : {}),
    ...(discount.discountAmount > 0 ? {
      discountAuthorizedBy: { _type: "reference", _ref: seller.id },
      discountAuthorizedByName: seller.name,
    } : {}),
    lineItems: orderLineDocuments(lines),
  });

  addPaymentRecordToTransaction({
    transaction, reference, orderId, orderNumber, customerName: customer.name, customerPhone: customer.phone,
    provider: "manual", channel: "external", providerReceiptNumber: externalReference, status: paymentStatus, amount: received, seller, now,
  });
  addAuditToTransaction({
    transaction, key: `pos-sale|${reference}`, eventType: "POS_MANUAL_PAYMENT_RECORDED", entityId: orderId, entityLabel: orderNumber, seller,
    detail: `${overpaidAmount > 0 ? "Overpaid" : paymentStatus === "partially_paid" ? "Partially paid" : "Paid"} manual/external sale · payer ${payerName} · reference ${externalReference} · received KES ${received.toFixed(2)} · credited KES ${amountPaid.toFixed(2)} · expected KES ${total.toFixed(2)} · balance KES ${balanceDue.toFixed(2)} · excess KES ${overpaidAmount.toFixed(2)}`,
    now,
  });

  await transaction.commit();
  const created = await fetchPosOrder(reference);
  if (!created) throw new Error("POS manual payment sale completed but could not be reloaded.");
  await linkCustomerToCompletedSale(created, customer);
  return {
    ...summary(created),
    displayText: `Manual payment ${externalReference} recorded for reconciliation. The reference was checked for duplicates in Decor by Kasiwa but was not independently verified with Safaricom.`,
  };
}

async function createPendingPaystackOrder(input: PosSaleInput, seller: PosSeller, channel: "mobile_money" | "card") {
  const customer = customerDetails(input);
  const reference = referenceFor(input.requestId);
  const existing = await fetchPosOrder(reference);
  if (existing) return { existing, customer };

  const { lines } = await buildLines(input.cart, seller);
  const workflow = await workflowForProducts(lines.map((line) => line.productId));
  const subtotal = subtotalFor(lines);
  const discount = calculateDiscount(subtotal, input.discount, seller);
  const delivery = deliveryPayable(input);
  const productRevenue = Math.max(0, subtotal - discount.discountAmount);
  const total = productRevenue + delivery.deliveryFee;
  if (total <= 0) throw new Error("Paystack payment total must be greater than zero.");
  const now = new Date().toISOString();
  const orderNumber = await createShortOrderNumber("POS", reference, new Date(now));
  const orderId = orderIdFor(reference);
  const transaction = serverClient.transaction();

  transaction.create({
    _id: orderId,
    _type: "commerceOrder",
    orderNumber,
    customerName: customer.name,
    customerEmail: customer.email || undefined,
    customerPhone: customer.phone,
    deliveryLocation: delivery.deliveryLocation,
    ...(delivery.deliveryAddress ? { deliveryAddress: delivery.deliveryAddress } : {}),
    createdAt: now,
    updatedAt: now,
    soldAt: now,
    status: "pending",
    paymentStatus: "pending",
    subtotal,
    deliveryFee: delivery.deliveryFee,
    ...discount,
    total,
    amountPaid: 0,
    balanceDue: total,
    refundedAmount: 0,
    receiptNumber: receiptNumberFor(orderNumber),
    currency: CURRENCY,
    salesChannel: "POS",
    fulfilmentType: delivery.fulfilmentType,
    fulfilmentStages: workflow.fulfilmentStages,
    // Do not start fulfilment until the payment provider confirms payment.
    paymentReference: reference,
    paymentProvider: "paystack",
    paymentChannel: channel,
    cashReceived: false,
    soldBy: { _type: "reference", _ref: seller.id },
    soldByName: seller.name,
    soldByRole: seller.role,
    ...(seller.storeLocationId ? { storeLocation: { _type: "reference", _ref: seller.storeLocationId }, assignedStore: seller.storeLocationName || seller.storeLocationCode || "Store" } : {}),
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
    orderNumber,
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
    entityLabel: orderNumber,
    seller,
    detail: `Paystack ${channel === "mobile_money" ? "M-PESA" : "card"} payment initiated for KES ${total.toLocaleString("en-KE")} · product revenue KES ${productRevenue.toLocaleString("en-KE")} · delivery payable KES ${delivery.deliveryFee.toLocaleString("en-KE")}.`,
    now,
  });
  await transaction.commit();
  return { existing: await fetchPosOrder(reference), customer };
}

async function createPendingDarajaOrder(input: PosSaleInput, seller: PosSeller) {
  const customer = customerDetails(input);
  const reference = referenceFor(input.requestId);
  const existing = await fetchPosOrder(reference);
  if (existing) return { existing, customer };

  const { lines } = await buildLines(input.cart, seller);
  const workflow = await workflowForProducts(lines.map((line) => line.productId));
  const subtotal = subtotalFor(lines);
  const discount = calculateDiscount(subtotal, input.discount, seller);
  const delivery = deliveryPayable(input);
  const productRevenue = Math.max(0, subtotal - discount.discountAmount);
  const total = productRevenue + delivery.deliveryFee;
  if (total <= 0) throw new Error("M-PESA payment total must be greater than zero.");
  if (!Number.isInteger(total)) throw new Error("Direct M-PESA requires a whole-KES total. Adjust the sale or delivery amount so the final total has no cents.");

  const now = new Date().toISOString();
  const orderNumber = await createShortOrderNumber("POS", reference, new Date(now));
  const orderId = orderIdFor(reference);
  const transaction = serverClient.transaction();

  transaction.create({
    _id: orderId,
    _type: "commerceOrder",
    orderNumber,
    customerName: customer.name,
    customerEmail: customer.email || undefined,
    customerPhone: customer.phone,
    deliveryLocation: delivery.deliveryLocation,
    ...(delivery.deliveryAddress ? { deliveryAddress: delivery.deliveryAddress } : {}),
    createdAt: now,
    updatedAt: now,
    soldAt: now,
    status: "pending",
    paymentStatus: "pending",
    subtotal,
    deliveryFee: delivery.deliveryFee,
    ...discount,
    total,
    amountPaid: 0,
    balanceDue: total,
    refundedAmount: 0,
    receiptNumber: receiptNumberFor(orderNumber),
    currency: CURRENCY,
    salesChannel: "POS",
    fulfilmentType: delivery.fulfilmentType,
    fulfilmentStages: workflow.fulfilmentStages,
    // A pending/failed STK request must never enter the fulfilment queue.
    paymentReference: reference,
    paymentProvider: "daraja",
    paymentChannel: "mobile_money",
    cashReceived: false,
    soldBy: { _type: "reference", _ref: seller.id },
    soldByName: seller.name,
    soldByRole: seller.role,
    ...(seller.storeLocationId ? { storeLocation: { _type: "reference", _ref: seller.storeLocationId }, assignedStore: seller.storeLocationName || seller.storeLocationCode || "Store" } : {}),
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
    orderNumber,
    customerName: customer.name,
    customerPhone: customer.phone,
    provider: "daraja",
    channel: "mobile_money",
    status: "pending",
    amount: total,
    seller,
    now,
  });
  addAuditToTransaction({
    transaction,
    key: `pos-daraja-order|${reference}`,
    eventType: "POS_MPESA_PAYMENT_STARTED",
    entityId: orderId,
    entityLabel: orderNumber,
    seller,
    detail: `Direct Safaricom Daraja M-PESA payment prepared for KES ${total.toLocaleString("en-KE")} · product revenue KES ${productRevenue.toLocaleString("en-KE")} · delivery payable KES ${delivery.deliveryFee.toLocaleString("en-KE")}.`,
    now,
  });

  await transaction.commit();
  return { existing: await fetchPosOrder(reference), customer };
}

export async function createPosMpesaSale(input: PosSaleInput, seller: PosSeller) {
  const { existing: order, customer } = await createPendingDarajaOrder(input, seller);
  if (!order) throw new Error("POS M-PESA order could not be created.");
  if (order.paymentStatus === "paid") return { ...summary(order), displayText: "Payment already completed." };

  const reference = order.paymentReference || order.orderNumber;
  const existingCheckoutRequestId = order.mpesaCheckoutRequestId || await fetchDarajaCheckoutRequestId(reference);
  if (existingCheckoutRequestId) {
    return {
      ...summary(order),
      displayText: "An M-PESA prompt has already been sent for this sale. Ask the customer to complete it on their phone.",
      testMode: (process.env.MPESA_ENV || "production").toLowerCase() === "sandbox",
    };
  }

  let stk: Awaited<ReturnType<typeof initiateDarajaStkPush>>;
  try {
    // Only failure before Safaricom accepts the STK request is safe to mark as
    // a failed sale. Once Safaricom returns CheckoutRequestID, money may still
    // be collected even if a later local write temporarily fails.
    stk = await initiateDarajaStkPush({
      phone: customer.phone,
      amount: Number(order.total || 0),
      accountReference: darajaAccountReference(reference),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "M-PESA STK initiation failed.";
    await Promise.allSettled([
      serverClient.patch(order._id).set({ paymentStatus: "failed", status: "cancelled", failureReason: reason, mpesaResultDescription: reason, updatedAt: new Date().toISOString() }).unset(["currentFulfilmentStage", "assignedFulfilmentStaff", "assignedFulfilmentStaffName"]).commit(),
      serverClient.patch(paymentTransactionId(reference)).set({ status: "failed", failureReason: reason, updatedAt: new Date().toISOString() }).commit(),
    ]);
    throw cause;
  }

  const now = new Date().toISOString();
  const [orderPersisted, paymentPersisted] = await Promise.allSettled([
    settleWithRetry(() => serverClient.patch(order._id).set({
      paymentStatus: "pending",
      status: "pending",
      failureReason: "",
      mpesaMerchantRequestId: stk.merchantRequestId,
      mpesaCheckoutRequestId: stk.checkoutRequestId,
      mpesaResultDescription: stk.customerMessage,
      updatedAt: now,
    }).commit()),
    settleWithRetry(() => serverClient.patch(paymentTransactionId(reference)).set({
      provider: "daraja",
      channel: "mobile_money",
      status: "pending",
      failureReason: "",
      providerTransactionId: stk.checkoutRequestId,
      updatedAt: now,
    }).commit()),
  ]);

  const persistenceFailed = orderPersisted.status === "rejected" || paymentPersisted.status === "rejected";
  if (persistenceFailed) {
    console.error("[POS M-PESA] STK accepted but local persistence needs reconciliation", {
      reference,
      orderId: order._id,
      checkoutRequestId: stk.checkoutRequestId,
      merchantRequestId: stk.merchantRequestId,
      orderPersisted: orderPersisted.status,
      paymentPersisted: paymentPersisted.status,
      orderError: orderPersisted.status === "rejected" ? String(orderPersisted.reason) : undefined,
      paymentError: paymentPersisted.status === "rejected" ? String(paymentPersisted.reason) : undefined,
    });
  }

  // Audit is intentionally best-effort. A logging failure must never turn an
  // accepted STK request into a failed sale.
  await Promise.allSettled([
    recordAuditEvent({
      key: `pos-daraja-stk|${reference}`,
      eventType: "POS_MPESA_STK_SENT",
      entityType: "commerceOrder",
      entityId: order._id,
      entityLabel: order.orderNumber,
      actor: seller,
      detail: `Safaricom STK Push sent to ${customer.phone} · checkout ${stk.checkoutRequestId}.`,
      createdAt: now,
    }),
    ...(persistenceFailed ? [recordAuditEvent({
      key: `pos-daraja-reconcile|${reference}|${stk.checkoutRequestId}`,
      eventType: "POS_MPESA_RECONCILIATION_REQUIRED",
      entityType: "commerceOrder",
      entityId: order._id,
      entityLabel: order.orderNumber,
      actor: seller,
      detail: `Safaricom accepted checkout ${stk.checkoutRequestId}, but one or more local persistence writes failed. Do not collect a second payment; verify this reference from Reconciliation.`,
      createdAt: now,
    })] : []),
  ]);

  const updated = await fetchPosOrder(reference);
  return {
    ...summary(updated || order),
    displayText: persistenceFailed
      ? "M-PESA prompt sent. Payment is pending reconciliation. Do not initiate a second payment for this sale."
      : stk.customerMessage || "Ask the customer to enter their M-PESA PIN on the Safaricom prompt.",
    testMode: stk.environment === "sandbox",
    reconciliationRequired: persistenceFailed,
  };
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
      serverClient.patch(order._id).set({ paymentStatus: "failed", status: "cancelled", failureReason: reason, updatedAt: new Date().toISOString() }).unset(["currentFulfilmentStage", "assignedFulfilmentStaff", "assignedFulfilmentStaffName"]).commit(),
      serverClient.patch(paymentTransactionId(order.paymentReference || order.orderNumber)).set({ status: "failed", failureReason: reason, updatedAt: new Date().toISOString() }).commit(),
    ]);
    throw cause;
  }
}

async function failPosPayment(order: PosOrder, reason: string) {
  const now = new Date().toISOString();
  await Promise.all([
    serverClient.patch(order._id).ifRevisionId(order._rev).set({ paymentStatus: "failed", status: "cancelled", failureReason: reason, updatedAt: now }).unset(["currentFulfilmentStage", "assignedFulfilmentStaff", "assignedFulfilmentStaffName"]).commit(),
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
  const storedSeller = await serverClient.fetch<{ id?: string; role?: ApiStaffRole; email?: string; storeLocationId?: string; storeLocationName?: string; storeLocationCode?: string } | null>(
    `*[_id == $id][0]{"id": soldBy._ref, "role": soldByRole, "email": soldBy->email, "storeLocationId": coalesce(storeLocation._ref, soldBy->assignedStore._ref), "storeLocationName": coalesce(storeLocation->name, assignedStore, soldBy->assignedStore->name), "storeLocationCode": coalesce(storeLocation->code, soldBy->assignedStore->code)}`,
    { id: order._id },
    { cache: "no-store" },
  );
  seller.id = storedSeller?.id || "";
  seller.role = storedSeller?.role || "STORE_STAFF";
  seller.email = storedSeller?.email || "";
  seller.storeLocationId = storedSeller?.storeLocationId || order.storeLocationId;
  seller.storeLocationName = storedSeller?.storeLocationName || order.storeLocationName;
  seller.storeLocationCode = storedSeller?.storeLocationCode;

  const firstFulfilmentStage = order.fulfilmentStages?.[0];
  addSaleInventoryMutations(transaction, products, order.lineItems || [], order._id, order.orderNumber, seller, now);
  transaction.patch(order._id, (patch) =>
    patch.ifRevisionId(order._rev).set({
      paymentStatus: "paid",
      status: firstFulfilmentStage ? "processing" : Number(order.deliveryFee || 0) > 0 ? "processing" : "delivered",
      ...(firstFulfilmentStage ? { currentFulfilmentStage: firstFulfilmentStage } : {}),
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
    paymentMethod: "mpesa",
    customerId: finalized.customerId,
    customerName: finalized.customerName,
    customerEmail: finalized.customerEmail,
    customerPhone: finalized.customerPhone,
  });
  await linkCustomerToCompletedSale(finalized, customer);
  return finalized;
}


async function sellerForPosOrder(order: PosOrder): Promise<PosSeller> {
  const storedSeller = await serverClient.fetch<{ id?: string; role?: ApiStaffRole; email?: string; storeLocationId?: string; storeLocationName?: string; storeLocationCode?: string } | null>(
    `*[_id == $id][0]{"id": soldBy._ref, "role": soldByRole, "email": soldBy->email, "storeLocationId": coalesce(storeLocation._ref, soldBy->assignedStore._ref), "storeLocationName": coalesce(storeLocation->name, assignedStore, soldBy->assignedStore->name), "storeLocationCode": coalesce(storeLocation->code, soldBy->assignedStore->code)}`,
    { id: order._id },
    { cache: "no-store" },
  );
  return {
    id: storedSeller?.id || "",
    name: order.soldByName || "POS Staff",
    email: storedSeller?.email || "",
    role: storedSeller?.role || "STORE_STAFF",
    storeLocationId: storedSeller?.storeLocationId || order.storeLocationId,
    storeLocationName: storedSeller?.storeLocationName || order.storeLocationName,
    storeLocationCode: storedSeller?.storeLocationCode,
  };
}

async function reconcilePaidPosInventory(order: PosOrder, now = new Date().toISOString()) {
  const reference = order.paymentReference || order.orderNumber;
  const seller = await sellerForPosOrder(order);
  const ids = [...new Set((order.lineItems || []).map((line) => line.productId))];

  try {
    const products = await fetchProducts(ids);
    const firstFulfilmentStage = order.fulfilmentStages?.[0];
    const transaction = serverClient.transaction();

    addSaleInventoryMutations(transaction, products, order.lineItems || [], order._id, order.orderNumber, seller, now);
    transaction.patch(order._id, (patch) => {
      let next = patch.set({
        status: firstFulfilmentStage ? "processing" : Number(order.deliveryFee || 0) > 0 ? "processing" : "delivered",
        ...(firstFulfilmentStage ? { currentFulfilmentStage: firstFulfilmentStage } : {}),
        inventoryReviewRequired: false,
        inventoryReconciliationReason: "",
        inventoryReconciledAt: now,
        updatedAt: now,
      });
      next = next.unset(["inventoryReviewRaisedAt"]);
      return next;
    });
    addAuditToTransaction({
      transaction,
      key: `pos-inventory-reconciled|${reference}`,
      eventType: "POS_INVENTORY_RECONCILED",
      entityId: order._id,
      entityLabel: order.orderNumber,
      seller,
      detail: "Inventory successfully reconciled after confirmed POS payment.",
      now,
    });
    await transaction.commit();

    return {
      order: (await fetchPosOrder(reference)) || order,
      reconciled: true,
      message: "Inventory reconciled successfully.",
    };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "Inventory could not be reconciled after confirmed payment.";
    const reviewNote = `Payment is confirmed and must remain paid. Inventory requires review: ${reason}`;

    await Promise.allSettled([
      serverClient.patch(order._id).set({
        paymentStatus: "paid",
        status: "paid",
        amountPaid: Number(order.total || 0),
        balanceDue: 0,
        inventoryReviewRequired: true,
        inventoryReconciliationReason: reason,
        inventoryReviewRaisedAt: now,
        updatedAt: now,
      }).unset(["currentFulfilmentStage", "assignedFulfilmentStaff", "assignedFulfilmentStaffName"]).commit(),
      recordAuditEvent({
        key: `pos-inventory-review|${reference}`,
        eventType: "POS_INVENTORY_RECONCILIATION_REQUIRED",
        entityType: "commerceOrder",
        entityId: order._id,
        entityLabel: order.orderNumber,
        actor: seller,
        detail: reviewNote,
        createdAt: now,
      }),
    ]);

    return {
      order: (await fetchPosOrder(reference)) || { ...order, paymentStatus: "paid", status: "paid", amountPaid: Number(order.total || 0), balanceDue: 0, inventoryReviewRequired: true, inventoryReconciliationReason: reason, inventoryReviewRaisedAt: now },
      reconciled: false,
      message: reason,
    };
  }
}

async function finalizeDarajaPosPayment(order: PosOrder, payment: {
  checkoutRequestId: string;
  merchantRequestId?: string;
  receiptNumber?: string;
  amount?: number;
  phone?: string;
  paidAt?: string;
  resultCode?: number;
  resultDescription?: string;
}) {
  const reference = order.paymentReference || order.orderNumber;
  const now = new Date().toISOString();

  if (order.paymentStatus === "paid") {
    const orderPatch: Record<string, unknown> = {
      mpesaResultCode: payment.resultCode ?? 0,
      mpesaResultDescription: payment.resultDescription || "M-PESA payment confirmed.",
      updatedAt: now,
    };
    if (payment.receiptNumber) {
      orderPatch.providerReceiptNumber = payment.receiptNumber;
      orderPatch.failureReason = "";
    }
    if (payment.merchantRequestId) orderPatch.mpesaMerchantRequestId = payment.merchantRequestId;
    if (payment.checkoutRequestId) orderPatch.mpesaCheckoutRequestId = payment.checkoutRequestId;

    await Promise.allSettled([
      serverClient.patch(order._id).set(orderPatch).commit(),
      serverClient.patch(paymentTransactionId(reference)).set({
        ...(payment.receiptNumber ? { providerReceiptNumber: payment.receiptNumber } : {}),
        providerTransactionId: payment.checkoutRequestId,
        updatedAt: now,
      }).commit(),
    ]);
    return (await fetchPosOrder(reference)) || order;
  }

  const expectedAmount = Number(order.total || 0);
  const expectedPhone = String(order.customerPhone || "").replace(/\D/g, "").replace(/^0/, "254").replace(/^7/, "2547").replace(/^1/, "2541");
  if (payment.phone && expectedPhone && payment.phone !== expectedPhone) {
    const note = `M-PESA callback phone ${payment.phone} did not match the phone used for this sale. Requires reconciliation.`;
    await Promise.allSettled([
      serverClient.patch(order._id).set({ failureReason: note, mpesaResultDescription: note, updatedAt: now }).commit(),
      serverClient.patch(paymentTransactionId(reference)).set({ status: "timed_out", failureReason: note, updatedAt: now }).commit(),
    ]);
    throw new Error(note);
  }

  if (typeof payment.amount === "number" && Math.abs(payment.amount - expectedAmount) > 0.001) {
    const note = `M-PESA callback amount KES ${payment.amount.toLocaleString("en-KE")} did not match expected KES ${expectedAmount.toLocaleString("en-KE")}. Requires reconciliation.`;
    await Promise.allSettled([
      serverClient.patch(order._id).set({ failureReason: note, mpesaResultDescription: note, updatedAt: now }).commit(),
      serverClient.patch(paymentTransactionId(reference)).set({ status: "timed_out", failureReason: note, updatedAt: now }).commit(),
    ]);
    throw new Error(note);
  }

  const seller = await sellerForPosOrder(order);
  const paidAt = payment.paidAt || now;
  const financialTransaction = serverClient.transaction();

  // Financial truth is persisted before inventory. Safaricom-confirmed money
  // must never be reverted to failed/pending because stock changed afterwards.
  financialTransaction.patch(order._id, (patch) =>
    patch.ifRevisionId(order._rev).set({
      paymentStatus: "paid",
      status: "paid",
      paymentProvider: "daraja",
      paymentChannel: "mobile_money",
      mpesaMerchantRequestId: payment.merchantRequestId || order.mpesaMerchantRequestId || "",
      mpesaCheckoutRequestId: payment.checkoutRequestId,
      mpesaResultCode: payment.resultCode ?? 0,
      mpesaResultDescription: payment.resultDescription || "M-PESA payment confirmed.",
      ...(payment.receiptNumber ? { providerReceiptNumber: payment.receiptNumber } : {}),
      amountPaid: expectedAmount,
      balanceDue: 0,
      paidAt,
      inventoryReviewRequired: false,
      inventoryReconciliationReason: "",
      updatedAt: now,
      failureReason: payment.receiptNumber ? "" : "Payment confirmed by Daraja status query; awaiting M-PESA receipt callback.",
    }).unset(["currentFulfilmentStage", "assignedFulfilmentStaff", "assignedFulfilmentStaffName"]),
  );
  financialTransaction.patch(paymentTransactionId(reference), (patch) => patch.set({
    provider: "daraja",
    channel: "mobile_money",
    status: "paid",
    providerTransactionId: payment.checkoutRequestId,
    ...(payment.receiptNumber ? { providerReceiptNumber: payment.receiptNumber } : {}),
    paidAt,
    updatedAt: now,
    failureReason: "",
  }));
  addAuditToTransaction({
    transaction: financialTransaction,
    key: `pos-daraja-paid|${reference}`,
    eventType: "POS_MPESA_PAYMENT_CONFIRMED",
    entityId: order._id,
    entityLabel: order.orderNumber,
    seller,
    detail: `Direct Safaricom M-PESA payment confirmed${payment.receiptNumber ? ` · receipt ${payment.receiptNumber}` : " via status query"} · checkout ${payment.checkoutRequestId}.`,
    now,
  });

  try {
    await financialTransaction.commit();
  } catch (cause) {
    const concurrent = await fetchPosOrder(reference);
    if (concurrent?.paymentStatus === "paid") return concurrent;
    throw cause;
  }

  const financiallyPaid = await fetchPosOrder(reference);
  if (!financiallyPaid || financiallyPaid.paymentStatus !== "paid") {
    throw new Error("M-PESA payment was confirmed but the paid financial state could not be reloaded.");
  }

  // Inventory is a separate concern. A stock discrepancy is flagged for review
  // but can no longer erase or hide confirmed money.
  const inventory = await reconcilePaidPosInventory(financiallyPaid, now);
  const finalized = inventory.order;
  const customer = customerDetails({
    requestId: reference.replace(/^DBK-POS-/, ""),
    cart: [],
    paymentMethod: "mpesa",
    customerId: finalized.customerId,
    customerName: finalized.customerName,
    customerEmail: finalized.customerEmail,
    customerPhone: finalized.customerPhone,
  });
  await linkCustomerToCompletedSale(finalized, customer);
  return finalized;
}

async function failDarajaPayment(order: PosOrder, resultCode: number, resultDescription: string) {
  if (order.paymentStatus === "paid") return order;
  const now = new Date().toISOString();
  const reference = order.paymentReference || order.orderNumber;
  try {
    await Promise.all([
      serverClient.patch(order._id).ifRevisionId(order._rev).set({
        paymentStatus: "failed",
        status: "cancelled",
        mpesaResultCode: resultCode,
        mpesaResultDescription: resultDescription,
        failureReason: resultDescription,
        updatedAt: now,
      }).unset(["currentFulfilmentStage", "assignedFulfilmentStaff", "assignedFulfilmentStaffName"]).commit(),
      serverClient.patch(paymentTransactionId(reference)).set({
        status: "failed",
        failureReason: resultDescription,
        updatedAt: now,
      }).commit(),
    ]);
  } catch (cause) {
    // Manual reconciliation can be clicked twice or overlap with a provider
    // callback. Treat an already-persisted equivalent result as idempotent
    // instead of incorrectly reporting a revision conflict as "pending".
    const concurrent = await fetchPosOrder(reference);
    if (concurrent?.paymentStatus === "paid") return concurrent;
    if (concurrent?.paymentStatus === "failed" && concurrent.mpesaResultCode === resultCode) return concurrent;
    throw cause;
  }
  return (await fetchPosOrder(reference)) || order;
}

export async function handleDarajaStkCallback(payload: DarajaStkCallbackPayload) {
  const callback = callbackMetadata(payload);
  if (!callback.checkoutRequestId) {
    throw new Error("Daraja callback did not include CheckoutRequestID.");
  }

  const order = await fetchPosOrderByCheckoutRequestId(callback.checkoutRequestId);
  if (!order) {
    console.warn("[Daraja callback] no POS order matched checkout request", callback.checkoutRequestId);
    return { matched: false };
  }

  if (callback.resultCode !== 0) {
    await failDarajaPayment(order, callback.resultCode, callback.resultDescription || `M-PESA ResultCode ${callback.resultCode}`);
    return { matched: true, state: "failed" as const };
  }

  const finalized = await finalizeDarajaPosPayment(order, {
    checkoutRequestId: callback.checkoutRequestId,
    merchantRequestId: callback.merchantRequestId,
    receiptNumber: callback.receiptNumber,
    amount: callback.amount,
    phone: callback.phone,
    paidAt: darajaTransactionDate(callback.transactionDate),
    resultCode: callback.resultCode,
    resultDescription: callback.resultDescription || "M-PESA payment confirmed.",
  });
  return { matched: true, state: "paid" as const, order: summary(finalized) };
}

export class PosPaymentAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosPaymentAccessError";
  }
}

export async function verifyPosPayment(reference: string, options: {
  forceProviderQuery?: boolean;
  allowedStoreLocationId?: string;
  failedTransactionOnly?: boolean;
  allowInventoryRetry?: boolean;
} = {}) {
  if (!/^DBK-POS-[A-Za-z0-9-]+$/.test(reference)) throw new Error("Invalid POS payment reference.");
  const order = await fetchPosOrder(reference);
  if (!order) throw new Error("POS order not found.");
  // Manager and Sales Staff may never inspect or reconcile another store's POS payment.
  if (options.allowedStoreLocationId && order.storeLocationId !== options.allowedStoreLocationId) {
    throw new PosPaymentAccessError("This payment does not belong to your assigned store.");
  }
  if (options.failedTransactionOnly) {
    // Sales Staff can query Safaricom again only for a failed/timed-out Daraja attempt.
    // Check the recorded payment transaction server-side; never trust client UI status.
    if (order.paymentProvider !== "daraja") {
      throw new PosPaymentAccessError("Only failed M-PESA transactions can be verified by Sales Staff.");
    }
    const transaction = await serverClient.fetch<{ status?: string } | null>(
      `*[_type == "paymentTransaction" && _id == $id][0]{status}`,
      { id: paymentTransactionId(reference) },
      { cache: "no-store" },
    );
    if (!transaction || !["failed", "timed_out"].includes(transaction.status || "")) {
      throw new PosPaymentAccessError("Sales Staff may only verify failed or timed-out transactions.");
    }
  }
  if (order.paymentStatus === "paid") {
    if (order.inventoryReviewRequired && options.allowInventoryRetry === false) {
      return {
        state: "paid" as const,
        order: summary(order),
        inventoryReviewRequired: true,
        inventoryMessage: order.inventoryReconciliationReason || "Inventory review required.",
        message: "Payment is already confirmed. Inventory reconciliation requires a manager.",
      };
    }
    if (order.inventoryReviewRequired) {
      const inventory = await reconcilePaidPosInventory(order);
      return {
        state: "paid" as const,
        order: summary(inventory.order),
        inventoryReviewRequired: !inventory.reconciled,
        inventoryMessage: inventory.message,
        message: inventory.reconciled
          ? "Payment was already confirmed. Inventory reconciliation has now completed successfully."
          : `Payment is confirmed and remains paid. Inventory still requires review: ${inventory.message}`,
      };
    }
    return { state: "paid" as const, order: summary(order), message: "Payment already completed." };
  }

  if (order.paymentProvider === "daraja") {
    const checkoutRequestId = order.mpesaCheckoutRequestId || await fetchDarajaCheckoutRequestId(reference);
    const explicitProviderFailure = typeof order.mpesaResultCode === "number" && order.mpesaResultCode !== 0;

    // Normal POS polling can trust a final provider failure already recorded by
    // the callback. Manual reconciliation can force a fresh Safaricom lookup so
    // historical orders that were locally marked failed can be checked again.
    if (order.paymentStatus === "failed" && explicitProviderFailure && !options.forceProviderQuery) {
      return { state: "failed" as const, order: summary(order), message: order.mpesaResultDescription || "Payment failed." };
    }
    if (!checkoutRequestId) {
      if (order.paymentStatus === "failed") {
        return { state: "failed" as const, order: summary(order), message: order.mpesaResultDescription || "Payment failed before Safaricom accepted the STK request." };
      }
      return { state: "pending" as const, order: summary(order), message: "Waiting for Safaricom to accept the M-PESA request." };
    }

    try {
      const status = await queryDarajaStkStatus(checkoutRequestId);
      const resultCode = Number(status.ResultCode);
      const providerResultDescription = status.ResultDesc || status.ResponseDescription || status.CustomerMessage || "";

      console.info("[POS M-PESA reconciliation] Safaricom status query", {
        reference,
        checkoutRequestId,
        responseCode: status.ResponseCode || null,
        resultCode: Number.isFinite(resultCode) ? resultCode : null,
        resultDescription: providerResultDescription || null,
      });

      if (Number.isFinite(resultCode)) {
        if (resultCode === 0) {
          const finalized = await finalizeDarajaPosPayment(order, {
            checkoutRequestId,
            merchantRequestId: status.MerchantRequestID || order.mpesaMerchantRequestId,
            resultCode,
            resultDescription: status.ResultDesc || "M-PESA payment confirmed by Daraja status query.",
          });
          const persisted = await fetchPosOrder(reference);
          if (!persisted || persisted.paymentStatus !== "paid") {
            throw new Error("Safaricom confirmed payment, but the reconciled paid state could not be verified locally.");
          }
          return {
            state: "paid" as const,
            order: summary(persisted),
            checkoutRequestId,
            providerResponseCode: status.ResponseCode || "",
            providerResultCode: resultCode,
            providerResultDescription,
            inventoryReviewRequired: Boolean(persisted.inventoryReviewRequired),
            inventoryMessage: persisted.inventoryReconciliationReason || "",
            message: persisted.inventoryReviewRequired
              ? `Safaricom confirmed this M-PESA payment and the order is now paid. Inventory requires review: ${persisted.inventoryReconciliationReason || "stock could not be reconciled."}`
              : persisted.providerReceiptNumber
                ? `Safaricom confirmed this M-PESA payment · receipt ${persisted.providerReceiptNumber}.`
                : "Safaricom confirmed this M-PESA payment. The order has been reconciled as paid; the final M-PESA receipt code may still be unavailable for an older transaction.",
          };
        }

        const failed = await failDarajaPayment(order, resultCode, status.ResultDesc || `M-PESA ResultCode ${resultCode}`);
        return {
          state: "failed" as const,
          order: summary(failed),
          checkoutRequestId,
          providerResponseCode: status.ResponseCode || "",
          providerResultCode: resultCode,
          providerResultDescription,
          message: options.forceProviderQuery
            ? `Safaricom says this specific STK request was not paid (ResultCode ${resultCode})${providerResultDescription ? `: ${providerResultDescription}` : "."}`
            : status.ResultDesc || "M-PESA payment failed.",
        };
      }

      return {
        state: "pending" as const,
        order: summary(order),
        checkoutRequestId,
        providerResponseCode: status.ResponseCode || "",
        providerResultDescription,
        message: `Safaricom accepted the status query${status.ResponseCode ? ` (ResponseCode ${status.ResponseCode})` : ""}, but did not return a final payment ResultCode. This is not confirmation that the customer paid.`,
      };
    } catch (cause) {
      const queryError = cause instanceof Error ? cause.message : String(cause);
      console.warn("[Daraja status] pending/query error", {
        reference,
        checkoutRequestId,
        message: queryError,
      });
      return {
        state: "pending" as const,
        order: summary(order),
        checkoutRequestId,
        message: `Safaricom could not provide a conclusive payment result: ${queryError}`,
      };
    }
  }

  if (order.paymentStatus === "failed") return { state: "failed" as const, order: summary(order), message: order.mpesaResultDescription || "Payment failed." };

  // Backward compatibility for any older POS payments that were started through Paystack.
  if (order.paymentChannel === "mobile_money") {
    const charge = await paystackRequest<PaystackChargeStatusResponse>(`/charge/${encodeURIComponent(reference)}`, { method: "GET" });
    if (!charge.status || !charge.data) throw new Error(charge.message || "Unable to check the legacy M-PESA charge.");
    const status = cleanText(charge.data.status).toLowerCase();
    if (["failed", "abandoned", "reversed"].includes(status)) {
      const reason = cleanText(charge.data.gateway_response) || cleanText(charge.data.message) || `Paystack status: ${status}`;
      await failPosPayment(order, reason);
      return { state: "failed" as const, order: summary(order), message: reason };
    }
    if (status !== "success") {
      return { state: "pending" as const, order: summary(order), message: cleanText(charge.data.message) || "Waiting for the legacy M-PESA payment." };
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

// Backward-compatible alias used by existing POS payment integrations.
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
  const result = await serverClient.fetch<{
    receipt: {
      _id: string;
      orderNumber: string;
      receiptNumber?: string;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      subtotal?: number;
      discountAmount?: number;
      discountType?: "percent" | "fixed";
      discountValue?: number;
      discountReason?: string;
      discountAuthorizedByName?: string;
      deliveryFee?: number;
      deliveryLocation?: string;
      deliveryAddress?: {
        fullName?: string;
        phone?: string;
        address1?: string;
        address2?: string;
        city?: string;
        region?: string;
        country?: string;
      };
      fulfilmentType?: "DELIVERY" | "IN_STORE";
      total?: number;
      amountPaid?: number;
      balanceDue?: number;
      overpaidAmount?: number;
      cashTendered?: number;
      cashChangeDue?: number;
      refundedAmount?: number;
      paymentStatus?: string;
      paymentProvider?: string;
      paymentChannel?: string;
      paymentReference?: string;
      providerReceiptNumber?: string;
      mpesaMerchantRequestId?: string;
      mpesaCheckoutRequestId?: string;
      mpesaResultCode?: number;
      mpesaResultDescription?: string;
      manualPaymentName?: string;
      manualPaymentReference?: string;
      soldByName?: string;
      soldByRole?: string;
      soldAt?: string;
      lineItems?: PosLine[];
    } | null;
    settings: {
      brandName?: string;
      email?: string;
      phone?: string;
    } | null;
  }>(
    `{
      "receipt": *[_type == "commerceOrder" && _id == $orderId][0]{
        _id,orderNumber,receiptNumber,customerName,customerPhone,customerEmail,subtotal,discountType,discountValue,discountAmount,discountReason,discountAuthorizedByName,
        deliveryFee,deliveryLocation,deliveryAddress,fulfilmentType,total,amountPaid,balanceDue,overpaidAmount,cashTendered,cashChangeDue,
        refundedAmount,paymentStatus,paymentProvider,paymentChannel,paymentReference,providerReceiptNumber,
        mpesaMerchantRequestId,mpesaCheckoutRequestId,mpesaResultCode,mpesaResultDescription,
        manualPaymentName,manualPaymentReference,soldByName,soldByRole,soldAt,
        "lineItems": lineItems[]{_key,"productId":coalesce(product._ref,productId),name,category,finish,size,variantId,quantity,unitPrice,unitCost}
      },
      "settings": *[_type == "siteSettings"][0]{brandName,email,phone}
    }`,
    { orderId },
    { cache: "no-store" },
  );

  if (!result.receipt) return null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://decorbykasiwa.co.ke";
  return {
    ...result.receipt,
    businessName: result.settings?.brandName?.trim() || "Decor by Kasiwa",
    businessEmail: result.settings?.email?.trim() || process.env.EMAIL_REPLY_TO?.trim() || "",
    businessPhone: result.settings?.phone?.trim() || "",
    businessWebsite: siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
  };
}

export async function recordOutstandingCashPayment({ orderId, amount, seller, legacyBridge }: {
  orderId: string; amount: number; seller: PosSeller;
  legacyBridge?: { reference: string; requestId: string };
}) {
  const order = await serverClient.fetch<(PosOrder & { salesChannel?: "ONLINE" | "POS"; assignedStore?: string }) | null>(
    `*[_type == "commerceOrder" && _id == $orderId][0]{_id,_rev,orderNumber,paymentStatus,status,total,amountPaid,balanceDue,receiptNumber,paymentReference,paymentChannel,customerName,customerEmail,customerPhone,"customerId":customer._ref,soldByName,soldAt,salesChannel,assignedStore,"storeLocationId":storeLocation._ref}`,
    { orderId },
    { cache: "no-store" },
  );
  if (!order) throw new Error("Order not found.");
  // A stable reference is globally unique: concurrent retries cannot collect twice.
  // Replays are acknowledged only if the exact order + amount + external receipt agree.
  const bridgePaymentRef = legacyBridge ? `DBK77-LEGACY-${legacyBridge.reference}` : undefined;
  if (bridgePaymentRef) {
    const previous = await serverClient.fetch<{orderId?:string;amount?:number;providerReceiptNumber?:string}|null>(
      `*[_id==$id][0]{"orderId":order._ref,amount,providerReceiptNumber}`,
      {id:paymentTransactionId(bridgePaymentRef)},{cache:'no-store'});
    if (previous) {
      if (previous.orderId!==orderId || previous.amount!==amount ||
          previous.providerReceiptNumber!==legacyBridge!.reference) {
        throw new Error('Historical payment reference was already used for a different payment');
      }
      return summary(order);
    }
  }
  if (seller.role === "MANAGER") {
    const main = await getMainStore();
    const effectiveStoreId = order.storeLocationId ||
      ((order.salesChannel === "ONLINE" || !order.salesChannel) && isLegacyStoreName(order.assignedStore) ? main?.id : undefined);
    if (!effectiveStoreId || effectiveStoreId !== seller.storeLocationId) {
      throw new Error("Managers may record payments only for their assigned store.");
    }
  }
  const balance = Number(order.balanceDue || 0);
  if (balance <= 0) throw new Error("This order has no outstanding balance.");
  const payment = Number(amount);
  if (!Number.isFinite(payment) || payment <= 0 || payment > balance) throw new Error("Enter a payment amount up to the outstanding balance.");

  const nextPaid = Number(order.amountPaid || 0) + payment;
  const nextBalance = Math.max(0, Number(order.total || 0) - nextPaid);
  const nextStatus = nextBalance > 0 ? "partially_paid" : "paid";
  const now = new Date().toISOString();
  const reference = bridgePaymentRef || `${order.orderNumber}-PAY-${Date.now()}`;
  const transaction = serverClient.transaction();
  transaction.patch(order._id, (patch) => patch.ifRevisionId(order._rev).set({
    amountPaid: nextPaid,
    balanceDue: nextBalance,
    paymentStatus: nextStatus,
    ...(nextBalance <= 0 ? { paidAt: now } : {}),
    updatedAt: now,
  }));
  if (legacyBridge && order.customerId) {
    // Historic bridge does not risk an acknowledged payment with a separately
    // failed customer-balance patch: both changes commit or both roll back.
    const customer = await serverClient.fetch<{_rev:string;outstandingBalance?:number}|null>(
      `*[_id==$id][0]{_rev,outstandingBalance}`,{id:order.customerId},{cache:'no-store'});
    if (!customer?._rev) throw new Error('Customer balance missing: reconcile before collecting historic debt');
    const previous = Number(customer.outstandingBalance || 0);
    if (!Number.isFinite(previous) || previous < 0)
      throw new Error('Invalid customer outstanding balance');
    transaction.patch(order.customerId, patch => patch.ifRevisionId(customer._rev).set({
      outstandingBalance:Math.max(0,previous-payment),updatedAt:now
    }));
  }
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
    providerReceiptNumber:legacyBridge?.reference,
    strictCreate:Boolean(legacyBridge),
  });
  addAuditToTransaction({ transaction, key: `receivable-payment|${reference}`, eventType: "RECEIVABLE_PAYMENT_RECORDED", entityId: order._id, entityLabel: order.orderNumber, seller, detail: `Cash balance payment KES ${payment.toLocaleString("en-KE")} recorded. Remaining KES ${nextBalance.toLocaleString("en-KE")}.`, now });
  await transaction.commit();

  if (order.customerId && !legacyBridge) {
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


/**
 * DBK-58: read-only development preview of the exact manual POS calculation.
 * This is NOT a sale. No Sanity/Neon writes, receipt creation or payment proof.
 * It deliberately shares the existing product, variant, store, pricing, discount
 * and delivery validation used by createPosManualSale(). It is not called from
 * production POS or checkout.
 */
export async function previewDBK58ManualPosSale(input: PosSaleInput, seller: PosSeller) {
  if (process.env.NODE_ENV !== "development" || process.env.DBK58_LOCAL_PREVIEW !== "YES") {
    throw new Error("DBK-58 preview is disabled.");
  }
  if (!input || input.paymentMethod !== "manual") {
    throw new Error("DBK-58 preview accepts manual POS only.");
  }
  const reference = referenceFor(input.requestId); // validates request ID
  customerDetails(input); // use the same customer validation, but persist no PII
  const payerName = cleanText(input.manualPaymentName);
  const externalReference = cleanText(input.manualPaymentReference).toUpperCase();
  const requestedPayment = Number(input.manualAmountReceived);
  if (!payerName || input.manualPaymentConfirmed !== true ||
      !/^DBK58-TEST-[A-Z0-9-]{5,64}$/.test(externalReference) ||
      !Number.isFinite(requestedPayment) || requestedPayment <= 0) {
    throw new Error("Use a synthetic DBK58-TEST- payment reference, a payer name, a positive amount, and cashier confirmation.");
  }

  const { lines } = await buildLines(input.cart, seller); // reads LIVE Sanity; never trusts client prices/stock
  const subtotal = subtotalFor(lines);
  const discount = calculateDiscount(subtotal, input.discount, seller);
  const delivery = deliveryPayable(input);
  const calculatedTotal = Math.max(0, subtotal - discount.discountAmount + delivery.deliveryFee);
  const breakdown = manualPaymentBreakdown(calculatedTotal, requestedPayment);
  if (breakdown.total <= 0) throw new Error("Neon test-order total must be positive.");
  if (breakdown.balanceDue > 0 && input.manualPartialPaymentConfirmed !== true) {
    throw new Error(`Confirm the partial payment: KES ${breakdown.balanceDue.toFixed(2)} remains outstanding.`);
  }
  if (breakdown.overpaidAmount > 0 && input.manualOverpaymentConfirmed !== true) {
    throw new Error(`Confirm the excess payment: KES ${breakdown.overpaidAmount.toFixed(2)} must be reconciled.`);
  }
  const storeId = seller.storeLocationId;
  if (!storeId) throw new Error("A verified active store is required.");
  const key = hashId(reference);
  const requestKey = `dbk58-manual-${key}`;
  const orderId = `dbk58.order.${key}`;
  const candidate = {
    requestKey,
    cashierConfirmed: true as const,
    overpaymentApproved: breakdown.overpaidAmount > 0 && input.manualOverpaymentConfirmed === true,
    order: {
      orderId,
      orderNumber: `DBK58-TEST-${key}`,
      channel: "POS" as const,
      storeId,
      sellerId: seller.id,
      currency: "KES" as const,
      discountMinor: toCents(discount.discountAmount, "discount"),
      deliveryMinor: toCents(delivery.deliveryFee, "delivery"),
      items: lines.map(line => ({
        productId: line.productId,
        ...(line.variantId ? { variantId: line.variantId } : {}),
        storeId,
        quantity: line.quantity,
        unitPriceMinor: toCents(line.unitPrice, "unit price"),
      })),
    },
    payment: {
      orderId,
      provider: "manual" as const,
      providerReference: externalReference,
      purpose: "INITIAL" as const,
      amountMinor: toCents(breakdown.received, "amount received"),
      evidenceReference: `synthetic-${key}`,
    },
  };
  return {
    mode: "READ_ONLY_LOCAL_PREVIEW" as const,
    source: "LIVE_SANITY_READS_ONLY" as const,
    simulatedPayment: true,
    noWritesPerformed: true,
    candidate,
    productNames: lines.map(line => line.name),
    calculation: {
      subtotalMinor: toCents(subtotal, "subtotal"),
      discountMinor: candidate.order.discountMinor,
      deliveryMinor: candidate.order.deliveryMinor,
      totalMinor: toCents(breakdown.total, "total"),
      collectedMinor: candidate.payment.amountMinor,
      balanceDueMinor: toCents(breakdown.balanceDue, "balance due"),
      overpaidMinor: toCents(breakdown.overpaidAmount, "overpaid amount"),
      financialStatus: breakdown.paymentStatus,
    },
  };
}

/** DBK-62: real manual POS candidate, never called unless the cutover gates pass. */
export async function prepareDBK62ManualSale(input: PosSaleInput, seller: PosSeller) {
  if (input.paymentMethod !== "manual") throw new Error("DBK-62 currently supports manual payment only.");
  const reference = referenceFor(input.requestId);
  const customer = customerDetails(input);
  const payerName = cleanText(input.manualPaymentName);
  const externalReference = cleanText(input.manualPaymentReference).toUpperCase();
  const requestedPayment = Number(input.manualAmountReceived);
  if (!payerName || !/^[A-Z0-9-]{5,100}$/.test(externalReference) || externalReference.startsWith("DBK58-TEST-")) {
    throw new Error("Enter a real, independently checked manual-payment reference and payer name.");
  }
  if (!Number.isFinite(requestedPayment) || requestedPayment <= 0 || input.manualPaymentConfirmed !== true) {
    throw new Error("Confirm the amount independently received before recording the manual payment.");
  }
  const duplicate = await serverClient.fetch<{_id: string} | null>(
    `*[((_type == "paymentTransaction") && providerReceiptNumber == $reference) ||
       ((_type == "commerceOrder") && (providerReceiptNumber == $reference || manualPaymentReference == $reference))][0]{_id}`,
    {reference:externalReference},{cache:"no-store"},
  );
  if (duplicate) throw new Error("That payment reference already exists in legacy sales. Check before recording it again.");
  if (!seller.storeLocationId) throw new Error("Select a verified store before recording the sale.");
  const delivery = deliveryPayable(input);
  if (delivery.fulfilmentType !== "IN_STORE" || delivery.deliveryFee !== 0) {
    throw new Error("DBK-62 cutover only supports in-store manual POS sales; delivery is not yet migrated.");
  }
  const {lines} = await buildLines(input.cart,seller,{stockAuthority:"neon"});
  const subtotal = subtotalFor(lines);
  const discount = calculateDiscount(subtotal,input.discount,seller);
  const total = Math.max(0,subtotal-discount.discountAmount);
  const breakdown = manualPaymentBreakdown(total,requestedPayment);
  if (breakdown.total <= 0) throw new Error("Manual sale total must be positive.");
  if (breakdown.balanceDue > 0 && input.manualPartialPaymentConfirmed !== true) {
    throw new Error("Confirm the outstanding balance on this partial payment.");
  }
  if (breakdown.overpaidAmount > 0) throw new Error("DBK-62 does not yet support overpayments or change reconciliation.");
  const key = hashId(reference);
  const requestKey = `dbk62-manual-${key}`;
  const orderId = `dbk62.order.${key}`;
  const orderNumber = `DBK62-POS-${key}`;
  const candidate = {
    requestKey,
    cashierConfirmed:true as const,
    overpaymentApproved:false,
    order:{orderId,orderNumber,channel:"POS" as const,storeId:seller.storeLocationId,sellerId:seller.id,
      currency:"KES" as const, discountMinor:toCents(discount.discountAmount,"discount"),deliveryMinor:0,
      items:lines.map(l=>({productId:l.productId,...(l.variantId?{variantId:l.variantId}:{}),
        storeId:seller.storeLocationId!,quantity:l.quantity,unitPriceMinor:toCents(l.unitPrice,"unit price")}))},
    payment:{orderId,provider:"manual" as const,providerReference:externalReference,
      purpose:"INITIAL" as const,amountMinor:toCents(breakdown.received,"received"),
      evidenceReference:`cashier-confirmed-${key}`},
  };
  const snapshot = {
    customerName:customer.name.slice(0,150),customerPhone:customer.phone,customerEmail:customer.email,
    sellerName:seller.name.slice(0,150),sellerRole:seller.role,storeName:(seller.storeLocationName||"Store").slice(0,150),
    paymentName:payerName.slice(0,150),paymentReference:externalReference,
    internalReference:reference,
    discountType:discount.discountType||"",discountValue:discount.discountValue||0,
    discountReason:discount.discountReason||"",discountAuthorizedByName:discount.discountAmount>0?seller.name:"",
    receiptNumber:`RCT-${orderNumber}`,deliveryLocation:delivery.deliveryLocation,
    productNames:lines.map(l=>l.name),
    lineDetails:lines.map(l=>({category:l.category,finish:l.finish||"",size:l.size||"",unitCost:l.unitCost})),
  };
  return {candidate,snapshot};
}

/** DBK-68: server-priced, in-store Neon candidate for direct Daraja STK. */
export async function prepareDBK68MpesaSale(input: PosSaleInput, seller: PosSeller) {
  if (input.paymentMethod !== 'mpesa') throw new Error('DBK-68 requires Direct M-PESA');
  const reference = referenceFor(input.requestId);
  const customer = customerDetails(input);
  const storeId = seller.storeLocationId;
  if (!storeId) throw new Error('Select a verified POS store');
  const delivery = deliveryPayable(input);
  if (delivery.fulfilmentType !== 'IN_STORE' || delivery.deliveryFee !== 0) {
    throw new Error('Neon Direct M-PESA currently supports in-store POS only');
  }
  const { lines } = await buildLines(input.cart, seller, { stockAuthority: 'neon' });
  const subtotal = subtotalFor(lines);
  const discount = calculateDiscount(subtotal, input.discount, seller);
  const total = subtotal - discount.discountAmount;
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new Error('Direct M-PESA requires a positive whole-KES amount');
  }
  const key = hashId(reference);
  const snapshot = {
    reference, orderId: `dbk68.order.${key}`, orderNumber: `DBK68-POS-${key}`,
    storeId, sellerId: seller.id, sellerName: seller.name.slice(0, 150),
    customerName: customer.name.slice(0, 150),
    customerPhone: customer.phone.replace(/\D/g, ''),
    totalMinor: toCents(total, 'total'),
    subtotalMinor: toCents(subtotal, 'subtotal'),
    discountMinor: toCents(discount.discountAmount, 'discount'),
    lines: lines.map(l => ({
      productId: l.productId, variantId: l.variantId || '', quantity: l.quantity,
      unitPriceMinor: toCents(l.unitPrice, 'unit price'), name: l.name.slice(0, 200),
    })),
  };
  return snapshot;
}
