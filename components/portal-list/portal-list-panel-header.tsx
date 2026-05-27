"use client";

import { Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export function PortalListPanelHeader(props: {
  title: string;
  filters?: ReactNode;
  hideTitle?: boolean;
}) {
  const { title, filters, hideTitle = false } = props;

  return (
    <Stack gap="sm">
      {hideTitle ? null : <Text fw={600}>{title}</Text>}
      {filters}
    </Stack>
  );
}
