/** Public error responses only; internal details are logged with the operation ID. */
export function dbk120InventoryFailure(cause: unknown): {status:number;message:string;code:string} {
  const error = cause instanceof Error ? cause.message : String(cause);
  if (/insufficient purchased\/incoming stock/i.test(error)) return {status:409,code:'INSUFFICIENT_INCOMING',message:'There are not enough purchased units awaiting receipt at this store. Record a purchase first, then receive the available incoming units.'};
  if (/insufficient stock at source location/i.test(error)) return {status:409,code:'INSUFFICIENT_STOCK',message:'The selected store does not have enough available stock for this transfer.'};
  if (/product\/variant is absent from seeded stock/i.test(error)) return {status:409,code:'NEON_VARIANT_MISSING',message:'The product or variant has no Neon stock registration. Save the variant in Products, reload Inventory and retry with the same operation ID.'};
  if (/idempotency key reused|retry key reused/i.test(error)) return {status:409,code:'OPERATION_CONFLICT',message:'This inventory operation ID has already been used for different values. Reload the inventory form before retrying.'};
  if (/inventory write gate disabled|stock engine.*disabled|database.*host mismatch|database pin missing|maintenance/i.test(error)) return {status:503,code:'INVENTORY_UNAVAILABLE',message:'Inventory writes are temporarily unavailable. No Sanity fallback was attempted.'};
  if (/Invalid (DBK-69 operation|stock operation payload|source\/destination)/i.test(error)) return {status:400,code:'INVALID_MOVEMENT',message:'The stock movement has invalid fields. Verify the product, variant, quantity, stores and cost.'};
  return {status:500,code:'INVENTORY_WRITE_FAILED',message:'Unable to save this stock movement. The original operation ID has been preserved; verify its status before submitting a different operation.'};
}
