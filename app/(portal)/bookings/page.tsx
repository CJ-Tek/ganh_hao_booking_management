"use client";

import dayjs from "dayjs";
import {
  Badge,
  Button,
  Grid,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useEffect, useMemo, useState } from "react";
import {
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyAction,
} from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { type Booking } from "@/lib/types";

export default function BookingsPage() {
  const {
    state,
    filteredBranchIds,
    createBooking,
    updateBookingStatus,
    checkInBooking,
  } = useAppContext();

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
  const [tableSearch, setTableSearch] = useState("");
  const [tableStatusFilter, setTableStatusFilter] = useState<string>("all");
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "bookingAt",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    setAreaId(null);
    setTableId(null);
    setPage(1);
  }, [filteredBranchIds]);

  const filteredAreas = state.areas.filter((area) => area.branchId === branchId);
  const filteredTables = useMemo(() => {
    const keyword = tableSearch.trim().toLowerCase();
    return state.tables
      .filter((table) => table.areaId === areaId)
      .filter((table) => tableStatusFilter === "all" || table.status === tableStatusFilter)
      .filter((table) => !keyword || table.name.toLowerCase().includes(keyword))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [areaId, state.tables, tableSearch, tableStatusFilter]);

  const branchBookings = useMemo(
    () => state.bookings.filter((booking) => filteredBranchIds.includes(booking.branchId)),
    [filteredBranchIds, state.bookings]
  );

  const sortedBookings = useMemo(() => {
    const getCustomerName = (booking: Booking) =>
      state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
    const getValue = (booking: Booking) => {
      if (sortStatus.columnAccessor === "id") {
        return booking.id;
      }
      if (sortStatus.columnAccessor === "customerId") {
        return getCustomerName(booking);
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
  }, [branchBookings, sortStatus, state.customers]);

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
    const result = await createBooking({
      customerName,
      customerPhone,
      branchId,
      areaId,
      tableId,
      guestCount,
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

  return (
    <Stack>
      <PortalPageTitle>Booking - Tạo / sửa / hủy đặt bàn</PortalPageTitle>
      <Grid>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <PortalSectionCard>
            <Stack>
              <Text size="sm" c="dimmed">
                Chi nhánh làm việc: {branchName}
              </Text>
              <TextInput
                label="Tên khách"
                value={customerName}
                onChange={(event) => setCustomerName(event.currentTarget.value)}
              />
              <TextInput
                label="Số điện thoại"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.currentTarget.value)}
              />
              <Select
                label="Khu vực"
                value={areaId}
                onChange={(value) => {
                  setAreaId(value);
                  setTableId(null);
                }}
                data={filteredAreas.map((area) => ({ value: area.id, label: area.name }))}
              />
              <TextInput
                label="Tìm bàn"
                value={tableSearch}
                onChange={(event) => setTableSearch(event.currentTarget.value)}
                placeholder="Tên bàn"
              />
              <Select
                label="Lọc trạng thái bàn"
                value={tableStatusFilter}
                onChange={(value) => setTableStatusFilter(value ?? "all")}
                data={[
                  { value: "all", label: "Tất cả trạng thái" },
                  { value: "available", label: "Sẵn sàng" },
                  { value: "hold", label: "Đang giữ chỗ" },
                  { value: "arriving", label: "Sắp đến" },
                  { value: "occupied", label: "Đang có khách" },
                ]}
              />
              <Select
                label="Bàn"
                value={tableId}
                onChange={setTableId}
                data={filteredTables.map((table) => ({ value: table.id, label: table.name }))}
                searchable
              />
              <DateTimePicker
                value={bookingAt}
                onChange={setBookingAt}
                label="Thời gian đến"
                valueFormat="DD/MM/YYYY HH:mm"
              />
              <NumberInput
                label="Số khách"
                value={guestCount}
                onChange={(value) => setGuestCount(Number(value || 1))}
                min={1}
              />
              <Textarea
                label="Ghi chú"
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
              <PortalStickyAction>
                <Button fullWidth onClick={() => void handleCreate()}>
                  Xác nhận tạo booking
                </Button>
              </PortalStickyAction>
            </Stack>
          </PortalSectionCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 7 }}>
          <PortalSectionCard>
            <Text fw={600} mb="sm">
              Danh sách booking hiện tại
            </Text>
            <DataTable
              minHeight={260}
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
                { accessor: "id", title: "Mã", sortable: true },
                {
                  accessor: "customerId",
                  title: "Khách",
                  sortable: true,
                  render: (booking) => state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "-",
                },
                {
                  accessor: "bookingAt",
                  title: "Giờ",
                  sortable: true,
                  render: (booking) => dayjs(booking.bookingAt).format("HH:mm DD/MM"),
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
                        disabled={booking.status === "cancelled"}
                      >
                        Hủy
                      </Button>
                    </Group>
                  ),
                },
              ]}
            />
          </PortalSectionCard>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
