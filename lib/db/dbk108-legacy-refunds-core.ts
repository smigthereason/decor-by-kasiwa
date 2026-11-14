/** Pure accounting invariants; no source / database I/O. */
export function dbk108MoneyMinor(amount:unknown) {
  if (typeof amount!=='number' || !Number.isFinite(amount) || amount < 0 || amount > 10_000_000_000 ||
      !Number.isSafeInteger(Math.round(amount*100)) ||
      Math.abs(Math.round(amount*100)/100-amount)>0.000001) {
    throw new Error('Invalid historical refund amount');
  }
  return Math.round(amount*100);
}
export function dbk108ApplyRefunds<T extends {id:string; refundedAmount:number; amountPaid:number;paymentStatus:string}>(
  orders:T[],rows:Array<{order_id:string; amount_minor:number|string; original_refunded_minor:number|string}>
):T[] {
  const byOrder=new Map(rows.map(row=>[row.order_id,row]));
  return orders.map(o=>{
    const row=byOrder.get(o.id);
    if(!row) return o;
    const minor=Number(row.amount_minor),original=Number(row.original_refunded_minor);
    if(!Number.isSafeInteger(minor)||minor<0||!Number.isSafeInteger(original)||original!==dbk108MoneyMinor(o.refundedAmount)||
      minor+original>dbk108MoneyMinor(o.amountPaid)) {
      throw new Error('Historical refund ledger does not reconcile with Sanity receipt');
    }
    const refunded=(minor+original)/100;
    return {...o,refundedAmount:refunded,
      paymentStatus:refunded===o.amountPaid?'refunded':o.paymentStatus};
  });
}
