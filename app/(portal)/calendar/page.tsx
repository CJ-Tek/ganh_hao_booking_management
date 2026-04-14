"use client";

import dayjs from "dayjs";
import {
  Badge,
  Group,
  SegmentedControl,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyHeader } from "@/components/portal-page";
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
      <PortalStickyHeader justify="space-between" align="end" wrap="wrap">
        <PortalPageTitle>Lịch đặt bàn theo ngày / tuần</PortalPageTitle>
        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(value) => setMode(value as ViewMode)}
          data={[
            { label: "Theo ngày", value: "day" },
            { label: "Theo tuần", value: "week" },
          ]}
        />
      </PortalStickyHeader>
      <PortalSectionCard>
        <Text c="dimmed" mb="sm">
          Hiển thị tự động theo chi nhánh bạn đang quản lý.
        </Text>
        <Stack hiddenFrom="sm" gap="sm">
          {bookings.length === 0 ? (
            <PortalSectionCard p="sm">
              <Text c="dimmed" size="sm">
                Không có booking trong khoảng thời gian đã chọn.
              </Text>
            </PortalSectionCard>
          ) : (
            bookings.map((booking) => {
              const customer = state.customers.find((item) => item.id === booking.customerId);
              const branch = state.branches.find((item) => item.id === booking.branchId);
              const area = state.areas.find((item) => item.id === booking.areaId);
              const table = state.tables.find((item) => item.id === booking.tableId);
              return (
                <PortalSectionCard key={booking.id} p="sm">
                  <Group justify="space-between" mb={6}>
                    <Text fw={700}>{dayjs(booking.bookingAt).format("HH:mm DD/MM")}</Text>
                    <Badge color={bookingStatusColor[booking.status]} variant="light">
                      {bookingStatusLabel[booking.status]}
                    </Badge>
                  </Group>
                  <Stack gap={4}>
                    <Text size="sm">Khách: {customer?.fullName ?? "Không rõ"}</Text>
                    <Text size="sm" c="dimmed">
                      Chi nhánh: {branch?.name ?? "-"}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Khu vực / Bàn: {area?.name} / {table?.name}
                    </Text>
                  </Stack>
                </PortalSectionCard>
              );
            })
          )}
        </Stack>

        <Table.ScrollContainer minWidth={780} visibleFrom="sm">
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
        </Table.ScrollContainer>
      </PortalSectionCard>
    </Stack>
  );
}
