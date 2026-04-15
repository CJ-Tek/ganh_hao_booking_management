"use client";

import dayjs from "dayjs";
import {
  Badge,
  Grid,
  Group,
  RingProgress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { bookingStatusLabel, tableStatusLabel } from "@/lib/display";
import { type Booking } from "@/lib/types";

export default function DashboardPage() {
  const { state, filteredBranchIds } = useAppContext();
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
    arriving: branchTables.filter((table) => table.status === "arriving").length,
    occupied: branchTables.filter((table) => table.status === "occupied").length,
    available: branchTables.filter((table) => table.status === "available").length,
  };

  const sortedHistoryBookings = useMemo(() => {
    const getValue = (booking: Booking) => {
      if (sortStatus.columnAccessor === "id") {
        return booking.id;
      }
      if (sortStatus.columnAccessor === "createdByUserId") {
        return state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "";
      }
      if (sortStatus.columnAccessor === "status") {
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
  }, [branchBookings, sortStatus, state.users]);

  const pagedHistoryBookings = useMemo(
    () => {
      const totalPages = Math.max(1, Math.ceil(sortedHistoryBookings.length / pageSize));
      const currentPage = Math.min(page, totalPages);
      return sortedHistoryBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    },
    [page, pageSize, sortedHistoryBookings]
  );

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <PortalPageTitle>Dashboard tổng quan</PortalPageTitle>
          <Text c="dimmed">Chi nhánh đang theo dõi: {branchNames.join(", ")}</Text>
        </div>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <PortalSectionCard>
          <Text size="sm" c="dimmed">
            Tổng booking
          </Text>
          <Title order={2}>{branchBookings.length}</Title>
        </PortalSectionCard>
        <PortalSectionCard>
          <Text size="sm" c="dimmed">
            Booking check-in
          </Text>
          <Title order={2}>{checkedInCount}</Title>
        </PortalSectionCard>
        <PortalSectionCard>
          <Text size="sm" c="dimmed">
            Bàn đang phục vụ
          </Text>
          <Title order={2}>{statusCounts.occupied}</Title>
        </PortalSectionCard>
        <PortalSectionCard>
          <Text size="sm" c="dimmed">
            Bàn trống
          </Text>
          <Title order={2}>{statusCounts.available}</Title>
        </PortalSectionCard>
      </SimpleGrid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <PortalSectionCard h="100%">
            <Text fw={600}>Tỷ lệ bàn có khách</Text>
            <Group mt="lg" justify="center">
              <RingProgress
                size={180}
                thickness={16}
                sections={[
                  {
                    value:
                      branchTables.length === 0
                        ? 0
                        : (statusCounts.occupied / branchTables.length) * 100,
                    color: "brand",
                  },
                ]}
                label={
                  <Text ta="center" fw={700} size="lg">
                    {statusCounts.occupied}/{branchTables.length}
                  </Text>
                }
              />
            </Group>
            <Stack mt="lg" gap={4}>
              {Object.entries(statusCounts).map(([status, value]) => (
                <Group key={status} justify="space-between">
                  <Text size="sm">{tableStatusLabel[status as keyof typeof statusCounts]}</Text>
                  <Badge variant="light">{value}</Badge>
                </Group>
              ))}
            </Stack>
          </PortalSectionCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <PortalSectionCard>
            <Text fw={600} mb="sm">
              Lịch sử booking theo nhân viên
            </Text>
            <DataTable
              minHeight={260}
              scrollAreaProps={portalDataTableScrollAreaProps}
              withTableBorder
              records={pagedHistoryBookings}
              totalRecords={sortedHistoryBookings.length}
              recordsPerPage={pageSize}
              page={Math.min(page, Math.max(1, Math.ceil(sortedHistoryBookings.length / pageSize)))}
              onPageChange={setPage}
              sortStatus={sortStatus}
              onSortStatusChange={(next) => {
                setSortStatus(next);
                setPage(1);
              }}
              noRecordsText="Chưa có booking nào."
              columns={[
                { accessor: "id", title: "Mã", sortable: true },
                {
                  accessor: "bookingAt",
                  title: "Giờ đặt",
                  sortable: true,
                  render: (booking) => dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
                },
                {
                  accessor: "createdByUserId",
                  title: "Người tạo",
                  sortable: true,
                  render: (booking) =>
                    state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "Không rõ",
                },
                {
                  accessor: "status",
                  title: "Trạng thái",
                  sortable: true,
                  render: (booking) => <Badge variant="light">{bookingStatusLabel[booking.status]}</Badge>,
                },
              ]}
            />
          </PortalSectionCard>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
