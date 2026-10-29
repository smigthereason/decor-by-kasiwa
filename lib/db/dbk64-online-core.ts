import type { DBK64CheckoutSnapshot } from './dbk64-online-neon';

export function dbk64MoneyMinor(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 10_000_000_000 ||
      !Number.isSafeInteger(Math.round(value * 100)) ||
      Math.abs(Math.round(value * 100) / 100 - value) > 0.00000001) {
    throw new Error('Invalid KES monetary amount');
  }
  return Math.round(value * 100);
}

export function dbk64ValidReference(reference: string) {
  return /^DBK64-[0-9]{10,15}-[a-f0-9]{10}$/.test(reference);
}

export function dbk64VerifiedOrder(snapshot: DBK64CheckoutSnapshot) {
  return {
    orderId: snapshot.orderId,
    orderNumber: snapshot.orderNumber,
    reference: snapshot.reference,
    customerName: snapshot.customerName,
    customerEmail: snapshot.customerEmail,
    customerPhone: snapshot.customerPhone,
    paymentMethod: snapshot.paymentChannel,
    subtotal: snapshot.subtotalMinor / 100,
    deliveryFee: snapshot.deliveryMinor / 100,
    total: snapshot.totalMinor / 100,
    deliveryAddress: snapshot.deliveryAddress,
    items: snapshot.lines.map(line => ({
      productId: line.productId, name: line.name, finish: line.finish,
      size: line.size, quantity: line.quantity, unitPrice: line.unitPriceMinor / 100,
    })),
  };
}
