"use client";

import { Badge, NavLink, Select, Stack, Text } from "@mantine/core";
import type { GuideModule, GuideModuleId } from "@/lib/guide/types";
import { GuideModuleIcon } from "./guide-icons";

type GuideModuleNavProps = {
  modules: GuideModule[];
  activeId: GuideModuleId;
  onSelect: (id: GuideModuleId) => void;
  compact: boolean;
  emptyMessage?: string;
};

export function GuideModuleNav({
  modules,
  activeId,
  onSelect,
  compact,
  emptyMessage = "Không tìm thấy chủ đề phù hợp. Thử từ khóa khác.",
}: GuideModuleNavProps) {
  if (modules.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        {emptyMessage}
      </Text>
    );
  }

  if (compact) {
    return (
      <Select
        label="Chủ đề hướng dẫn"
        value={activeId}
        onChange={(value) => {
          if (value) {
            onSelect(value as GuideModuleId);
          }
        }}
        data={modules.map((module) => ({
          value: module.id,
          label: module.title,
        }))}
        allowDeselect={false}
      />
    );
  }

  return (
    <Stack gap={6}>
      {modules.map((module) => (
        <NavLink
          key={module.id}
          label={module.title}
          description={module.summary}
          leftSection={<GuideModuleIcon name={module.icon} />}
          rightSection={
            <Badge size="xs" variant="light" color="gray">
              ~{module.readMinutes} phút
            </Badge>
          }
          active={module.id === activeId}
          onClick={() => onSelect(module.id)}
          style={{ borderRadius: 12 }}
        />
      ))}
    </Stack>
  );
}

export function GuideModuleNavHint({ moduleCount }: { moduleCount: number }) {
  return (
    <Text size="sm" c="dimmed">
      {moduleCount} chủ đề phù hợp với vai trò của bạn
    </Text>
  );
}
