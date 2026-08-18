"use client";

import CommerceProvider from "@/components/commerce/CommerceProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <CommerceProvider>{children}</CommerceProvider>;
}
