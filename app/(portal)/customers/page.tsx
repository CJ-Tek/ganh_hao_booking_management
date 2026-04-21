"use client";

import dayjs from "dayjs";
import {
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DataTable } from "mantine-datatable";
import { Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyPanel } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { Customer } from "@/lib/types";

const LIST_PAGE_SIZE = 10;
const DRAWER_BOOKING_PAGE_SIZE = 8;

export default function CustomersPage() {
  const { state, filteredBranchIds } = useAppContext();
  const isCompact = usePortalCompact();
  const [query, setQuery] = useState("");
  const [listPage, setListPage] = useState(1);
  const [drawerBookingPage, setDrawerBookingPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

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
        .filter(
          (item) =>
            item.fullName.toLowerCase().includes(query.toLowerCase()) ||
            item.phone.includes(query)
        ),
    [filteredBranchIds, query, state.bookings, state.customers]
  );

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
        <TextInput
          placeholder="Tìm tên hoặc SĐT"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setListPage(1);
          }}
          size={isCompact ? "md" : "sm"}
        />
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
                          {row.phone}
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
            records={customerStats}
            noRecordsText="Không tìm thấy khách hàng phù hợp."
            onRowClick={({ record }) => {
              setDrawerBookingPage(1);
              setSelectedCustomer(record);
            }}
            columns={[
              { accessor: "fullName", title: "Khách hàng" },
              { accessor: "phone", title: "Điện thoại" },
              { accessor: "bookingCount", title: "Số booking" },
              {
                accessor: "latestBooking",
                title: "Booking gần nhất",
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
            <Text fw={600}>{selectedCustomer?.phone}</Text>
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
                            {area} · {table}
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
