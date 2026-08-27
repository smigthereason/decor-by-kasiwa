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

  const staffRole: "ADMIN" | "STORE" =
    customer.role === "ADMIN"
      ? "ADMIN"
      : "STORE";

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
