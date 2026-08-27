"use client";

import {
  SessionProvider,
} from "next-auth/react";

import CommerceProvider from "@/components/root/commerce/CommerceProvider";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <CommerceProvider>
        {children}
      </CommerceProvider>
    </SessionProvider>
  );
}
