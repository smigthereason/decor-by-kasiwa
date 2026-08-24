import type { ReactNode } from "react";

import BackOfficeShell from "@/components/backoffice/BackOfficeShell";

export const metadata = {
  title: "Admin",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <BackOfficeShell mode="admin">{children}</BackOfficeShell>;
}
