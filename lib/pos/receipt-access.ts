import type { ApiStaffRole } from "@/lib/auth/api-authorization";

/**
 * Sales Staff may print receipts only for sales attributed to their assigned store.
 * Managers, Store Managers and Admin retain their existing receipt visibility.
 */
export function canViewPosReceipt(
  role: ApiStaffRole,
  assignedStoreId: string | undefined,
  receiptStoreId: string | undefined,
): boolean {
  if (role === "STORE_STAFF") {
    return Boolean(assignedStoreId && receiptStoreId && assignedStoreId === receiptStoreId);
  }
  return role === "ADMIN" || role === "STORE" || role === "MANAGER";
}
