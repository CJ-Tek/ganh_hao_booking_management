"use client";

import dayjs from "dayjs";
import { Badge, Button, Card, Group, Select, Stack, Text } from "@mantine/core";
import { type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useMemo, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { useAppContext } from "@/contexts/app-context";
import { type BookingWaitlistEntry, type WaitlistStatus } from "@/lib/types";

const waitlistStatusLabel: Record<WaitlistStatus, string> = {
  waiting: "Đang chờ",
  offered: "Được mời xác nhận",
  expired: "Hết hạn",
  cancelled: "Đã hủy",
  promoted: "Đã xác nhận",
};

const waitlistStatusColor: Record<WaitlistStatus, string> = {
  waiting: "orange",
  offered: "cyan",
  expired: "gray",
  cancelled: "red",
  promoted: "green",
};

const waitlistStatusFilterData = (
  ["waiting", "offered", "expired", "cancelled", "promoted"] as const
).map((status) => ({
  value: status,
  label: waitlistStatusLabel[status],
}));

export function TableBlockWaitlistTable(props: {
  records: BookingWaitlistEntry[];
  isEmployee: boolean;
  confirmLoadingId: string | null;
  onConfirmOffer: (entryId: string) => void;
}) {
  const { records, isEmployee, confirmLoadingId, onConfirmOffer } = props;
  const { state } = useAppContext();
  const [statusFilter, setStatusFilter] = useState<WaitlistStatus | null>(null);

  const filteredRecords = useMemo(
    () => (statusFilter ? records.filter((entry) => entry.status === statusFilter) : records),
    [records, statusFilter]
  );

  const getRecordSearchValue = useCallback(
    (entry: BookingWaitlistEntry) => {
      const customer = state.customers.find((item) => item.id === entry.customerId);
      return [
        entry.position,
        dayjs(entry.desiredStartTime).format("HH:mm"),
        dayjs(entry.desiredEndTime).format("HH:mm"),
        customer?.fullName,
        entry.partySize,
        waitlistStatusLabel[entry.status],
        entry.offerExpiresAt
          ? dayjs(entry.offerExpiresAt).format("HH:mm DD/MM/YYYY")
          : null,
      ]
        .filter(Boolean)
        .join(" ");
    },
    [state.customers]
  );

  const sortRecords = useCallback(
    (rows: BookingWaitlistEntry[], sortStatus: DataTableSortStatus<BookingWaitlistEntry>) => {
      const getValue = (entry: BookingWaitlistEntry) => {
        if (sortStatus.columnAccessor === "position") {
          return entry.position;
        }
        if (sortStatus.columnAccessor === "timeSlot") {
          return dayjs(entry.desiredStartTime).valueOf();
        }
        if (sortStatus.columnAccessor === "customerId") {
          return state.customers.find((item) => item.id === entry.customerId)?.fullName ?? "";
        }
        if (sortStatus.columnAccessor === "partySize") {
          return entry.partySize;
        }
        if (sortStatus.columnAccessor === "status") {
          return waitlistStatusLabel[entry.status];
        }
        return entry.position;
      };
      return [...rows].sort((left, right) => {
        const leftValue = getValue(left);
        const rightValue = getValue(right);
        const compare =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue), "vi");
        return sortStatus.direction === "asc" ? compare : -compare;
      });
    },
    [state.customers]
  );

  return (
    <PortalDataTable<BookingWaitlistEntry>
      records={filteredRecords}
      idAccessor="id"
      getRecordSearchValue={getRecordSearchValue}
      sortRecords={sortRecords}
      defaultSort={{ columnAccessor: "position", direction: "asc" }}
      searchPlaceholder="Khách, khung giờ, trạng thái..."
      noRecordsText="Không có khách trong hàng chờ."
      minHeight={220}
      defaultRecordsPerPage={8}
      filters={
        <Select
          label="Trạng thái"
          placeholder="Tất cả"
          clearable
          data={waitlistStatusFilterData}
          value={statusFilter}
          onChange={(value) => setStatusFilter((value as WaitlistStatus | null) ?? null)}
          size="sm"
          w={200}
          miw={200}
        />
      }
      mobileCardRender={(entry) => {
        const customer = state.customers.find((item) => item.id === entry.customerId);
        return (
          <Card key={entry.id} withBorder radius="md" padding="md">
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Text fw={700} lineClamp={2}>
                  #{entry.position} · {customer?.fullName ?? "—"}
                </Text>
                <Badge color={waitlistStatusColor[entry.status]} variant="light" size="sm">
                  {waitlistStatusLabel[entry.status]}
                </Badge>
              </Group>
              <Text size="sm">
                {dayjs(entry.desiredStartTime).format("HH:mm")} –{" "}
                {dayjs(entry.desiredEndTime).format("HH:mm")}
              </Text>
              <Text size="xs" c="dimmed">
                {entry.partySize} khách
              </Text>
              {entry.status === "offered" && entry.offerExpiresAt ? (
                <Text size="xs" c="dimmed">
                  Hết hạn: {dayjs(entry.offerExpiresAt).format("HH:mm DD/MM/YYYY")}
                </Text>
              ) : null}
              {!isEmployee && entry.status === "offered" ? (
                <Button
                  size="compact-sm"
                  variant="filled"
                  color="green"
                  loading={confirmLoadingId === entry.id}
                  onClick={() => onConfirmOffer(entry.id)}
                >
                  Xác nhận
                </Button>
              ) : null}
            </Stack>
          </Card>
        );
      }}
      columns={[
        {
          accessor: "position",
          title: "#",
          sortable: true,
          width: 56,
        },
        {
          accessor: "timeSlot",
          title: "Khung giờ",
          sortable: true,
          render: (entry) => (
            <Text size="sm">
              {dayjs(entry.desiredStartTime).format("HH:mm")} –{" "}
              {dayjs(entry.desiredEndTime).format("HH:mm")}
            </Text>
          ),
        },
        {
          accessor: "customerId",
          title: "Khách",
          sortable: true,
          render: (entry) =>
            state.customers.find((item) => item.id === entry.customerId)?.fullName ?? "—",
        },
        {
          accessor: "partySize",
          title: "Số khách",
          sortable: true,
        },
        {
          accessor: "status",
          title: "Trạng thái",
          sortable: true,
          render: (entry) => (
            <Stack gap={2}>
              <Badge color={waitlistStatusColor[entry.status]} variant="light" size="sm" w="fit-content">
                {waitlistStatusLabel[entry.status]}
              </Badge>
              {entry.status === "offered" && entry.offerExpiresAt ? (
                <Text size="xs" c="dimmed">
                  Hết hạn: {dayjs(entry.offerExpiresAt).format("HH:mm DD/MM/YYYY")}
                </Text>
              ) : null}
            </Stack>
          ),
        },
        ...(!isEmployee
          ? [
              {
                accessor: "actions" as const,
                title: "Thao tác",
                render: (entry: BookingWaitlistEntry) =>
                  entry.status === "offered" ? (
                    <Button
                      size="compact-xs"
                      variant="filled"
                      color="green"
                      loading={confirmLoadingId === entry.id}
                      onClick={() => onConfirmOffer(entry.id)}
                    >
                      Xác nhận
                    </Button>
                  ) : (
                    <Text size="xs" c="dimmed">
                      —
                    </Text>
                  ),
              },
            ]
          : []),
      ]}
    />
  );
}
