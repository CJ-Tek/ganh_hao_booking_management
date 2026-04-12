"use client";

import dayjs from "dayjs";
import {
  Badge,
  Card,
  Group,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";

type ViewMode = "day" | "week";

export default function CalendarPage() {
  const { state, filteredBranchIds } = useAppContext();
  const [mode, setMode] = useState<ViewMode>("day");
  const now = dayjs();

  const bookings = useMemo(
    () =>
      state.bookings
        .filter((booking) => filteredBranchIds.includes(booking.branchId))
        .filter((booking) =>
          mode === "day"
            ? dayjs(booking.bookingAt).isSame(now, "day")
            : dayjs(booking.bookingAt).isAfter(now.startOf("week")) &&
              dayjs(booking.bookingAt).isBefore(now.endOf("week"))
        )
        .sort((a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()),
    [filteredBranchIds, mode, now, state.bookings]
  );

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Lịch đặt bàn theo ngày / tuần</Title>
        <SegmentedControl
          value={mode}
          onChange={(value) => setMode(value as ViewMode)}
          data={[
            { label: "Theo ngày", value: "day" },
            { label: "Theo tuần", value: "week" },
          ]}
        />
      </Group>
      <Card withBorder>
        <Text c="dimmed" mb="sm">
          Hiển thị tự động theo chi nhánh bạn đang quản lý.
        </Text>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Thời gian</Table.Th>
              <Table.Th>Khách</Table.Th>
              <Table.Th>Chi nhánh</Table.Th>
              <Table.Th>Khu vực / Bàn</Table.Th>
              <Table.Th>Trạng thái</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bookings.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed">Không có booking trong khoảng thời gian đã chọn.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              bookings.map((booking) => {
                const customer = state.customers.find((item) => item.id === booking.customerId);
                const branch = state.branches.find((item) => item.id === booking.branchId);
                const area = state.areas.find((item) => item.id === booking.areaId);
                const table = state.tables.find((item) => item.id === booking.tableId);
                return (
                  <Table.Tr key={booking.id}>
                    <Table.Td>{dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY")}</Table.Td>
                    <Table.Td>{customer?.fullName}</Table.Td>
                    <Table.Td>{branch?.name}</Table.Td>
                    <Table.Td>
                      {area?.name} / {table?.name}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={bookingStatusColor[booking.status]} variant="light">
                        {bookingStatusLabel[booking.status]}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
