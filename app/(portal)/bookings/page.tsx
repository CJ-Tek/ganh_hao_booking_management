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
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import {
  PortalMobileActionGrid,
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyAction,
} from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";

export default function BookingsPage() {
  const {
    state,
    filteredBranchIds,
    createBooking,
    updateBookingStatus,
    checkInBooking,
    currentUser,
  } = useAppContext();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [branchId, setBranchId] = useState<string | null>(filteredBranchIds[0] ?? null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState<number>(4);
  const [bookingAt, setBookingAt] = useState<string | null>(
    dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm")
  );
  const [note, setNote] = useState("");

  const filteredAreas = state.areas.filter((area) => area.branchId === branchId);
  const filteredTables = state.tables.filter((table) => table.areaId === areaId);

  const branchBookings = useMemo(
    () =>
      state.bookings.filter(
        (booking) =>
          filteredBranchIds.includes(booking.branchId) &&
          (currentUser?.role !== "manager" || booking.branchId === branchId)
      ),
    [branchId, currentUser?.role, filteredBranchIds, state.bookings]
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
              <Select
                label="Chi nhánh"
                value={branchId}
                onChange={(value) => {
                  setBranchId(value);
                  setAreaId(null);
                  setTableId(null);
                }}
                data={state.branches
                  .filter((branch) => filteredBranchIds.includes(branch.id))
                  .map((branch) => ({ value: branch.id, label: branch.name }))}
              />
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
              <Select
                label="Bàn"
                value={tableId}
                onChange={setTableId}
                data={filteredTables.map((table) => ({ value: table.id, label: table.name }))}
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
            <Stack hiddenFrom="sm" gap="sm">
              {branchBookings.length === 0 ? (
                <PortalSectionCard p="sm">
                  <Text c="dimmed" size="sm">
                    Chưa có booking nào cho bộ lọc hiện tại.
                  </Text>
                </PortalSectionCard>
              ) : (
                branchBookings.map((booking) => {
                  const customer = state.customers.find((item) => item.id === booking.customerId);
                  return (
                    <PortalSectionCard key={booking.id} p="sm">
                      <Group justify="space-between" mb={6}>
                        <Text fw={700}>{booking.id}</Text>
                        <Badge color={bookingStatusColor[booking.status]} variant="light">
                          {bookingStatusLabel[booking.status]}
                        </Badge>
                      </Group>
                      <Stack gap={4}>
                        <Text size="sm">Khách: {customer?.fullName ?? "Không rõ"}</Text>
                        <Text size="sm" c="dimmed">
                          Giờ: {dayjs(booking.bookingAt).format("HH:mm DD/MM")}
                        </Text>
                        <PortalMobileActionGrid mt={6}>
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
                            disabled={booking.status === "cancelled"}
                          >
                            Hủy
                          </Button>
                        </PortalMobileActionGrid>
                      </Stack>
                    </PortalSectionCard>
                  );
                })
              )}
            </Stack>

            <Table.ScrollContainer minWidth={760} visibleFrom="sm">
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Mã</Table.Th>
                    <Table.Th>Khách</Table.Th>
                    <Table.Th>Giờ</Table.Th>
                    <Table.Th>Trạng thái</Table.Th>
                    <Table.Th>Thao tác</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {branchBookings.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={5}>
                        <Text c="dimmed" size="sm">
                          Chưa có booking nào cho bộ lọc hiện tại.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    branchBookings.map((booking) => {
                      const customer = state.customers.find((item) => item.id === booking.customerId);
                      return (
                        <Table.Tr key={booking.id}>
                          <Table.Td>{booking.id}</Table.Td>
                          <Table.Td>{customer?.fullName}</Table.Td>
                          <Table.Td>{dayjs(booking.bookingAt).format("HH:mm DD/MM")}</Table.Td>
                          <Table.Td>
                            <Badge color={bookingStatusColor[booking.status]} variant="light">
                              {bookingStatusLabel[booking.status]}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
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
                          </Table.Td>
                        </Table.Tr>
                      );
                    })
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </PortalSectionCard>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
