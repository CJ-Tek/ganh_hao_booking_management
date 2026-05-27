"use client";

import { Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export function PortalListPanelHeader(props: {
  title: string;
  filters?: ReactNode;
}) {
  const { title, filters } = props;

  return (
    <Stack gap="sm">
      <Text fw={600}>{title}</Text>
      {filters}
    </Stack>
  );
}
