"use client";

import { Suspense } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { GuidePage } from "@/components/guide/guide-page";

function GuidePageFallback() {
  return (
    <Center mih={240}>
      <Stack align="center" gap="sm">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Đang tải hướng dẫn…
        </Text>
      </Stack>
    </Center>
  );
}

export default function GuideRoutePage() {
  return (
    <Suspense fallback={<GuidePageFallback />}>
      <GuidePage />
    </Suspense>
  );
}
