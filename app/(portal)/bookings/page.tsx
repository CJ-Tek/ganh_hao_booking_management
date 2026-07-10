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
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { BookingDateTimeFields } from "@/components/booking-datetime-fields";
import { notifications } from "@mantine/notifications";
import { type DataTableSortStatus } from "mantine-datatable";
import { FileSpreadsheet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { GuestCountNumberInput } from "@/components/booking-management/guest-count-number-input";
import { BookingOrderDetailModal } from "@/components/booking-management/booking-order-detail-modal";
import { BookingModalContextBanner } from "@/components/booking-management/booking-modal-context-banner";
import { EditBookingModalTitle } from "@/components/booking-management/edit-booking-modal-title";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import { BookingListDesktopSection } from "@/components/booking-management/booking-list-desktop-section";
import { BookingListDateRangeFilter } from "@/components/booking-management/booking-list-date-range-filter";
import {
  BookingListFiltersToolbar,
  BookingListTimeSortFilters,
} from "@/components/booking-management/booking-list-filters-toolbar";
import {
  BookingListMobileEmptyState,
  BookingListMobileView,
} from "@/components/booking-management/booking-list-mobile-view";
import { BookingListPaginationBar } from "@/components/booking-management/booking-list-pagination";
import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { BookingTablePicker } from "@/components/booking-table-picker/booking-table-picker";
import { ChangeBookingTableModal } from "@/components/floor-map/change-booking-table-modal";
import { confirmDuplicateBookingSecond } from "@/components/booking-duplicate-confirm";
import { openPortalModalsConfirmModal } from "@/lib/portal-confirm-modal";
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
  bookingMatchesStatusFilters,
  defaultActivePipelineStatusFilters,
  defaultBookingStatusFilters,
  bookingStatusColor,
  bookingStatusLabel,
  BOOKING_PENDING_TABLE_LABEL,
} from "@/lib/display";
import { useBookingStatusFiltersWithSearch } from "@/lib/use-booking-status-filters-with-search";
import {
  displayCustomerPhone,
  findAssignableSlotConflictsAtTable,
  formatTableSlotConflictMessage,
  bookingAreaTableSortKey,
  formatBookingAreaTable,
  formatTodayBookingAreaTable,
  getAssignableCandidateTables,
  getReceptionBookingStatus,
  inferGuestTypeLabel,
  isBookingTableAssigned,
  isGuestCountSpecified,
  isSyntheticPhoneValue,
  getAssignableMergeGroups,
  hasAssignableSlotConflictAtMergeGroup,
  resolveBookingArrivalTime,
  resolveBookingCreatedAt,
  stripUnknownGuestTag,
} from "@/lib/booking-meta";
import {
  formatBookingListDateRangeLabel,
  getDefaultBookingListDateRange,
  isBookingInDateRange,
} from "@/lib/booking-list-date-range";
import { exportBookingsToExcel } from "@/lib/export-bookings-excel";
import { validateMergeGroupDateRange } from "@/lib/merge-group-utils";
import { bookingCardBusyProps, bookingListRowStyle } from "@/lib/busy-row-style";
import { useBusyId } from "@/lib/use-busy-id";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { finalizeCustomerName } from "@/lib/voice-booking/format";
import { type Booking, type BookingStatus } from "@/lib/types";

function branchScopeKey(branchIds: string[]) {
  return [...branchIds].sort().join("|") || "none";
}

/** After `modals.close`, the Mantine overlay can still cover the viewport during exit (notably on mobile). */
const LIST_BOOKING_PULSE_CYCLE_MS = 600;
const LIST_BOOKING_PULSE_CYCLES = 2;
const LIST_BOOKING_PULSE_TOTAL_MS = LIST_BOOKING_PULSE_CYCLE_MS * LIST_BOOKING_PULSE_CYCLES;

