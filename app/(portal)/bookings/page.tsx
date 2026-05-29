"use client";

import dayjs from "dayjs";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Group,
  Modal,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { BookingDateTimeFields } from "@/components/booking-datetime-fields";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { type DataTableSortStatus } from "mantine-datatable";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { GuestCountNumberInput } from "@/components/booking-management/guest-count-number-input";
import { BookingOrderDetailModal } from "@/components/booking-management/booking-order-detail-modal";
import { BookingRowActions } from "@/components/booking-management/booking-row-actions";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import { BookingListDesktopSection } from "@/components/booking-management/booking-list-desktop-section";
import {
  BookingListFiltersToolbar,
  BookingListTableAssignFilter,
} from "@/components/booking-management/booking-list-filters-toolbar";
import {
  BookingListMobileEmptyState,
  BookingListMobileView,
} from "@/components/booking-management/booking-list-mobile-view";
import { BookingListPaginationBar } from "@/components/booking-management/booking-list-pagination";
import { ChangeBookingTableModal } from "@/components/floor-map/change-booking-table-modal";
import { confirmDuplicateBookingSecond } from "@/components/booking-duplicate-confirm";
import { useAppContext } from "@/contexts/app-context";
import {
  bookingSlotKey,
  DUPLICATE_BOOKING_CODE,
  formatBookingDuplicateAlertMessage,
  isPlausibleVietnamPhone,
  normalizeVietnamPhone,
} from "@/lib/booking-duplicate";
import {
  bookingListStatusFilterStatuses,
  bookingPipelineStatusFilterStatuses,
  bookingStatusColor,
  bookingStatusLabel,
} from "@/lib/display";
import {
  displayCustomerPhone,
  findAssignableSlotConflictsAtTable,
  formatTableSlotConflictMessage,
  bookingAreaTableSortKey,
  formatBookingAreaTable,
  formatTodayBookingAreaTable,
  isBookingTableAssigned,
  getAssignableCandidateTables,
  getReceptionBookingStatus,
  inferGuestTypeLabel,
  isGuestCountSpecified,
  isSyntheticPhoneValue,
  getAssignableMergeGroups,
  hasAssignableSlotConflictAtMergeGroup,
  stripUnknownGuestTag,
} from "@/lib/booking-meta";
import { bookingCardBusyProps, bookingListRowStyle } from "@/lib/busy-row-style";
import { useBusyId } from "@/lib/use-busy-id";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking, type BookingStatus } from "@/lib/types";

function branchScopeKey(branchIds: string[]) {
  return [...branchIds].sort().join("|") || "none";
}

/** After `modals.close`, the Mantine overlay can still cover the viewport during exit (notably on mobile). */
const LIST_BOOKING_PULSE_CYCLE_MS = 600;
const LIST_BOOKING_PULSE_CYCLES = 2;
const LIST_BOOKING_PULSE_TOTAL_MS = LIST_BOOKING_PULSE_CYCLE_MS * LIST_BOOKING_PULSE_CYCLES;

/** Page `<Modal>` stacks above Mantine `modals`; portaled overlays need a higher z-index. */
const MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX = 600;
const MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX = 700;

const portalModalOverlayPopoverProps = {
  zIndex: MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX,
  withinPortal: true,
} as const;

function bookingLastEditorName(
  booking: Pick<Booking, "lastEditedByUserId">,
  users: { id: string; fullName: string }[]
): string {
  if (!booking.lastEditedByUserId) {
    return "—";
  }
  return users.find((item) => item.id === booking.lastEditedByUserId)?.fullName ?? "Không rõ";
}

export default function BookingsPage() {
  const { filteredBranchIds } = useAppContext();
  return <BookingsPageContent key={branchScopeKey(filteredBranchIds)} />;
}

