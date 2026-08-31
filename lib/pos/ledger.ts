import "server-only";

import { createHash } from "node:crypto";

import { serverClient } from "@/sanity/lib/serverClient";
import type { PosSeller } from "@/lib/pos/server";

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

function hashId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export type LedgerLine = {
  productId: string;
  name: string;
  variantId?: string;
  quantity: number;
};

export async function recordAuditEvent({
  key,
  eventType,
  entityType,
  entityId,
  entityLabel,
  actor,
  detail,
  createdAt = new Date().toISOString(),
}: {
  key: string;
  eventType: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  actor?: PosSeller;
  detail?: string;
  createdAt?: string;
}) {
  const id = `auditEvent.${hashId(key)}`;
  await serverClient.createIfNotExists({
    _id: id,
    _type: "auditEvent",
    eventNumber: `AUD-${hashId(key).slice(0, 12).toUpperCase()}`,
    eventType,
    entityType,
    entityId,
    entityLabel,
    ...(actor ? {
      actor: { _type: "reference", _ref: actor.id },
      actorName: actor.name,
      actorRole: actor.role,
    } : {}),
    detail,
    createdAt,
  });
  return id;
}

export async function upsertPaymentTransaction({
  reference,
  orderId,
  orderNumber,
  customerId,
  customerName,
  customerPhone,
  salesChannel,
  provider,
  channel,
  status,
  amount,
  providerTransactionId,
  providerReceiptNumber,
  failureReason,
  seller,
  paidAt,
}: {
  reference: string;
  orderId: string;
  orderNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  salesChannel: "POS" | "ONLINE";
  provider: string;
  channel: string;
  status: "pending" | "paid" | "partially_paid" | "failed" | "refunded";
  amount: number;
  providerTransactionId?: string;
  providerReceiptNumber?: string;
  failureReason?: string;
  seller?: PosSeller;
  paidAt?: string;
}) {
  const id = `paymentTransaction.${safeId(reference)}`;
  const now = new Date().toISOString();
  await serverClient.createIfNotExists({
    _id: id,
    _type: "paymentTransaction",
    reference,
    order: { _type: "reference", _ref: orderId },
    orderNumber,
    customerName,
    customerPhone,
    salesChannel,
    provider,
    channel,
    status,
    amount,
    currency: "KES",
    createdAt: now,
  });
  await serverClient.patch(id).set({
    order: { _type: "reference", _ref: orderId },
    orderNumber,
    ...(customerId ? { customer: { _type: "reference", _ref: customerId } } : {}),
    customerName,
    customerPhone,
    salesChannel,
    provider,
    channel,
    status,
    amount,
    currency: "KES",
    ...(providerTransactionId ? { providerTransactionId } : {}),
    ...(providerReceiptNumber ? { providerReceiptNumber } : {}),
    ...(failureReason ? { failureReason } : { failureReason: "" }),
    ...(seller ? {
      processedBy: { _type: "reference", _ref: seller.id },
      processedByName: seller.name,
      processedByRole: seller.role,
    } : {}),
    ...(paidAt ? { paidAt } : {}),
    updatedAt: now,
  }).commit();
  return id;
}

export function addInventoryMovementsToTransaction({
  transaction,
  movementKey,
  movementType,
  orderId,
  orderNumber,
  actor,
  movements,
  note,
  createdAt = new Date().toISOString(),
}: {
  transaction: ReturnType<typeof serverClient.transaction>;
  movementKey: string;
  movementType: "SALE" | "RETURN" | "REFUND_RESTOCK" | "ADJUSTMENT";
  orderId?: string;
  orderNumber?: string;
  actor?: PosSeller;
  movements: Array<{
    productId: string;
    productName: string;
    variantId?: string;
    quantityChange: number;
    stockBefore?: number;
    stockAfter?: number;
  }>;
  note?: string;
  createdAt?: string;
}) {
  movements.forEach((movement, index) => {
    const key = `${movementKey}|${movement.productId}|${movement.variantId || "default"}|${index}`;
    const id = `inventoryMovement.${hashId(key)}`;
    transaction.createIfNotExists({
      _id: id,
      _type: "inventoryMovement",
      movementNumber: `MOV-${hashId(key).slice(0, 12).toUpperCase()}`,
      movementType,
      product: { _type: "reference", _ref: movement.productId },
      productId: movement.productId,
      productName: movement.productName,
      variantId: movement.variantId,
      quantityChange: movement.quantityChange,
      stockBefore: movement.stockBefore,
      stockAfter: movement.stockAfter,
      ...(orderId ? { order: { _type: "reference", _ref: orderId } } : {}),
      orderNumber,
      ...(actor ? {
        actor: { _type: "reference", _ref: actor.id },
        actorName: actor.name,
        actorRole: actor.role,
      } : {}),
      note,
      createdAt,
    });
  });
}
