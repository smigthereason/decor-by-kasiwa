import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import "./globals.css";

import Providers from "@/app/providers";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: {
    default: "Decor by Kasiwa",
    template: "%s | Decor by Kasiwa",
  },
  description:
    "Interior design, décor, furnishings and space transformation for residential, commercial and hospitality spaces.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={manrope.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
