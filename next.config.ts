import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: {
    skipWaiting: true,
  },
});

const nextConfig: NextConfig = {
  // PWA plugin injects webpack config; acknowledge Turbopack for `next dev` (Next.js 16+).
  turbopack: {},
};

export default withPWA(nextConfig);
