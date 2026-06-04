"use client";

import { useMediaQuery } from "@mantine/hooks";

/** Tablet band between phone (`48em`) and compact portal (`md` / ~992px). */
export function usePortalTablet() {
  return useMediaQuery("(min-width: 48em) and (max-width: 61.9375em)", false, {
    getInitialValueInEffect: true,
  });
}
