import type { MetadataRoute } from "next";
import { ANDROID_PWA_ICONS } from "@/lib/pwa-icons";

export default function manifest(): MetadataRoute.Manifest {
  const icons: NonNullable<MetadataRoute.Manifest["icons"]> = ANDROID_PWA_ICONS.map(
    ({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })
  );

  return {
    name: "Gành Hào Booking Management",
    short_name: "Gành Hào",
    description: "Hệ thống quản lý đặt bàn cho nhà hàng Gành Hào",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "vi",
    background_color: "#ffffff",
    theme_color: "#0b7285",
    icons,
  };
}
