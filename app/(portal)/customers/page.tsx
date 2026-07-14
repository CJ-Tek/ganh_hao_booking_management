"use client";

import dayjs from "dayjs";
import { Button, Drawer, Group, Select, Stack, Text } from "@mantine/core";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import { BookingListDateRangeFilter } from "@/components/booking-management/booking-list-date-range-filter";
import { type DataTableSortStatus } from "mantine-datatable";
import { Phone } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PORTAL_SEARCH_QUERY_PARAM } from "@/lib/portal-advance-search";
import { BookingListFiltersToolbar } from "@/components/booking-management/booking-list-filters-toolbar";
import { BookingListPaginationBar } from "@/components/booking-management/booking-list-pagination";
import {
  CustomerBookingFilter,
  CustomerBookingFilterChips,
} from "@/components/customers/customer-booking-filter-chips";
import {
  CustomerCompactCard,
  type CustomerListRow,
} from "@/components/customers/customer-compact-card";
import { MergeCustomersModal } from "@/components/customers/merge-customers-modal";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalListSectionDesktop } from "@/components/portal-list/portal-list-section-desktop";
import {
  PortalListSectionEmptyState,
  PortalListSectionMobile,
} from "@/components/portal-list/portal-list-section-mobile";
import { PortalPageTitle } from "@/components/portal-page";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { useAppContext } from "@/contexts/app-context";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { displayCustomerPhone } from "@/lib/booking-meta";
import { openPortalAlertModal, openPortalConfirmModal } from "@/lib/portal-confirm-modal";

const DRAWER_BOOKING_PAGE_SIZE = 8;
const MOBILE_CUSTOMER_PAGE_SIZE_OPTIONS = [6, 8, 10, 12, 20] as const;
const DEFAULT_CUSTOMER_SORT: DataTableSortStatus<CustomerListRow> = {
  columnAccessor: "latestBooking",
  direction: "desc",
};
const CUSTOMER_SORT_OPTIONS = [
  { value: "latestBooking:desc", label: "Booking gần nhất" },
  { value: "latestBooking:asc", label: "Booking xa nhất" },
  { value: "createdAt:desc", label: "Mới tạo → Cũ" },
  { value: "createdAt:asc", label: "Cũ → Mới tạo" },
  { value: "updatedAt:desc", label: "Mới cập nhật → Cũ" },
  { value: "updatedAt:asc", label: "Cũ → Mới cập nhật" },
  { value: "fullName:asc", label: "Tên A → Z" },
  { value: "fullName:desc", label: "Tên Z → A" },
  { value: "bookingCount:desc", label: "Nhiều booking nhất" },
  { value: "bookingCount:asc", label: "Ít booking nhất" },
  { value: "phone:asc", label: "SĐT A → Z" },
  { value: "phone:desc", label: "SĐT Z → A" },
] as const;

function customerSortValue(sortStatus: DataTableSortStatus<CustomerListRow>): string {
  return `${String(sortStatus.columnAccessor)}:${sortStatus.direction}`;
}

function parseCustomerSortValue(
  value: string | null
): DataTableSortStatus<CustomerListRow> | null {
  if (!value) {
    return null;
  }
  const [columnAccessor, direction] = value.split(":");
  if (
    (columnAccessor !== "latestBooking" &&
      columnAccessor !== "createdAt" &&
      columnAccessor !== "updatedAt" &&
      columnAccessor !== "fullName" &&
      columnAccessor !== "bookingCount" &&
      columnAccessor !== "phone") ||
    (direction !== "asc" && direction !== "desc")
  ) {
    return null;
  }
  return {
    columnAccessor: columnAccessor as DataTableSortStatus<CustomerListRow>["columnAccessor"],
    direction,
  };
}

function applyCustomerBookingFilter(rows: CustomerListRow[], filter: CustomerBookingFilter) {
  if (filter === "has_booking") {
    return rows.filter((row) => row.bookingCount > 0);
  }
  if (filter === "no_booking") {
    return rows.filter((row) => row.bookingCount === 0);
  }
  return rows;
}

