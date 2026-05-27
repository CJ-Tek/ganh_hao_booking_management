"use client";

import dayjs from "dayjs";
import { Button, Drawer, Group, Stack, Text } from "@mantine/core";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import { type DataTableSortStatus } from "mantine-datatable";
import { Phone } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalListSectionDesktop } from "@/components/portal-list/portal-list-section-desktop";
import {
  PortalListSectionEmptyState,
  PortalListSectionMobile,
} from "@/components/portal-list/portal-list-section-mobile";
import { PortalPageTitle } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { displayCustomerPhone } from "@/lib/booking-meta";
import { openPortalAlertModal, openPortalConfirmModal } from "@/lib/portal-confirm-modal";

const DRAWER_BOOKING_PAGE_SIZE = 8;
const MOBILE_CUSTOMER_PAGE_SIZE_OPTIONS = [6, 8, 10, 12, 20] as const;

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
  const { state, filteredBranchIds, deleteCustomers } = useAppContext();
  const isCompact = usePortalCompact();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CustomerBookingFilter>("all");
  const [listPage, setListPage] = useState(1);
  const [mobileListPageSize, setMobileListPageSize] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerBookingPage, setDrawerBookingPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListRow | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<CustomerListRow[]>([]);

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
    (records: CustomerListRow[], sortStatus: DataTableSortStatus<CustomerListRow>) => {
      const dir = sortStatus.direction === "asc" ? 1 : -1;
      const accessor = sortStatus.columnAccessor;
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

  const listTotalPages = Math.max(1, Math.ceil(searchFilteredRows.length / mobileListPageSize));
  const listPageSafe = Math.min(listPage, listTotalPages);
  const pagedCustomerRows = useMemo(
    () =>
      searchFilteredRows.slice(
        (listPageSafe - 1) * mobileListPageSize,
        listPageSafe * mobileListPageSize
      ),
    [listPageSafe, mobileListPageSize, searchFilteredRows]
  );

  const mobilePageSizeSelectData = useMemo(
    () =>
      MOBILE_CUSTOMER_PAGE_SIZE_OPTIONS.map((size) => ({
        value: String(size),
        label: String(size),
      })),
    []
  );

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
      totalBookings={searchFilteredRows.length}
      summaryItemLabel="khách"
    />
  );

  const openCustomerDetail = useCallback((row: CustomerListRow) => {
    setDrawerBookingPage(1);
    setSelectedCustomer(row);
  }, []);

  const handleDeleteSelected = async () => {
    const ids = selectedCustomers.map((customer) => customer.id);
    const hasBooking = state.bookings.some((booking) => ids.includes(booking.customerId));
    if (hasBooking) {
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
      {!isCompact ? (
        <Button
          color="red"
          variant="light"
          size="sm"
          disabled={selectedCustomers.length === 0}
          onClick={() => void handleDeleteSelected()}
          style={{ flexShrink: 0 }}
        >
          Xóa ({selectedCustomers.length})
        </Button>
      ) : null}
    </Group>
  );

  const filtersToolbar = (
    <BookingListFiltersToolbar
      searchQuery={query}
      onSearchQueryChange={(value) => {
        setQuery(value);
        setListPage(1);
      }}
      searchPlaceholder="Tìm tên hoặc SĐT"
      filtersOpen={filtersOpen}
      onFiltersOpenChange={setFiltersOpen}
      collapseFilters={
        <Text size="sm" c="dimmed">
          Không có bộ lọc thêm.
        </Text>
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
      defaultSort={{ columnAccessor: "latestBooking", direction: "desc" }}
      idAccessor="id"
      searchPlaceholder="Tìm tên hoặc SĐT"
      noRecordsText="Không tìm thấy khách hàng phù hợp."
      mobileSummaryItemLabel="khách"
      onRowClick={({ record }) => openCustomerDetail(record)}
      selectedRecords={selectedCustomers}
      onSelectedRecordsChange={setSelectedCustomers}
      mobileCardRender={(row) => (
        <CustomerCompactCard key={row.id} row={row} onClick={() => openCustomerDetail(row)} />
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
            Ghi chú: {selectedCustomer?.note || "Không có"}
          </Text>
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
    </Stack>
  );
}
