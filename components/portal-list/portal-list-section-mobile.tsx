"use client";

import { Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { PortalListPanelHeader } from "@/components/portal-list/portal-list-panel-header";
import { PortalSectionCard } from "@/components/portal-page";

export function PortalListSectionMobile(props: {
  title: string;
  headerFilters?: ReactNode;
  filtersToolbar?: ReactNode;
  paginationBar?: ReactNode | null;
  children: ReactNode;
}) {
  const { title, headerFilters, filtersToolbar, paginationBar, children } = props;

  return (
    <PortalSectionCard>
      <Stack gap="md">
        <PortalListPanelHeader title={title} filters={headerFilters} />
        {filtersToolbar}
        <Stack gap="xs">
          {paginationBar}
          {children}
          {paginationBar}
        </Stack>
      </Stack>
    </PortalSectionCard>
  );
}

export function PortalListSectionEmptyState(props: { message: string }) {
  return (
    <Text c="dimmed" size="sm">
      {props.message}
    </Text>
  );
}
