// DBK-74 — Pure maintenance-routing checks. No database or secrets.
export type Provider = 'paystack' | 'daraja';
export function callbackProvider(pathname: string): Provider | null {
  if (pathname === '/api/paystack/webhook') return 'paystack';
  if (pathname === '/api/payments/mobile/callback') return 'daraja';
  return null;
}
export function isWriteMethod(method: string): boolean {
  return !['GET','HEAD','OPTIONS'].includes(method.toUpperCase());
}
export function isPausedPage(pathname: string): boolean {
  return pathname === '/checkout' || pathname.startsWith('/checkout/') ||
    pathname === '/admin/pos' || pathname.startsWith('/admin/pos/') ||
    pathname === '/store/pos' || pathname.startsWith('/store/pos/');
}
export function validateQueuedBody(provider: Provider, raw: string): boolean {
  if (!raw || Buffer.byteLength(raw, 'utf8') > 65536) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return false; }
  if (!parsed || typeof parsed !== 'object') return false;
  const event = parsed as Record<string, unknown>;
  if (provider === 'paystack') {
    const data = event.data as Record<string,unknown> | undefined;
    return typeof event.event === 'string' && !!data &&
      (event.event !== 'charge.success' ||
        (typeof data.reference === 'string' && data.reference.length > 0 && data.reference.length <= 180));
  }
  const body = event.Body as Record<string, unknown> | undefined;
  const cb = body?.stkCallback as Record<string,unknown> | undefined;
  return !!cb && typeof cb.CheckoutRequestID === 'string' &&
    cb.CheckoutRequestID.length > 0 && cb.CheckoutRequestID.length <= 180;
}
