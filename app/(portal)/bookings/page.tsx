"use client";

import dayjs from "dayjs";
import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  NumberInput,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import {
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyAction,
} from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel, tableStatusLabel } from "@/lib/display";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking, type TableStatus } from "@/lib/types";

function branchScopeKey(branchIds: string[]) {
  return [...branchIds].sort().join("|") || "none";
}

export default function BookingsPage() {
  const { filteredBranchIds } = useAppContext();
  return <BookingsPageContent key={branchScopeKey(filteredBranchIds)} />;
}

function BookingsPageContent() {
  const {
    state,
    filteredBranchIds,
    createBooking,
    updateBookingStatus,
    checkInBooking,
  } = useAppContext();

  const isCompact = usePortalCompact();

  const branchId = filteredBranchIds[0] ?? null;
  const branchName =
    branchId ? state.branches.find((b) => b.id === branchId)?.name ?? "—" : "—";

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState<number>(4);
  const [bookingAt, setBookingAt] = useState<string | null>(
    dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm")
  );
  const [note, setNote] = useState("");
  const [tableStatusFilter, setTableStatusFilter] = useState<string>("all");
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "bookingAt",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filteredAreas = state.areas.filter((area) => area.branchId === branchId);
  const filteredTables = useMemo(() => {
    return state.tables
      .filter((table) => table.areaId === areaId)
      .filter((table) => tableStatusFilter === "all" || table.status === tableStatusFilter)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [areaId, state.tables, tableStatusFilter]);

  const selectedTable = useMemo(
    () => (tableId ? state.tables.find((t) => t.id === tableId) : undefined),
    [tableId, state.tables]
  );

  const branchBookings = useMemo(
    () => state.bookings.filter((booking) => filteredBranchIds.includes(booking.branchId)),
    [filteredBranchIds, state.bookings]
  );

  const sortedBookings = useMemo(() => {
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

  const pagedBookings = useMemo(
    () => {
      const totalPages = Math.max(1, Math.ceil(sortedBookings.length / pageSize));
      const currentPage = Math.min(page, totalPages);
      return sortedBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    },
    [page, pageSize, sortedBookings]
  );

  const handleCreate = async () => {
    if (!customerName || !customerPhone || !branchId || !areaId || !tableId || !bookingAt) {
      notifications.show({ color: "red", message: "Vui lòng nhập đầy đủ thông tin." });
      return;
    }
    const nextGuestCount = Math.max(1, guestCount);
    if (selectedTable?.seats && nextGuestCount > selectedTable.seats) {
      notifications.show({
        color: "red",
        message: `Số khách không được vượt quá sức chứa bàn (${selectedTable.seats} ghế).`,
      });
      return;
    }
    const result = await createBooking({
      customerName,
      customerPhone,
      branchId,
      areaId,
      tableId,
      guestCount: nextGuestCount,
      bookingAt: dayjs(bookingAt).toISOString(),
      note,
    });
    notifications.show({
      color: result.ok ? "green" : "red",
      message: result.message,
    });
    if (result.ok) {
      setCustomerName("");
      setCustomerPhone("");
      setAreaId(null);
      setTableId(null);
      setGuestCount(4);
      setNote("");
    }
  };

  const createForm = (
    <PortalSectionCard>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Chi nhánh: <strong>{branchName}</strong>
        </Text>
        <TextInput
          label="Tên khách"
          placeholder="Họ và tên"
          value={customerName}
          onChange={(event) => setCustomerName(event.currentTarget.value)}
          size={isCompact ? "md" : "sm"}
        />
        <TextInput
          label="Số điện thoại"
          placeholder="09…"
          inputMode="tel"
          value={customerPhone}
          onChange={(event) => setCustomerPhone(event.currentTarget.value)}
          size={isCompact ? "md" : "sm"}
        />
        <Select
          label="Khu vực"
          placeholder="Chọn khu"
          value={areaId}
          onChange={(value) => {
            setAreaId(value);
            setTableId(null);
          }}
          data={filteredAreas.map((area) => ({ value: area.id, label: area.name }))}
          size={isCompact ? "md" : "sm"}
        />
        <Select
          label="Trạng thái bàn (lọc)"
          value={tableStatusFilter}
          onChange={(value) => setTableStatusFilter(value ?? "all")}
          data={[
            { value: "all", label: "Tất cả" },
            ...(["available", "hold", "occupied", "locked"] as TableStatus[]).map((status) => ({
              value: status,
              label: tableStatusLabel[status],
            })),
          ]}
          size={isCompact ? "md" : "sm"}
        />
        <Select
          label="Bàn gán cho khách"
          placeholder="Chọn hoặc gõ tên bàn"
          value={tableId}
          onChange={setTableId}
          data={filteredTables.map((table) => ({ value: table.id, label: table.name }))}
          searchable
          size={isCompact ? "md" : "sm"}
        />
        <DateTimePicker
          value={bookingAt}
          onChange={setBookingAt}
          label="Thời gian đến"
          valueFormat="DD/MM/YYYY HH:mm"
          size={isCompact ? "md" : "sm"}
        />
        <NumberInput
          label="Số khách"
          value={guestCount}
          onChange={(value) => setGuestCount(Number(value || 1))}
          min={1}
          max={selectedTable?.seats}
          size={isCompact ? "md" : "sm"}
        />
        <Textarea
          label="Ghi chú"
          placeholder="Tùy chọn"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          autosize
          minRows={2}
          size={isCompact ? "md" : "sm"}
        />
        <PortalStickyAction>
          <Button fullWidth size={isCompact ? "md" : "sm"} onClick={() => void handleCreate()}>
            Tạo booking
          </Button>
        </PortalStickyAction>
      </Stack>
    </PortalSectionCard>
  );

  const bookingsTable = (
    <PortalSectionCard>
      <Text fw={600} mb="sm">
        Danh sách booking
      </Text>
      <DataTable
        minHeight={isCompact ? 200 : 260}
        scrollAreaProps={portalDataTableScrollAreaProps}
        withTableBorder
        records={pagedBookings}
        totalRecords={sortedBookings.length}
        recordsPerPage={pageSize}
        page={Math.min(page, Math.max(1, Math.ceil(sortedBookings.length / pageSize)))}
        onPageChange={setPage}
        sortStatus={sortStatus}
        onSortStatusChange={(next) => {
          setSortStatus(next);
          setPage(1);
        }}
        noRecordsText="Chưa có booking nào cho bộ lọc hiện tại."
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
          {
            accessor: "actions",
            title: "Thao tác",
            render: (booking) => (
              booking.status === "cancelled" || booking.status === "completed" ? null : (
                <Group gap={6} wrap="wrap">
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="green"
                    onClick={() => void checkInBooking(booking.id)}
                    disabled={booking.status !== "confirmed"}
                  >
                    Check-in
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="red"
                    onClick={() => void updateBookingStatus(booking.id, "cancelled")}
                  >
                    Hủy
                  </Button>
                </Group>
              )
            ),
          },
        ]}
      />
    </PortalSectionCard>
  );

  const bookingsCards = (
    <Stack gap="sm">
      {pagedBookings.length === 0 ? (
        <Text c="dimmed" size="sm">
          Chưa có booking nào.
        </Text>
      ) : (
        pagedBookings.map((booking) => {
          const cust = state.customers.find((item) => item.id === booking.customerId);
          const customer = cust?.fullName ?? "—";
          const phone = cust?.phone ?? "—";
          const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "—";
          const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "—";
          const creator =
            state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
            "Không rõ";
          const locationLine = `${area} · Bàn ${table}`;
          return (
            <Card key={booking.id} withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700} lineClamp={2}>
                      {customer}
                    </Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      {phone}
                    </Text>
                  </div>
                  <Badge color={bookingStatusColor[booking.status]} variant="light" size="lg">
                    {bookingStatusLabel[booking.status]}
                  </Badge>
                </Group>
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
                <Group grow gap="xs">
                  {booking.status === "cancelled" || booking.status === "completed" ? null : (
                    <>
                      <Button
                        size="sm"
                        variant="light"
                        color="green"
                        onClick={() => void checkInBooking(booking.id)}
                        disabled={booking.status !== "confirmed"}
                      >
                        Check-in
                      </Button>
                      <Button
                        size="sm"
                        variant="light"
                        color="red"
                        onClick={() => void updateBookingStatus(booking.id, "cancelled")}
                      >
                        Hủy
                      </Button>
                    </>
                  )}
                </Group>
              </Stack>
            </Card>
          );
        })
      )}
      {sortedBookings.length > pageSize ? (
        <Group justify="center" gap="xs" mt="xs">
          <Button
            variant="default"
            size="compact-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Trước
          </Button>
          <Text size="sm" c="dimmed">
            {page}/{Math.max(1, Math.ceil(sortedBookings.length / pageSize))}
          </Text>
          <Button
            variant="default"
            size="compact-sm"
            disabled={page >= Math.ceil(sortedBookings.length / pageSize)}
            onClick={() =>
              setPage((p) => Math.min(Math.max(1, Math.ceil(sortedBookings.length / pageSize)), p + 1))
            }
          >
            Sau
          </Button>
        </Group>
      ) : null}
    </Stack>
  );

  return (
    <Stack gap="md">
      <PortalPageTitle order={isCompact ? 3 : 2}>
        {isCompact ? "Đặt bàn" : "Booking - Tạo / sửa / hủy đặt bàn"}
      </PortalPageTitle>

      {isCompact ? (
        <Tabs defaultValue="create" keepMounted={false}>
          <Tabs.List grow>
            <Tabs.Tab value="create">Tạo mới</Tabs.Tab>
            <Tabs.Tab value="list">Trạng thái booking</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="create" pt="md">
            {createForm}
          </Tabs.Panel>
          <Tabs.Panel value="list" pt="md">
            <PortalSectionCard>
              <Stack gap="md">
                <Text size="sm" fw={600}>
                  Theo dõi nhanh
                </Text>
                {bookingsCards}
              </Stack>
            </PortalSectionCard>
          </Tabs.Panel>
        </Tabs>
      ) : (
        <Grid>
          <Grid.Col span={{ base: 12, lg: 5 }}>{createForm}</Grid.Col>
          <Grid.Col span={{ base: 12, lg: 7 }}>{bookingsTable}</Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}
