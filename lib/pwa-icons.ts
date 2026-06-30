export type PwaIconDef = {
  src: string;
  sizes: string;
  type: "image/png";
  purpose?: "any" | "maskable";
};

export const ANDROID_PWA_ICONS: readonly PwaIconDef[] = [
  { src: "/logo/pwa/android/72x72.png", sizes: "72x72", type: "image/png", purpose: "any" },
  { src: "/logo/pwa/android/96x96.png", sizes: "96x96", type: "image/png", purpose: "any" },
  { src: "/logo/pwa/android/128x128.png", sizes: "128x128", type: "image/png", purpose: "any" },
  { src: "/logo/pwa/android/144x144.png", sizes: "144x144", type: "image/png", purpose: "any" },
  { src: "/logo/pwa/android/152x152.png", sizes: "152x152", type: "image/png", purpose: "any" },
  {
    src: "/logo/pwa/android/192x192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "maskable",
  },
  { src: "/logo/pwa/android/384x384.png", sizes: "384x384", type: "image/png", purpose: "any" },
  {
    src: "/logo/pwa/android/512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
] as const;

export const IOS_PWA_ICONS: readonly PwaIconDef[] = [
  { src: "/logo/pwa/ios/120x120.png", sizes: "120x120", type: "image/png" },
  { src: "/logo/pwa/ios/180x180.png", sizes: "180x180", type: "image/png" },
] as const;

/** Browser tab favicon — circular artwork. */
export const FAVICON_ICONS: readonly PwaIconDef[] = [
  { src: "/logo/pwa/favicon/16x16.png", sizes: "16x16", type: "image/png" },
  { src: "/logo/pwa/favicon/32x32.png", sizes: "32x32", type: "image/png" },
  { src: "/logo/pwa/favicon/48x48.png", sizes: "48x48", type: "image/png" },
] as const;
