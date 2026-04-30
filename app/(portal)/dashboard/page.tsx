"use client";

import dayjs from "dayjs";
import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  RingProgress,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel, tableStatusLabel } from "@/lib/display";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking } from "@/lib/types";

export default function DashboardPage() {
  const { state, filteredBranchIds } = useAppContext();
  const isCompact = usePortalCompact();
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "bookingAt",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const branchBookings = useMemo(
    () => state.bookings.filter((item) => filteredBranchIds.includes(item.branchId)),
    [filteredBranchIds, state.bookings]
  );
  const branchTables = useMemo(
    () => state.tables.filter((item) => filteredBranchIds.includes(item.branchId)),
    [filteredBranchIds, state.tables]
  );
  const checkedInCount = branchBookings.filter((item) => item.status === "checked_in").length;
  const branchNames = state.branches
    .filter((branch) => filteredBranchIds.includes(branch.id))
    .map((branch) => branch.name);

  const statusCounts = {
    hold: branchTables.filter((table) => table.status === "hold").length,
    occupied: branchTables.filter((table) => table.status === "occupied").length,
    available: branchTables.filter((table) => table.status === "available").length,
    locked: branchTables.filter((table) => table.status === "locked").length,
  };

  const sortedHistoryBookings = useMemo(() => {
    const getValue = (booking: Booking) => {
      const acc = sortStatus.columnAccessor as string;
      if (acc === "customerId") {
        return state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
      }
      if (acc === "guestCount") {
        return booking.guestCount;
      }
      if (acc === "areaTable") {
        const areaName = state.areas.find((item) => item.id === booking.areaId)?.name ?? "";
        const tableName = state.tables.find((item) => item.id === booking.tableId)?.name ?? "";
        return `${areaName} ${tableName}`;
      }
      if (acc === "note") {
        return booking.note ?? "";
      }
      if (acc === "createdByUserId") {
        return state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "";
      }
      if (acc === "status") {
        return bookingStatusLabel[booking.status];
      }
      return dayjs(booking.bookingAt).valueOf();
    };
    return [...branchBookings].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);
      const compare = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "vi");
      return sortStatus.direction === "asc" ? compare : -compare;
    });
  }, [
    branchBookings,
    sortStatus,
    state.areas,
    state.customers,
    state.tables,
    state.users,
  ]);

  const pagedHistoryBookings = useMemo(
    () => {
      const totalPages = Math.max(1, Math.ceil(sortedHistoryBookings.length / pageSize));
      const currentPage = Math.min(page, totalPages);
      return sortedHistoryBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    },
    [page, pageSize, sortedHistoryBookings]
  );

  const historyTotalPages = Math.max(1, Math.ceil(sortedHistoryBookings.length / pageSize));

  const statGrid = (
    <SimpleGrid cols={{ base: 2, sm: 2, lg: 4 }} spacing={isCompact ? "sm" : "md"}>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed">
          Tổng booking
        </Text>
        <Title order={2}>{branchBookings.length}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed">
          Đã check-in
        </Text>
        <Title order={2}>{checkedInCount}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed">
          Bàn phục vụ
        </Text>
        <Title order={2}>{statusCounts.occupied}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed">
          Bàn trống
        </Text>
        <Title order={2}>{statusCounts.available}</Title>
      </PortalSectionCard>
    </SimpleGrid>
  );

  const ringStatusSection = (
    <PortalSectionCard h="100%" padding={isCompact ? "sm" : "md"}>
      <Text fw={600} size={isCompact ? "sm" : "md"}>
        Bàn theo trạng thái
      </Text>
      <Group mt="md" justify="center">
        <RingProgress
          size={isCompact ? 140 : 180}
          thickness={isCompact ? 14 : 16}
          sections={[
            {
              value:
                branchTables.length === 0 ? 0 : (statusCounts.occupied / branchTables.length) * 100,
              color: "brand",
            },
          ]}
          label={
            <Text ta="center" fw={700} size={isCompact ? "md" : "lg"}>
              {statusCounts.occupied}/{branchTables.length}
            </Text>
          }
        />
      </Group>
      <Stack mt="md" gap={6}>
        {Object.entries(statusCounts).map(([status, value]) => (
          <Group key={status} justify="space-between">
            <Text size="sm">{tableStatusLabel[status as keyof typeof statusCounts]}</Text>
            <Badge variant="light">{value}</Badge>
          </Group>
        ))}
      </Stack>
    </PortalSectionCard>
  );

  const recentBookingsSection = (
    <PortalSectionCard padding={isCompact ? "sm" : "md"}>
      <Text fw={600} mb="sm" size={isCompact ? "sm" : "md"}>
        Booking gần đây
      </Text>
      {isCompact ? (
        <Stack gap="sm">
          {pagedHistoryBookings.length === 0 ? (
            <Text c="dimmed" size="sm">
              Chưa có booking nào.
            </Text>
          ) : (
            pagedHistoryBookings.map((booking) => {
              const customer =
                state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—";
              const phone =
                state.customers.find((item) => item.id === booking.customerId)?.phone ?? "—";
              const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "—";
              const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "—";
              const locationLine = `${area} · Bàn ${table}`;
              const creator =
                state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
                "Không rõ";
              return (
                <Card key={booking.id} withBorder radius="md" padding="sm">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Text fw={700} lineClamp={2}>
                        {customer}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {phone}
                      </Text>
                      <Text size="sm" fw={500}>
                        {dayjs(booking.bookingAt).format("HH:mm · DD/MM/YYYY")}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {locationLine}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {booking.guestCount} khách · {creator}
                      </Text>
                      {booking.note ? (
                        <Text size="xs" c="dimmed" lineClamp={3}>
                          {booking.note}
                        </Text>
                      ) : null}
                    </Stack>
                    <Badge color={bookingStatusColor[booking.status]} variant="light" size="lg">
                      {bookingStatusLabel[booking.status]}
                    </Badge>
                  </Group>
                </Card>
              );
            })
          )}
          {sortedHistoryBookings.length > pageSize ? (
            <Group justify="center" gap="xs">
              <Button
                variant="default"
                size="compact-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trước
              </Button>
              <Text size="sm" c="dimmed">
                {page}/{historyTotalPages}
              </Text>
              <Button
                variant="default"
                size="compact-sm"
                disabled={page >= historyTotalPages}
                onClick={() => setPage((p) => Math.min(historyTotalPages, p + 1))}
              >
                Sau
              </Button>
            </Group>
          ) : null}
        </Stack>
      ) : (
        <DataTable
          minHeight={260}
          scrollAreaProps={portalDataTableScrollAreaProps}
          withTableBorder
          records={pagedHistoryBookings}
          totalRecords={sortedHistoryBookings.length}
          recordsPerPage={pageSize}
          page={Math.min(page, historyTotalPages)}
          onPageChange={setPage}
          sortStatus={sortStatus}
          onSortStatusChange={(next) => {
            setSortStatus(next);
            setPage(1);
          }}
          noRecordsText="Chưa có booking nào."
          columns={[
            {
              accessor: "bookingAt",
              title: "Giờ đặt",
              sortable: true,
              render: (booking) => dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
            },
            {
              accessor: "customerId",
              title: "Khách",
              sortable: true,
              render: (booking) => {
                const c = state.customers.find((item) => item.id === booking.customerId);
                return (
                  <Stack gap={2}>
                    <Text size="sm">{c?.fullName ?? "—"}</Text>
                    <Text size="xs" c="dimmed">
                      {c?.phone ?? "—"}
                    </Text>
                  </Stack>
                );
              },
            },
            {
              accessor: "areaTable",
              title: "Khu vực / Bàn",
              sortable: true,
              render: (booking) => {
                const area = state.areas.find((item) => item.id === booking.areaId);
                const table = state.tables.find((item) => item.id === booking.tableId);
                return `${area?.name ?? "—"} · ${table?.name ?? "—"}`;
              },
            },
            {
              accessor: "guestCount",
              title: "Số khách",
              sortable: true,
            },
            {
              accessor: "createdByUserId",
              title: "Người tạo",
              sortable: true,
              render: (booking) =>
                state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
                "Không rõ",
            },
            {
              accessor: "note",
              title: "Ghi chú",
              sortable: true,
              render: (booking) =>
                booking.note ? (
                  <Text size="sm" lineClamp={2} maw={220}>
                    {booking.note}
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                ),
            },
            {
              accessor: "status",
              title: "Trạng thái",
              sortable: true,
              render: (booking) => (
                <Badge color={bookingStatusColor[booking.status]} variant="light">
                  {bookingStatusLabel[booking.status]}
                </Badge>
              ),
            },
          ]}
        />
      )}
    </PortalSectionCard>
  );

  return (
    <Stack gap="md">
      <div>
        <PortalPageTitle order={isCompact ? 3 : 2}>
          {isCompact ? "Tổng quan" : "Dashboard tổng quan"}
        </PortalPageTitle>
        <Text c="dimmed" size={isCompact ? "xs" : "sm"}>
          Chi nhánh: {branchNames.join(", ")}
        </Text>
      </div>

      {isCompact ? (
        <Tabs defaultValue="overview" keepMounted={false}>
          <Tabs.List grow>
            <Tabs.Tab value="overview">Tổng quan</Tabs.Tab>
            <Tabs.Tab value="recent">Booking gần đây</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="overview" pt="md">
            <Stack gap="md">
              {statGrid}
              {ringStatusSection}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="recent" pt="md">
            {recentBookingsSection}
          </Tabs.Panel>
        </Tabs>
      ) : (
        <>
          {statGrid}
          <Grid>
            <Grid.Col span={{ base: 12, lg: 4 }}>{ringStatusSection}</Grid.Col>
            <Grid.Col span={{ base: 12, lg: 8 }}>{recentBookingsSection}</Grid.Col>
          </Grid>
        </>
      )}
    </Stack>
  );
}
