"use client";

import dayjs from "dayjs";
import {
  Badge,
  Grid,
  Group,
  RingProgress,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import { BookingListPaginationBar } from "@/components/booking-management/booking-list-pagination";
import { type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel, tableStatusLabel } from "@/lib/display";
import { bookingAreaTableSortKey, displayCustomerPhone, stripUnknownGuestTag } from "@/lib/booking-meta";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking } from "@/lib/types";

export default function DashboardPage() {
  const { state, filteredBranchIds, currentUser } = useAppContext();
  const router = useRouter();
  const isCompact = usePortalCompact();
  const isManager = currentUser?.role === "manager";
  const isEmployee = currentUser?.role === "employee";
  useEffect(() => {
    if (isManager) {
      router.replace("/bookings");
    }
  }, [isManager, router]);
  useEffect(() => {
    if (isEmployee) {
      router.replace("/floor-map");
    }
  }, [isEmployee, router]);
  const [mobilePage, setMobilePage] = useState(1);
  const [mobilePageSize, setMobilePageSize] = useState(8);
  const [mobileQuery, setMobileQuery] = useState("");

  const branchBookings = useMemo(
    () => state.bookings.filter((item) => filteredBranchIds.includes(item.branchId)),
    [filteredBranchIds, state.bookings]
  );
  const branchTables = useMemo(
    () => state.tables.filter((item) => filteredBranchIds.includes(item.branchId)),
    [filteredBranchIds, state.tables]
  );
  const bookingAreaTableLookup = useMemo(
    () => ({
      areas: state.areas,
      tables: state.tables,
      mergeGroups: state.mergeGroups,
    }),
    [state.areas, state.mergeGroups, state.tables]
  );
  const checkedInCount = branchBookings.filter(
    (item) => item.status === "checked_in" || item.status === "seated"
  ).length;
  const branchNames = state.branches
    .filter((branch) => filteredBranchIds.includes(branch.id))
    .map((branch) => branch.name);

  const statusCounts = {
    hold: branchTables.filter((table) => table.status === "hold").length,
    occupied: branchTables.filter((table) => table.status === "occupied").length,
    available: branchTables.filter((table) => table.status === "available").length,
    locked: branchTables.filter((table) => table.status === "locked").length,
  };

  const mobileFilteredBookings = useMemo(() => {
    const q = mobileQuery.trim().toLowerCase();
    if (!q) return branchBookings;
    return branchBookings.filter((booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const creator = state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "";
      return [
        customer?.fullName ?? "",
        displayCustomerPhone(customer?.phone),
        bookingAreaTableSortKey(booking, bookingAreaTableLookup),
        creator,
        bookingStatusLabel[booking.status],
        stripUnknownGuestTag(booking.note) ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [bookingAreaTableLookup, branchBookings, mobileQuery, state.customers, state.users]);

  const mobileSortedBookings = useMemo(
    () =>
      [...mobileFilteredBookings].sort(
        (a, b) => dayjs(b.bookingAt).valueOf() - dayjs(a.bookingAt).valueOf()
      ),
    [mobileFilteredBookings]
  );

  const mobileTotalPages = Math.max(1, Math.ceil(mobileSortedBookings.length / mobilePageSize));
  const mobilePageSafe = Math.min(mobilePage, mobileTotalPages);

  const pagedMobileBookings = useMemo(
    () =>
      mobileSortedBookings.slice(
        (mobilePageSafe - 1) * mobilePageSize,
        mobilePageSafe * mobilePageSize
      ),
    [mobilePageSafe, mobilePageSize, mobileSortedBookings]
  );

  const sortHistoryBookings = useCallback(
    (records: Booking[], sortStatus: DataTableSortStatus<Booking>) => {
      const getValue = (booking: Booking) => {
        const acc = sortStatus.columnAccessor as string;
        if (acc === "customerId") {
          return state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
        }
        if (acc === "guestCount") {
          return booking.guestCount;
        }
        if (acc === "areaTable") {
          return bookingAreaTableSortKey(booking, bookingAreaTableLookup);
        }
        if (acc === "note") {
          return stripUnknownGuestTag(booking.note) ?? "";
        }
        if (acc === "createdByUserId") {
          return state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "";
        }
        if (acc === "status") {
          return bookingStatusLabel[booking.status];
        }
        return dayjs(booking.bookingAt).valueOf();
      };
      return [...records].sort((a, b) => {
        const left = getValue(a);
        const right = getValue(b);
        const compare =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "vi");
        return sortStatus.direction === "asc" ? compare : -compare;
      });
    },
    [bookingAreaTableLookup, state.customers, state.users]
  );

  const getHistorySearchValue = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const creator =
        state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "";
      return [
        customer?.fullName,
        displayCustomerPhone(customer?.phone),
        bookingAreaTableSortKey(booking, bookingAreaTableLookup),
        creator,
        bookingStatusLabel[booking.status],
        stripUnknownGuestTag(booking.note),
        dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
        isGuestCountSpecified(booking) ? String(booking.guestCount) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    },
    [bookingAreaTableLookup, state.customers, state.users]
  );

  const statGrid = (
    <SimpleGrid cols={{ base: 2, sm: 2, lg: 4 }} spacing={isManager ? "md" : isCompact ? "sm" : "md"}>
      <PortalSectionCard padding={isManager ? "lg" : isCompact ? "sm" : "md"}>
        <Text size={isManager ? "sm" : "xs"} c="dimmed" fw={600}>
          Tổng booking
        </Text>
        <Title order={isManager ? 1 : 2}>{branchBookings.length}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isManager ? "lg" : isCompact ? "sm" : "md"}>
        <Text size={isManager ? "sm" : "xs"} c="dimmed" fw={600}>
          Đã check-in
        </Text>
        <Title order={isManager ? 1 : 2}>{checkedInCount}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isManager ? "lg" : isCompact ? "sm" : "md"}>
        <Text size={isManager ? "sm" : "xs"} c="dimmed" fw={600}>
          Bàn phục vụ
        </Text>
        <Title order={isManager ? 1 : 2}>{statusCounts.occupied}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isManager ? "lg" : isCompact ? "sm" : "md"}>
        <Text size={isManager ? "sm" : "xs"} c="dimmed" fw={600}>
          Bàn trống
        </Text>
        <Title order={isManager ? 1 : 2}>{statusCounts.available}</Title>
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
          <TextInputWithVoice
            placeholder="Tìm khách, SĐT, bàn, người tạo..."
            value={mobileQuery}
            onChange={(event) => {
              setMobileQuery(event.currentTarget.value);
              setMobilePage(1);
            }}
            size="md"
            voiceIconSize="md"
          />
          <BookingListPaginationBar
            pageSize={mobilePageSize}
            pageSizeSelectData={["6", "8", "10", "12", "20"].map((value) => ({
              value,
              label: value,
            }))}
            onPageSizeChange={(size) => {
              setMobilePageSize(size);
              setMobilePage(1);
            }}
            page={mobilePageSafe}
            totalPages={mobileTotalPages}
            onPageChange={setMobilePage}
            totalBookings={mobileSortedBookings.length}
            summaryItemLabel="booking"
          />
          {pagedMobileBookings.length === 0 ? (
            <Text c="dimmed" size="sm">
              Chưa có booking nào.
            </Text>
          ) : (
            pagedMobileBookings.map((booking) => {
              const customer =
                state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—";
              const phone = displayCustomerPhone(
                state.customers.find((item) => item.id === booking.customerId)?.phone
              );
              const creator =
                state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
                "Không rõ";
              const lastEditor =
                booking.lastEditedByUserId != null
                  ? state.users.find((item) => item.id === booking.lastEditedByUserId)?.fullName
                  : undefined;

              return (
                <BookingCompactCard
                  key={booking.id}
                  booking={booking}
                  variant="list"
                  customerName={customer}
                  creatorName={creator}
                  bookingAreaTableLookup={bookingAreaTableLookup}
                  customerPhone={phone}
                  lastEditorName={lastEditor}
                />
              );
            })
          )}
          <BookingListPaginationBar
            pageSize={mobilePageSize}
            pageSizeSelectData={["6", "8", "10", "12", "20"].map((value) => ({
              value,
              label: value,
            }))}
            onPageSizeChange={(size) => {
              setMobilePageSize(size);
              setMobilePage(1);
            }}
            page={mobilePageSafe}
            totalPages={mobileTotalPages}
            onPageChange={setMobilePage}
            totalBookings={mobileSortedBookings.length}
            summaryItemLabel="booking"
          />
        </Stack>
      ) : (
        <PortalDataTable<Booking>
          records={branchBookings}
          getRecordSearchValue={getHistorySearchValue}
          sortRecords={sortHistoryBookings}
          defaultSort={{ columnAccessor: "bookingAt", direction: "desc" }}
          defaultRecordsPerPage={8}
          searchPlaceholder="Khách, bàn, người tạo, ghi chú..."
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
                      {displayCustomerPhone(c?.phone)}
                    </Text>
                  </Stack>
                );
              },
            },
            {
              accessor: "areaTable",
              title: "Khu vực / Bàn",
              sortable: true,
              render: (booking) =>
                formatBookingAreaTable(booking, bookingAreaTableLookup),
            },
            {
              accessor: "guestCount",
              title: "Số khách",
              sortable: true,
              render: (booking) =>
                isGuestCountSpecified(booking) ? booking.guestCount : "Chưa rõ",
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
                stripUnknownGuestTag(booking.note) ? (
                  <Text size="sm" lineClamp={2} maw={220}>
                    {stripUnknownGuestTag(booking.note)}
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
          {isManager ? "Đặt bàn hôm nay" : isCompact ? "Tổng quan" : "Dashboard tổng quan"}
        </PortalPageTitle>
        <Text c="dimmed" size={isCompact ? "xs" : "sm"}>
          Chi nhánh: {branchNames.join(", ")}
        </Text>
      </div>

      {isManager ? (
        statGrid
      ) : isCompact ? (
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
