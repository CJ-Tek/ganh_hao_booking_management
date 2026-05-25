"use client";

import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { type MergeRecommendation } from "@/lib/booking-meta";

export interface MergeRecommendationCardProps {
  recommendations: MergeRecommendation[];
  tables: { id: string; name: string; seats: number }[];
  targetSeats: number;
  areaName?: string | null;
  maxItems?: number;
  applyLabel?: string;
  busyKey?: string | null;
  onUseExisting: (group: MergeRecommendation) => void | Promise<void>;
  onMergeAndApply: (combo: MergeRecommendation) => void | Promise<void>;
}

export function MergeRecommendationCard({
  recommendations,
  tables,
  targetSeats,
  areaName,
  maxItems = 3,
  busyKey,
  onUseExisting,
  onMergeAndApply,
}: MergeRecommendationCardProps) {
  const tableMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; seats: number }>();
    for (const table of tables) {
      map.set(table.id, table);
    }
    return map;
  }, [tables]);
  if (recommendations.length === 0) {
    return null;
  }
  const items = recommendations.slice(0, maxItems);
  return (
    <Alert
      color="blue"
      variant="light"
      title={`Gợi ý gộp bàn cho ${targetSeats} khách${areaName ? ` · ${areaName}` : ""}`}
    >
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Không có bàn lẻ nào đủ chỗ. Áp dụng một trong các gợi ý dưới đây để gộp bàn và gán booking ngay.
        </Text>
        {items.map((rec) => {
          const labelTables = rec.tableIds
            .map((id) => tableMap.get(id)?.name ?? "?")
            .join(" + ");
          const isExisting = rec.kind === "existing-group";
          const ctaLabel = isExisting
            ? `Dùng ${rec.existingGroup?.mergedName ?? "cụm có sẵn"}`
            : `Gộp & gán: ${labelTables}`;
          const subtitle = isExisting
            ? `${labelTables} · ${rec.totalCapacity} chỗ`
            : `Tổng ${rec.totalCapacity} chỗ`;
          const itemKey = isExisting
            ? `existing:${rec.existingGroup?.id ?? rec.key}`
            : `combo:${rec.tableIds.join(",")}`;
          return (
            <Group key={rec.key} justify="space-between" wrap="nowrap" gap="xs">
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} lineClamp={1}>
                  {ctaLabel}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {subtitle}
                </Text>
              </Stack>
              <Button
                size="xs"
                variant={isExisting ? "filled" : "light"}
                loading={busyKey === itemKey}
                onClick={() => {
                  if (isExisting) {
                    void onUseExisting(rec);
                  } else {
                    void onMergeAndApply(rec);
                  }
                }}
              >
                {isExisting ? "Dùng cụm" : "Gộp & gán"}
              </Button>
            </Group>
          );
        })}
      </Stack>
    </Alert>
  );
}
