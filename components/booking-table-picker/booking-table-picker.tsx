"use client";

import dayjs from "dayjs";
import dynamic from "next/dynamic";
import {
  Badge,
  Button,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterChipScroll } from "@/components/filter-chip-scroll";
import { useAppContext } from "@/contexts/app-context";
import {
  buildBookingTablePickerLayout,
  derivePickerMergeGroupStatuses,
  filterMergeGroupsForPicker,
} from "@/lib/booking-table-picker-layout";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { filterTablesForFloorMapDay } from "@/lib/table-split-clone-utils";
import { usePortalCompact } from "@/lib/use-portal-compact";
import type { Area, Booking, DiningTable, TableMergeGroup } from "@/lib/types";

const BookingTablePickerMap = dynamic(
  () =>
    import("@/components/booking-table-picker/booking-table-picker-map").then(
      (m) => m.BookingTablePickerMap
    ),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          minHeight: 280,
          height: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          background: "#f8fafc",
        }}
      >
        <Text size="sm" c="dimmed">
          Đang tải sơ đồ…
        </Text>
      </div>
    ),
  }
);

export type BookingTablePickerMode = "create" | "edit" | "assign" | "change_table";

export type BookingTablePickerProps = {
  mode: BookingTablePickerMode;
  branchId: string;
  areas: Area[];
  tables: DiningTable[];
  mergeGroups: TableMergeGroup[];
  bookings: readonly Booking[];
  layoutDate: string;
  areaId: string | null;
  tableId: string | null;
  mergeGroupId: string | null;
  onChange: (patch: {
    areaId?: string | null;
    tableId?: string | null;
    mergeGroupId?: string | null;
  }) => void;
  selectableTableIds?: ReadonlySet<string>;
  selectableMergeGroupIds?: ReadonlySet<string>;
  highlightTableId?: string | null;
  disabled?: boolean;
  /** Show sector map and table availability without selection controls. */
  readOnly?: boolean;
};

