"use client";

import { useMediaQuery } from "@mantine/hooks";

/** Matches AppShell navbar `breakpoint: "md"` (collapses sidebar below this width). */
export function usePortalCompact() {
  return useMediaQuery("(max-width: 61.9375em)", false, { getInitialValueInEffect: true });
}
