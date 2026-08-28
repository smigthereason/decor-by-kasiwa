import type { ReactNode } from "react";

import { requireStaffAccess } from "@/lib/auth/authorization";

export default async function StoreManagementLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireStaffAccess("STORE_MANAGER", "/store");
  return children;
}
