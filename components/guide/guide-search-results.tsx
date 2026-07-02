"use client";

import { Button, SimpleGrid, Stack, Text } from "@mantine/core";
import type { GuideModule, GuideModuleId } from "@/lib/guide/types";
import { GuideModuleIcon } from "./guide-icons";

type GuideSearchResultButtonsProps = {
  modules: GuideModule[];
  activeId: GuideModuleId;
  onSelect: (id: GuideModuleId) => void;
  query: string;
};

export function GuideSearchResultButtons({
  modules,
  activeId,
  onSelect,
  query,
}: GuideSearchResultButtonsProps) {
  if (!query.trim()) {
    return null;
  }

  if (modules.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Không tìm thấy chủ đề phù hợp. Thử từ khóa khác.
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {modules.length} chủ đề khớp với &ldquo;{query.trim()}&rdquo;
      </Text>
      <SimpleGrid cols={1} spacing="xs">
        {modules.map((module) => (
          <Button
            key={module.id}
            variant={module.id === activeId ? "filled" : "light"}
            color="brand"
            justify="flex-start"
            fullWidth
            leftSection={<GuideModuleIcon name={module.icon} size={18} />}
            onClick={() => onSelect(module.id)}
            styles={{
              inner: { justifyContent: "flex-start" },
              label: { textAlign: "left", whiteSpace: "normal" },
            }}
          >
            {module.title}
          </Button>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
