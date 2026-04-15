"use client";

import dayjs from "dayjs";
import {
  Drawer,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DataTable } from "mantine-datatable";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyPanel } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { Customer } from "@/lib/types";

export default function CustomersPage() {
  const { state, filteredBranchIds } = useAppContext();
  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const customerStats = useMemo(
    () =>
      state.customers
        .map((customer) => {
          const bookings = state.bookings.filter(
            (booking) =>
              booking.customerId === customer.id && filteredBranchIds.includes(booking.branchId)
          );
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

  return (
    <Stack>
      <PortalPageTitle>Quản lý khách hàng</PortalPageTitle>
      <PortalStickyPanel>
        <TextInput
          placeholder="Tìm theo tên hoặc số điện thoại"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </PortalStickyPanel>
      <PortalSectionCard>
        <DataTable
          minHeight={260}
          scrollAreaProps={portalDataTableScrollAreaProps}
          withTableBorder
          records={customerStats}
          noRecordsText="Không tìm thấy khách hàng phù hợp."
          onRowClick={({ record }) => setSelectedCustomer(record)}
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

      <Drawer
        opened={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        title="Hồ sơ khách hàng"
        position="right"
      >
        <Stack gap="xs">
          <Text>
            <b>Họ tên:</b> {selectedCustomer?.fullName}
          </Text>
          <Text>
            <b>Số điện thoại:</b> {selectedCustomer?.phone}
          </Text>
          <Text>
            <b>Ghi chú:</b> {selectedCustomer?.note || "Không có"}
          </Text>
          <Text fw={600} mt="sm">
            Lịch sử booking
          </Text>
          {state.bookings
            .filter((booking) => booking.customerId === selectedCustomer?.id)
            .map((booking) => (
              <PortalSectionCard key={booking.id} p="sm">
                <Group justify="space-between">
                  <Text size="sm">{booking.id}</Text>
                  <Text size="sm">{dayjs(booking.bookingAt).format("DD/MM HH:mm")}</Text>
                </Group>
              </PortalSectionCard>
            ))}
        </Stack>
      </Drawer>
    </Stack>
  );
}