export function BookingTablePicker(props: BookingTablePickerProps) {
  const {
    mode,
    branchId,
    areas,
    tables,
    mergeGroups,
    bookings,
    layoutDate,
    areaId,
    tableId,
    mergeGroupId,
    onChange,
    selectableTableIds,
    selectableMergeGroupIds,
    highlightTableId,
    disabled = false,
    readOnly = false,
  } = props;

  const isCompact = usePortalCompact();
  const areaChipSize = isCompact ? "xs" : "compact-sm";
  const { filteredBranchIds, fetchAreaFloorLayoutForDate } = useAppContext();
  const [dayOverride, setDayOverride] = useState<
    import("@/lib/floor-layout-snapshot").AreaFloorLayoutByDate | null | undefined
  >(undefined);
  const [layoutLoading, setLayoutLoading] = useState(false);

  const branchAreas = useMemo(
    () =>
      [...areas]
        .filter((a) => a.branchId === branchId)
        .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id)),
    [areas, branchId]
  );

  const selectedArea = useMemo(
    () => branchAreas.find((a) => a.id === areaId) ?? null,
    [areaId, branchAreas]
  );

  useEffect(() => {
    if (!areaId || !layoutDate) {
      setDayOverride(null);
      return;
    }
    let cancelled = false;
    setLayoutLoading(true);
    void fetchAreaFloorLayoutForDate(areaId, layoutDate).then((row) => {
      if (!cancelled) {
        setDayOverride(row);
        setLayoutLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [areaId, fetchAreaFloorLayoutForDate, layoutDate]);

  const tablesInArea = useMemo(() => {
    if (!areaId) {
      return [];
    }
    const inArea = tables.filter((t) => t.areaId === areaId && t.branchId === branchId);
    return filterTablesForFloorMapDay(inArea, dayjs(layoutDate));
  }, [areaId, branchId, layoutDate, tables]);

  const mergeGroupsInArea = useMemo(() => {
    if (!areaId) {
      return [];
    }
    return filterMergeGroupsForPicker(mergeGroups, branchId, areaId, layoutDate);
  }, [areaId, branchId, layoutDate, mergeGroups]);

  const layoutModel = useMemo(() => {
    if (!selectedArea || dayOverride === undefined) {
      return null;
    }
    return buildBookingTablePickerLayout({
      area: selectedArea,
      tablesInArea,
      mergeGroupsInArea,
      dayOverride,
      bookings,
      branchIds: filteredBranchIds.length > 0 ? filteredBranchIds : [branchId],
      layoutDate,
    });
  }, [
    bookings,
    branchId,
    dayOverride,
    filteredBranchIds,
    layoutDate,
    mergeGroupsInArea,
    selectedArea,
    tablesInArea,
  ]);

  const mergeStatusById = useMemo(() => {
    if (!layoutModel) {
      return new Map();
    }
    return derivePickerMergeGroupStatuses(mergeGroupsInArea, layoutModel.dayBookings);
  }, [layoutModel, mergeGroupsInArea]);

  useEffect(() => {
    if (!layoutModel) {
      return;
    }
    const placedIds = new Set(layoutModel.placedTables.map((t) => t.id));
    const visibleMergeIds = new Set(layoutModel.mergeBboxes.map((b) => b.groupId));
    if (tableId && !placedIds.has(tableId)) {
      onChange({ tableId: null, mergeGroupId: null });
      return;
    }
    if (mergeGroupId && !visibleMergeIds.has(mergeGroupId)) {
      onChange({ mergeGroupId: null });
    }
  }, [layoutModel, mergeGroupId, onChange, tableId]);

  const selectionLabel = useMemo(() => {
    if (!areaId) {
      return "Chưa chọn khu vực";
    }
    const areaName = selectedArea?.name ?? "—";
    if (mergeGroupId) {
      const group = mergeGroups.find((g) => g.id === mergeGroupId);
      return `${areaName} · ${group?.mergedName ?? "Cụm gộp"}`;
    }
    if (tableId) {
      const table = tables.find((t) => t.id === tableId);
      return `${areaName} · ${table?.name ?? "Bàn"}`;
    }
    return `${areaName} · Chưa chọn bàn`;
  }, [areaId, mergeGroupId, mergeGroups, selectedArea?.name, tableId, tables]);

  const handleSelectArea = useCallback(
    (value: string) => {
      onChange({
        areaId: value,
        tableId: null,
        mergeGroupId: null,
      });
    },
    [onChange]
  );

  const handleClearTableSelection = useCallback(() => {
    if (mode === "create" || mode === "edit") {
      onChange({
        areaId: null,
        tableId: null,
        mergeGroupId: null,
      });
      return;
    }
    onChange({
      tableId: null,
      mergeGroupId: null,
    });
  }, [mode, onChange]);

  const canClearTableSelection =
    mode === "create" || mode === "edit"
      ? Boolean(areaId || tableId || mergeGroupId)
      : Boolean(tableId || mergeGroupId);

  const handleSelectTable = useCallback(
    (id: string, nextAreaId: string) => {
      onChange({
        areaId: nextAreaId,
        tableId: id,
        mergeGroupId: null,
      });
    },
    [onChange]
  );

  const handleSelectMergeGroup = useCallback(
    (id: string, nextAreaId: string) => {
      onChange({
        areaId: nextAreaId,
        tableId: null,
        mergeGroupId: id,
      });
    },
    [onChange]
  );

  return (
    <Stack gap="sm">
      {readOnly ? (
        <Text size="sm" fw={600}>
          Khu vực &amp; bàn
        </Text>
      ) : (
        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
          <Text size="sm" fw={600}>
            Khu vực &amp; bàn
          </Text>
          <Button
            variant="subtle"
            size="compact-sm"
            disabled={disabled || !canClearTableSelection}
            onClick={handleClearTableSelection}
          >
            Bỏ chọn bàn
          </Button>
        </Group>
      )}
      {branchAreas.length === 0 ? (
        <Text size="sm" c="dimmed">
          Chi nhánh này chưa có khu vực.
        </Text>
      ) : (
        <>
          <FilterChipScroll>
            <Group gap="xs" wrap="nowrap" role="radiogroup" aria-label="Chọn khu vực">
              {branchAreas.map((area) => {
                const selected = areaId === area.id;
                return (
                  <Button
                    key={area.id}
                    size={areaChipSize}
                    radius="xl"
                    variant={selected ? "filled" : "outline"}
                    color="gray"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled || (!readOnly && branchAreas.length <= 1)}
                    onClick={() => handleSelectArea(area.id)}
                    styles={{
                      root: selected
                        ? {
                            borderWidth: 2,
                            borderStyle: "solid",
                            borderColor: "var(--mantine-color-gray-7)",
                          }
                        : undefined,
                    }}
                  >
                    {area.name}
                  </Button>
                );
              })}
            </Group>
          </FilterChipScroll>
          {areaId ? (
            layoutLoading || !layoutModel ? (
              <Text size="sm" c="dimmed">
                Đang tải sơ đồ khu…
              </Text>
            ) : (
              <>
                <Group gap="xs" wrap="wrap" justify={readOnly ? "flex-start" : "space-between"} align="center">
                  <Group gap="xs" wrap="wrap">
                    {(["available", "hold", "occupied", "locked"] as const).map((status) => (
                      <Badge
                        key={status}
                        variant="light"
                        color={tableStatusColor[status]}
                        size="sm"
                      >
                        {tableStatusLabel[status]}
                      </Badge>
                    ))}
                  </Group>
                  {readOnly ? null : (
                    <Text size="sm">
                      Đã chọn: <strong>{selectionLabel}</strong>
                    </Text>
                  )}
                </Group>
                <BookingTablePickerMap
                  layout={layoutModel}
                  mergeStatusById={mergeStatusById}
                  areaId={areaId}
                  tableId={tableId}
                  mergeGroupId={mergeGroupId}
                  disabled={disabled}
                  readOnly={readOnly}
                  selectableTableIds={selectableTableIds}
                  selectableMergeGroupIds={selectableMergeGroupIds}
                  highlightTableId={highlightTableId}
                  onSelectTable={handleSelectTable}
                  onSelectMergeGroup={handleSelectMergeGroup}
                />
              </>
            )
          ) : (
            <Text size="sm" c="dimmed">
              Chọn khu vực để mở sơ đồ bàn.
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}
