import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Business Flow",
  description: "Platform pengelolaan bisnis terpadu: keuangan, penjualan, stok, klien, dan operasional.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2ba8a2" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
