"use client";

import dayjs from "dayjs";
import {
  Badge,
  Card,
  Grid,
  Group,
  RingProgress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusLabel, tableStatusLabel } from "@/lib/display";

export default function DashboardPage() {
  const { state, filteredBranchIds } = useAppContext();

  const branchBookings = state.bookings.filter((item) =>
    filteredBranchIds.includes(item.branchId)
  );
  const branchTables = state.tables.filter((item) => filteredBranchIds.includes(item.branchId));
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

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Dashboard tổng quan</Title>
          <Text c="dimmed">Chi nhánh đang theo dõi: {branchNames.join(", ")}</Text>
        </div>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Tổng booking
          </Text>
          <Title order={2}>{branchBookings.length}</Title>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Booking check-in
          </Text>
          <Title order={2}>{checkedInCount}</Title>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Bàn đang phục vụ
          </Text>
          <Title order={2}>{statusCounts.occupied}</Title>
        </Card>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            Bàn trống
          </Text>
          <Title order={2}>{statusCounts.available}</Title>
        </Card>
      </SimpleGrid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card withBorder h="100%">
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
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card withBorder>
            <Text fw={600} mb="sm">
              Lịch sử booking theo nhân viên
            </Text>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Mã</Table.Th>
                  <Table.Th>Giờ đặt</Table.Th>
                  <Table.Th>Người tạo</Table.Th>
                  <Table.Th>Trạng thái</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {branchBookings.slice(0, 8).map((booking) => {
                  const user = state.users.find((item) => item.id === booking.createdByUserId);
                  return (
                    <Table.Tr key={booking.id}>
                      <Table.Td>{booking.id}</Table.Td>
                      <Table.Td>{dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY")}</Table.Td>
                      <Table.Td>{user?.fullName ?? "Không rõ"}</Table.Td>
                      <Table.Td>
                        <Badge variant="light">{bookingStatusLabel[booking.status]}</Badge>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
