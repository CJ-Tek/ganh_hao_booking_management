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
  Tooltip,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import {
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyAction,
} from "@/components/portal-page";
import { VoiceBookingAssistant } from "@/components/voice-booking/VoiceBookingAssistant";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking } from "@/lib/types";
import { formatVietnamesePersonName } from "@/lib/voice-booking/format";

function branchScopeKey(branchIds: string[]) {
  return [...branchIds].sort().join("|") || "none";
}

/** Chuẩn hóa số điện thoại VN (+84 → 0…). */
function normalizeVietnamPhone(raw: string): string {
  const s = raw.replace(/[\s.-]/g, "");
  if (s.startsWith("+84")) {
    return `0${s.slice(3)}`;
  }
  if (s.startsWith("84") && s.length >= 10) {
    return `0${s.slice(2)}`;
  }
  return s;
}

function isPlausibleVietnamPhone(normalized: string): boolean {
  return /^0[1-9]\d{8,9}$/.test(normalized);
}

function BookingCheckInButton(props: {
  size: "compact-xs" | "sm";
  disabled: boolean;
  onCheckIn: () => void;
}) {
  const { size, disabled, onCheckIn } = props;
  const btn = (
    <Button
      size={size}
      variant="light"
      color="green"
      onClick={() => void onCheckIn()}
      disabled={disabled}
    >
      Check-in
    </Button>
  );
  if (!disabled) {
    return btn;
  }
  return (
    <Tooltip label="Chỉ check-in khi booking đã xác nhận." withArrow>
      <span style={{ display: "inline-flex" }}>{btn}</span>
    </Tooltip>
  );
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
    hasSupabase,
  } = useAppContext();

  const isCompact = usePortalCompact();

  const branchId = filteredBranchIds[0] ?? null;
  const branchName =
    branchId ? state.branches.find((b) => b.id === branchId)?.name ?? "—" : "—";

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [guestCount, setGuestCount] = useState<number>(4);
  const [bookingAt, setBookingAt] = useState<string | null>(
    dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm")
  );
  const [note, setNote] = useState("");
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "bookingAt",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const openCancelBookingConfirm = (booking: Booking) => {
    const customer = state.customers.find((c) => c.id === booking.customerId);
    const name = customer?.fullName ?? "—";
    const timeStr = dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY");
    modals.openConfirmModal({
      title: "Xác nhận hủy booking",
      children: (
        <Text size="sm">
          Hủy booking của <strong>{name}</strong> · {timeStr}? Thao tác không hoàn tác.
        </Text>
      ),
      labels: { cancel: "Quay lại", confirm: "Hủy booking" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        if (!hasSupabase) {
          notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
          return;
        }
        try {
          await updateBookingStatus(booking.id, "cancelled");
          notifications.show({ color: "green", message: "Đã hủy booking." });
        } catch (error) {
          notifications.show({
            color: "red",
            message: error instanceof Error ? error.message : "Không hủy được booking.",
          });
        }
      },
    });
  };

  const runCheckIn = async (bookingId: string) => {
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    try {
      await checkInBooking(bookingId);
      notifications.show({ color: "green", message: "Đã check-in." });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Check-in thất bại.",
      });
    }
  };

  const filteredAreas = state.areas.filter((area) => area.branchId === branchId);
  const branchTables = useMemo(
    () => state.tables.filter((table) => table.branchId === branchId),
    [branchId, state.tables]
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
    if (!customerName || !customerPhone || !branchId || !bookingAt) {
      notifications.show({ color: "red", message: "Vui lòng nhập đầy đủ thông tin cơ bản." });
      return;
    }
    const phoneNorm = normalizeVietnamPhone(customerPhone.trim());
    if (!isPlausibleVietnamPhone(phoneNorm)) {
      notifications.show({
        color: "red",
        message:
          "Số điện thoại không đúng định dạng Việt Nam (ví dụ 0912345678, +84912345678).",
      });
      return;
    }
    const result = await createBooking({
      customerName: formatVietnamesePersonName(customerName),
      customerPhone: phoneNorm,
      branchId,
      guestCount: Math.max(1, guestCount),
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
        <Group justify="flex-start">
          <VoiceBookingAssistant
            branch={branchId ? { id: branchId, name: branchName } : null}
            areas={filteredAreas.map((a) => ({ id: a.id, name: a.name }))}
            tables={branchTables.map((t) => ({
              id: t.id,
              name: t.name,
              seats: t.seats,
              areaId: t.areaId,
              status: t.status,
            }))}
            onCreateBooking={createBooking}
          />
        </Group>
        <TextInput
          label="Tên khách"
          placeholder="Họ và tên"
          value={customerName}
          onChange={(event) => setCustomerName(event.currentTarget.value)}
          onBlur={() => setCustomerName((v) => formatVietnamesePersonName(v))}
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
        <Text size="sm" c="dimmed">
          Khu vực, trạng thái bàn và bàn gán sẽ được cấu hình ở mục <strong>Sơ đồ</strong>.
        </Text>
        <Text size="sm" c="dimmed">
          Booking tạo từ đây sẽ ở trạng thái <strong>Chờ xếp bàn</strong>.
        </Text>
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
              if (!booking.areaId || !booking.tableId) {
                return "Chờ xếp bàn";
              }
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
                  <BookingCheckInButton
                    size="compact-xs"
                    disabled={booking.status !== "confirmed"}
                    onCheckIn={() => runCheckIn(booking.id)}
                  />
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="red"
                    onClick={() => openCancelBookingConfirm(booking)}
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
          const locationLine =
            booking.areaId && booking.tableId ? `${area} · Bàn ${table}` : "Chờ xếp bàn";
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
                      <BookingCheckInButton
                        size="sm"
                        disabled={booking.status !== "confirmed"}
                        onCheckIn={() => runCheckIn(booking.id)}
                      />
                      <Button
                        size="sm"
                        variant="light"
                        color="red"
                        onClick={() => openCancelBookingConfirm(booking)}
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
        {isCompact ? "Đặt bàn" : "Đặt bàn — Tạo / theo dõi / hủy"}
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
