import type { ReactNode } from "react";

import BackOfficeShell from "@/components/backoffice/BackOfficeShell";

export const metadata = {
  title: "Store Operations",
};

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <BackOfficeShell mode="store">{children}</BackOfficeShell>;
}
