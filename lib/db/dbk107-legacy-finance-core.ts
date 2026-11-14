/** No I/O: shared accounting invariants used on both POS and reporting reads. */
export function dbk107ValidateMoney(value:unknown):number {
  if (typeof value!=='number' || !Number.isFinite(value) || value<0 || value>10_000_000_000 ||
      !Number.isSafeInteger(Math.round(value*100)) || Math.abs(value*100-Math.round(value*100))>0.00001)
    throw new Error('Invalid KES amount');
  return Math.round(value*100);
}
export function dbk107ApplyLegacyBalances<T extends {id:string;balanceDue:number;amountPaid:number;paymentStatus:string}>(
  orders:T[],collected: Array<{order_id:string;amount_minor:number|string;original_balance_minor?:number|string}>):T[] {
  const deltas=new Map(collected.map(row=>[row.order_id,row]));
  return orders.map(order=>{
    const entry=deltas.get(order.id);
    const minor=Number(entry?.amount_minor||0);
    if (!Number.isSafeInteger(minor)||minor<0) throw new Error('Invalid legacy ledger amount');
    const due=dbk107ValidateMoney(order.balanceDue);
    if (entry?.original_balance_minor !== undefined && Number(entry.original_balance_minor)!==due)
      throw new Error('Historical Sanity order changed after Neon bridge enrollment; reconcile before displaying balances');
    if (minor>due) throw new Error('Legacy receipts exceed original Sanity balance');
    const left=due-minor;
    return {...order,balanceDue:left/100,amountPaid:order.amountPaid+minor/100,
      paymentStatus:minor>0?(left===0?'paid':'partially_paid'):order.paymentStatus};
  });
}
