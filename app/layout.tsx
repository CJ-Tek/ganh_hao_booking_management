import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ganh Hao Booking Management",
  description: "Hệ thống quản lý đặt bàn cho nhà hàng Gành Hào",
  icons: {
    icon: "/logo/main_logo.png",
    shortcut: "/logo/main_logo.png",
    apple: "/logo/main_logo.png",
  },
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
