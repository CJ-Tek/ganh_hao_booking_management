"use client";

import type { ReactNode } from "react";
import { PortalListPanelHeader } from "@/components/portal-list/portal-list-panel-header";
import { PortalSectionCard } from "@/components/portal-page";

export function PortalListSectionDesktop(props: {
  title?: string;
  showTitle?: boolean;
  headerFilters?: ReactNode;
  children: ReactNode;
}) {
  const { title, showTitle = true, headerFilters, children } = props;

  return (
    <PortalSectionCard>
      {showTitle && title ? (
        <PortalListPanelHeader title={title} filters={headerFilters} />
      ) : headerFilters ? (
        <PortalListPanelHeader title="" filters={headerFilters} hideTitle />
      ) : null}
      {children}
    </PortalSectionCard>
  );
}
