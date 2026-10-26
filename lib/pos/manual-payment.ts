/** All POS manual-payment amounts are stored as KES, calculated in integer cents. */
export function toCents(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Enter a valid ${label}.`);
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 0.000001) {
    throw new Error(`${label} must have no more than two decimal places.`);
  }
  return cents;
}

export function manualPaymentBreakdown(total: number, received: number) {
  const totalCents = toCents(total, "sale total");
  const receivedCents = toCents(received, "amount received");
  if (receivedCents <= 0) throw new Error("Enter the amount received outside the system.");
  return {
    total: totalCents / 100,
    received: receivedCents / 100,
    amountPaid: Math.min(receivedCents, totalCents) / 100,
    balanceDue: Math.max(0, totalCents - receivedCents) / 100,
    overpaidAmount: Math.max(0, receivedCents - totalCents) / 100,
    paymentStatus: receivedCents < totalCents ? "partially_paid" as const : "paid" as const,
  };
}
