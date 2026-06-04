"use client";

import { ModalsProvider } from "@mantine/modals";
import { PORTAL_MODAL_Z_INDEX } from "@/lib/portal-z-index";
import { usePortalModalLayoutProps } from "@/lib/use-portal-modal-layout";

const modalOverlayBlur = { backgroundOpacity: 0.55, blur: 4 } as const;

export function PortalModalsProvider({ children }: { children: React.ReactNode }) {
  const modalLayout = usePortalModalLayoutProps();

  return (
    <ModalsProvider
      modalProps={{
        ...modalLayout,
        overlayProps: modalOverlayBlur,
        zIndex: PORTAL_MODAL_Z_INDEX,
      }}
    >
      {children}
    </ModalsProvider>
  );
}
