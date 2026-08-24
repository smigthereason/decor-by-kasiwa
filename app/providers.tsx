"use client";

import CommerceProvider from "@/components/root/commerce/CommerceProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <CommerceProvider>{children}</CommerceProvider>;
}
