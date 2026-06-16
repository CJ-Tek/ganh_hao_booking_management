"use client";

import dayjs from "dayjs";
import { BarChart, ChartTooltip, DonutChart, getFilteredChartTooltipPayload } from "@mantine/charts";
import {
  Badge,
  Box,
  Grid,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useMemo, useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { BookingTablePicker } from "@/components/booking-table-picker/booking-table-picker";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import {
  bookingStatusColor,
  bookingStatusLabel,
  tableStatusColor,
  tableStatusLabel,
} from "@/lib/display";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type BookingStatus } from "@/lib/types";

export default function DashboardPage() {
  const { state, filteredBranchIds, currentUser } = useAppContext();
  const router = useRouter();
  const isCompact = usePortalCompact();
  const isEmployee = currentUser?.role === "employee";
  useEffect(() => {
    if (isEmployee) {
      router.replace("/floor-map");
    }
  }, [isEmployee, router]);

  const isManager = currentUser?.role === "manager";
  const accessibleBranchIds = useMemo(() => currentUser?.branchIds ?? [], [currentUser?.branchIds]);
  const accessibleBranches = useMemo(
    () => state.branches.filter((branch) => accessibleBranchIds.includes(branch.id)),
    [accessibleBranchIds, state.branches]
  );
  const dashboardBranches = useMemo(
    () => (isManager ? state.branches : accessibleBranches),
    [accessibleBranches, isManager, state.branches]
  );
  const activeBranchId = state.activeBranchId;
  const activeBranchName =
    activeBranchId != null ? state.branches.find((branch) => branch.id === activeBranchId)?.name : undefined;
  const otherBranches = useMemo(
    () => dashboardBranches.filter((branch) => branch.id !== activeBranchId),
    [dashboardBranches, activeBranchId]
  );

  const [compareBranchId, setCompareBranchId] = useState<string | null>(() => {
    if (activeBranchId) return activeBranchId;
    return accessibleBranchIds[0] ?? null;
  });
  const [otherBranchId, setOtherBranchId] = useState<string | null>(null);
  useEffect(() => {
    if (activeBranchId) {
      setCompareBranchId(activeBranchId);
      return;
    }
    if (accessibleBranchIds.length > 0) {
      setCompareBranchId((prev) => prev ?? accessibleBranchIds[0] ?? null);
    }
  }, [activeBranchId, accessibleBranchIds]);
  useEffect(() => {
    setOtherBranchId((prev) => {
      if (prev && otherBranches.some((branch) => branch.id === prev)) {
        return prev;
      }
      return otherBranches[0]?.id ?? null;
    });
  }, [activeBranchId, otherBranches]);

  const branchBookings = useMemo(
    () => state.bookings.filter((item) => filteredBranchIds.includes(item.branchId)),
    [filteredBranchIds, state.bookings]
  );
  const branchTables = useMemo(
    () => state.tables.filter((item) => filteredBranchIds.includes(item.branchId)),
    [filteredBranchIds, state.tables]
  );
  const checkedInCount = branchBookings.filter(
    (item) => item.status === "checked_in" || item.status === "seated"
  ).length;

  const branchDashboard = useMemo(() => {
    const build = (branchId: string | null) => {
      if (!branchId) {
        return null;
      }

      const bookings = state.bookings.filter((item) => item.branchId === branchId);
      const tables = state.tables.filter((item) => item.branchId === branchId);
      const checkedInCount = bookings.filter(
        (item) => item.status === "checked_in" || item.status === "seated"
      ).length;
      const statusCounts = {
        hold: tables.filter((table) => table.status === "hold").length,
        occupied: tables.filter((table) => table.status === "occupied").length,
        available: tables.filter((table) => table.status === "available").length,
        locked: tables.filter((table) => table.status === "locked").length,
      };
      const hiddenStatuses = new Set<BookingStatus>(["checked_in"]);
      const bookingStatusChart = (Object.keys(bookingStatusLabel) as BookingStatus[])
        .filter((status) => !hiddenStatuses.has(status))
        .map((status) => ({
          status,
          label: bookingStatusLabel[status],
          color: `${bookingStatusColor[status]}.6`,
          count: state.bookings.filter(
            (booking) => booking.branchId === branchId && booking.status === status
          ).length,
        }));
      const bookingStatusBarChart = {
        data: bookingStatusChart.map((entry) => ({
          status: entry.label,
          count: entry.count,
          color: entry.color,
        })),
        series: [{ name: "count", label: "Số lượng", color: "gray.6" }],
      };

      return {
        bookings,
        tables,
        checkedInCount,
        statusCounts,
        bookingStatusBarChart,
        mergeGroups: state.mergeGroups.filter((group) => group.branchId === branchId),
      };
    };

    return {
      active: build(activeBranchId ?? null),
      other: build(otherBranchId),
      compare: build(compareBranchId),
    };
  }, [
    activeBranchId,
    compareBranchId,
    otherBranchId,
    state.bookings,
    state.mergeGroups,
    state.tables,
  ]);

  const compareBranchName =
    compareBranchId != null ? state.branches.find((b) => b.id === compareBranchId)?.name : undefined;

  const syncPickerAreaId = useCallback(
    (branchId: string | null, setAreaId: Dispatch<SetStateAction<string | null>>) => {
      if (!branchId) {
        setAreaId(null);
        return;
      }

      const areas = state.areas
        .filter((area) => area.branchId === branchId)
        .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id));

      setAreaId((prev) => {
        if (prev && areas.some((area) => area.id === prev)) {
          return prev;
        }
        return areas[0]?.id ?? null;
      });
    },
    [state.areas]
  );

  const [activePickerAreaId, setActivePickerAreaId] = useState<string | null>(null);
  const [otherPickerAreaId, setOtherPickerAreaId] = useState<string | null>(null);
  const [pickerAreaId, setPickerAreaId] = useState<string | null>(null);

  useEffect(() => {
    syncPickerAreaId(activeBranchId ?? null, setActivePickerAreaId);
  }, [activeBranchId, syncPickerAreaId]);
  useEffect(() => {
    syncPickerAreaId(otherBranchId, setOtherPickerAreaId);
  }, [otherBranchId, syncPickerAreaId]);
  useEffect(() => {
    syncPickerAreaId(compareBranchId, setPickerAreaId);
  }, [compareBranchId, syncPickerAreaId]);

  const handleActivePickerAreaChange = useCallback((patch: { areaId?: string | null }) => {
    if (patch.areaId !== undefined) {
      setActivePickerAreaId(patch.areaId);
    }
  }, []);
  const handleOtherPickerAreaChange = useCallback((patch: { areaId?: string | null }) => {
    if (patch.areaId !== undefined) {
      setOtherPickerAreaId(patch.areaId);
    }
  }, []);
  const handlePickerAreaChange = useCallback((patch: { areaId?: string | null }) => {
    if (patch.areaId !== undefined) {
      setPickerAreaId(patch.areaId);
    }
  }, []);

  const statusCounts = {
    hold: branchTables.filter((table) => table.status === "hold").length,
    occupied: branchTables.filter((table) => table.status === "occupied").length,
    available: branchTables.filter((table) => table.status === "available").length,
    locked: branchTables.filter((table) => table.status === "locked").length,
  };

  const buildTableStatusDonutData = (counts: typeof statusCounts) =>
    (["hold", "occupied", "available", "locked"] as const).map((status) => ({
      name: tableStatusLabel[status],
      value: counts[status],
      color: `${tableStatusColor[status]}.6`,
    }));

  const renderTableStatusDonut = (counts: typeof statusCounts, total: number) => {
    const allItems = buildTableStatusDonutData(counts);
    const chartItems = allItems.filter((item) => item.value > 0);
    const hasChartSegments = chartItems.length > 0;

    return (
      <Group align="center" gap="sm" wrap="nowrap" mt="md">
        <Box style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
          <DonutChart
            style={{ flexShrink: 0 }}
            data={
              hasChartSegments
                ? chartItems
                : [{ name: tableStatusLabel.available, value: 1, color: "gray.4" }]
            }
            chartLabel={`${counts.occupied}/${total}`}
            size={isCompact ? 160 : 180}
            thickness={isCompact ? 16 : 18}
            withTooltip
            tooltipDataSource="segment"
          />
        </Box>
        <Stack gap={8} w={isCompact ? 136 : 148} style={{ flexShrink: 0 }}>
          {allItems.map((item) => (
            <Badge
              key={item.name}
              variant="light"
              color={item.color.split(".")[0]}
              size="lg"
              radius="sm"
              w="100%"
              styles={{ root: { justifyContent: "center" } }}
            >
              {item.name} {item.value}
            </Badge>
          ))}
        </Stack>
      </Group>
    );
  };

  const statGrid = (
    <SimpleGrid cols={{ base: 2, sm: 2, lg: 4 }} spacing={isCompact ? "sm" : "md"}>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed" fw={600}>
          Tổng booking
        </Text>
        <Title order={2}>{branchBookings.length}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed" fw={600}>
          Đã check-in
        </Text>
        <Title order={2}>{checkedInCount}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed" fw={600}>
          Bàn phục vụ
        </Text>
        <Title order={2}>{statusCounts.occupied}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed" fw={600}>
          Bàn trống
        </Text>
        <Title order={2}>{statusCounts.available}</Title>
      </PortalSectionCard>
    </SimpleGrid>
  );

  const renderBranchStatGrid = (dashboard: NonNullable<typeof branchDashboard.compare>) => (
    <SimpleGrid cols={{ base: 2, sm: 2, lg: 4 }} spacing={isCompact ? "sm" : "md"}>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed" fw={600}>
          Tổng booking
        </Text>
        <Title order={2}>{dashboard.bookings.length}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed" fw={600}>
          Đã check-in
        </Text>
        <Title order={2}>{dashboard.checkedInCount}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed" fw={600}>
          Bàn phục vụ
        </Text>
        <Title order={2}>{dashboard.statusCounts.occupied}</Title>
      </PortalSectionCard>
      <PortalSectionCard padding={isCompact ? "sm" : "md"}>
        <Text size="xs" c="dimmed" fw={600}>
          Bàn trống
        </Text>
        <Title order={2}>{dashboard.statusCounts.available}</Title>
      </PortalSectionCard>
    </SimpleGrid>
  );

  const renderBranchRingSection = (dashboard: NonNullable<typeof branchDashboard.compare>) => (
    <PortalSectionCard h="100%" padding={isCompact ? "sm" : "md"}>
      <Text fw={700} size={isCompact ? "sm" : "md"} lineClamp={1}>
        Bàn theo trạng thái
      </Text>
      {renderTableStatusDonut(dashboard.statusCounts, dashboard.tables.length)}
    </PortalSectionCard>
  );

  const renderBookingStatusChartSection = (dashboard: NonNullable<typeof branchDashboard.compare>) => (
    <PortalSectionCard padding={isCompact ? "sm" : "md"}>
      <Text size="sm" c="black" fw={700} mb="xs">
        Booking theo trạng thái
      </Text>
      <BarChart
        h={isCompact ? 280 : 320}
        data={dashboard.bookingStatusBarChart.data}
        dataKey="status"
        orientation="vertical"
        yAxisProps={{ width: isCompact ? 100 : 124 }}
        gridAxis="x"
        tickLine="x"
        withTooltip
        valueFormatter={(value) => String(value)}
        series={dashboard.bookingStatusBarChart.series}
        tooltipProps={{
          content: ({ label, payload }) => (
            <ChartTooltip
              label={label}
              payload={getFilteredChartTooltipPayload(payload).map((item) => ({
                ...item,
                color: item.payload?.color ?? item.color,
              }))}
              series={dashboard.bookingStatusBarChart.series}
              valueFormatter={(value) => String(value)}
            />
          ),
        }}
      />
    </PortalSectionCard>
  );

  const renderBranchAreaPickerSection = (
    branchId: string,
    dashboard: NonNullable<typeof branchDashboard.compare>,
    areaId: string | null,
    onChange: (patch: { areaId?: string | null }) => void
  ) => (
    <PortalSectionCard padding={isCompact ? "sm" : "md"}>
      <BookingTablePicker
        readOnly
        mode="create"
        branchId={branchId}
        areas={state.areas}
        tables={state.tables}
        mergeGroups={dashboard.mergeGroups}
        bookings={state.bookings}
        layoutDate={dayjs().format("YYYY-MM-DD")}
        areaId={areaId}
        tableId={null}
        mergeGroupId={null}
        onChange={onChange}
      />
    </PortalSectionCard>
  );

  const renderBranchDetailStack = (
    branchId: string | null,
    dashboard: typeof branchDashboard.compare,
    areaId: string | null,
    onPickerChange: (patch: { areaId?: string | null }) => void
  ) => {
    if (!branchId || !dashboard) {
      return (
        <Text size="sm" c="dimmed">
          Tài khoản này chưa được gán chi nhánh.
        </Text>
      );
    }

    return (
      <Stack gap="md">
        {renderBranchStatGrid(dashboard)}
        {renderBranchRingSection(dashboard)}
        {renderBookingStatusChartSection(dashboard)}
        {renderBranchAreaPickerSection(branchId, dashboard, areaId, onPickerChange)}
      </Stack>
    );
  };

  const ringStatusSection = (
    <PortalSectionCard h="100%" padding={isCompact ? "sm" : "md"}>
      <Text fw={600} size={isCompact ? "sm" : "md"}>
        Bàn theo trạng thái
      </Text>
      {renderTableStatusDonut(statusCounts, branchTables.length)}
    </PortalSectionCard>
  );

  const compareStatGrid = branchDashboard.compare ? renderBranchStatGrid(branchDashboard.compare) : null;
  const compareRingStatusSection = branchDashboard.compare
    ? renderBranchRingSection(branchDashboard.compare)
    : null;
  const bookingStatusChartSection = branchDashboard.compare
    ? renderBookingStatusChartSection(branchDashboard.compare)
    : null;
  const branchAreaPickerSection =
    compareBranchId != null && branchDashboard.compare
      ? renderBranchAreaPickerSection(
          compareBranchId,
          branchDashboard.compare,
          pickerAreaId,
          handlePickerAreaChange
        )
      : null;

  return (
    <Stack gap="md">
      <PortalPageTitle order={isCompact ? 3 : 2}>
        {isCompact ? "Tổng quan" : "Dashboard tổng quan"}
      </PortalPageTitle>

      {isCompact ? (
        <Tabs defaultValue="overview" keepMounted={false}>
          <Tabs.List grow>
            <Tabs.Tab value="overview">{activeBranchName ?? "Tổng quan"}</Tabs.Tab>
            <Tabs.Tab value="branches">Theo chi nhánh</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="overview" pt="md">
            {renderBranchDetailStack(
              activeBranchId ?? null,
              branchDashboard.active,
              activePickerAreaId,
              handleActivePickerAreaChange
            )}
          </Tabs.Panel>
          <Tabs.Panel value="branches" pt="md">
            <Stack gap="md">
              {otherBranches.length > 0 ? (
                <SegmentedControl
                  fullWidth
                  value={otherBranchId ?? undefined}
                  onChange={(value) => setOtherBranchId(value)}
                  data={otherBranches.map((branch) => ({ value: branch.id, label: branch.name }))}
                />
              ) : null}
              {otherBranches.length > 0 ? (
                renderBranchDetailStack(
                  otherBranchId,
                  branchDashboard.other,
                  otherPickerAreaId,
                  handleOtherPickerAreaChange
                )
              ) : (
                <Text size="sm" c="dimmed">
                  Không có chi nhánh khác để xem.
                </Text>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      ) : (
        <>
          {statGrid}
          <Grid>
            <Grid.Col span={{ base: 12, lg: 4 }}>{ringStatusSection}</Grid.Col>
          </Grid>

          <PortalSectionCard padding="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-end" wrap="nowrap">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={700} size="md" lineClamp={1}>
                    Xem nhanh theo chi nhánh
                  </Text>
                  <Text size="sm" c="dimmed" lineClamp={2}>
                    Chuyển nhanh để xem số liệu tóm tắt từng chi nhánh (không thay đổi chi nhánh đang chọn trên thanh tiêu đề).
                  </Text>
                </Stack>
                {compareBranchName ? (
                  <Badge variant="light" color="brand" style={{ flexShrink: 0 }}>
                    {compareBranchName}
                  </Badge>
                ) : null}
              </Group>

              {dashboardBranches.length <= 1 ? null : (
                <SegmentedControl
                  fullWidth
                  value={compareBranchId ?? undefined}
                  onChange={(value) => setCompareBranchId(value)}
                  data={dashboardBranches.map((b) => ({ value: b.id, label: b.name }))}
                />
              )}

              {compareBranchId ? (
                <Stack gap="md">
                  <Grid>
                    <Grid.Col span={{ base: 12, lg: 7 }}>{compareStatGrid}</Grid.Col>
                    <Grid.Col span={{ base: 12, lg: 5 }}>{compareRingStatusSection}</Grid.Col>
                  </Grid>
                  {bookingStatusChartSection}
                  {branchAreaPickerSection}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Tài khoản này chưa được gán chi nhánh.
                </Text>
              )}
            </Stack>
          </PortalSectionCard>
        </>
      )}
    </Stack>
  );
}
