"use client";

import dayjs from "dayjs";
import {
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyPanel } from "@/components/portal-page";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { displayCustomerPhone } from "@/lib/booking-meta";
import { Customer } from "@/lib/types";

const LIST_PAGE_SIZE = 10;
const DRAWER_BOOKING_PAGE_SIZE = 8;

type CustomerFilter = "all" | "has_booking" | "no_booking";
type CustomerRow = Customer & { bookingCount: number; latestBooking?: string };

export default function CustomersPage() {
  const { state, filteredBranchIds, deleteCustomers } = useAppContext();
  const isCompact = usePortalCompact();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [listPage, setListPage] = useState(1);
  const [drawerBookingPage, setDrawerBookingPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<CustomerRow[]>([]);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<CustomerRow>>({
    columnAccessor: "latestBooking",
    direction: "desc",
  });

  const customerStats = useMemo(
    () =>
      state.customers
        .map((customer) => {
          const bookings = state.bookings
            .filter(
              (booking) =>
                booking.customerId === customer.id && filteredBranchIds.includes(booking.branchId)
            )
            .sort((a, b) => dayjs(b.bookingAt).valueOf() - dayjs(a.bookingAt).valueOf());
          return {
            ...customer,
            bookingCount: bookings.length,
            latestBooking: bookings[0]?.bookingAt,
          };
        })
        .filter((item) => {
          const q = query.toLowerCase();
          const rawPhone = (item.phone ?? "").toLowerCase();
          return (
            item.fullName.toLowerCase().includes(q) ||
            rawPhone.includes(q) ||
            displayCustomerPhone(item.phone).toLowerCase().includes(q)
          );
        })
        .filter((item) => {
          if (filter === "has_booking") return item.bookingCount > 0;
          if (filter === "no_booking") return item.bookingCount === 0;
          return true;
        }),
    [filteredBranchIds, filter, query, state.bookings, state.customers]
  );

  const sortedCustomerStats = useMemo(() => {
    const dir = sortStatus.direction === "asc" ? 1 : -1;
    const accessor = sortStatus.columnAccessor;
    const next = [...customerStats];
    next.sort((a, b) => {
      if (accessor === "fullName") {
        return dir * a.fullName.localeCompare(b.fullName, "vi");
      }
      if (accessor === "phone") {
        return (
          dir *
          displayCustomerPhone(a.phone).localeCompare(displayCustomerPhone(b.phone), "vi")
        );
      }
      if (accessor === "bookingCount") {
        return dir * (a.bookingCount - b.bookingCount);
      }
      if (accessor === "latestBooking") {
        const av = a.latestBooking ? dayjs(a.latestBooking).valueOf() : 0;
        const bv = b.latestBooking ? dayjs(b.latestBooking).valueOf() : 0;
        return dir * (av - bv);
      }
      return 0;
    });
    return next;
  }, [customerStats, sortStatus.columnAccessor, sortStatus.direction]);

  const listTotalPages = Math.max(1, Math.ceil(customerStats.length / LIST_PAGE_SIZE));
  const listPageSafe = Math.min(listPage, listTotalPages);
  const pagedCustomerStats = useMemo(
    () =>
      customerStats.slice(
        (listPageSafe - 1) * LIST_PAGE_SIZE,
        listPageSafe * LIST_PAGE_SIZE
      ),
    [customerStats, listPageSafe]
  );

  const customerBookings = useMemo(() => {
    if (!selectedCustomer) {
      return [];
    }
    return state.bookings
      .filter(
        (booking) =>
          booking.customerId === selectedCustomer.id &&
          filteredBranchIds.includes(booking.branchId)
      )
      .sort((a, b) => dayjs(b.bookingAt).valueOf() - dayjs(a.bookingAt).valueOf());
  }, [filteredBranchIds, selectedCustomer, state.bookings]);

  const drawerBookingTotalPages = Math.max(
    1,
    Math.ceil(customerBookings.length / DRAWER_BOOKING_PAGE_SIZE)
  );
  const drawerBookingPageSafe = Math.min(drawerBookingPage, drawerBookingTotalPages);
  const pagedDrawerBookings = useMemo(
    () =>
      customerBookings.slice(
        (drawerBookingPageSafe - 1) * DRAWER_BOOKING_PAGE_SIZE,
        drawerBookingPageSafe * DRAWER_BOOKING_PAGE_SIZE
      ),
    [customerBookings, drawerBookingPageSafe]
  );

  return (
    <Stack>
      <PortalPageTitle order={isCompact ? 3 : 2}>
        {isCompact ? "Khách hàng" : "Quản lý khách hàng"}
      </PortalPageTitle>
      <PortalStickyPanel>
        <Group gap="sm" wrap="wrap" align="flex-end">
          <TextInputWithVoice
            placeholder="Tìm tên hoặc SĐT"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setListPage(1);
            }}
            size={isCompact ? "md" : "sm"}
            voiceIconSize={isCompact ? "md" : "sm"}
            style={{ flex: 1, minWidth: 240 }}
          />
          {!isCompact ? (
            <>
              <SegmentedControl
                value={filter}
                onChange={(value) => {
                  setFilter(value as CustomerFilter);
                  setListPage(1);
                  setSelectedCustomers([]);
                }}
                data={[
                  { label: "Tất cả", value: "all" },
                  { label: "Có booking", value: "has_booking" },
                  { label: "Chưa có booking", value: "no_booking" },
                ]}
                size="sm"
              />
              <Button
                color="red"
                variant="light"
                size="sm"
                disabled={selectedCustomers.length === 0}
                onClick={async () => {
                  const ids = selectedCustomers.map((c) => c.id);
                  const hasBooking = state.bookings.some((b) => ids.includes(b.customerId));
                  if (hasBooking) {
                    window.alert("Không thể xóa: có khách hàng đã có booking.");
                    return;
                  }
                  const ok = window.confirm(
                    `Xóa ${selectedCustomers.length} khách hàng? (Chỉ xóa khách chưa có booking)`
                  );
                  if (!ok) return;
                  const result = await deleteCustomers(ids);
                  if (!result.ok) {
                    window.alert(result.message);
                    return;
                  }
                  setSelectedCustomers([]);
                }}
              >
                Xóa ({selectedCustomers.length})
              </Button>
            </>
          ) : null}
        </Group>
      </PortalStickyPanel>
      {isCompact ? (
        <Stack gap="sm">
          {customerStats.length === 0 ? (
            <Text c="dimmed" size="sm">
              Không tìm thấy khách hàng phù hợp.
            </Text>
          ) : (
            <>
              {pagedCustomerStats.map((row) => (
                <Card
                  key={row.id}
                  withBorder
                  radius="md"
                  padding="md"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setDrawerBookingPage(1);
                    setSelectedCustomer(row);
                  }}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Text fw={700} lineClamp={2}>
                        {row.fullName}
                      </Text>
                      <Group gap={6} wrap="nowrap">
                        <Phone size={14} />
                        <Text size="sm" c="dimmed">
                          {displayCustomerPhone(row.phone)}
                        </Text>
                      </Group>
                    </Stack>
                    <Badge variant="light" size="lg">
                      {row.bookingCount} booking
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" mt="xs">
                    Gần nhất:{" "}
                    {row.latestBooking ? dayjs(row.latestBooking).format("DD/MM/YYYY HH:mm") : "—"}
                  </Text>
                </Card>
              ))}
              {customerStats.length > LIST_PAGE_SIZE ? (
                <Group justify="center" gap="xs" mt="xs" wrap="wrap">
                  <Button
                    variant="default"
                    size="compact-sm"
                    disabled={listPageSafe <= 1}
                    onClick={() => setListPage((p) => Math.max(1, p - 1))}
                  >
                    Trước
                  </Button>
                  <Text size="sm" c="dimmed">
                    {listPageSafe}/{listTotalPages} · {customerStats.length} khách
                  </Text>
                  <Button
                    variant="default"
                    size="compact-sm"
                    disabled={listPageSafe >= listTotalPages}
                    onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}
                  >
                    Sau
                  </Button>
                </Group>
              ) : (
                <Text size="xs" c="dimmed" ta="center">
                  {customerStats.length} khách
                </Text>
              )}
            </>
          )}
        </Stack>
      ) : (
        <PortalSectionCard>
          <DataTable
            minHeight={260}
            scrollAreaProps={portalDataTableScrollAreaProps}
            withTableBorder
            idAccessor="id"
            records={sortedCustomerStats}
            noRecordsText="Không tìm thấy khách hàng phù hợp."
            onRowClick={({ record }) => {
              setDrawerBookingPage(1);
              setSelectedCustomer(record);
            }}
            selectedRecords={selectedCustomers}
            onSelectedRecordsChange={setSelectedCustomers}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
            columns={[
              { accessor: "fullName", title: "Khách hàng", sortable: true },
              {
                accessor: "phone",
                title: "Điện thoại",
                sortable: true,
                render: (row) => displayCustomerPhone(row.phone),
              },
              { accessor: "bookingCount", title: "Số booking", sortable: true },
              {
                accessor: "latestBooking",
                title: "Booking gần nhất",
                sortable: true,
                render: (row) =>
                  row.latestBooking ? dayjs(row.latestBooking).format("DD/MM/YYYY HH:mm") : "-",
              },
            ]}
          />
        </PortalSectionCard>
      )}

      <Drawer
        opened={!!selectedCustomer}
        onClose={() => {
          setSelectedCustomer(null);
          setDrawerBookingPage(1);
        }}
        title={selectedCustomer?.fullName ?? "Khách hàng"}
        position={isCompact ? "bottom" : "right"}
        size={isCompact ? "100%" : "md"}
        transitionProps={isCompact ? { transition: "slide-up" } : undefined}
        styles={
          isCompact
            ? {
                content: { height: "92dvh", maxHeight: "92dvh" },
                body: { paddingTop: 4 },
              }
            : undefined
        }
      >
        <Stack gap="md">
          <Group gap="xs" wrap="nowrap">
            <Phone size={18} />
            <Text fw={600}>{displayCustomerPhone(selectedCustomer?.phone)}</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Ghi chú: {selectedCustomer?.note || "Không có"}
          </Text>
          <Text fw={700} size="sm">
            Lịch sử booking ({customerBookings.length})
          </Text>
          <Stack gap="sm">
            {customerBookings.length === 0 ? (
              <Text size="sm" c="dimmed">
                Chưa có booking.
              </Text>
            ) : (
              <>
                {pagedDrawerBookings.map((booking) => {
                  const area = state.areas.find((a) => a.id === booking.areaId)?.name ?? "—";
                  const table = state.tables.find((t) => t.id === booking.tableId)?.name ?? "—";
                  const locationLine =
                    booking.areaId && booking.tableId ? `${area} · ${table}` : "Chờ xếp bàn";
                  return (
                    <Card key={booking.id} withBorder radius="md" padding="sm">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Stack gap={4} style={{ minWidth: 0 }}>
                          <Text size="xs" c="dimmed">
                            Mã {booking.id}
                          </Text>
                          <Text size="sm" fw={600}>
                            {dayjs(booking.bookingAt).format("HH:mm · DD/MM/YYYY")}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {locationLine}
                          </Text>
                        </Stack>
                        <Badge color={bookingStatusColor[booking.status]} variant="light">
                          {bookingStatusLabel[booking.status]}
                        </Badge>
                      </Group>
                    </Card>
                  );
                })}
                {customerBookings.length > DRAWER_BOOKING_PAGE_SIZE ? (
                  <Group justify="center" gap="xs" wrap="wrap">
                    <Button
                      variant="default"
                      size="compact-sm"
                      disabled={drawerBookingPageSafe <= 1}
                      onClick={() => setDrawerBookingPage((p) => Math.max(1, p - 1))}
                    >
                      Trước
                    </Button>
                    <Text size="sm" c="dimmed">
                      {drawerBookingPageSafe}/{drawerBookingTotalPages}
                    </Text>
                    <Button
                      variant="default"
                      size="compact-sm"
                      disabled={drawerBookingPageSafe >= drawerBookingTotalPages}
                      onClick={() =>
                        setDrawerBookingPage((p) => Math.min(drawerBookingTotalPages, p + 1))
                      }
                    >
                      Sau
                    </Button>
                  </Group>
                ) : null}
              </>
            )}
          </Stack>
        </Stack>
      </Drawer>
    </Stack>
  );
}
