import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";

import "./globals.css";

import Providers from "@/app/providers";
import { getSiteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const siteUrl = getSiteUrl();


export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: SITE_NAME,
  title: {
    default: "Decor by Kasiwa | Home Decor in Kenya",
    template: "%s | Decor by Kasiwa",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "home decor Kenya",
    "home accessories Kenya",
    "interior decor Nairobi",
    "artificial plants Kenya",
    "mirrors Kenya",
    "lighting Kenya",
    "Decor by Kasiwa",
  ],
  openGraph: {
    type: "website",
    locale: "en_KE",
    siteName: SITE_NAME,
    title: "Decor by Kasiwa | Home Decor in Kenya",
    description: SITE_DESCRIPTION,
    url: "/",
    images: [
      {
        url: "/brand-logo.jpg",
        alt: "Decor by Kasiwa",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Decor by Kasiwa | Home Decor in Kenya",
    description: SITE_DESCRIPTION,
    images: ["/brand-logo.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-KE" data-scroll-behavior="smooth">
      <body className={manrope.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
