"use client";

import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useMemo, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalSectionCard } from "@/components/portal-page";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { bookingCardBusyProps } from "@/lib/busy-row-style";
import { formatNotificationTime } from "@/lib/format-notification-time";
import { formatMergeGroupDateRange } from "@/lib/merge-group-utils";
import { type Booking, type DiningTable, type TableMergeGroup } from "@/lib/types";

export interface MergeGroupsPanelProps {
  mergeGroups: TableMergeGroup[];
  tables: DiningTable[];
  areas: { id: string; name: string; branchId: string }[];
  branches: { id: string; name: string }[];
  bookings: Booking[];
  filteredBranchIds: string[];
  busyGroupId: string | null;
  onRequestRelease: (groupId: string) => void;
  /** Jump to this merge group (e.g. set floor-map date and focus group). */
  onRowSelect?: (group: TableMergeGroup) => void;
  /** Pre-select area filter (e.g. current floor-map area). */
  initialAreaFilter?: string | null;
  /** Omit outer section card when embedded in a modal. */
  embedded?: boolean;
}

export function MergeGroupsPanel({
  mergeGroups,
  tables,
  areas,
  branches,
  bookings,
  filteredBranchIds,
  busyGroupId,
  onRequestRelease,
  onRowSelect,
  initialAreaFilter = null,
  embedded = false,
}: MergeGroupsPanelProps) {
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<string | null>(initialAreaFilter);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<TableMergeGroup>>({
    columnAccessor: "mergedName",
    direction: "asc",
  });

  const tableNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const table of tables) {
      map.set(table.id, table.name);
    }
    return map;
  }, [tables]);
  const areaNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const area of areas) {
      map.set(area.id, area.name);
    }
    return map;
  }, [areas]);
  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branches) {
      map.set(branch.id, branch.name);
    }
    return map;
  }, [branches]);
  const activeBookingCountByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const booking of bookings) {
      if (
        booking.mergeGroupId &&
        !["completed", "cancelled", "no_show"].includes(booking.status)
      ) {
        map.set(booking.mergeGroupId, (map.get(booking.mergeGroupId) ?? 0) + 1);
      }
    }
    return map;
  }, [bookings]);

  const visibleGroups = useMemo(
    () =>
      mergeGroups.filter(
        (group) =>
          group.status === "active" &&
          filteredBranchIds.includes(group.branchId) &&
          (!areaFilter || group.areaId === areaFilter)
      ),
    [areaFilter, filteredBranchIds, mergeGroups]
  );

  const areaOptions = useMemo(
    () =>
      areas
        .filter((area) => filteredBranchIds.includes(area.branchId))
        .map((area) => ({ value: area.id, label: area.name })),
    [areas, filteredBranchIds]
  );

  const searchedGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return visibleGroups;
    }
    return visibleGroups.filter((group) => {
      const memberLabel = group.tableIds
        .map((id) => tableNameById.get(id) ?? "")
        .join(" ")
        .toLowerCase();
      const dateLabel = formatMergeGroupDateRange(group.startDate, group.endDate).toLowerCase();
      return (
        group.mergedName.toLowerCase().includes(keyword) ||
        (areaNameById.get(group.areaId) ?? "").toLowerCase().includes(keyword) ||
        (branchNameById.get(group.branchId) ?? "").toLowerCase().includes(keyword) ||
        memberLabel.includes(keyword) ||
        dateLabel.includes(keyword)
      );
    });
  }, [areaNameById, branchNameById, search, tableNameById, visibleGroups]);

  const sortGroups = useCallback(
    (records: TableMergeGroup[], status: DataTableSortStatus<TableMergeGroup>) => {
      const getValue = (group: TableMergeGroup): string | number => {
        if (status.columnAccessor === "areaId") {
          return areaNameById.get(group.areaId) ?? "";
        }
        if (status.columnAccessor === "memberCount") {
          return group.tableIds.length;
        }
        if (status.columnAccessor === "activeBookings") {
          return activeBookingCountByGroup.get(group.id) ?? 0;
        }
        if (status.columnAccessor === "startDate") {
          return group.startDate;
        }
        return group.mergedName;
      };
      return [...records].sort((a, b) => {
        const left = getValue(a);
        const right = getValue(b);
        const compare =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "vi");
        return status.direction === "asc" ? compare : -compare;
      });
    },
    [activeBookingCountByGroup, areaNameById]
  );

  const filters = (
    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" mb="md">
      <TextInputWithVoice
        label="Tìm cụm gộp"
        placeholder="Tên cụm, khu vực, bàn thành viên..."
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      <Select
        label="Khu vực"
        placeholder="Tất cả"
        data={areaOptions}
        value={areaFilter}
        onChange={setAreaFilter}
        clearable
      />
    </SimpleGrid>
  );

  const table = (
    <PortalDataTable<TableMergeGroup>
      records={searchedGroups}
      hideSearch
      withToolbar={false}
      pinLastColumn
      onRowClick={
        onRowSelect
          ? ({ record }) => {
              onRowSelect(record);
            }
          : undefined
      }
      rowStyle={
        onRowSelect
          ? () => ({
              cursor: "pointer",
            })
          : undefined
      }
      sortRecords={sortGroups}
      sortStatus={sortStatus}
      onSortStatusChange={setSortStatus}
      idAccessor="id"
      minHeight={embedded ? 200 : 260}
      noRecordsText="Chưa có cụm gộp nào trong phạm vi đang chọn."
      mobileCardRender={(group) => {
        const cardBusy = bookingCardBusyProps(busyGroupId === group.id);
        const memberNames = group.tableIds
          .map((id) => tableNameById.get(id) ?? "—")
          .join(" + ");
        return (
          <Card
            key={group.id}
            withBorder
            radius="md"
            padding="md"
            className={cardBusy.className}
            style={{
              ...cardBusy.style,
              ...(onRowSelect ? { cursor: "pointer" } : undefined),
            }}
            onClick={onRowSelect ? () => onRowSelect(group) : undefined}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={800} size="lg">
                    {group.mergedName}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {branchNameById.get(group.branchId) ?? "—"} · {areaNameById.get(group.areaId) ?? "—"}
                  </Text>
                </div>
                <Badge color="blue" variant="light" size="lg">
                  Đang gộp
                </Badge>
              </Group>
              <Text size="sm">
                {formatMergeGroupDateRange(group.startDate, group.endDate)}
              </Text>
              <Text size="xs" c="dimmed">
                Gộp lúc {formatNotificationTime(group.createdAt)}
              </Text>
              <Text size="sm">
                {group.tableIds.length} bàn ·{" "}
                {activeBookingCountByGroup.get(group.id) ?? 0} booking đang giữ
              </Text>
              <Text size="xs" c="dimmed" lineClamp={3}>
                {memberNames}
              </Text>
              <Button
                color="red"
                variant="light"
                size="compact-sm"
                loading={busyGroupId === group.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestRelease(group.id);
                }}
              >
                Bỏ gộp
              </Button>
            </Stack>
          </Card>
        );
      }}
      columns={[
        {
          accessor: "mergedName",
          title: "Tên cụm",
          sortable: true,
          render: (group) => (
            <Stack gap={2}>
              <Text fw={600} size="sm">
                {group.mergedName}
              </Text>
              <Text size="xs" c="dimmed">
                {branchNameById.get(group.branchId) ?? "—"}
              </Text>
            </Stack>
          ),
        },
        {
          accessor: "areaId",
          title: "Khu vực",
          sortable: true,
          render: (group) => areaNameById.get(group.areaId) ?? "—",
        },
        {
          accessor: "memberCount",
          title: "Bàn thành viên",
          sortable: true,
          render: (group) => (
            <Stack gap={2}>
              <Text size="sm">{group.tableIds.length} bàn</Text>
              <Text size="xs" c="dimmed" lineClamp={2}>
                {group.tableIds.map((id) => tableNameById.get(id) ?? "—").join(" + ")}
              </Text>
            </Stack>
          ),
        },
        {
          accessor: "startDate",
          title: "Thời gian gộp",
          sortable: true,
          render: (group) => (
            <Stack gap={2}>
              <Text size="sm">
                {formatMergeGroupDateRange(group.startDate, group.endDate)}
              </Text>
              <Text size="xs" c="dimmed">
                Gộp lúc {formatNotificationTime(group.createdAt)}
              </Text>
            </Stack>
          ),
        },
        {
          accessor: "activeBookings",
          title: "Booking đang giữ",
          sortable: true,
          render: (group) => activeBookingCountByGroup.get(group.id) ?? 0,
        },
        {
          accessor: "status",
          title: "Trạng thái",
          width: 112,
          noWrap: true,
          textAlign: "center",
          render: () => (
            <Badge color="blue" variant="light" style={{ whiteSpace: "nowrap" }}>
              Đang gộp
            </Badge>
          ),
        },
        {
          accessor: "actions",
          title: "",
          width: 100,
          noWrap: true,
          textAlign: "center",
          render: (group) => (
            <Button
              color="red"
              variant="light"
              size="compact-sm"
              loading={busyGroupId === group.id}
              onClick={(event) => {
                event.stopPropagation();
                onRequestRelease(group.id);
              }}
              style={{ whiteSpace: "nowrap" }}
            >
              Bỏ gộp
            </Button>
          ),
        },
      ]}
    />
  );

  if (embedded) {
    return (
      <Stack gap="sm">
        {filters}
        {table}
      </Stack>
    );
  }

  return (
    <Stack>
      <PortalSectionCard>
        {filters}
        {table}
      </PortalSectionCard>
    </Stack>
  );
}
