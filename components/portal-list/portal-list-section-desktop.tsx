"use client";

import type { ReactNode } from "react";
import { PortalListPanelHeader } from "@/components/portal-list/portal-list-panel-header";
import { PortalSectionCard } from "@/components/portal-page";

export function PortalListSectionDesktop(props: {
  title: string;
  headerFilters?: ReactNode;
  children: ReactNode;
}) {
  const { title, headerFilters, children } = props;

  return (
    <PortalSectionCard>
      <PortalListPanelHeader title={title} filters={headerFilters} />
      {children}
    </PortalSectionCard>
  );
}
