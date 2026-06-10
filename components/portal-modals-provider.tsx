"use client";

import { ModalsProvider } from "@mantine/modals";
import { portalConfirmModalProps } from "@/lib/portal-z-index";

export function PortalModalsProvider({ children }: { children: React.ReactNode }) {
  return (
    <ModalsProvider modalProps={portalConfirmModalProps}>
      {children}
    </ModalsProvider>
  );
}
