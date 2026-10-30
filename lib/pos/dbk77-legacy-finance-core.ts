/** DBK-77: tightly scoped historical-finance exception after Neon POS cutover.
 * Historical Sanity sales remain reportable in Sanity; NEVER alter Sanity stock.
 * All routes are still blocked by DBK-74 while maintenance is active.
 */
export function dbk77LegacyFinanceEnabled(cutoverRequested: boolean, flag: string | undefined) {
  return cutoverRequested && flag === 'YES';
}

export function dbk77RequireSameOriginJson(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin ||
      !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Same-origin JSON required for historical financial operations');
  }
}

export function dbk77ValidateCollection(input: {
  amount?: number; requestId?: string; paymentReference?: string; manualPaymentConfirmed?: boolean;
}) {
  const amount = Number(input.amount);
  if (input.manualPaymentConfirmed !== true || !Number.isSafeInteger(Math.round(amount * 100)) ||
      !Number.isFinite(amount) || amount <= 0 || Math.abs(Math.round(amount * 100) / 100 - amount) > 0.000001 ||
      typeof input.paymentReference !== 'string' || !/^[A-Za-z0-9._-]{8,100}$/.test(input.paymentReference) ||
      /(?:TEST|SYNTHETIC)/i.test(input.paymentReference) ||
      typeof input.requestId !== 'string' || !/^[A-Za-z0-9._-]{8,100}$/.test(input.requestId)) {
    throw new Error('Confirm the received payment with a unique external reference, request ID and exact KES amount');
  }
  return { amount, paymentReference: input.paymentReference, requestId: input.requestId };
}

export function dbk77ValidateLegacyRefund(input: {
  refundAmount?: number; restock?: boolean; cancelOutstanding?: boolean; items?: unknown;
  manualRefundConfirmed?: boolean; manualRefundReference?: string;
}) {
  const amount = Number(input.refundAmount);
  if (input.restock || input.cancelOutstanding || (Array.isArray(input.items) && input.items.length > 0)) {
    throw new Error('Historical stock returns and outstanding cancellations need a Neon stock-safe workflow; not permitted here');
  }
  if (input.items !== undefined && !Array.isArray(input.items)) throw new Error('Invalid refund items');
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100)) ||
      Math.abs(amount - Math.round(amount * 100) / 100) > 0.000001 ||
      input.manualRefundConfirmed !== true ||
      typeof input.manualRefundReference !== 'string' ||
      !/^[A-Za-z0-9._-]{8,100}$/.test(input.manualRefundReference) ||
      /(?:TEST|SYNTHETIC)/i.test(input.manualRefundReference)) {
    throw new Error('Historical refund must be externally completed and documented with a unique reference');
  }
}