export default function CustomersPage() {
  const {
    state,
    filteredBranchIds,
    currentUser,
    deleteCustomers,
    mergeCustomers,
    purgeCustomersWithRelatedData,
    purgeDataInDateRange,
    canEditActiveBranch,
  } = useAppContext();
  const isCompact = usePortalCompact();
  const searchParams = useSearchParams();
  const consumedSearchFromUrlRef = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CustomerBookingFilter>("all");
  const [listPage, setListPage] = useState(1);
  const [mobileListPageSize, setMobileListPageSize] = useState(10);
  const [sortStatus, setSortStatus] =
    useState<DataTableSortStatus<CustomerListRow>>(DEFAULT_CUSTOMER_SORT);
  const [drawerBookingPage, setDrawerBookingPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListRow | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<CustomerListRow[]>([]);
  const [dateRangeModalOpen, setDateRangeModalOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [purgeRangeStart, setPurgeRangeStart] = useState(() =>
    dayjs().subtract(30, "day").format("YYYY-MM-DD")
  );
  const [purgeRangeEnd, setPurgeRangeEnd] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [isPurging, setIsPurging] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const canPurgeCustomerData =
    currentUser?.role === "general_manager" || currentUser?.role === "admin";
  const canSelectCustomers = canEditActiveBranch || canPurgeCustomerData;

  useEffect(() => {
    const queryFromUrl = searchParams.get(PORTAL_SEARCH_QUERY_PARAM);
    if (!queryFromUrl || consumedSearchFromUrlRef.current === queryFromUrl) {
      return;
    }
    consumedSearchFromUrlRef.current = queryFromUrl;
    setQuery(queryFromUrl);
    setListPage(1);
  }, [searchParams]);

  const customerRows = useMemo<CustomerListRow[]>(
    () =>
      state.customers.map((customer) => {
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
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        };
      }),
    [filteredBranchIds, state.bookings, state.customers]
  );

  const segmentFilteredRows = useMemo(
    () => applyCustomerBookingFilter(customerRows, filter),
    [customerRows, filter]
  );

  const getCustomerSearchValue = useCallback((row: CustomerListRow) => {
    const rawPhone = (row.phone ?? "").toLowerCase();
    return [row.fullName, rawPhone, displayCustomerPhone(row.phone)].join(" ").toLowerCase();
  }, []);

  const searchFilteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return segmentFilteredRows;
    }
    return segmentFilteredRows.filter((row) => getCustomerSearchValue(row).includes(q));
  }, [getCustomerSearchValue, query, segmentFilteredRows]);

  const sectionTitle = useMemo(
    () => `Khách hàng (${searchFilteredRows.length})`,
    [searchFilteredRows.length]
  );

  const sortCustomerRows = useCallback(
    (records: CustomerListRow[], nextSort: DataTableSortStatus<CustomerListRow>) => {
      const dir = nextSort.direction === "asc" ? 1 : -1;
      const accessor = nextSort.columnAccessor;
      return [...records].sort((a, b) => {
        if (accessor === "fullName") {
          return dir * a.fullName.localeCompare(b.fullName, "vi");
        }
        if (accessor === "phone") {
          return (
            dir *
            displayCustomerPhone(a.phone).localeCompare(displayCustomerPhone(b.phone), "vi")
          );
        }
        if (accessor === "bookingCount") {
          return dir * (a.bookingCount - b.bookingCount);
        }
        if (accessor === "createdAt") {
          const av = a.createdAt ? dayjs(a.createdAt).valueOf() : 0;
          const bv = b.createdAt ? dayjs(b.createdAt).valueOf() : 0;
          return dir * (av - bv);
        }
        if (accessor === "updatedAt") {
          const av = a.updatedAt ? dayjs(a.updatedAt).valueOf() : 0;
          const bv = b.updatedAt ? dayjs(b.updatedAt).valueOf() : 0;
          return dir * (av - bv);
        }
        if (accessor === "latestBooking") {
          const av = a.latestBooking ? dayjs(a.latestBooking).valueOf() : 0;
          const bv = b.latestBooking ? dayjs(b.latestBooking).valueOf() : 0;
          return dir * (av - bv);
        }
        return 0;
      });
    },
    []
  );

  const sortedFilteredRows = useMemo(
    () => sortCustomerRows(searchFilteredRows, sortStatus),
    [searchFilteredRows, sortCustomerRows, sortStatus]
  );

  const listTotalPages = Math.max(1, Math.ceil(sortedFilteredRows.length / mobileListPageSize));
  const listPageSafe = Math.min(listPage, listTotalPages);
  const pagedCustomerRows = useMemo(
    () =>
      sortedFilteredRows.slice(
        (listPageSafe - 1) * mobileListPageSize,
        listPageSafe * mobileListPageSize
      ),
    [listPageSafe, mobileListPageSize, sortedFilteredRows]
  );

  const mobilePageSizeSelectData = useMemo(
    () =>
      MOBILE_CUSTOMER_PAGE_SIZE_OPTIONS.map((size) => ({
        value: String(size),
        label: String(size),
      })),
    []
  );

  const rangePreview = useMemo(() => {
    const from = dayjs(purgeRangeStart).startOf("day");
    const to = dayjs(purgeRangeEnd).endOf("day");
    const inRange = state.bookings.filter((booking) => {
      const at = dayjs(booking.bookingAt);
      return !at.isBefore(from) && !at.isAfter(to);
    });
    const bookingIds = new Set(inRange.map((booking) => booking.id));
    const touchedCustomerIds = [...new Set(inRange.map((booking) => booking.customerId))];
    const remainingByCustomer = new Map<string, number>();
    for (const booking of state.bookings) {
      if (bookingIds.has(booking.id)) {
        continue;
      }
      remainingByCustomer.set(
        booking.customerId,
        (remainingByCustomer.get(booking.customerId) ?? 0) + 1
      );
    }
    const orphanCustomers = touchedCustomerIds.filter(
      (customerId) => !remainingByCustomer.has(customerId)
    );
    return {
      bookingCount: inRange.length,
      orphanCustomerCount: orphanCustomers.length,
    };
  }, [purgeRangeEnd, purgeRangeStart, state.bookings]);

  const customerPaginationBar = (
    <BookingListPaginationBar
      pageSize={mobileListPageSize}
      pageSizeSelectData={mobilePageSizeSelectData}
      onPageSizeChange={(size) => {
        setMobileListPageSize(size);
        setListPage(1);
      }}
      page={listPageSafe}
      totalPages={listTotalPages}
      onPageChange={setListPage}
      totalBookings={sortedFilteredRows.length}
    />
  );

  const openCustomerDetail = useCallback((row: CustomerListRow) => {
    setDrawerBookingPage(1);
    setSelectedCustomer(row);
  }, []);

  const runPurgeCustomers = async (ids: string[], bookingCount: number) => {
    const ok = await openPortalConfirmModal({
      title: "Xóa toàn bộ dữ liệu khách",
      message: `Xóa ${ids.length} khách hàng và ${bookingCount} booking liên quan? Hành động không thể hoàn tác.`,
      confirmLabel: "Xóa toàn bộ",
      confirmColor: "red",
    });
    if (!ok) {
      return;
    }
    setIsPurging(true);
    try {
      const result = await purgeCustomersWithRelatedData(ids);
      if (!result.ok) {
        openPortalAlertModal({
          title: "Không thể xóa",
          message: result.message,
        });
        return;
      }
      openPortalAlertModal({
        title: "Đã xóa",
        message: result.message,
      });
      setSelectedCustomers([]);
      setSelectedCustomer((prev) => (prev && ids.includes(prev.id) ? null : prev));
    } finally {
      setIsPurging(false);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = selectedCustomers.map((customer) => customer.id);
    const relatedBookingCount = state.bookings.filter((booking) =>
      ids.includes(booking.customerId)
    ).length;

    if (canPurgeCustomerData) {
      await runPurgeCustomers(ids, relatedBookingCount);
      return;
    }

    if (relatedBookingCount > 0) {
      openPortalAlertModal({
        title: "Không thể xóa",
        message: "Không thể xóa: có khách hàng đã có booking.",
      });
      return;
    }
    const ok = await openPortalConfirmModal({
      title: "Xóa khách hàng",
      message: `Xóa ${selectedCustomers.length} khách hàng? (Chỉ xóa khách chưa có booking)`,
      confirmLabel: "Xóa",
      confirmColor: "red",
    });
    if (!ok) {
      return;
    }
    const result = await deleteCustomers(ids);
    if (!result.ok) {
      openPortalAlertModal({
        title: "Không thể xóa",
        message: result.message,
      });
      return;
    }
    setSelectedCustomers([]);
  };

  const handlePurgeSelectedCustomer = async () => {
    if (!selectedCustomer || !canPurgeCustomerData) {
      return;
    }
    const bookingCount = state.bookings.filter(
      (booking) => booking.customerId === selectedCustomer.id
    ).length;
    await runPurgeCustomers([selectedCustomer.id], bookingCount);
  };

  const handlePurgeDateRange = async () => {
    if (!canPurgeCustomerData) {
      return;
    }
    if (!purgeRangeStart || !purgeRangeEnd) {
      openPortalAlertModal({
        title: "Khoảng thời gian không hợp lệ",
        message: "Vui lòng chọn đầy đủ từ ngày và đến ngày.",
      });
      return;
    }
    if (dayjs(purgeRangeStart).isAfter(dayjs(purgeRangeEnd), "day")) {
      openPortalAlertModal({
        title: "Khoảng thời gian không hợp lệ",
        message: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
      });
      return;
    }

    const fromIso = dayjs(purgeRangeStart).startOf("day").toISOString();
    const toIso = dayjs(purgeRangeEnd).endOf("day").toISOString();
    const ok = await openPortalConfirmModal({
      title: "Xóa dữ liệu theo khoảng thời gian",
      message: `Xóa khoảng ${rangePreview.bookingCount} booking từ ${dayjs(purgeRangeStart).format("DD/MM/YYYY")} đến ${dayjs(purgeRangeEnd).format("DD/MM/YYYY")}? Khoảng ${rangePreview.orphanCustomerCount} khách không còn booking sẽ bị xóa. Không thể hoàn tác.`,
      confirmLabel: "Xóa theo khoảng",
      confirmColor: "red",
    });
    if (!ok) {
      return;
    }

    setIsPurging(true);
    try {
      const result = await purgeDataInDateRange({ fromIso, toIso });
      if (!result.ok) {
        openPortalAlertModal({
          title: "Không thể xóa",
          message: result.message,
        });
        return;
      }
      openPortalAlertModal({
        title: "Đã xóa",
        message: result.message,
      });
      setDateRangeModalOpen(false);
      setSelectedCustomers([]);
      setSelectedCustomer(null);
    } finally {
      setIsPurging(false);
    }
  };

  const setCustomerSelected = useCallback((row: CustomerListRow, selected: boolean) => {
    setSelectedCustomers((prev) => {
      if (selected) {
        if (prev.some((item) => item.id === row.id)) {
          return prev;
        }
        return [...prev, row];
      }
      return prev.filter((item) => item.id !== row.id);
    });
  }, []);

  const selectCurrentPageCustomers = useCallback(() => {
    setSelectedCustomers((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      for (const row of pagedCustomerRows) {
        byId.set(row.id, row);
      }
      return [...byId.values()];
    });
  }, [pagedCustomerRows]);

  const equalWidthButtonStyle = isCompact
    ? { flex: "1 1 0", minWidth: 0, width: 0 }
    : undefined;

  const customerActionButtons = (
    <Group
      gap="xs"
      wrap={isCompact ? "nowrap" : "wrap"}
      w={isCompact ? "100%" : undefined}
      style={isCompact ? undefined : { flexShrink: 0 }}
    >
      {canEditActiveBranch ? (
        <Button
          color="orange"
          variant="light"
          size={isCompact ? "md" : "sm"}
          disabled={selectedCustomers.length < 2 || isPurging || isMerging}
          onClick={() => setMergeModalOpen(true)}
          style={equalWidthButtonStyle}
        >
          Gộp khách ({selectedCustomers.length})
        </Button>
      ) : null}
      {canPurgeCustomerData ? (
        <Button
          color="red"
          variant="outline"
          size={isCompact ? "md" : "sm"}
          onClick={() => setDateRangeModalOpen(true)}
          disabled={isPurging || isMerging}
          style={equalWidthButtonStyle}
        >
          Xóa theo thời gian
        </Button>
      ) : null}
      {canSelectCustomers ? (
        <Button
          color="red"
          variant="light"
          size={isCompact ? "md" : "sm"}
          disabled={selectedCustomers.length === 0 || isPurging || isMerging}
          onClick={() => void handleDeleteSelected()}
          style={equalWidthButtonStyle}
        >
          {canPurgeCustomerData
            ? `Xóa dữ liệu (${selectedCustomers.length})`
            : `Xóa (${selectedCustomers.length})`}
        </Button>
      ) : null}
    </Group>
  );

  const headerFilters = (
    <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm" w="100%">
      <CustomerBookingFilterChips
        value={filter}
        onChange={(value) => {
          setFilter(value);
          setListPage(1);
          setSelectedCustomers([]);
        }}
        size={isCompact ? "xs" : undefined}
      />
      {!isCompact ? customerActionButtons : null}
    </Group>
  );

  const customerSortSelect = (
    <Select
      label="Sắp xếp"
      data={[...CUSTOMER_SORT_OPTIONS]}
      value={customerSortValue(sortStatus)}
      onChange={(value) => {
        const next = parseCustomerSortValue(value) ?? DEFAULT_CUSTOMER_SORT;
        setSortStatus(next);
        setListPage(1);
      }}
      size={isCompact ? "md" : "sm"}
      w="100%"
      allowDeselect={false}
    />
  );

  const filtersToolbar = (
    <BookingListFiltersToolbar
      searchQuery={query}
      onSearchQueryChange={(value) => {
        setQuery(value);
        setListPage(1);
      }}
      searchPlaceholder="Tìm tên hoặc SĐT"
      inlineFilters={
        <Stack gap="sm" w="100%">
          {customerSortSelect}
          {customerActionButtons}
          {canSelectCustomers ? (
            <Group gap="xs" wrap="nowrap" w="100%">
              <Button
                variant="default"
                size={isCompact ? "md" : "sm"}
                onClick={selectCurrentPageCustomers}
                disabled={pagedCustomerRows.length === 0 || isPurging || isMerging}
                style={equalWidthButtonStyle}
              >
                Chọn trang ({pagedCustomerRows.length})
              </Button>
              <Button
                variant="default"
                size={isCompact ? "md" : "sm"}
                onClick={() => setSelectedCustomers([])}
                disabled={selectedCustomers.length === 0 || isPurging || isMerging}
                style={equalWidthButtonStyle}
              >
                Bỏ chọn
              </Button>
            </Group>
          ) : null}
        </Stack>
      }
    />
  );

  const customersTable = (
    <PortalDataTable<CustomerListRow>
      records={segmentFilteredRows}
      searchQuery={query}
      onSearchQueryChange={(value) => {
        setQuery(value);
        setListPage(1);
      }}
      getRecordSearchValue={getCustomerSearchValue}
      sortRecords={sortCustomerRows}
      defaultSort={DEFAULT_CUSTOMER_SORT}
      sortStatus={sortStatus}
      onSortStatusChange={(next) => {
        setSortStatus(next);
        setListPage(1);
      }}
      idAccessor="id"
      searchPlaceholder="Tìm tên hoặc SĐT"
      noRecordsText="Không tìm thấy khách hàng phù hợp."
      onRowClick={({ record }) => openCustomerDetail(record)}
      selectedRecords={canSelectCustomers ? selectedCustomers : []}
      onSelectedRecordsChange={canSelectCustomers ? setSelectedCustomers : undefined}
      mobileCardRender={(row) => (
        <CustomerCompactCard
          key={row.id}
          row={row}
          selected={selectedCustomers.some((item) => item.id === row.id)}
          onSelectedChange={
            canSelectCustomers
              ? (selected) => setCustomerSelected(row, selected)
              : undefined
          }
          selectionDisabled={isPurging || isMerging}
          onClick={() => openCustomerDetail(row)}
        />
      )}
      columns={[
        { accessor: "fullName", title: "Khách hàng", sortable: true },
        {
          accessor: "phone",
          title: "Điện thoại",
          sortable: true,
          render: (row) => displayCustomerPhone(row.phone),
        },
        { accessor: "bookingCount", title: "Số booking", sortable: true },
        {
          accessor: "createdAt",
          title: "Ngày tạo",
          sortable: true,
          render: (row) =>
            row.createdAt ? dayjs(row.createdAt).format("DD/MM/YYYY HH:mm") : "—",
        },
        {
          accessor: "updatedAt",
          title: "Ngày cập nhật",
          sortable: true,
          render: (row) =>
            row.updatedAt ? dayjs(row.updatedAt).format("DD/MM/YYYY HH:mm") : "—",
        },
        {
          accessor: "latestBooking",
          title: "Booking gần nhất",
          sortable: true,
          render: (row) =>
            row.latestBooking ? dayjs(row.latestBooking).format("DD/MM/YYYY HH:mm") : "—",
        },
      ]}
    />
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
    <Stack gap="md">
      <PortalPageTitle order={isCompact ? 3 : 2}>
        {isCompact ? "Khách hàng" : "Quản lý khách hàng"}
      </PortalPageTitle>

      {isCompact ? (
        <PortalListSectionMobile
          title={sectionTitle}
          headerFilters={headerFilters}
          filtersToolbar={filtersToolbar}
          paginationBar={customerPaginationBar}
        >
          {searchFilteredRows.length === 0 ? (
            <PortalListSectionEmptyState message="Không tìm thấy khách hàng phù hợp." />
          ) : (
            pagedCustomerRows.map((row) => (
              <CustomerCompactCard
                key={row.id}
                row={row}
                selected={selectedCustomers.some((item) => item.id === row.id)}
                onSelectedChange={
                  canSelectCustomers
                    ? (selected) => setCustomerSelected(row, selected)
                    : undefined
                }
                selectionDisabled={isPurging || isMerging}
                onClick={() => openCustomerDetail(row)}
              />
            ))
          )}
        </PortalListSectionMobile>
      ) : (
        <PortalListSectionDesktop title={sectionTitle} headerFilters={headerFilters}>
          {customersTable}
        </PortalListSectionDesktop>
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
            <Text fw={600}>{displayCustomerPhone(selectedCustomer?.phone)}</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Ngày tạo:{" "}
            {selectedCustomer?.createdAt
              ? dayjs(selectedCustomer.createdAt).format("DD/MM/YYYY HH:mm")
              : "—"}
          </Text>
          <Text size="sm" c="dimmed">
            Ngày cập nhật:{" "}
            {selectedCustomer?.updatedAt
              ? dayjs(selectedCustomer.updatedAt).format("DD/MM/YYYY HH:mm")
              : "—"}
          </Text>
          <Text size="sm" c="dimmed">
            Ghi chú: {selectedCustomer?.note || "Không có"}
          </Text>
          {canPurgeCustomerData ? (
            <Button
              color="red"
              variant="light"
              loading={isPurging}
              onClick={() => void handlePurgeSelectedCustomer()}
            >
              Xóa toàn bộ dữ liệu khách này
            </Button>
          ) : null}
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
                  const creator =
                    state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
                    "Không rõ";
                  const lastEditor =
                    booking.lastEditedByUserId != null
                      ? state.users.find((item) => item.id === booking.lastEditedByUserId)
                          ?.fullName
                      : undefined;

                  return (
                    <BookingCompactCard
                      key={booking.id}
                      booking={booking}
                      variant="list"
                      customerName={selectedCustomer?.fullName ?? "—"}
                      creatorName={creator}
                      bookingAreaTableLookup={{
                        areas: state.areas,
                        tables: state.tables,
                        mergeGroups: state.mergeGroups,
                      }}
                      lastEditorName={lastEditor}
                    />
                  );
                })}
                {customerBookings.length > DRAWER_BOOKING_PAGE_SIZE ? (
                  <Group justify="center" gap="xs" wrap="wrap">
                    <Button
                      variant="default"
                      size="compact-sm"
                      disabled={drawerBookingPageSafe <= 1}
                      onClick={() => setDrawerBookingPage((page) => Math.max(1, page - 1))}
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
                        setDrawerBookingPage((page) =>
                          Math.min(drawerBookingTotalPages, page + 1)
                        )
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

      <PortalStandardModal
        opened={dateRangeModalOpen}
        onClose={() => {
          if (!isPurging) {
            setDateRangeModalOpen(false);
          }
        }}
        closeOnClickOutside={!isPurging}
        closeOnEscape={!isPurging}
        title="Xóa dữ liệu theo khoảng thời gian"
        size="md"
        footer={
          <Group justify="flex-end" gap="sm" wrap="nowrap">
            <Button
              variant="default"
              disabled={isPurging}
              onClick={() => setDateRangeModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              color="red"
              loading={isPurging}
              disabled={rangePreview.bookingCount === 0}
              onClick={() => void handlePurgeDateRange()}
            >
              Xóa theo khoảng
            </Button>
          </Group>
        }
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Xóa mọi booking có giờ đặt trong khoảng đã chọn. Khách hàng không còn booking nào sẽ bị
            xóa luôn.
          </Text>
          <BookingListDateRangeFilter
            startDate={purgeRangeStart}
            endDate={purgeRangeEnd}
            onStartDateChange={setPurgeRangeStart}
            onEndDateChange={setPurgeRangeEnd}
            disabled={isPurging}
          />
          <Text size="sm">
            Dự kiến:{" "}
            <Text span fw={600}>
              {rangePreview.bookingCount}
            </Text>{" "}
            booking,{" "}
            <Text span fw={600}>
              {rangePreview.orphanCustomerCount}
            </Text>{" "}
            khách hàng sẽ bị xóa hết.
          </Text>
        </Stack>
      </PortalStandardModal>

      <MergeCustomersModal
        opened={mergeModalOpen}
        customers={selectedCustomers}
        onClose={() => {
          if (!isMerging) {
            setMergeModalOpen(false);
          }
        }}
        onConfirm={async (input) => {
          setIsMerging(true);
          try {
            const result = await mergeCustomers(input);
            if (!result.ok) {
              return result;
            }
            openPortalAlertModal({
              title: "Đã gộp khách",
              message: result.message,
            });
            const deletedIds = selectedCustomers
              .map((row) => row.id)
              .filter((id) => id !== result.survivorId);
            setSelectedCustomers([]);
            setSelectedCustomer((prev) =>
              prev && deletedIds.includes(prev.id) ? null : prev
            );
            setMergeModalOpen(false);
            return result;
          } finally {
            setIsMerging(false);
          }
        }}
      />
    </Stack>
  );
}