function BookingsPageContent() {
  const {
    state,
    filteredBranchIds,
    assignBookingToTable,
    updateBookingGuestCount,
    updateBookingOrder,
    changeBookingTable,
    updateBookingStatus,
    checkInBooking,
    hasSupabase,
    createTableMergeGroup,
  } = useAppContext();

  const isCompact = usePortalCompact();
  const {
    busyId: busyBookingId,
    isBusy: isBookingRowBusy,
    run: runBookingRowAction,
  } = useBusyId();
  const branchId = filteredBranchIds[0] ?? null;
  const branchName =
    branchId ? state.branches.find((b) => b.id === branchId)?.name ?? "—" : "—";

  const receptionThresholds = useMemo(
    () => ({
      groupPartyGuestThreshold: state.bookingRuntimeSettings.groupPartyGuestThreshold,
      repeatCustomerMinCompleted: state.bookingRuntimeSettings.repeatCustomerMinCompleted,
      receptionArrivalGraceMinutes: state.bookingRuntimeSettings.receptionArrivalGraceMinutes,
      noShowGraceMinutes: state.bookingRuntimeSettings.noShowGraceMinutes,
    }),
    [state.bookingRuntimeSettings]
  );

  const [activeTab, setActiveTab] = useState<string | null>("today");
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editBookingAt, setEditBookingAt] = useState<string | null>(null);
  const [editGuestCount, setEditGuestCount] = useState<number | undefined>(undefined);
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editAreaId, setEditAreaId] = useState<string | null>(null);
  const [editTableId, setEditTableId] = useState<string | null>(null);
  const [editMergeGroupId, setEditMergeGroupId] = useState<string | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [mobileDetailBooking, setMobileDetailBooking] = useState<Booking | null>(null);
  const [mobileDetailSource, setMobileDetailSource] = useState<"list" | "today">("list");
  const [listMobileFiltersOpen, setListMobileFiltersOpen] = useState(false);
  const [todayMobileFiltersOpen, setTodayMobileFiltersOpen] = useState(false);
  const [listFocusBookingId, setListFocusBookingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [listStatusFilter, setListStatusFilter] = useState<BookingStatus | null>(null);
  const [listTableAssignFilter, setListTableAssignFilter] = useState<
    "all" | "assigned" | "unassigned"
  >("all");
  const [assignFormBooking, setAssignFormBooking] = useState<Booking | null>(null);
  const [assignManualGuestCount, setAssignManualGuestCount] = useState<number | undefined>(undefined);
  const [assignAreaId, setAssignAreaId] = useState<string | null>(null);
  const [assignTableId, setAssignTableId] = useState<string | null>(null);
  const [assignMergeGroupId, setAssignMergeGroupId] = useState<string | null>(null);
  const [isAssignSaving, setIsAssignSaving] = useState(false);
  const [changeTableBooking, setChangeTableBooking] = useState<Booking | null>(null);
  const [isChangeTableSaving, setIsChangeTableSaving] = useState(false);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "bookingAt",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  /** Desktop DataTable — user-chosen rows per page. */
  const DESKTOP_BOOKINGS_PAGE_SIZE_OPTIONS = [8, 12, 16, 24, 32] as const;
  const [desktopBookingsPageSize, setDesktopBookingsPageSize] = useState(8);
  /** Mobile card list — user-chosen page size. */
  const MOBILE_BOOKINGS_PAGE_SIZE_OPTIONS = [4, 6, 8, 12, 16] as const;
  const [mobileBookingsPageSize, setMobileBookingsPageSize] = useState<number>(8);

  const [todaySearchQuery, setTodaySearchQuery] = useState("");
  const [todayStatusFilter, setTodayStatusFilter] = useState<BookingStatus | null>(null);
  const [todayGuestTypeFilter, setTodayGuestTypeFilter] = useState<string | null>(null);

  const [todaySortStatus, setTodaySortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "bookingAt",
    direction: "asc",
  });
  const [todayPage, setTodayPage] = useState(1);
  const TODAY_DESKTOP_PAGE_SIZE_OPTIONS = [8, 12, 16, 24, 32] as const;
  const [todayDesktopPageSize, setTodayDesktopPageSize] = useState(12);

  const listPageSize = isCompact ? mobileBookingsPageSize : desktopBookingsPageSize;
  const todayPageSize = isCompact ? mobileBookingsPageSize : todayDesktopPageSize;
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
        await runBookingRowAction(booking.id, async () => {
          try {
            await updateBookingStatus(booking.id, "cancelled");
            notifications.show({ color: "green", message: "Đã hủy booking." });
          } catch (error) {
            notifications.show({
              color: "red",
              message: error instanceof Error ? error.message : "Không hủy được booking.",
            });
          }
        });
      },
    });
  };

  const openCompleteBookingConfirm = (booking: Booking) => {
    const customer = state.customers.find((c) => c.id === booking.customerId);
    const name = customer?.fullName ?? "—";
    const timeStr = dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY");
    modals.openConfirmModal({
      title: "Xác nhận hoàn thành",
      children: (
        <Text size="sm">
          Đánh dấu booking của <strong>{name}</strong> · {timeStr} là đã hoàn thành?
        </Text>
      ),
      labels: { cancel: "Quay lại", confirm: "Hoàn thành" },
      confirmProps: { color: "green" },
      onConfirm: async () => {
        if (!hasSupabase) {
          notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
          return;
        }
        await runBookingRowAction(booking.id, async () => {
          try {
            await updateBookingStatus(booking.id, "completed");
            notifications.show({ color: "green", message: "Đã hoàn thành booking." });
          } catch (error) {
            notifications.show({
              color: "red",
              message:
                error instanceof Error ? error.message : "Không hoàn thành được booking.",
            });
          }
        });
      },
    });
  };

  const runCheckIn = async (bookingId: string) => {
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    await runBookingRowAction(bookingId, async () => {
      try {
        await checkInBooking(bookingId);
        notifications.show({ color: "green", message: "Đã check-in." });
      } catch (error) {
        notifications.show({
          color: "red",
          message: error instanceof Error ? error.message : "Check-in thất bại.",
        });
      }
    });
  };

  const branchBookings = useMemo(
    () => state.bookings.filter((booking) => filteredBranchIds.includes(booking.branchId)),
    [filteredBranchIds, state.bookings]
  );

  const bookingAreaTableLookup = useMemo(
    () => ({
      areas: state.areas,
      tables: state.tables,
      mergeGroups: state.mergeGroups,
    }),
    [state.areas, state.mergeGroups, state.tables]
  );

  const editBookingSlotKey = useMemo(
    () => (editBookingAt ? bookingSlotKey(editBookingAt) : null),
    [editBookingAt]
  );

  const editNormalizedPhone = useMemo(
    () => normalizeVietnamPhone(editCustomerPhone.trim()),
    [editCustomerPhone]
  );

  const editDuplicateCandidates = useMemo(() => {
    if (!editBooking || !editBookingSlotKey || !editNormalizedPhone) {
      return [];
    }
    if (!isPlausibleVietnamPhone(editNormalizedPhone)) {
      return [];
    }
    return branchBookings.filter((booking) => {
      if (booking.id === editBooking.id) {
        return false;
      }
      const customer = state.customers.find((item) => item.id === booking.customerId);
      if (!customer?.phone || isSyntheticPhoneValue(customer.phone)) {
        return false;
      }
      const bookingPhone = normalizeVietnamPhone(customer.phone);
      if (bookingPhone !== editNormalizedPhone) {
        return false;
      }
      const slot = bookingSlotKey(booking.bookingAt);
      if (!slot) {
        return false;
      }
      return (
        slot.dayKey === editBookingSlotKey.dayKey && slot.timeKey === editBookingSlotKey.timeKey
      );
    });
  }, [branchBookings, editBooking, editBookingSlotKey, editNormalizedPhone, state.customers]);

  const editDuplicateWarningMessage = useMemo(
    () =>
      formatBookingDuplicateAlertMessage(
        editDuplicateCandidates.map((item) => {
          const customer = state.customers.find((c) => c.id === item.customerId);
          return {
            bookingId: item.id,
            bookingAt: item.bookingAt,
            guestCount: item.guestCount,
            receiverFullName:
              state.users.find((u) => u.id === item.createdByUserId)?.fullName ?? "Không rõ",
          };
        }),
        editBookingAt ?? undefined
      ),
    [editBookingAt, editDuplicateCandidates, state.customers, state.users]
  );

  const editAssignCandidate = useMemo((): Booking | null => {
    if (!editBooking || !editBookingAt) {
      return null;
    }
    const startIso = dayjs(editBookingAt).toISOString();
    const endIso = dayjs(editBookingAt)
      .add(state.bookingRuntimeSettings.standardTurnaroundMinutes, "minute")
      .toISOString();
    return {
      ...editBooking,
      bookingAt: startIso,
      startTime: startIso,
      endTime: endIso,
      areaId: editAreaId,
      tableId: editTableId,
      mergeGroupId: editMergeGroupId,
    };
  }, [
    editAreaId,
    editBooking,
    editBookingAt,
    editMergeGroupId,
    editTableId,
    state.bookingRuntimeSettings.standardTurnaroundMinutes,
  ]);

  const editTableSlotConflicts = useMemo(() => {
    if (!editAssignCandidate?.tableId) {
      return [];
    }
    return findAssignableSlotConflictsAtTable(
      editAssignCandidate,
      editAssignCandidate.tableId,
      branchBookings
    );
  }, [branchBookings, editAssignCandidate]);

  const editMergeGroupSlotBlocked = useMemo(() => {
    if (!editAssignCandidate?.mergeGroupId) {
      return false;
    }
    const group = state.mergeGroups.find(
      (item) => item.id === editAssignCandidate.mergeGroupId
    );
    if (!group) {
      return false;
    }
    return hasAssignableSlotConflictAtMergeGroup(editAssignCandidate, group, branchBookings);
  }, [branchBookings, editAssignCandidate, state.mergeGroups]);

  const editTableConflictMessage = useMemo(() => {
    if (editMergeGroupId && editMergeGroupSlotBlocked) {
      const groupName =
        state.mergeGroups.find((item) => item.id === editMergeGroupId)?.mergedName ?? "cụm gộp";
      return `Khung giờ mới trùng với booking khác trên ${groupName}.`;
    }
    if (!editTableId || editTableSlotConflicts.length === 0) {
      return null;
    }
    const tableName = state.tables.find((item) => item.id === editTableId)?.name;
    const conflictCustomer = state.customers.find(
      (item) => item.id === editTableSlotConflicts[0]?.customerId
    )?.fullName;
    return formatTableSlotConflictMessage(editTableSlotConflicts, {
      tableName,
      customerName: conflictCustomer,
    });
  }, [
    editMergeGroupId,
    editMergeGroupSlotBlocked,
    editTableId,
    editTableSlotConflicts,
    state.customers,
    state.mergeGroups,
    state.tables,
  ]);

  const tableAssignFilterOptions = useMemo(
    () => [
      { value: "all", label: "Tất cả" },
      { value: "assigned", label: "Đã gán bàn" },
      { value: "unassigned", label: "Chưa gán bàn" },
    ],
    []
  );

  const pipelineFilteredBookings = useMemo(() => {
    return branchBookings.filter((booking) => {
      if (listStatusFilter === null) {
        if (booking.status === "completed") {
          return false;
        }
      } else if (booking.status !== listStatusFilter) {
        return false;
      }
      const hasTable = isBookingTableAssigned(booking);
      if (listTableAssignFilter === "assigned" && !hasTable) {
        return false;
      }
      if (listTableAssignFilter === "unassigned" && hasTable) {
        return false;
      }
      return true;
    });
  }, [branchBookings, listStatusFilter, listTableAssignFilter]);

  /** Use booking.branchId — not filteredBranchIds[0] — so areas/tables match the booking's chi nhánh. */
  const getCandidateTables = (booking: Booking) =>
    getAssignableCandidateTables(booking, state.tables, state.bookings);

  type AssignPersistMode = "default" | "keepModalSynced";

  const runAssign = async (
    booking: Booking,
    target: { areaId: string; tableId: string; guestCount?: number },
    persist?: AssignPersistMode
  ) => {
    setIsAssignSaving(true);
    try {
      const result = await assignBookingToTable({
        bookingId: booking.id,
        areaId: target.areaId,
        tableId: target.tableId,
        guestCount: target.guestCount,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok && persist === "keepModalSynced") {
        setAssignAreaId(target.areaId);
        setAssignTableId(target.tableId);
        setAssignMergeGroupId(null);
        const guest =
          typeof target.guestCount === "number" && Number.isFinite(target.guestCount)
            ? Math.max(1, target.guestCount)
            : booking.guestCount;
        setAssignFormBooking((prev) =>
          prev?.id === booking.id
            ? {
                ...prev,
                areaId: target.areaId,
                tableId: target.tableId,
                mergeGroupId: null,
                guestCount: guest,
              }
            : prev
        );
      } else if (result.ok && persist !== "keepModalSynced") {
        setAssignFormBooking(null);
      }
    } finally {
      setIsAssignSaving(false);
    }
  };

  /** Assign a booking to an existing merge group (Dùng cụm có sẵn). */
  const runAssignToMergeGroup = async (
    booking: Booking,
    target: { areaId: string; groupId: string; guestCount?: number },
    persist?: AssignPersistMode
  ) => {
    setIsAssignSaving(true);
    try {
      const result = await assignBookingToTable({
        bookingId: booking.id,
        areaId: target.areaId,
        tableId: null,
        mergeGroupId: target.groupId,
        guestCount: target.guestCount,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok && persist === "keepModalSynced") {
        setAssignAreaId(target.areaId);
        setAssignTableId(null);
        setAssignMergeGroupId(target.groupId);
        const guest =
          typeof target.guestCount === "number" && Number.isFinite(target.guestCount)
            ? Math.max(1, target.guestCount)
            : booking.guestCount;
        setAssignFormBooking((prev) =>
          prev?.id === booking.id
            ? {
                ...prev,
                areaId: target.areaId,
                tableId: null,
                mergeGroupId: target.groupId,
                guestCount: guest,
              }
            : prev
        );
      } else if (result.ok && persist !== "keepModalSynced") {
        setAssignFormBooking(null);
      }
    } finally {
      setIsAssignSaving(false);
    }
  };

  /** Create a new merge group from suggested tables, then assign the booking to it. */
  const runMergeAndAssign = async (
    booking: Booking,
    target: { areaId: string; tableIds: string[]; guestCount?: number },
    persist?: AssignPersistMode
  ) => {
    setIsAssignSaving(true);
    try {
      const mergeDay = dayjs(booking.bookingAt).format("YYYY-MM-DD");
      const createResult = await createTableMergeGroup({
        branchId: booking.branchId,
        areaId: target.areaId,
        tableIds: target.tableIds,
        startDate: mergeDay,
        endDate: mergeDay,
      });
      if (!createResult.ok || !createResult.groupId) {
        notifications.show({ color: "red", message: createResult.message });
        return;
      }
      const assignResult = await assignBookingToTable({
        bookingId: booking.id,
        areaId: target.areaId,
        tableId: null,
        mergeGroupId: createResult.groupId,
        guestCount: target.guestCount,
      });
      notifications.show({
        color: assignResult.ok ? "green" : "red",
        message: assignResult.ok
          ? `${createResult.message}. ${assignResult.message}`
          : assignResult.message,
      });
      if (assignResult.ok && persist === "keepModalSynced") {
        setAssignAreaId(target.areaId);
        setAssignTableId(null);
        setAssignMergeGroupId(createResult.groupId);
        const guest =
          typeof target.guestCount === "number" && Number.isFinite(target.guestCount)
            ? Math.max(1, target.guestCount)
            : booking.guestCount;
        setAssignFormBooking((prev) =>
          prev?.id === booking.id
            ? {
                ...prev,
                areaId: target.areaId,
                tableId: null,
                mergeGroupId: createResult.groupId,
                guestCount: guest,
              }
            : prev
        );
      } else if (assignResult.ok && persist !== "keepModalSynced") {
        setAssignFormBooking(null);
      }
    } finally {
      setIsAssignSaving(false);
    }
  };

  /** Create merge group from edit modal recommendation, then save booking onto it. */
  const runEditMergeAndAssign = async (
    booking: Booking,
    target: { areaId: string; tableIds: string[]; guestCount?: number }
  ) => {
    setIsEditSaving(true);
    try {
      const mergeDay = dayjs(booking.bookingAt).format("YYYY-MM-DD");
      const createResult = await createTableMergeGroup({
        branchId: booking.branchId,
        areaId: target.areaId,
        tableIds: target.tableIds,
        startDate: mergeDay,
        endDate: mergeDay,
      });
      if (!createResult.ok || !createResult.groupId) {
        notifications.show({ color: "red", message: createResult.message });
        return;
      }
      const guestApplied =
        typeof target.guestCount === "number" && Number.isFinite(target.guestCount)
          ? Math.max(1, target.guestCount)
          : typeof editGuestCount === "number" && Number.isFinite(editGuestCount)
            ? Math.max(1, editGuestCount)
            : booking.guestCount;

      const result = await updateBookingOrder({
        bookingId: booking.id,
        bookingAt: dayjs(editBookingAt).toISOString(),
        guestCount: guestApplied,
        customerPhone: editCustomerPhone,
        areaId: target.areaId,
        tableId: null,
        mergeGroupId: createResult.groupId,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message:
          result.ok
            ? (() => {
                const mergedLabel =
                  createResult.mergedName ?? createResult.group?.mergedName ?? "Bàn gộp";
                const areaLabel =
                  state.areas.find((a) => a.id === target.areaId)?.name ?? "khu đã chọn";
                return `${createResult.message}. ${result.message} · Đã chọn ${areaLabel} · ${mergedLabel}.`;
              })()
            : result.message,
      });
      if (result.ok) {
        setEditAreaId(target.areaId);
        setEditMergeGroupId(createResult.groupId);
        setEditTableId(null);
        setEditGuestCount(guestApplied);
        setEditBooking((prev) =>
          prev?.id === booking.id
            ? {
                ...prev,
                areaId: target.areaId,
                tableId: null,
                mergeGroupId: createResult.groupId,
                guestCount: guestApplied,
              }
            : prev
        );
      }
    } finally {
      setIsEditSaving(false);
    }
  };

  const openManualAssignModal = (booking: Booking, guestForAssign?: number) => {
    setAssignFormBooking(booking);
    const initialGuestCount =
      typeof guestForAssign === "number" && Number.isFinite(guestForAssign)
        ? guestForAssign
        : booking.guestCount > 0
          ? booking.guestCount
          : undefined;
    setAssignManualGuestCount(initialGuestCount);
    setAssignAreaId(null);
    setAssignTableId(null);
    setAssignMergeGroupId(null);
  };

  const openEditBookingModal = (booking: Booking) => {
    const customer = state.customers.find((item) => item.id === booking.customerId);
    const phone =
      customer?.phone && !isSyntheticPhoneValue(customer.phone) ? customer.phone : "";
    setEditBooking(booking);
    setEditBookingAt(booking.bookingAt);
    setEditGuestCount(
      isGuestCountSpecified(booking) ? Math.max(1, booking.guestCount) : undefined
    );
    setEditCustomerPhone(phone);
    setEditAreaId(booking.areaId);
    setEditTableId(booking.tableId);
    setEditMergeGroupId(booking.mergeGroupId ?? null);
  };

  const handleSubmitChangeTable = async (target: { areaId: string; tableId: string }) => {
    if (!changeTableBooking) {
      return;
    }
    setIsChangeTableSaving(true);
    try {
      const result = await changeBookingTable({
        bookingId: changeTableBooking.id,
        areaId: target.areaId,
        tableId: target.tableId,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setChangeTableBooking(null);
        if (mobileDetailBooking?.id === changeTableBooking.id) {
          setMobileDetailBooking(null);
        }
      }
    } finally {
      setIsChangeTableSaving(false);
    }
  };

  const closeEditBookingModal = () => {
    setEditBooking(null);
    setEditBookingAt(null);
    setEditGuestCount(undefined);
    setEditCustomerPhone("");
    setEditAreaId(null);
    setEditTableId(null);
    setEditMergeGroupId(null);
  };

  const submitEditBooking = async (options?: { allowDuplicate?: boolean }) => {
    if (!editBooking || !editBookingAt) {
      notifications.show({ color: "red", message: "Vui lòng chọn thời gian đến." });
      return;
    }
    const normalizedEditPhone = normalizeVietnamPhone(editCustomerPhone.trim());
    if (normalizedEditPhone && !isPlausibleVietnamPhone(normalizedEditPhone)) {
      notifications.show({
        color: "red",
        message:
          "Số điện thoại không đúng định dạng Việt Nam (ví dụ 0912345678, +84912345678).",
      });
      return;
    }
    const hasTable = Boolean(editTableId);
    const hasMergeGroup = Boolean(editMergeGroupId);
    if (
      (editAreaId && !hasTable && !hasMergeGroup) ||
      (!editAreaId && (hasTable || hasMergeGroup)) ||
      (hasTable && hasMergeGroup)
    ) {
      notifications.show({
        color: "red",
        message:
          "Vui lòng chọn khu vực kèm một bàn hoặc một cụm gộp, hoặc để trống cả hai để chờ xếp bàn.",
      });
      return;
    }
    if (editTableSlotConflicts.length > 0 || editMergeGroupSlotBlocked) {
      notifications.show({
        color: "red",
        message:
          editTableConflictMessage ??
          "Khung giờ mới trùng với booking khác trên cùng bàn.",
      });
      return;
    }
    setIsEditSaving(true);
    try {
      const result = await updateBookingOrder({
        bookingId: editBooking.id,
        bookingAt: dayjs(editBookingAt).toISOString(),
        guestCount:
          typeof editGuestCount === "number" && Number.isFinite(editGuestCount)
            ? Math.max(1, editGuestCount)
            : undefined,
        customerPhone: editCustomerPhone,
        areaId: editAreaId,
        tableId: editMergeGroupId ? null : editTableId,
        mergeGroupId: editMergeGroupId,
        allowDuplicate: options?.allowDuplicate,
      });
      if (!result.ok && result.code === DUPLICATE_BOOKING_CODE && result.duplicates?.length) {
        notifications.show({ color: "orange", message: result.message });
        confirmDuplicateBookingSecond(
          result.duplicates,
          () => {
            void submitEditBooking({ allowDuplicate: true });
          },
          (bookingId) => {
            const target = state.bookings.find((item) => item.id === bookingId);
            if (target) {
              openBookingInList(target);
            }
          }
        );
        return;
      }
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        closeEditBookingModal();
      }
    } finally {
      setIsEditSaving(false);
    }
  };

  const openAssignOptions = openManualAssignModal;

  const getListBookingRowStyle = useCallback(
    (booking: Booking) =>
      bookingListRowStyle(booking.id, {
        busyBookingId,
        focusBookingId: listFocusBookingId,
        focusPulse: {
          cycleMs: LIST_BOOKING_PULSE_CYCLE_MS,
          cycles: LIST_BOOKING_PULSE_CYCLES,
        },
        extra: { cursor: isBookingRowBusy(booking.id) ? undefined : "pointer" },
      }),
    [busyBookingId, isBookingRowBusy, listFocusBookingId]
  );

  const searchedBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return pipelineFilteredBookings;
    }
    return pipelineFilteredBookings.filter((booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const area = state.areas.find((item) => item.id === booking.areaId);
      const table = state.tables.find((item) => item.id === booking.tableId);
      const noteText = stripUnknownGuestTag(booking.note) ?? "";
      const haystack = [
        customer?.fullName ?? "",
        displayCustomerPhone(customer?.phone),
        dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
        dayjs(booking.bookingAt).format("DD/MM/YYYY HH:mm"),
        booking.checkedInAt ? dayjs(booking.checkedInAt).format("HH:mm DD/MM/YYYY") : "",
        booking.checkedInAt ? dayjs(booking.checkedInAt).format("DD/MM/YYYY HH:mm") : "",
        "check-in",
        "checkin",
        "giờ check-in",
        String(booking.guestCount),
        area?.name ?? "",
        table?.name ?? "",
        bookingStatusLabel[booking.status],
        noteText,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [pipelineFilteredBookings, searchQuery, state.areas, state.customers, state.tables]);

  const getListBookingSearchValue = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const noteText = stripUnknownGuestTag(booking.note) ?? "";
      return [
        customer?.fullName ?? "",
        displayCustomerPhone(customer?.phone),
        dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
        dayjs(booking.bookingAt).format("DD/MM/YYYY HH:mm"),
        booking.checkedInAt ? dayjs(booking.checkedInAt).format("HH:mm DD/MM/YYYY") : "",
        booking.checkedInAt ? dayjs(booking.checkedInAt).format("DD/MM/YYYY HH:mm") : "",
        "check-in",
        "checkin",
        "giờ check-in",
        String(booking.guestCount),
        bookingAreaTableSortKey(booking, bookingAreaTableLookup),
        bookingStatusLabel[booking.status],
        noteText,
      ]
        .join(" ")
        .toLowerCase();
    },
    [bookingAreaTableLookup, state.customers]
  );

  const sortListBookings = useCallback(
    (records: Booking[], sortStatus: DataTableSortStatus<Booking>) => {
      const getValue = (booking: Booking) => {
        const acc = sortStatus.columnAccessor as string;
        if (acc === "customerId") {
          return state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
        }
        if (acc === "guestCount") {
          return booking.guestCount;
        }
        if (acc === "areaTable") {
          return bookingAreaTableSortKey(booking, bookingAreaTableLookup);
        }
        if (acc === "note") {
          return stripUnknownGuestTag(booking.note) ?? "";
        }
        if (acc === "createdByUserId") {
          return state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "";
        }
        if (acc === "lastEditedByUserId") {
          return bookingLastEditorName(booking, state.users);
        }
        if (acc === "lastEditedAt") {
          return booking.lastEditedAt ? dayjs(booking.lastEditedAt).valueOf() : 0;
        }
        if (acc === "status") {
          return bookingStatusLabel[booking.status];
        }
        if (acc === "checkedInAt") {
          return booking.checkedInAt ? dayjs(booking.checkedInAt).valueOf() : 0;
        }
        return dayjs(booking.bookingAt).valueOf();
      };
      return [...records].sort((a, b) => {
        const left = getValue(a);
        const right = getValue(b);
        const compare =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "vi");
        return sortStatus.direction === "asc" ? compare : -compare;
      });
    },
    [bookingAreaTableLookup, state.customers, state.users]
  );

  const sortedBookings = useMemo(
    () => sortListBookings(searchedBookings, sortStatus),
    [searchedBookings, sortListBookings, sortStatus]
  );

  const listSectionTitle = useMemo(
    () => `Danh sách booking (${sortedBookings.length})`,
    [sortedBookings.length]
  );

  const completedBookingsByCustomer = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booking of branchBookings) {
      if (booking.status !== "completed") {
        continue;
      }
      counts.set(booking.customerId, (counts.get(booking.customerId) ?? 0) + 1);
    }
    return counts;
  }, [branchBookings]);

  const todayBookings = useMemo(() => {
    const todayStart = dayjs().startOf("day");
    const todayEnd = todayStart.endOf("day");
    return branchBookings
      .filter((booking) => {
        if (booking.status === "cancelled" || booking.status === "completed") {
          return false;
        }
        const bookingTime = dayjs(booking.bookingAt);
        return (
          bookingTime.isSame(todayStart, "day") &&
          bookingTime.isAfter(todayStart.subtract(1, "millisecond")) &&
          bookingTime.isBefore(todayEnd.add(1, "millisecond"))
        );
      })
  }, [branchBookings]);

  const getTodayGuestTypeLabel = useCallback(
    (booking: Booking) =>
      inferGuestTypeLabel(booking, {
        completedBookingCountForCustomer:
          completedBookingsByCustomer.get(booking.customerId) ?? 0,
        thresholds: receptionThresholds,
      }),
    [completedBookingsByCustomer, receptionThresholds]
  );

  const getTodayReceptionStatusLabel = useCallback(
    (booking: Booking) => getReceptionBookingStatus(booking, receptionThresholds).label,
    [receptionThresholds]
  );

  const todayGuestTypeFilterOptions = useMemo(() => {
    const labels = new Set(todayBookings.map((booking) => getTodayGuestTypeLabel(booking)));
    return [...labels]
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((label) => ({ value: label, label }));
  }, [getTodayGuestTypeLabel, todayBookings]);

  const todayPipelineFilteredBookings = useMemo(() => {
    return todayBookings.filter((booking) => {
      if (todayStatusFilter && booking.status !== todayStatusFilter) {
        return false;
      }
      if (todayGuestTypeFilter && getTodayGuestTypeLabel(booking) !== todayGuestTypeFilter) {
        return false;
      }
      return true;
    });
  }, [
    getTodayGuestTypeLabel,
    todayBookings,
    todayGuestTypeFilter,
    todayStatusFilter,
  ]);

  const todaySearchPlaceholder =
    "Tìm theo khách, SĐT, giờ, loại khách, khu, bàn, trạng thái, người nhận, ghi chú...";

  const todaySearchedBookings = useMemo(() => {
    const q = todaySearchQuery.trim().toLowerCase();
    if (!q) {
      return todayPipelineFilteredBookings;
    }
    return todayPipelineFilteredBookings.filter((booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const noteText = stripUnknownGuestTag(booking.note) ?? "";
      const haystack = [
        customer?.fullName ?? "",
        displayCustomerPhone(customer?.phone),
        dayjs(booking.bookingAt).format("HH:mm"),
        dayjs(booking.bookingAt).format("DD/MM/YYYY HH:mm"),
        String(booking.guestCount),
        formatTodayBookingAreaTable(booking, bookingAreaTableLookup),
        getTodayGuestTypeLabel(booking),
        getTodayReceptionStatusLabel(booking),
        bookingStatusLabel[booking.status],
        state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "",
        noteText,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    bookingAreaTableLookup,
    getTodayGuestTypeLabel,
    getTodayReceptionStatusLabel,
    state.customers,
    state.users,
    todayPipelineFilteredBookings,
    todaySearchQuery,
  ]);

  const getTodayBookingSearchValue = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const noteText = stripUnknownGuestTag(booking.note) ?? "";
      return [
        customer?.fullName ?? "",
        displayCustomerPhone(customer?.phone),
        dayjs(booking.bookingAt).format("HH:mm"),
        dayjs(booking.bookingAt).format("DD/MM/YYYY HH:mm"),
        String(booking.guestCount),
        formatTodayBookingAreaTable(booking, bookingAreaTableLookup),
        getTodayGuestTypeLabel(booking),
        getTodayReceptionStatusLabel(booking),
        bookingStatusLabel[booking.status],
        state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "",
        noteText,
      ]
        .join(" ")
        .toLowerCase();
    },
    [
      getTodayGuestTypeLabel,
      getTodayReceptionStatusLabel,
      state.areas,
      state.customers,
      state.tables,
      state.users,
    ]
  );

  const sortTodayBookings = useCallback(
    (records: Booking[], sortStatus: DataTableSortStatus<Booking>) => {
      const getValue = (booking: Booking) => {
        const acc = sortStatus.columnAccessor as string;
        if (acc === "customerId") {
          return state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
        }
        if (acc === "guestCount") {
          return booking.guestCount;
        }
        if (acc === "guestType") {
          return getTodayGuestTypeLabel(booking);
        }
        if (acc === "areaTable") {
          return formatTodayBookingAreaTable(booking, bookingAreaTableLookup);
        }
        if (acc === "note") {
          return stripUnknownGuestTag(booking.note) ?? "";
        }
        if (acc === "createdByUserId") {
          return state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "";
        }
        if (acc === "status") {
          return getTodayReceptionStatusLabel(booking);
        }
        return dayjs(booking.bookingAt).valueOf();
      };
      return [...records].sort((a, b) => {
        const left = getValue(a);
        const right = getValue(b);
        const compare =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "vi");
        return sortStatus.direction === "asc" ? compare : -compare;
      });
    },
    [
      bookingAreaTableLookup,
      getTodayGuestTypeLabel,
      getTodayReceptionStatusLabel,
      state.customers,
      state.users,
    ]
  );

  const todaySortedBookings = useMemo(
    () => sortTodayBookings(todaySearchedBookings, todaySortStatus),
    [sortTodayBookings, todaySearchedBookings, todaySortStatus]
  );

  const todaySectionTitle = useMemo(
    () => `Booking hôm nay (${todaySortedBookings.length})`,
    [todaySortedBookings.length]
  );

  const totalTodayListPages = useMemo(
    () => Math.max(1, Math.ceil(todaySortedBookings.length / todayPageSize)),
    [todayPageSize, todaySortedBookings.length]
  );

  useEffect(() => {
    setTodayPage((p) => (p > totalTodayListPages ? totalTodayListPages : p));
  }, [totalTodayListPages]);

  const pagedTodayBookings = useMemo(() => {
    const currentPage = Math.min(todayPage, totalTodayListPages);
    return todaySortedBookings.slice(
      (currentPage - 1) * todayPageSize,
      currentPage * todayPageSize
    );
  }, [todayPageSize, todayPage, todaySortedBookings, totalTodayListPages]);

  const totalListPages = useMemo(
    () => Math.max(1, Math.ceil(sortedBookings.length / listPageSize)),
    [sortedBookings.length, listPageSize]
  );

  const mobilePageSizeSelectData = useMemo(
    () =>
      MOBILE_BOOKINGS_PAGE_SIZE_OPTIONS.map((n) => ({
        value: String(n),
        label: `${n} thẻ`,
      })),
    []
  );

  useEffect(() => {
    setPage((p) => (p > totalListPages ? totalListPages : p));
  }, [totalListPages]);

  const pagedBookings = useMemo(
    () => {
      const currentPage = Math.min(page, totalListPages);
      return sortedBookings.slice((currentPage - 1) * listPageSize, currentPage * listPageSize);
    },
    [listPageSize, page, sortedBookings, totalListPages]
  );

  const router = useRouter();
  const searchParams = useSearchParams();
  const consumedFocusFromUrlRef = useRef<string | null>(null);

  const openBookingInList = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      setListStatusFilter(booking.status === "completed" ? "completed" : null);
      setListTableAssignFilter("all");
      setSearchQuery(customer?.fullName ?? "");
      setListFocusBookingId(booking.id);
      setActiveTab("list");
      notifications.show({
        color: "blue",
        message: customer?.fullName
          ? `Đã mở danh sách booking · ${customer.fullName}`
          : "Đã mở danh sách booking.",
        autoClose: 2500,
      });
    },
    [state.customers]
  );

  const focusBookingIdFromUrl = searchParams.get("focusBooking");
  const tabFromUrl = searchParams.get("tab");

  useEffect(() => {
    if (tabFromUrl === "completed") {
      setActiveTab("list");
      setListStatusFilter("completed");
      setPage(1);
    }
  }, [tabFromUrl]);

  useEffect(() => {
    if (!focusBookingIdFromUrl || consumedFocusFromUrlRef.current === focusBookingIdFromUrl) {
      return;
    }
    const booking = state.bookings.find((item) => item.id === focusBookingIdFromUrl);
    if (!booking) {
      return;
    }
    consumedFocusFromUrlRef.current = focusBookingIdFromUrl;
    openBookingInList(booking);
    router.replace("/bookings", { scroll: false });
  }, [focusBookingIdFromUrl, openBookingInList, router, state.bookings]);

  const openMobileBookingDetail = useCallback((booking: Booking, source: "list" | "today") => {
    setMobileDetailBooking(booking);
    setMobileDetailSource(source);
  }, []);

  const closeMobileBookingDetail = useCallback(() => {
    setMobileDetailBooking(null);
  }, []);

  const mobileDetailBookingLive = useMemo(() => {
    if (!mobileDetailBooking) {
      return null;
    }
    return state.bookings.find((item) => item.id === mobileDetailBooking.id) ?? mobileDetailBooking;
  }, [mobileDetailBooking, state.bookings]);

  useEffect(() => {
    if (!listFocusBookingId || activeTab !== "list") {
      return;
    }
    const index = sortedBookings.findIndex((item) => item.id === listFocusBookingId);
    if (index < 0) {
      return;
    }
    const targetPage = Math.floor(index / listPageSize) + 1;
    setPage((current) => (current === targetPage ? current : targetPage));
  }, [activeTab, listFocusBookingId, listPageSize, sortedBookings]);

  useEffect(() => {
    if (!listFocusBookingId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setListFocusBookingId(null);
    }, LIST_BOOKING_PULSE_TOTAL_MS);
    return () => window.clearTimeout(timer);
  }, [listFocusBookingId]);

  const bookingsSearchPlaceholder =
    "Tìm theo khách, SĐT, giờ đến, giờ check-in, khu, bàn, trạng thái...";

  const listFiltersToolbar = (
    <BookingListFiltersToolbar
      searchQuery={searchQuery}
      onSearchQueryChange={(value) => {
        setSearchQuery(value);
        setPage(1);
      }}
      searchPlaceholder={bookingsSearchPlaceholder}
      filtersOpen={listMobileFiltersOpen}
      onFiltersOpenChange={setListMobileFiltersOpen}
      collapseFilters={
        <BookingListTableAssignFilter
          value={listTableAssignFilter}
          onChange={(value) => {
            setListTableAssignFilter(value);
            setPage(1);
          }}
          data={tableAssignFilterOptions}
          size="md"
        />
      }
    />
  );

  const listTableAssignFilterControl = (
    <BookingListTableAssignFilter
      value={listTableAssignFilter}
      onChange={(value) => {
        setListTableAssignFilter(value);
        setPage(1);
      }}
      data={tableAssignFilterOptions}
      size="sm"
      width={168}
    />
  );

  const listPaginationBar = (
    <BookingListPaginationBar
      pageSize={mobileBookingsPageSize}
      pageSizeSelectData={mobilePageSizeSelectData}
      onPageSizeChange={(size) => {
        setMobileBookingsPageSize(size);
        setPage(1);
      }}
      page={page}
      totalPages={totalListPages}
      onPageChange={setPage}
      totalBookings={sortedBookings.length}
    />
  );

  const renderListBookingCard = (booking: Booking) => {
    const customer =
      state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—";
    const creator =
      state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "Không rõ";
    const cardBusy = bookingCardBusyProps(isBookingRowBusy(booking.id));

    return (
      <BookingCompactCard
        key={booking.id}
        booking={booking}
        variant="list"
        customerName={customer}
        creatorName={creator}
        bookingAreaTableLookup={bookingAreaTableLookup}
        receptionThresholds={receptionThresholds}
        lastEditorName={bookingLastEditorName(booking, state.users)}
        className={
          [booking.id === listFocusBookingId ? "booking-list-row-pulse" : undefined, cardBusy.className]
            .filter(Boolean)
            .join(" ") || undefined
        }
        style={cardBusy.style}
        onClick={() => {
          if (isBookingRowBusy(booking.id)) {
            return;
          }
          openMobileBookingDetail(booking, "list");
        }}
      />
    );
  };

  const bookingsTable = (
    <BookingListDesktopSection
      title={listSectionTitle}
      statusFilter={listStatusFilter}
      onStatusFilterChange={(value) => {
        setListStatusFilter(value);
        setPage(1);
      }}
      statusFilterStatuses={bookingListStatusFilterStatuses}
      table={
        <PortalDataTable<Booking>
        records={pipelineFilteredBookings}
        searchQuery={searchQuery}
        onSearchQueryChange={(value) => {
          setSearchQuery(value);
          setPage(1);
        }}
        getRecordSearchValue={getListBookingSearchValue}
        sortRecords={sortListBookings}
        sortStatus={sortStatus}
        onSortStatusChange={(next) => {
          setSortStatus(next);
          setPage(1);
        }}
        page={page}
        onPageChange={setPage}
        recordsPerPage={desktopBookingsPageSize}
        onRecordsPerPageChange={(size) => {
          setDesktopBookingsPageSize(size);
          setPage(1);
        }}
        recordsPerPageOptions={[...DESKTOP_BOOKINGS_PAGE_SIZE_OPTIONS]}
        defaultSort={{ columnAccessor: "bookingAt", direction: "desc" }}
        searchPlaceholder={bookingsSearchPlaceholder}
        filters={listTableAssignFilterControl}
        minHeight={260}
        pinLastColumn
        onRowClick={({ record }) => {
          if (isBookingRowBusy(record.id)) {
            return;
          }
          openMobileBookingDetail(record, "list");
        }}
        rowStyle={getListBookingRowStyle}
        noRecordsText="Chưa có booking nào cho bộ lọc hiện tại."
        columns={[
          {
            accessor: "bookingAt",
            title: "Giờ đặt",
            sortable: true,
            render: (booking) => dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
          },
          {
            accessor: "checkedInAt",
            title: "Giờ check-in",
            sortable: true,
            render: (booking) =>
              booking.checkedInAt ? (
                <Text size="sm">{dayjs(booking.checkedInAt).format("HH:mm DD/MM/YYYY")}</Text>
              ) : (
                <Text size="sm" c="dimmed">
                  —
                </Text>
              ),
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
                    {displayCustomerPhone(c?.phone)}
                  </Text>
                </Stack>
              );
            },
          },
          {
            accessor: "areaTable",
            title: "Khu vực / Bàn",
            sortable: true,
            render: (booking) =>
              formatBookingAreaTable(booking, bookingAreaTableLookup),
          },
          {
            accessor: "guestCount",
            title: "Số khách",
            sortable: true,
            render: (booking) =>
              isGuestCountSpecified(booking) ? (
                <Text size="sm">{booking.guestCount}</Text>
              ) : (
                <Text size="sm" c="dimmed">
                  Chưa rõ
                </Text>
              ),
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
            accessor: "lastEditedByUserId",
            title: "Người sửa",
            sortable: true,
            render: (booking) => (
              <Text size="sm">{bookingLastEditorName(booking, state.users)}</Text>
            ),
          },
          {
            accessor: "lastEditedAt",
            title: "Lúc sửa",
            sortable: true,
            render: (booking) =>
              booking.lastEditedAt ? (
                <Text size="sm">{dayjs(booking.lastEditedAt).format("HH:mm DD/MM/YYYY")}</Text>
              ) : (
                <Text size="sm" c="dimmed">
                  —
                </Text>
              ),
          },
          {
            accessor: "note",
            title: "Ghi chú",
            sortable: true,
            render: (booking) =>
              stripUnknownGuestTag(booking.note) ? (
                <Text size="sm" lineClamp={2} maw={220}>
                  {stripUnknownGuestTag(booking.note)}
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
        ]}
      />
      }
    />
  );

  const todayFiltersToolbar = (
    <BookingListFiltersToolbar
      searchQuery={todaySearchQuery}
      onSearchQueryChange={(value) => {
        setTodaySearchQuery(value);
        setTodayPage(1);
      }}
      searchPlaceholder={todaySearchPlaceholder}
      filtersOpen={todayMobileFiltersOpen}
      onFiltersOpenChange={setTodayMobileFiltersOpen}
      collapseFilters={
        <Select
          label="Loại khách"
          placeholder="Tất cả"
          clearable
          data={todayGuestTypeFilterOptions}
          value={todayGuestTypeFilter}
          onChange={(value) => {
            setTodayGuestTypeFilter(value);
            setTodayPage(1);
          }}
          size="md"
        />
      }
    />
  );

  const todayDesktopFilters = (
    <Select
      label="Loại khách"
      placeholder="Tất cả"
      clearable
      data={todayGuestTypeFilterOptions}
      value={todayGuestTypeFilter}
      onChange={(value) => {
        setTodayGuestTypeFilter(value);
        setTodayPage(1);
      }}
      size="sm"
      w={148}
      miw={148}
    />
  );

  const todayPaginationBar = (
    <BookingListPaginationBar
      pageSize={mobileBookingsPageSize}
      pageSizeSelectData={mobilePageSizeSelectData}
      onPageSizeChange={(size) => {
        setMobileBookingsPageSize(size);
        setTodayPage(1);
      }}
      page={todayPage}
      totalPages={totalTodayListPages}
      onPageChange={setTodayPage}
      totalBookings={todaySortedBookings.length}
    />
  );

  const renderTodayBookingCard = (booking: Booking) => {
    const customer =
      state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—";
    const creator =
      state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "Không rõ";

    return (
      <BookingCompactCard
        key={booking.id}
        booking={booking}
        variant="today"
        customerName={customer}
        creatorName={creator}
        bookingAreaTableLookup={bookingAreaTableLookup}
        receptionThresholds={receptionThresholds}
        getGuestTypeLabel={getTodayGuestTypeLabel}
        onClick={() => openMobileBookingDetail(booking, "today")}
      />
    );
  };

  const bookingsTodayTable = (
    <BookingListDesktopSection
      title={todaySectionTitle}
      statusFilter={todayStatusFilter}
      onStatusFilterChange={(value) => {
        setTodayStatusFilter(value);
        setTodayPage(1);
      }}
      statusFilterStatuses={bookingPipelineStatusFilterStatuses}
      table={
        <PortalDataTable<Booking>
        records={todayPipelineFilteredBookings}
        searchQuery={todaySearchQuery}
        onSearchQueryChange={(value) => {
          setTodaySearchQuery(value);
          setTodayPage(1);
        }}
        getRecordSearchValue={getTodayBookingSearchValue}
        sortRecords={sortTodayBookings}
        sortStatus={todaySortStatus}
        onSortStatusChange={(next) => {
          setTodaySortStatus(next);
          setTodayPage(1);
        }}
        page={todayPage}
        onPageChange={setTodayPage}
        recordsPerPage={todayDesktopPageSize}
        onRecordsPerPageChange={(size) => {
          setTodayDesktopPageSize(size);
          setTodayPage(1);
        }}
        recordsPerPageOptions={[...TODAY_DESKTOP_PAGE_SIZE_OPTIONS]}
        defaultSort={{ columnAccessor: "bookingAt", direction: "asc" }}
        searchPlaceholder={todaySearchPlaceholder}
        filters={todayDesktopFilters}
        minHeight={260}
        onRowClick={({ record }) => {
          if (isBookingRowBusy(record.id)) {
            return;
          }
          openMobileBookingDetail(record, "today");
        }}
        rowStyle={(booking) =>
          bookingListRowStyle(booking.id, {
            busyBookingId,
            extra: { cursor: "pointer" },
          })
        }
        noRecordsText={
          todayBookings.length === 0
            ? "Chưa có booking nào cho hôm nay."
            : "Không có booking khớp bộ lọc hiện tại."
        }
        columns={[
          {
            accessor: "bookingAt",
            title: "Giờ",
            sortable: true,
            render: (booking) => dayjs(booking.bookingAt).format("HH:mm"),
          },
          {
            accessor: "customerId",
            title: "Tên khách",
            sortable: true,
            render: (booking) =>
              state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—",
          },
          {
            accessor: "guestCount",
            title: "SL",
            sortable: true,
            render: (booking) =>
              isGuestCountSpecified(booking) ? (
                <Text size="sm">{booking.guestCount}</Text>
              ) : (
                <Text size="sm" c="dimmed">
                  Chưa rõ
                </Text>
              ),
          },
          {
            accessor: "guestType",
            title: "Loại khách",
            sortable: true,
            render: (booking) => getTodayGuestTypeLabel(booking),
          },
          {
            accessor: "areaTable",
            title: "Khu/Bàn",
            sortable: true,
            render: (booking) =>
              formatTodayBookingAreaTable(booking, bookingAreaTableLookup),
          },
          {
            accessor: "status",
            title: "Trạng thái",
            sortable: true,
            render: (booking) => {
              const receptionStatus = getReceptionBookingStatus(booking, receptionThresholds);
              return (
                <Badge color={receptionStatus.color} variant="light">
                  {receptionStatus.label}
                </Badge>
              );
            },
          },
          {
            accessor: "createdByUserId",
            title: "Người nhận",
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
              stripUnknownGuestTag(booking.note) ? (
                <Text size="sm" lineClamp={2} maw={220}>
                  {stripUnknownGuestTag(booking.note)}
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  —
                </Text>
              ),
          },
        ]}
      />
      }
    />
  );

  const assignModalTableOptions = useMemo(() => {
    if (!assignFormBooking) {
      return [];
    }
    return getCandidateTables(assignFormBooking)
      .filter((table) => (assignAreaId ? table.areaId === assignAreaId : true))
      .map((table) => ({
        value: table.id,
        label: table.name,
      }));
  }, [assignAreaId, assignFormBooking, state.bookings, state.tables]);

  const assignModalAreaOptions = useMemo(() => {
    if (!assignFormBooking) {
      return [];
    }
    return [...state.areas.filter((area) => area.branchId === assignFormBooking.branchId)]
      .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id))
      .map((area) => ({
        value: area.id,
        label: area.name,
      }));
  }, [assignFormBooking, state.areas]);

  const assignModalMergeGroupOptions = useMemo(() => {
    if (!assignFormBooking || !assignAreaId) {
      return [];
    }
    const groups = getAssignableMergeGroups(
      assignFormBooking,
      state.mergeGroups.filter((group) => group.areaId === assignAreaId),
      state.bookings
    );
    const options = groups.map((group) => ({
      value: group.id,
      label: group.mergedName,
    }));
    if (
      assignMergeGroupId &&
      !options.some((item) => item.value === assignMergeGroupId)
    ) {
      const current = state.mergeGroups.find((group) => group.id === assignMergeGroupId);
      if (current) {
        options.unshift({
          value: current.id,
          label: current.mergedName,
        });
      }
    }
    return options;
  }, [assignAreaId, assignFormBooking, assignMergeGroupId, state.bookings, state.mergeGroups]);

  const editModalAreaOptions = useMemo(() => {
    if (!editBooking) {
      return [];
    }
    return [...state.areas.filter((area) => area.branchId === editBooking.branchId)]
      .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id))
      .map((area) => ({
        value: area.id,
        label: area.name,
      }));
  }, [editBooking, state.areas]);

  const editModalTableOptions = useMemo(() => {
    if (!editAssignCandidate) {
      return [];
    }
    const options = getCandidateTables(editAssignCandidate)
      .filter((table) => (editAreaId ? table.areaId === editAreaId : true))
      .map((table) => ({
        value: table.id,
        label: table.name,
      }));
    if (editTableId && !options.some((item) => item.value === editTableId)) {
      const current = state.tables.find((table) => table.id === editTableId);
      if (current) {
        options.unshift({
          value: current.id,
          label: current.name,
        });
      }
    }
    return options;
  }, [editAreaId, editAssignCandidate, editTableId, state.bookings, state.tables]);

  const editModalMergeGroupOptions = useMemo(() => {
    if (!editAssignCandidate || !editAreaId) {
      return [];
    }
    const groups = getAssignableMergeGroups(
      editAssignCandidate,
      state.mergeGroups.filter((group) => group.areaId === editAreaId),
      state.bookings
    );
    const options = groups.map((group) => ({
      value: group.id,
      label: group.mergedName,
    }));
    if (
      editMergeGroupId &&
      !options.some((item) => item.value === editMergeGroupId)
    ) {
      const current = state.mergeGroups.find((group) => group.id === editMergeGroupId);
      if (current) {
        options.unshift({
          value: current.id,
          label: current.mergedName,
        });
      }
    }
    return options;
  }, [editAreaId, editAssignCandidate, editMergeGroupId, state.bookings, state.mergeGroups]);

  return (
    <Stack gap="md">
      <PortalPageTitle order={isCompact ? 3 : 2} mb={0}>
        Đặt bàn
      </PortalPageTitle>

      <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List grow>
          <Tabs.Tab value="today">Booking hôm nay</Tabs.Tab>
          <Tabs.Tab value="list">Danh sách booking</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="today" pt="md">
          {isCompact ? (
            <BookingListMobileView
              title={todaySectionTitle}
              statusFilter={todayStatusFilter}
              onStatusFilterChange={(value) => {
                setTodayStatusFilter(value);
                setTodayPage(1);
              }}
              statusFilterStatuses={bookingPipelineStatusFilterStatuses}
              filtersToolbar={todayFiltersToolbar}
              paginationBar={todayPaginationBar}
              bookingsContent={
                pagedTodayBookings.length === 0 ? (
                  <BookingListMobileEmptyState
                    message={
                      todayBookings.length === 0
                        ? "Chưa có booking nào cho hôm nay."
                        : "Không có booking khớp bộ lọc hiện tại."
                    }
                  />
                ) : (
                  pagedTodayBookings.map(renderTodayBookingCard)
                )
              }
            />
          ) : (
            bookingsTodayTable
          )}
        </Tabs.Panel>
        <Tabs.Panel value="list" pt="md">
          {isCompact ? (
            <BookingListMobileView
              title={listSectionTitle}
              statusFilter={listStatusFilter}
              onStatusFilterChange={(value) => {
                setListStatusFilter(value);
                setPage(1);
              }}
              statusFilterStatuses={bookingListStatusFilterStatuses}
              filtersToolbar={listFiltersToolbar}
              paginationBar={listPaginationBar}
              bookingsContent={
                pagedBookings.length === 0 ? (
                  <BookingListMobileEmptyState message="Chưa có booking nào cho bộ lọc hiện tại." />
                ) : (
                  pagedBookings.map(renderListBookingCard)
                )
              }
            />
          ) : (
            bookingsTable
          )}
        </Tabs.Panel>
      </Tabs>
      <BookingOrderDetailModal
        booking={mobileDetailBookingLive}
        opened={mobileDetailBookingLive != null}
        onClose={closeMobileBookingDetail}
        source={mobileDetailSource}
        receptionThresholds={receptionThresholds}
        completedBookingsByCustomer={completedBookingsByCustomer}
        isBookingRowBusy={isBookingRowBusy}
        onEdit={(b) => {
          closeMobileBookingDetail();
          openEditBookingModal(b);
        }}
        onChangeTable={(b) => {
          closeMobileBookingDetail();
          setChangeTableBooking(b);
        }}
        onAssign={(b) => {
          closeMobileBookingDetail();
          openAssignOptions(b);
        }}
        onCheckIn={(id) => void runCheckIn(id)}
        onComplete={openCompleteBookingConfirm}
        onCancel={openCancelBookingConfirm}
      />
      <Modal
        opened={editBooking != null}
        onClose={closeEditBookingModal}
        title="Chỉnh booking"
        size="lg"
        centered
        zIndex={MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX}
      >
        {editBooking ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Khách{" "}
              <strong>
                {state.customers.find((item) => item.id === editBooking.customerId)?.fullName ??
                  "—"}
              </strong>
            </Text>
            <BookingDateTimeFields
              value={editBookingAt}
              onChange={setEditBookingAt}
              labelDate="Ngày đến"
              labelTime="Giờ đến"
            />
            {editTableConflictMessage ? (
              <Alert color="red" variant="light" title="Trùng khung giờ trên bàn">
                {editTableConflictMessage}
              </Alert>
            ) : null}
            {editDuplicateWarningMessage ? (
              <Alert color="orange" variant="light" title="Cảnh báo trùng booking">
                {editDuplicateWarningMessage}
              </Alert>
            ) : null}
            <TextInput
              label="Số điện thoại"
              placeholder="09… (tùy chọn)"
              inputMode="tel"
              value={editCustomerPhone}
              onChange={(event) => setEditCustomerPhone(event.currentTarget.value)}
              size={isCompact ? "md" : "sm"}
            />
            <GuestCountNumberInput
              label="Số khách"
              description="Để trống nếu chưa rõ số khách."
              value={editGuestCount}
              onChange={setEditGuestCount}
              placeholder="Chưa rõ"
              size={isCompact ? "md" : "sm"}
            />
            <Group grow align="flex-start">
              <Select
                label="Khu vực"
                placeholder="Chờ xếp bàn"
                data={editModalAreaOptions}
                value={editAreaId}
                onChange={(value) => {
                  setEditAreaId(value);
                  setEditTableId(null);
                  setEditMergeGroupId(null);
                }}
                searchable
                clearable
                size={isCompact ? "md" : "sm"}
                comboboxProps={{ zIndex: portalModalOverlayPopoverProps.zIndex }}
              />
              <Select
                label="Bàn"
                placeholder={editAreaId ? "Chọn bàn" : "Chọn khu vực trước"}
                data={editModalTableOptions}
                value={editTableId}
                onChange={(value) => {
                  setEditTableId(value);
                  if (value) {
                    setEditMergeGroupId(null);
                  }
                }}
                searchable
                clearable
                disabled={!editAreaId || Boolean(editMergeGroupId)}
                size={isCompact ? "md" : "sm"}
                comboboxProps={{ zIndex: portalModalOverlayPopoverProps.zIndex }}
              />
            </Group>
            {editAreaId && editModalMergeGroupOptions.length > 0 ? (
              <Select
                label="Cụm gộp (Bàn gộp)"
                placeholder="Chọn cụm gộp thay cho bàn lẻ"
                data={editModalMergeGroupOptions}
                value={editMergeGroupId}
                onChange={(value) => {
                  setEditMergeGroupId(value);
                  if (value) {
                    setEditTableId(null);
                  }
                }}
                searchable
                clearable
                size={isCompact ? "md" : "sm"}
                comboboxProps={{ zIndex: portalModalOverlayPopoverProps.zIndex }}
              />
            ) : null}
            <Text size="xs" c="dimmed">
              Để trống khu vực, bàn và cụm gộp nếu booking vẫn chờ xếp bàn.
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={closeEditBookingModal}>
                Hủy
              </Button>
              <Button
                loading={isEditSaving}
                disabled={editTableSlotConflicts.length > 0 || editMergeGroupSlotBlocked}
                onClick={() => void submitEditBooking()}
              >
                Lưu
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
      <ChangeBookingTableModal
        opened={changeTableBooking != null}
        onClose={() => {
          if (!isChangeTableSaving) {
            setChangeTableBooking(null);
          }
        }}
        booking={changeTableBooking}
        customerName={
          changeTableBooking
            ? (state.customers.find((item) => item.id === changeTableBooking.customerId)
                ?.fullName ?? "")
            : ""
        }
        customers={state.customers}
        areas={state.areas}
        tables={state.tables}
        bookings={state.bookings}
        loading={isChangeTableSaving}
        onConfirm={handleSubmitChangeTable}
      />

      {assignFormBooking ? (
        <Modal
          opened
          onClose={() => {
            setAssignFormBooking(null);
            setAssignMergeGroupId(null);
          }}
          title="Gán thủ công booking vào bàn"
          size="lg"
          centered
          zIndex={MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX}
          overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {state.customers.find((item) => item.id === assignFormBooking.customerId)?.fullName ?? "—"} ·{" "}
              {dayjs(assignFormBooking.bookingAt).format("HH:mm DD/MM/YYYY")}
            </Text>
            <GuestCountNumberInput
              label="Số khách"
              description={
                isGuestCountSpecified(assignFormBooking)
                  ? "Có thể chỉnh lại trước khi gán bàn."
                  : undefined
              }
              required
              value={assignManualGuestCount}
              onChange={setAssignManualGuestCount}
            />
            <Group grow>
              <Select
                label="Khu vực"
                data={assignModalAreaOptions}
                value={assignAreaId}
                onChange={(value) => {
                  setAssignAreaId(value);
                  setAssignTableId(null);
                  setAssignMergeGroupId(null);
                }}
                searchable
                clearable
                comboboxProps={{ zIndex: MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX }}
              />
              <Select
                label="Bàn"
                placeholder={assignAreaId ? "Chọn bàn hoặc cụm gộp" : "Chọn khu vực trước"}
                data={assignModalTableOptions}
                value={assignTableId}
                onChange={(value) => {
                  setAssignTableId(value);
                  if (value) {
                    setAssignMergeGroupId(null);
                  }
                }}
                searchable
                clearable
                disabled={!assignAreaId || Boolean(assignMergeGroupId)}
                comboboxProps={{ zIndex: MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX }}
              />
            </Group>
            {assignAreaId && (assignModalMergeGroupOptions.length > 0 || assignMergeGroupId) ? (
              <Select
                label="Cụm gộp (Bàn gộp)"
                placeholder="Chọn cụm gộp thay cho bàn lẻ"
                data={assignModalMergeGroupOptions}
                value={assignMergeGroupId}
                onChange={(value) => {
                  setAssignMergeGroupId(value);
                  if (value) {
                    setAssignTableId(null);
                  }
                }}
                searchable
                clearable
                comboboxProps={{ zIndex: MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX }}
              />
            ) : null}
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => {
                  setAssignFormBooking(null);
                  setAssignMergeGroupId(null);
                }}
              >
                Đóng
              </Button>
              <Button
                loading={isAssignSaving}
                onClick={() => {
                  if (!assignAreaId) {
                    notifications.show({
                      color: "red",
                      message: "Vui lòng chọn khu vực.",
                    });
                    return;
                  }
                  if (!assignTableId && !assignMergeGroupId) {
                    notifications.show({
                      color: "red",
                      message: "Vui lòng chọn bàn hoặc cụm bàn gộp.",
                    });
                    return;
                  }
                  if (
                    typeof assignManualGuestCount !== "number" ||
                    assignManualGuestCount < 1
                  ) {
                    notifications.show({
                      color: "red",
                      message: "Vui lòng nhập số khách hợp lệ.",
                    });
                    return;
                  }
                  if (assignMergeGroupId) {
                    void runAssignToMergeGroup(assignFormBooking, {
                      areaId: assignAreaId,
                      groupId: assignMergeGroupId,
                      guestCount: assignManualGuestCount,
                    });
                    return;
                  }
                  void runAssign(assignFormBooking, {
                    areaId: assignAreaId,
                    tableId: assignTableId!,
                    guestCount: assignManualGuestCount,
                  });
                }}
              >
                Xác nhận gán
              </Button>
            </Group>
          </Stack>
        </Modal>
      ) : null}
    </Stack>
  );
}