/** Page `<Modal>` z-index; confirm dialogs use `PORTAL_MODAL_CONFIRM_Z_INDEX` (650) via `openPortalModalsConfirmModal`. */
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
    queueBooking,
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
      lateGraceMinutes: state.bookingRuntimeSettings.lateGraceMinutes,
    }),
    [state.bookingRuntimeSettings]
  );

  const [activeTab, setActiveTab] = useState<string | null>("today");
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editBookingAt, setEditBookingAt] = useState<string | null>(null);
  const [editGuestCount, setEditGuestCount] = useState<number | undefined>(undefined);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editAreaId, setEditAreaId] = useState<string | null>(null);
  const [editTableId, setEditTableId] = useState<string | null>(null);
  const [editMergeGroupId, setEditMergeGroupId] = useState<string | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [mobileDetailBooking, setMobileDetailBooking] = useState<Booking | null>(null);
  const [mobileDetailSource, setMobileDetailSource] = useState<"list" | "today">("list");
  const [listFocusBookingId, setListFocusBookingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [listRangeStart, setListRangeStart] = useState(
    () => getDefaultBookingListDateRange().startDate
  );
  const [listRangeEnd, setListRangeEnd] = useState(
    () => getDefaultBookingListDateRange().endDate
  );
  const [listStatusFilters, setListStatusFilters] = useState<BookingStatus[]>(
    defaultBookingStatusFilters
  );
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
  const [todayStatusFilters, setTodayStatusFilters] = useState<BookingStatus[]>(
    defaultBookingStatusFilters
  );
  const [todaySortStatus, setTodaySortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "createdAt",
    direction: "desc",
  });
  const [todayPage, setTodayPage] = useState(1);
  const TODAY_DESKTOP_PAGE_SIZE_OPTIONS = [8, 12, 16, 24, 32] as const;
  const [todayDesktopPageSize, setTodayDesktopPageSize] = useState(12);
  const isListSearchActive = useBookingStatusFiltersWithSearch(
    searchQuery,
    listStatusFilters,
    setListStatusFilters
  );
  const isTodaySearchActive = useBookingStatusFiltersWithSearch(
    todaySearchQuery,
    todayStatusFilters,
    setTodayStatusFilters
  );

  const listPageSize = isCompact ? mobileBookingsPageSize : desktopBookingsPageSize;
  const todayPageSize = isCompact ? mobileBookingsPageSize : todayDesktopPageSize;
  const openCancelBookingConfirm = (booking: Booking) => {
    const customer = state.customers.find((c) => c.id === booking.customerId);
    const name = customer?.fullName ?? "—";
    const timeStr = dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY");
    openPortalModalsConfirmModal({
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

  const openQueueBookingConfirm = (booking: Booking) => {
    const customer = state.customers.find((c) => c.id === booking.customerId);
    const name = customer?.fullName ?? "—";
    const hadTable = Boolean(booking.tableId || booking.mergeGroupId);
    openPortalModalsConfirmModal({
      title: `Chuyển về ${BOOKING_PENDING_TABLE_LABEL.toLowerCase()}`,
      children: (
        <Text size="sm">
          Chuyển booking của <strong>{name}</strong> về <strong>{BOOKING_PENDING_TABLE_LABEL}</strong>
          {hadTable ? " và giải phóng bàn hiện tại" : ""}? Khách có thể được gán bàn lại sau.
        </Text>
      ),
      labels: { cancel: "Quay lại", confirm: `Chuyển ${BOOKING_PENDING_TABLE_LABEL.toLowerCase()}` },
      confirmProps: { color: "yellow" },
      onConfirm: async () => {
        if (!hasSupabase) {
          notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
          return;
        }
        await runBookingRowAction(booking.id, async () => {
          try {
            const result = await queueBooking(booking.id, booking);
            notifications.show({
              color: result.ok ? "green" : "red",
              message: result.message,
            });
          } catch (error) {
            notifications.show({
              color: "red",
              message:
                error instanceof Error
                  ? error.message
                  : "Không chuyển được booking về chờ xếp bàn.",
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
    openPortalModalsConfirmModal({
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

  const getGuestTypeLabel = useCallback(
    (booking: Booking) =>
      inferGuestTypeLabel(booking, {
        completedBookingCountForCustomer:
          completedBookingsByCustomer.get(booking.customerId) ?? 0,
        thresholds: receptionThresholds,
      }),
    [completedBookingsByCustomer, receptionThresholds]
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
      candidateBookingAt: editBookingAt ?? undefined,
    });
  }, [
    editBookingAt,
    editMergeGroupId,
    editMergeGroupSlotBlocked,
    editTableId,
    editTableSlotConflicts,
    state.customers,
    state.mergeGroups,
    state.tables,
  ]);

  const dateFilteredBookings = useMemo(
    () =>
      branchBookings.filter((booking) =>
        isBookingInDateRange(booking, listRangeStart, listRangeEnd)
      ),
    [branchBookings, listRangeEnd, listRangeStart]
  );

  const pipelineFilteredBookings = useMemo(() => {
    return dateFilteredBookings.filter((booking) =>
      bookingMatchesStatusFilters(booking.status, listStatusFilters)
    );
  }, [dateFilteredBookings, listStatusFilters]);

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
        customerName: finalizeCustomerName(editCustomerName),
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
    if (booking.status === "late" && isBookingTableAssigned(booking)) {
      setAssignAreaId(booking.areaId);
      setAssignTableId(booking.mergeGroupId ? null : booking.tableId);
      setAssignMergeGroupId(booking.mergeGroupId ?? null);
    } else {
      setAssignAreaId(null);
      setAssignTableId(null);
      setAssignMergeGroupId(null);
    }
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
    setEditCustomerName(customer?.fullName ?? "");
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
    setEditCustomerName("");
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
    const finalizedCustomerName = finalizeCustomerName(editCustomerName);
    if (!finalizedCustomerName) {
      notifications.show({ color: "red", message: "Vui lòng nhập tên khách." });
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
        customerName: finalizedCustomerName,
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
        getGuestTypeLabel(booking),
        bookingStatusLabel[booking.status],
        noteText,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    getGuestTypeLabel,
    pipelineFilteredBookings,
    searchQuery,
    state.areas,
    state.customers,
    state.tables,
  ]);

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
        getGuestTypeLabel(booking),
        bookingStatusLabel[booking.status],
        noteText,
      ]
        .join(" ")
        .toLowerCase();
    },
    [bookingAreaTableLookup, getGuestTypeLabel, state.customers]
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
        if (acc === "guestType") {
          return getGuestTypeLabel(booking);
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
          return getReceptionBookingStatus(booking, receptionThresholds).label;
        }
        if (acc === "checkedInAt") {
          return booking.checkedInAt ? dayjs(booking.checkedInAt).valueOf() : 0;
        }
        if (acc === "createdAt") {
          return dayjs(resolveBookingCreatedAt(booking)).valueOf();
        }
        if (acc === "bookingAt") {
          return dayjs(resolveBookingArrivalTime(booking)).valueOf();
        }
        return dayjs(resolveBookingArrivalTime(booking)).valueOf();
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
    [bookingAreaTableLookup, getGuestTypeLabel, receptionThresholds, state.customers, state.users]
  );

  const sortedBookings = useMemo(
    () => sortListBookings(searchedBookings, sortStatus),
    [searchedBookings, sortListBookings, sortStatus]
  );

  const listSectionTitle = useMemo(() => {
    const rangeLabel = formatBookingListDateRangeLabel(listRangeStart, listRangeEnd);
    const count = sortedBookings.length;
    return rangeLabel
      ? `Danh sách booking (${count}) · ${rangeLabel}`
      : `Danh sách booking (${count})`;
  }, [listRangeEnd, listRangeStart, sortedBookings.length]);

  const todayBookings = useMemo(() => {
    const todayStart = dayjs().startOf("day");
    const todayEnd = todayStart.endOf("day");
    return branchBookings.filter((booking) => {
      const bookingTime = dayjs(booking.bookingAt);
      return (
        bookingTime.isSame(todayStart, "day") &&
        bookingTime.isAfter(todayStart.subtract(1, "millisecond")) &&
        bookingTime.isBefore(todayEnd.add(1, "millisecond"))
      );
    });
  }, [branchBookings]);

  const getTodayReceptionStatusLabel = useCallback(
    (booking: Booking) => getReceptionBookingStatus(booking, receptionThresholds).label,
    [receptionThresholds]
  );

  const todayPipelineFilteredBookings = useMemo(() => {
    return todayBookings.filter((booking) =>
      bookingMatchesStatusFilters(booking.status, todayStatusFilters)
    );
  }, [todayBookings, todayStatusFilters]);

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
        dayjs(resolveBookingCreatedAt(booking)).format("HH:mm"),
        dayjs(resolveBookingCreatedAt(booking)).format("DD/MM/YYYY HH:mm"),
        String(booking.guestCount),
        formatTodayBookingAreaTable(booking, bookingAreaTableLookup),
        getGuestTypeLabel(booking),
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
    getGuestTypeLabel,
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
        dayjs(resolveBookingCreatedAt(booking)).format("HH:mm"),
        dayjs(resolveBookingCreatedAt(booking)).format("DD/MM/YYYY HH:mm"),
        String(booking.guestCount),
        formatTodayBookingAreaTable(booking, bookingAreaTableLookup),
        getGuestTypeLabel(booking),
        getTodayReceptionStatusLabel(booking),
        bookingStatusLabel[booking.status],
        state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "",
        noteText,
      ]
        .join(" ")
        .toLowerCase();
    },
    [
      bookingAreaTableLookup,
      getGuestTypeLabel,
      getTodayReceptionStatusLabel,
      state.customers,
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
          return getGuestTypeLabel(booking);
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
        if (acc === "createdAt") {
          return dayjs(resolveBookingCreatedAt(booking)).valueOf();
        }
        if (acc === "bookingAt") {
          return dayjs(resolveBookingArrivalTime(booking)).valueOf();
        }
        return dayjs(resolveBookingCreatedAt(booking)).valueOf();
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
      getGuestTypeLabel,
      getTodayReceptionStatusLabel,
      state.customers,
      state.users,
    ]
  );

  const todaySortedBookings = useMemo(
    () => sortTodayBookings(todaySearchedBookings, todaySortStatus),
    [sortTodayBookings, todaySearchedBookings, todaySortStatus]
  );

  const todaySectionTitle = useMemo(() => {
    return `Booking hôm nay (${todaySortedBookings.length}) · ${dayjs().format("DD/MM/YYYY")}`;
  }, [todaySortedBookings.length]);

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
      setListStatusFilters(
        booking.status === "completed" ? ["completed"] : defaultActivePipelineStatusFilters
      );
      setSearchQuery(booking.status === "completed" ? "" : (customer?.fullName ?? ""));
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
      setListStatusFilters(["completed"]);
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
    "Tìm theo khách, SĐT, giờ đến, giờ check-in, loại khách, khu, bàn, trạng thái...";

  const listDefaultSort = useMemo<DataTableSortStatus<Booking>>(
    () => ({ columnAccessor: "bookingAt", direction: "desc" }),
    []
  );

  const listDateRangeValidation = useMemo(
    () => validateMergeGroupDateRange({ startDate: listRangeStart, endDate: listRangeEnd }),
    [listRangeEnd, listRangeStart]
  );

  const runExportListExcel = useCallback(async () => {
    try {
      await exportBookingsToExcel({
        bookings: sortedBookings,
        customers: state.customers,
        dateRange: { start: listRangeStart, end: listRangeEnd },
        bookingAreaTableLookup,
      });
      notifications.show({
        color: "green",
        message: `Đã xuất ${sortedBookings.length} booking ra Excel.`,
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Xuất Excel thất bại.",
      });
    }
  }, [
    bookingAreaTableLookup,
    listRangeEnd,
    listRangeStart,
    sortedBookings,
    state.customers,
  ]);

  const handleExportListExcel = useCallback(() => {
    if (!listDateRangeValidation.ok) {
      notifications.show({ color: "red", message: listDateRangeValidation.message });
      return;
    }
    if (sortedBookings.length === 0) {
      notifications.show({ color: "yellow", message: "Không có booking để xuất Excel." });
      return;
    }

    const rangeLabel = formatBookingListDateRangeLabel(listRangeStart, listRangeEnd);
    const isSingleDay = listRangeStart === listRangeEnd;
    openPortalModalsConfirmModal({
      title: "Xuất Excel",
      children: (
        <Text size="sm">
          Tải danh sách <strong>{sortedBookings.length}</strong> booking{" "}
          {isSingleDay ? "trong ngày" : "trong khoảng"} <strong>{rangeLabel}</strong>?
        </Text>
      ),
      labels: { cancel: "Hủy", confirm: "Xuất Excel" },
      onConfirm: runExportListExcel,
    });
  }, [
    listDateRangeValidation,
    listRangeEnd,
    listRangeStart,
    runExportListExcel,
    sortedBookings.length,
  ]);

  const listBookingRangeFiltersPanel = (
    <Stack gap="sm" w="100%">
      <BookingStatusFilterChips
        value={listStatusFilters}
        onChange={(value) => {
          setListStatusFilters(value);
          setPage(1);
        }}
        statuses={bookingListStatusFilterStatuses}
        locked={isListSearchActive}
        size={isCompact ? "xs" : undefined}
      />
      <Group gap="md" align="flex-start" wrap="nowrap" w="100%" style={{ minWidth: 0 }}>
        <BookingListDateRangeFilter
          layout="panel"
          startDate={listRangeStart}
          endDate={listRangeEnd}
          onStartDateChange={(value) => {
            setListRangeStart(value);
            setPage(1);
          }}
          onEndDateChange={(value) => {
            setListRangeEnd(value);
            setPage(1);
          }}
          size="sm"
        />
        <Stack gap="sm" w="100%" style={{ flex: "1 1 8rem", minWidth: 0 }}>
          <TextInputWithVoice
            placeholder={bookingsSearchPlaceholder}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.currentTarget.value);
              setPage(1);
            }}
            size={isCompact ? "md" : "sm"}
            voiceIconSize={isCompact ? "md" : "sm"}
            style={{ width: "100%" }}
          />
          <BookingListTimeSortFilters
            layout="panel"
            sortStatus={sortStatus}
            fallbackSort={listDefaultSort}
            onSortStatusChange={(next) => {
              setSortStatus(next);
              setPage(1);
            }}
            size="sm"
          />
          <Button
            variant="default"
            size="sm"
            leftSection={<FileSpreadsheet size={16} />}
            onClick={handleExportListExcel}
            disabled={!listDateRangeValidation.ok || sortedBookings.length === 0}
            w="100%"
          >
            Xuất Excel
          </Button>
        </Stack>
      </Group>
    </Stack>
  );

  const listFiltersPanel = listBookingRangeFiltersPanel;

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
      table={
        <Stack gap="sm">
          {listFiltersPanel}
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
        defaultSort={listDefaultSort}
        withToolbar={false}
        hideSearch
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
            accessor: "bookingAt",
            title: "Giờ đến",
            sortable: true,
            render: (booking) =>
              dayjs(resolveBookingArrivalTime(booking)).format("HH:mm DD/MM/YYYY"),
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
            accessor: "guestType",
            title: "Loại khách",
            sortable: true,
            render: (booking) => getGuestTypeLabel(booking),
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
            accessor: "createdAt",
            title: "Tạo lúc",
            sortable: true,
            render: (booking) =>
              dayjs(resolveBookingCreatedAt(booking)).format("HH:mm DD/MM/YYYY"),
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
        ]}
      />
        </Stack>
      }
    />
  );

  const todayDefaultSort = useMemo<DataTableSortStatus<Booking>>(
    () => ({ columnAccessor: "createdAt", direction: "desc" }),
    []
  );

  const todayTimeSortFilters = (
    <BookingListTimeSortFilters
      sortStatus={todaySortStatus}
      fallbackSort={todayDefaultSort}
      onSortStatusChange={(next) => {
        setTodaySortStatus(next);
        setTodayPage(1);
      }}
      size={isCompact ? "md" : "sm"}
    />
  );

  const todayInlineFilters = todayTimeSortFilters;

  const todayFiltersToolbar = (
    <BookingListFiltersToolbar
      searchQuery={todaySearchQuery}
      onSearchQueryChange={(value) => {
        setTodaySearchQuery(value);
        setTodayPage(1);
      }}
      searchPlaceholder={todaySearchPlaceholder}
      inlineFilters={todayInlineFilters}
    />
  );

  const todayDesktopFilters = todayInlineFilters;

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
        getGuestTypeLabel={getGuestTypeLabel}
        lastEditorName={bookingLastEditorName(booking, state.users)}
        onClick={() => openMobileBookingDetail(booking, "today")}
      />
    );
  };

  const bookingsTodayTable = (
    <BookingListDesktopSection
      title={todaySectionTitle}
      statusFilters={todayStatusFilters}
      onStatusFiltersChange={(value) => {
        setTodayStatusFilters(value);
        setTodayPage(1);
      }}
      statusFilterStatuses={bookingListStatusFilterStatuses}
      statusFiltersLocked={isTodaySearchActive}
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
        defaultSort={todayDefaultSort}
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
            accessor: "customerId",
            title: "Tên khách",
            sortable: true,
            render: (booking) =>
              state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—",
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
            accessor: "bookingAt",
            title: "Giờ đến",
            sortable: true,
            render: (booking) => dayjs(resolveBookingArrivalTime(booking)).format("HH:mm"),
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
            render: (booking) => getGuestTypeLabel(booking),
          },
          {
            accessor: "areaTable",
            title: "Khu/Bàn",
            sortable: true,
            render: (booking) =>
              formatTodayBookingAreaTable(booking, bookingAreaTableLookup),
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
            accessor: "createdAt",
            title: "Tạo lúc",
            sortable: true,
            render: (booking) =>
              dayjs(resolveBookingCreatedAt(booking)).format("HH:mm DD/MM/YYYY"),
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

  const assignSelectableTableIds = useMemo(() => {
    if (!assignFormBooking) {
      return undefined;
    }
    return new Set(getCandidateTables(assignFormBooking).map((table) => table.id));
  }, [assignFormBooking, state.bookings, state.tables]);

  const assignSelectableMergeGroupIds = useMemo(() => {
    if (!assignFormBooking) {
      return undefined;
    }
    const groupsInScope = assignAreaId
      ? state.mergeGroups.filter((group) => group.areaId === assignAreaId)
      : state.mergeGroups.filter((group) => group.branchId === assignFormBooking.branchId);
    return new Set(
      getAssignableMergeGroups(assignFormBooking, groupsInScope, state.bookings).map(
        (group) => group.id
      )
    );
  }, [assignAreaId, assignFormBooking, state.bookings, state.mergeGroups]);

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

  const todayEmptyMessage =
    todayBookings.length === 0
      ? "Chưa có booking nào cho hôm nay."
      : "Không có booking khớp bộ lọc hiện tại.";

  const todayBookingsPanel = isCompact ? (
    <BookingListMobileView
      title={todaySectionTitle}
      statusFilters={todayStatusFilters}
      onStatusFiltersChange={(value) => {
        setTodayStatusFilters(value);
        setTodayPage(1);
      }}
      statusFilterStatuses={bookingListStatusFilterStatuses}
      statusFiltersLocked={isTodaySearchActive}
      filtersToolbar={todayFiltersToolbar}
      paginationBar={todayPaginationBar}
      bookingsContent={
        pagedTodayBookings.length === 0 ? (
          <BookingListMobileEmptyState message={todayEmptyMessage} />
        ) : (
          pagedTodayBookings.map(renderTodayBookingCard)
        )
      }
    />
  ) : (
    bookingsTodayTable
  );

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
          {todayBookingsPanel}
        </Tabs.Panel>
        <Tabs.Panel value="list" pt="md">
          {isCompact ? (
            <BookingListMobileView
              title={listSectionTitle}
              filtersToolbar={listFiltersPanel}
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
        onQueue={openQueueBookingConfirm}
      />
      <PortalStandardModal
        opened={editBooking != null}
        onClose={closeEditBookingModal}
        closeOnClickOutside={!isEditSaving}
        closeOnEscape={!isEditSaving}
        title={
          editBooking ? (
            <EditBookingModalTitle customerName={editCustomerName.trim() || "—"} />
          ) : (
            "Chỉnh booking"
          )
        }
        size="xl"
        zIndex={MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX}
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        footer={
          editBooking ? (
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={closeEditBookingModal} disabled={isEditSaving}>
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
          ) : undefined
        }
      >
        {editBooking ? (
          <Stack gap="sm">
            <TextInputWithVoice
              label="Tên khách"
              placeholder="Nhập tên khách"
              value={editCustomerName}
              onChange={(event) => setEditCustomerName(event.currentTarget.value)}
              onBlur={() => setEditCustomerName((value) => finalizeCustomerName(value))}
              disabled={isEditSaving}
              size={isCompact ? "md" : "sm"}
            />
            <BookingDateTimeFields
              value={editBookingAt}
              onChange={setEditBookingAt}
              labelDate="Ngày đến"
              labelTime="Giờ đến"
              disabled={isEditSaving}
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
              disabled={isEditSaving}
              size={isCompact ? "md" : "sm"}
            />
            <GuestCountNumberInput
              label="Số khách"
              description="Để trống nếu chưa rõ số khách."
              value={editGuestCount}
              onChange={setEditGuestCount}
              placeholder="Chưa rõ"
              disabled={isEditSaving}
              size={isCompact ? "md" : "sm"}
            />
            <BookingTablePicker
              mode="edit"
              branchId={editBooking.branchId}
              areas={state.areas.filter((area) => area.branchId === editBooking.branchId)}
              tables={state.tables.filter((table) => table.branchId === editBooking.branchId)}
              mergeGroups={state.mergeGroups.filter(
                (group) => group.branchId === editBooking.branchId
              )}
              bookings={state.bookings}
              layoutDate={dayjs(editBookingAt).format("YYYY-MM-DD")}
              areaId={editAreaId}
              tableId={editTableId}
              mergeGroupId={editMergeGroupId}
              disabled={isEditSaving}
              onChange={(patch) => {
                if (patch.areaId !== undefined) {
                  setEditAreaId(patch.areaId);
                }
                if (patch.tableId !== undefined) {
                  setEditTableId(patch.tableId);
                }
                if (patch.mergeGroupId !== undefined) {
                  setEditMergeGroupId(patch.mergeGroupId);
                }
              }}
            />
          </Stack>
        ) : null}
      </PortalStandardModal>
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
        <PortalStandardModal
          opened
          onClose={() => {
            setAssignFormBooking(null);
            setAssignMergeGroupId(null);
          }}
          title="Gán thủ công booking vào bàn"
          size="xl"
          zIndex={MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX}
          overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        >
          <Stack gap="sm">
            <BookingModalContextBanner
              customerName={
                state.customers.find((item) => item.id === assignFormBooking.customerId)?.fullName ??
                "—"
              }
              bookingAt={assignFormBooking.bookingAt}
            />
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
            <BookingTablePicker
              mode="assign"
              branchId={assignFormBooking.branchId}
              areas={state.areas.filter((area) => area.branchId === assignFormBooking.branchId)}
              tables={state.tables.filter((table) => table.branchId === assignFormBooking.branchId)}
              mergeGroups={state.mergeGroups.filter(
                (group) => group.branchId === assignFormBooking.branchId
              )}
              bookings={state.bookings}
              layoutDate={dayjs(assignFormBooking.bookingAt).format("YYYY-MM-DD")}
              areaId={assignAreaId}
              tableId={assignTableId}
              mergeGroupId={assignMergeGroupId}
              selectableTableIds={assignSelectableTableIds}
              selectableMergeGroupIds={assignSelectableMergeGroupIds}
              onChange={(patch) => {
                if (patch.areaId !== undefined) {
                  setAssignAreaId(patch.areaId);
                }
                if (patch.tableId !== undefined) {
                  setAssignTableId(patch.tableId);
                }
                if (patch.mergeGroupId !== undefined) {
                  setAssignMergeGroupId(patch.mergeGroupId);
                }
              }}
            />
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
        </PortalStandardModal>
      ) : null}
    </Stack>
  );
}

