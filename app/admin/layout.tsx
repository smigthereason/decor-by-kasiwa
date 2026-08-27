import type { ReactNode } from "react";

import BackOfficeShell from "@/components/backoffice/BackOfficeShell";
import { requireStaffAccess } from "@/lib/auth/authorization";

export const metadata = {
  title: "Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { customer } = await requireStaffAccess(
    "ADMIN",
    "/admin",
  );

  return (
    <BackOfficeShell
      mode="admin"
      staffRole="ADMIN"
      staffName={customer.name}
      staffEmail={customer.email}
    >
      {children}
    </BackOfficeShell>
  );
}
