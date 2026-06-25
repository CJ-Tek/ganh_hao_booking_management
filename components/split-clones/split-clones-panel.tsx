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
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import {
  formatSplitCloneDateRange,
  getSplitCloneLifecycleStatus,
  isSplitCloneExpired,
  isSplitCloneTable,
  type SplitCloneLifecycle,
} from "@/lib/table-split-clone-utils";
import { type Booking, type DiningTable } from "@/lib/types";

const SPLIT_CLONE_LIFECYCLE_LABEL: Record<Exclude<SplitCloneLifecycle, "expired">, string> = {
  scheduled: "Chưa đến",
  active: "Đang tách",
};

const SPLIT_CLONE_LIFECYCLE_COLOR: Record<Exclude<SplitCloneLifecycle, "expired">, string> = {
  scheduled: "yellow",
  active: "teal",
};

export interface SplitClonesPanelProps {
  tables: DiningTable[];
  areas: { id: string; name: string; branchId: string }[];
  branches: { id: string; name: string }[];
  bookings: Booking[];
  filteredBranchIds: string[];
  busyCloneId: string | null;
  onRequestDelete: (cloneId: string) => void;
  /** Jump to this clone on Sơ đồ (set date + area). */
  onRowSelect?: (clone: DiningTable) => void;
  initialAreaFilter?: string | null;
  embedded?: boolean;
  /** Hide delete actions (view-only branch). */
  readOnly?: boolean;
}

