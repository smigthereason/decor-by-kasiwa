"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

export default function GoogleAnalytics() {
  const pathname = usePathname();
  const firstPath = useRef(true);

  useEffect(() => {
    if (!measurementId || firstPath.current) {
      firstPath.current = false;
      return;
    }
    window.gtag?.("config", measurementId, {
      page_path: `${pathname}${window.location.search}`,
      anonymize_ip: true,
    });
  }, [pathname]);

  if (!measurementId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="decor-by-kasiwa-google-analytics" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${measurementId}',{anonymize_ip:true});`}
      </Script>
    </>
  );
}
