import type { ReactNode } from "react";

import BackOfficeShell from "@/components/backoffice/BackOfficeShell";
import { requireStaffAccess } from "@/lib/auth/authorization";

export const metadata = {
  title: "Store Operations",
};

export default async function StoreLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { customer } = await requireStaffAccess(
    "STORE",
    "/store",
  );

  const staffRole = customer.role === "CUSTOMER" ? "STORE_STAFF" : customer.role;

  return (
    <BackOfficeShell
      mode="store"
      staffRole={staffRole}
      staffName={customer.name}
      staffEmail={customer.email}
    >
      {children}
    </BackOfficeShell>
  );
}