export function SplitClonesPanel({
  tables,
  areas,
  branches,
  bookings,
  filteredBranchIds,
  busyCloneId,
  onRequestDelete,
  onRowSelect,
  initialAreaFilter = null,
  embedded = false,
  readOnly = false,
}: SplitClonesPanelProps) {
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<string | null>(initialAreaFilter);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<DiningTable>>({
    columnAccessor: "name",
    direction: "asc",
  });

  const sourceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const table of tables) {
      if (!isSplitCloneTable(table)) {
        map.set(table.id, table.name);
      }
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

  const activeBookingCountByTable = useMemo(() => {
    const map = new Map<string, number>();
    for (const booking of bookings) {
      if (
        booking.tableId &&
        !["completed", "cancelled", "no_show", "late"].includes(booking.status)
      ) {
        map.set(booking.tableId, (map.get(booking.tableId) ?? 0) + 1);
      }
    }
    return map;
  }, [bookings]);

  const cloneTables = useMemo(
    () =>
      tables.filter(
        (table) =>
          isSplitCloneTable(table) &&
          !isSplitCloneExpired(table) &&
          filteredBranchIds.includes(table.branchId) &&
          (!areaFilter || table.areaId === areaFilter)
      ),
    [areaFilter, filteredBranchIds, tables]
  );

  const areaOptions = useMemo(
    () =>
      areas
        .filter((area) => filteredBranchIds.includes(area.branchId))
        .map((area) => ({ value: area.id, label: area.name })),
    [areas, filteredBranchIds]
  );

  const searchedClones = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return cloneTables;
    }
    return cloneTables.filter((clone) => {
      const sourceName =
        (clone.splitSourceTableId
          ? sourceNameById.get(clone.splitSourceTableId)
          : null) ?? "";
      const dateLabel =
        clone.splitStartDate && clone.splitEndDate
          ? formatSplitCloneDateRange(clone.splitStartDate, clone.splitEndDate).toLowerCase()
          : "";
      return (
        clone.name.toLowerCase().includes(keyword) ||
        sourceName.toLowerCase().includes(keyword) ||
        (areaNameById.get(clone.areaId) ?? "").toLowerCase().includes(keyword) ||
        (branchNameById.get(clone.branchId) ?? "").toLowerCase().includes(keyword) ||
        dateLabel.includes(keyword)
      );
    });
  }, [areaNameById, branchNameById, cloneTables, search, sourceNameById]);

  const sortClones = useCallback(
    (records: DiningTable[], status: DataTableSortStatus<DiningTable>) => {
      const getValue = (clone: DiningTable): string | number => {
        if (status.columnAccessor === "sourceTableId") {
          return clone.splitSourceTableId
            ? (sourceNameById.get(clone.splitSourceTableId) ?? "")
            : "";
        }
        if (status.columnAccessor === "areaId") {
          return areaNameById.get(clone.areaId) ?? "";
        }
        if (status.columnAccessor === "splitStartDate") {
          return clone.splitStartDate ?? "";
        }
        if (status.columnAccessor === "activeBookings") {
          return activeBookingCountByTable.get(clone.id) ?? 0;
        }
        if (status.columnAccessor === "lifecycle") {
          return getSplitCloneLifecycleStatus(clone);
        }
        if (status.columnAccessor === "status") {
          return clone.status;
        }
        return clone.name;
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
    [activeBookingCountByTable, areaNameById, sourceNameById]
  );

  const filters = (
    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" mb="md">
      <TextInputWithVoice
        label="Tìm bàn tách"
        placeholder="Tên bàn tách, bàn gốc, khu vực..."
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
    <PortalDataTable<DiningTable>
      records={searchedClones}
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
      sortRecords={sortClones}
      sortStatus={sortStatus}
      onSortStatusChange={setSortStatus}
      idAccessor="id"
      minHeight={embedded ? 200 : 260}
      noRecordsText="Chưa có bàn tách nào trong phạm vi đang chọn."
      mobileCardRender={(clone) => {
        const cardBusy = bookingCardBusyProps(busyCloneId === clone.id);
        const lifecycle = getSplitCloneLifecycleStatus(clone) as Exclude<
          SplitCloneLifecycle,
          "expired"
        >;
        const sourceName = clone.splitSourceTableId
          ? (sourceNameById.get(clone.splitSourceTableId) ?? "—")
          : "—";
        return (
          <Card
            key={clone.id}
            withBorder
            radius="md"
            padding="md"
            className={cardBusy.className}
            style={{
              ...cardBusy.style,
              ...(onRowSelect ? { cursor: "pointer" } : undefined),
            }}
            onClick={onRowSelect ? () => onRowSelect(clone) : undefined}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={800} size="lg">
                    {clone.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {branchNameById.get(clone.branchId) ?? "—"} ·{" "}
                    {areaNameById.get(clone.areaId) ?? "—"}
                  </Text>
                </div>
                <Badge
                  color={SPLIT_CLONE_LIFECYCLE_COLOR[lifecycle]}
                  variant="light"
                  size="lg"
                >
                  {SPLIT_CLONE_LIFECYCLE_LABEL[lifecycle]}
                </Badge>
              </Group>
              <Text size="sm">
                Bàn gốc: <Text component="span" fw={600}>{sourceName}</Text>
              </Text>
              {clone.splitStartDate && clone.splitEndDate ? (
                <Text size="sm">
                  {formatSplitCloneDateRange(clone.splitStartDate, clone.splitEndDate)}
                </Text>
              ) : null}
              <Group gap="xs">
                <Badge color={tableStatusColor[clone.status]} variant="light" size="sm">
                  {tableStatusLabel[clone.status]}
                </Badge>
                <Text size="sm">
                  {activeBookingCountByTable.get(clone.id) ?? 0} booking đang giữ
                </Text>
              </Group>
              {!readOnly ? (
              <Button
                color="red"
                variant="light"
                size="compact-sm"
                loading={busyCloneId === clone.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestDelete(clone.id);
                }}
              >
                Xóa tách
              </Button>
              ) : null}
            </Stack>
          </Card>
        );
      }}
      columns={[
        {
          accessor: "name",
          title: "Bàn tách",
          sortable: true,
          render: (clone) => (
            <Stack gap={2}>
              <Text fw={600} size="sm">
                {clone.name}
              </Text>
              <Text size="xs" c="dimmed">
                {branchNameById.get(clone.branchId) ?? "—"}
              </Text>
            </Stack>
          ),
        },
        {
          accessor: "sourceTableId",
          title: "Bàn gốc",
          sortable: true,
          render: (clone) =>
            clone.splitSourceTableId
              ? (sourceNameById.get(clone.splitSourceTableId) ?? "—")
              : "—",
        },
        {
          accessor: "areaId",
          title: "Khu vực",
          sortable: true,
          render: (clone) => areaNameById.get(clone.areaId) ?? "—",
        },
        {
          accessor: "splitStartDate",
          title: "Thời gian hiển thị",
          sortable: true,
          render: (clone) =>
            clone.splitStartDate && clone.splitEndDate ? (
              <Text size="sm">
                {formatSplitCloneDateRange(clone.splitStartDate, clone.splitEndDate)}
              </Text>
            ) : (
              "—"
            ),
        },
        {
          accessor: "activeBookings",
          title: "Booking đang giữ",
          sortable: true,
          render: (clone) => activeBookingCountByTable.get(clone.id) ?? 0,
        },
        {
          accessor: "status",
          title: "Trạng thái bàn",
          sortable: true,
          render: (clone) => (
            <Badge color={tableStatusColor[clone.status]} variant="light">
              {tableStatusLabel[clone.status]}
            </Badge>
          ),
        },
        {
          accessor: "lifecycle",
          title: "Kỳ tách",
          sortable: true,
          render: (clone) => {
            const lifecycle = getSplitCloneLifecycleStatus(clone);
            if (lifecycle === "expired") {
              return null;
            }
            return (
              <Badge color={SPLIT_CLONE_LIFECYCLE_COLOR[lifecycle]} variant="light">
                {SPLIT_CLONE_LIFECYCLE_LABEL[lifecycle]}
              </Badge>
            );
          },
        },
        ...(readOnly
          ? []
          : [
              {
                accessor: "actions",
                title: "",
                width: 116,
                noWrap: true,
                textAlign: "center" as const,
                render: (clone: DiningTable) => (
                  <Button
                    color="red"
                    variant="light"
                    size="compact-sm"
                    loading={busyCloneId === clone.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestDelete(clone.id);
                    }}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Xóa tách
                  </Button>
                ),
              },
            ]),
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
