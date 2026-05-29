import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gành Hào Booking Management",
  description: "Hệ thống quản lý đặt bàn cho nhà hàng Gành Hào",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gành Hào",
  },
  icons: {
    icon: "/logo/main_logo.png",
    apple: "/logo/main_logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b7285",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
