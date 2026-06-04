"use client";

import type { ModalProps } from "@mantine/core";
import { usePortalCompact } from "@/lib/use-portal-compact";

/** Default modal layout: full-screen below AppShell `md` (~992px). */
export function usePortalModalLayoutProps(): Pick<ModalProps, "fullScreen" | "centered"> {
  const isCompact = usePortalCompact();
  return isCompact
    ? { fullScreen: true, centered: false }
    : { fullScreen: false, centered: true };
}
