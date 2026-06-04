import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { ANDROID_PWA_ICONS, IOS_PWA_ICONS } from "@/lib/pwa-icons";
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
    icon: ANDROID_PWA_ICONS.map(({ src, sizes, type }) => ({ url: src, sizes, type })),
    apple: IOS_PWA_ICONS.map(({ src, sizes, type }) => ({ url: src, sizes, type })),
  },
};

export const viewport: Viewport = {
  themeColor: "#0b7285",
  width: "device-width",
  initialScale: 1,
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
