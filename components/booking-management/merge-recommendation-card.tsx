"use client";

import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { type MergeRecommendation } from "@/lib/booking-meta";
import { formatTableGuestCapacityHint } from "@/lib/table-capacity";

export interface MergeRecommendationTableRef {
  id: string;
  name: string;
  seats: number;
  areaId: string;
}

export interface MergeRecommendationCardProps {
  recommendations: MergeRecommendation[];
  tables: MergeRecommendationTableRef[];
  /** Areas for resolving `areaId → name` when showing recommendations without a scoped khu vực. */
  areas: { id: string; name: string }[];
  targetSeats: number;
  /** When set, recommendation rows omit repeating this khu vực prefix (shown in alert title instead). */
  areaName?: string | null;
  maxItems?: number;
  applyLabel?: string;
  /** Override helper text under the alert title. */
  description?: string;
  busyKey?: string | null;
  onUseExisting: (group: MergeRecommendation) => void | Promise<void>;
  onMergeAndApply: (combo: MergeRecommendation) => void | Promise<void>;
}

export function MergeRecommendationCard({
  recommendations,
  tables,
  areas,
  targetSeats,
  areaName,
  maxItems = 3,
  description,
  busyKey,
  onUseExisting,
  onMergeAndApply,
}: MergeRecommendationCardProps) {
  const tableMap = useMemo(() => {
    const map = new Map<string, MergeRecommendationTableRef>();
    for (const table of tables) {
      map.set(table.id, table);
    }
    return map;
  }, [tables]);

  const areaMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const area of areas) {
      map.set(area.id, area.name);
    }
    return map;
  }, [areas]);

  const resolveAreaName = (areaId: string) => areaMap.get(areaId)?.trim() || "—";

  if (recommendations.length === 0) {
    return null;
  }
  const items = recommendations.slice(0, maxItems);
  const scoped = Boolean(areaName?.trim());
  const titleBasics =
    scoped && areaName
      ? `${targetSeats} khách · ${areaName}`
      : `${targetSeats} khách (tất cả khu trong chi nhánh)`;

  return (
    <Alert color="blue" variant="light" title={`Gợi ý gộp bàn cho ${titleBasics}`}>
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          {description ??
            "Không có bàn lẻ nào đủ chỗ. Áp dụng một trong các gợi ý dưới đây để gộp bàn và gán booking ngay."}
        </Text>
        {items.map((rec) => {
          const joinedNames = rec.tableIds.map((id) => tableMap.get(id)?.name ?? "?").join(" + ");
          const derivedAreaId =
            rec.kind === "existing-group" && rec.existingGroup
              ? rec.existingGroup.areaId
              : rec.tableIds[0]
                ? (tableMap.get(rec.tableIds[0])?.areaId ?? "")
                : "";
          const areaLabel = resolveAreaName(derivedAreaId);
          let headline: string;
          let memberHint: string | null = null;

          if (rec.kind === "existing-group") {
            const mn = rec.existingGroup?.mergedName ?? "Bàn gộp";
            if (scoped) {
              headline = mn;
              memberHint = joinedNames.length > 0 ? joinedNames : null;
            } else {
              headline = `${areaLabel} · ${mn}`;
              memberHint = joinedNames.length > 0 ? joinedNames : null;
            }
          } else if (scoped) {
            headline = joinedNames;
            memberHint = null;
          } else {
            headline = `${areaLabel} · ${joinedNames}`;
            memberHint = null;
          }

          const capacityHint = formatTableGuestCapacityHint(rec.totalCapacity);
          const isExisting = rec.kind === "existing-group";
          const itemKey = isExisting
            ? `existing:${rec.existingGroup?.id ?? rec.key}`
            : `combo:${rec.tableIds.join(",")}`;
          const itemBusy = busyKey === itemKey;

          return (
            <Group key={rec.key} justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
              <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {headline}
                </Text>
                {memberHint ? (
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {memberHint}
                  </Text>
                ) : null}
                <Text size="xs" c="dimmed" lineClamp={2}>
                  Tối đa chứa: {capacityHint}
                </Text>
              </Stack>
              <Button
                size="xs"
                variant={isExisting ? "filled" : "light"}
                loading={itemBusy}
                onClick={() => {
                  if (isExisting) {
                    void onUseExisting(rec);
                  } else {
                    void onMergeAndApply(rec);
                  }
                }}
                style={{ flexShrink: 0 }}
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
