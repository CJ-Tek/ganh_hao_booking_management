"use client";

import dayjs from "dayjs";
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DateTimePicker } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyAction,
} from "@/components/portal-page";
import { confirmDuplicateBookingSecond } from "@/components/booking-duplicate-confirm";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { VoiceBookingAssistant } from "@/components/voice-booking/VoiceBookingAssistant";
import { useAppContext } from "@/contexts/app-context";
import {
  bookingSlotKey,
  DUPLICATE_BOOKING_CODE,
  formatBookingDuplicateAlertMessage,
  isPlausibleVietnamPhone,
  normalizeVietnamPhone,
  type BookingDuplicateInfo,
} from "@/lib/booking-duplicate";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import {
  BOOKING_GUEST_TYPE_OPTIONS,
  displayCustomerPhone,
  findAssignableSlotConflictsAtTable,
  formatTableSlotConflictMessage,
  formatTodayBookingAreaTable,
  getAssignableCandidateTables,
  getReceptionBookingStatus,
  inferGuestTypeLabel,
  isGuestCountSpecified,
  isSyntheticPhoneValue,
  stripUnknownGuestTag,
} from "@/lib/booking-meta";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking, type BookingStatus } from "@/lib/types";
import { formatVietnamesePersonName } from "@/lib/voice-booking/format";

function branchScopeKey(branchIds: string[]) {
  return [...branchIds].sort().join("|") || "none";
}

/** After `modals.close`, the Mantine overlay can still cover the viewport during exit (notably on mobile). */
const LIST_BOOKING_PULSE_CYCLE_MS = 600;
const LIST_BOOKING_PULSE_CYCLES = 2;
const LIST_BOOKING_PULSE_TOTAL_MS = LIST_BOOKING_PULSE_CYCLE_MS * LIST_BOOKING_PULSE_CYCLES;

const MANUAL_ASSIGN_MODAL_OPEN_DELAY_MS = 220;

/** Page `<Modal>` stacks above Mantine `modals`; portaled overlays need a higher z-index. */
const MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX = 600;
const MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX = 700;

const portalModalOverlayPopoverProps = {
  zIndex: MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX,
  withinPortal: true,
} as const;

function BookingCheckInButton(props: {
  size: "compact-xs" | "sm";
  disabled: boolean;
  onCheckIn: () => void;
}) {
  const { size, disabled, onCheckIn } = props;
  const btn = (
    <Button
      size={size}
      variant={disabled ? "default" : "filled"}
      color={disabled ? undefined : "green"}
      onClick={() => void onCheckIn()}
      disabled={disabled}
    >
      Check-in
    </Button>
  );
  if (!disabled) {
    return btn;
  }
  return (
    <Tooltip label="Chỉ check-in khi booking đã xác nhận." withArrow>
      <span style={{ display: "inline-flex" }}>{btn}</span>
    </Tooltip>
  );
}

function canEditBookingOrder(booking: Pick<Booking, "status">): boolean {
  return booking.status === "pending" || booking.status === "confirmed";
}

function bookingLastEditorName(
  booking: Pick<Booking, "lastEditedByUserId">,
  users: { id: string; fullName: string }[]
): string {
  if (!booking.lastEditedByUserId) {
    return "—";
  }
  return users.find((item) => item.id === booking.lastEditedByUserId)?.fullName ?? "Không rõ";
}

function BookingDetailField(props: { label: string; value: ReactNode }) {
  const { label, value } = props;
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <div style={{ minWidth: 0, flex: 1, textAlign: "right" }}>{value}</div>
    </Group>
  );
}

/** Mantine NumberInput may emit string while editing; keep a single parse path for guest counts. */
function parseGuestCountFromNumberInput(value: number | string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function AssignGuestCountPromptBody(props: {
  onBack?: () => void;
  onManual: (guestCount: number) => void;
  onAuto: (guestCount: number) => void;
}) {
  const { onBack, onManual, onAuto } = props;
  const [guestCount, setGuestCount] = useState<number | undefined>(undefined);
  return (
    <Stack gap="sm">
      {onBack ? (
        <Button variant="default" size="compact-sm" onClick={onBack}>
          ← Quay lại
        </Button>
      ) : null}
      <NumberInput
        label="Số khách"
        min={1}
        allowDecimal={false}
        clampBehavior="strict"
        value={guestCount}
        onChange={(value) => setGuestCount(parseGuestCountFromNumberInput(value))}
      />
      <Group grow>
        <Button
          variant="default"
          onClick={() => {
            if (typeof guestCount !== "number" || guestCount < 1) {
              notifications.show({
                color: "red",
                message: "Vui lòng nhập số khách hợp lệ.",
              });
              return;
            }
            onManual(guestCount);
          }}
        >
          Chọn thủ công
        </Button>
        <Button
          onClick={() => {
            if (typeof guestCount !== "number" || guestCount < 1) {
              notifications.show({
                color: "red",
                message: "Vui lòng nhập số khách hợp lệ.",
              });
              return;
            }
            onAuto(guestCount);
          }}
        >
          Tự động theo số khách
        </Button>
      </Group>
    </Stack>
  );
}

/** Đã có số khách: Sửa → chỉnh rồi Xong để lưu DB; sau đó có thể chọn thủ công / tự động. */
function AssignGuestSpecifiedOptionsBody(props: {
  booking: Booking;
  modalId: string;
  persistGuestCount: (bookingId: string, guestCount: number) => Promise<{ ok: boolean; message: string }>;
  onManual: (guestCount: number) => void;
  onAuto: (guestCount: number) => void;
}) {
  const { booking, modalId, persistGuestCount, onManual, onAuto } = props;
  const [editingGuest, setEditingGuest] = useState(false);
  const [guestDraft, setGuestDraft] = useState(() => Math.max(1, booking.guestCount));
  const [committedGuest, setCommittedGuest] = useState(() => Math.max(1, booking.guestCount));
  const [persistingGuest, setPersistingGuest] = useState(false);

  useEffect(() => {
    const base = Math.max(1, booking.guestCount);
    setGuestDraft(base);
    setCommittedGuest(base);
    setEditingGuest(false);
  }, [booking.id, booking.guestCount]);

  const resolvedGuest = Math.max(
    1,
    Math.round(
      typeof guestDraft === "number" && Number.isFinite(guestDraft)
        ? guestDraft
        : committedGuest
    )
  );

  const handleEditToggle = async () => {
    if (editingGuest) {
      const next = resolvedGuest;
      setPersistingGuest(true);
      try {
        const result = await persistGuestCount(booking.id, next);
        notifications.show({ color: result.ok ? "green" : "red", message: result.message });
        if (!result.ok) {
          return;
        }
        setCommittedGuest(next);
        setGuestDraft(next);
      } finally {
        setPersistingGuest(false);
      }
      setEditingGuest(false);
      return;
    }
    setEditingGuest(true);
  };

  return (
    <Stack gap="sm">
      <Group gap="xs" align="flex-end" wrap="wrap">
        {editingGuest ? (
          <NumberInput
            label="Số khách"
            min={1}
            miw={160}
            style={{ flex: "1 1 12rem" }}
            allowDecimal={false}
            clampBehavior="strict"
            disabled={persistingGuest}
            value={guestDraft}
            onChange={(v) =>
              setGuestDraft(parseGuestCountFromNumberInput(v) ?? guestDraft)
            }
          />
        ) : (
          <Text size="sm" c="dimmed">
            Đã có số khách: <strong>{resolvedGuest}</strong>.
          </Text>
        )}
        <Button
          variant="light"
          size="compact-sm"
          loading={persistingGuest}
          disabled={persistingGuest}
          onClick={() => void handleEditToggle()}
        >
          {editingGuest ? "Xong" : "Sửa"}
        </Button>
      </Group>
      <Group grow>
        <Button
          variant="default"
          onClick={() => {
            modals.close(modalId);
            window.setTimeout(() => {
              onManual(resolvedGuest);
            }, MANUAL_ASSIGN_MODAL_OPEN_DELAY_MS);
          }}
        >
          Chọn thủ công
        </Button>
        <Button
          onClick={() => {
            modals.close(modalId);
            onAuto(resolvedGuest);
          }}
        >
          Tự động gán theo số khách
        </Button>
      </Group>
    </Stack>
  );
}

export default function BookingsPage() {
  const { filteredBranchIds } = useAppContext();
  return <BookingsPageContent key={branchScopeKey(filteredBranchIds)} />;
}

function BookingsPageContent() {
  const {
    state,
    filteredBranchIds,
    createBooking,
    assignBookingToTable,
    updateBookingGuestCount,
    updateBookingOrder,
    updateBookingStatus,
    checkInBooking,
    hasSupabase,
  } = useAppContext();

  const isCompact = usePortalCompact();

  const branchId = filteredBranchIds[0] ?? null;
  const branchName =
    branchId ? state.branches.find((b) => b.id === branchId)?.name ?? "—" : "—";

  const receptionThresholds = useMemo(
    () => ({
      groupPartyGuestThreshold: state.bookingRuntimeSettings.groupPartyGuestThreshold,
      repeatCustomerMinCompleted: state.bookingRuntimeSettings.repeatCustomerMinCompleted,
      receptionArrivalGraceMinutes: state.bookingRuntimeSettings.receptionArrivalGraceMinutes,
    }),
    [state.bookingRuntimeSettings]
  );

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [guestCount, setGuestCount] = useState<number | undefined>(undefined);
  const [bookingAt, setBookingAt] = useState<string | null>(
    dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm")
  );
  const [note, setNote] = useState("");
  const [guestType, setGuestType] = useState<string | null>("Khách thường");
  const [activeTab, setActiveTab] = useState<string | null>("today");
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editBookingAt, setEditBookingAt] = useState<string | null>(null);
  const [editGuestCount, setEditGuestCount] = useState<number | undefined>(undefined);
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editAreaId, setEditAreaId] = useState<string | null>(null);
  const [editTableId, setEditTableId] = useState<string | null>(null);
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
  const [isAssignSaving, setIsAssignSaving] = useState(false);
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
  const [todayReceptionStatusFilter, setTodayReceptionStatusFilter] = useState<string | null>(null);
  const [todayGuestTypeFilter, setTodayGuestTypeFilter] = useState<string | null>(null);
  const [todayTableAssignFilter, setTodayTableAssignFilter] = useState<
    "all" | "assigned" | "unassigned"
  >("all");
  const [todaySortStatus, setTodaySortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "bookingAt",
    direction: "asc",
  });
  const [todayPage, setTodayPage] = useState(1);
  const TODAY_DESKTOP_PAGE_SIZE_OPTIONS = [8, 12, 16, 24, 32] as const;
  const [todayDesktopPageSize, setTodayDesktopPageSize] = useState(12);

  const listPageSize = isCompact ? mobileBookingsPageSize : desktopBookingsPageSize;
  const todayPageSize = isCompact ? mobileBookingsPageSize : todayDesktopPageSize;
  const selectedBookingSlot = useMemo(() => (bookingAt ? bookingSlotKey(bookingAt) : null), [bookingAt]);
  const normalizedCustomerPhone = useMemo(
    () => normalizeVietnamPhone(customerPhone.trim()),
    [customerPhone]
  );

  const duplicateCandidates = useMemo(() => {
    if (!branchId || !selectedBookingSlot || !normalizedCustomerPhone) {
      return [];
    }
    if (!isPlausibleVietnamPhone(normalizedCustomerPhone)) {
      return [];
    }
    return state.bookings
      .filter((booking) => booking.branchId === branchId)
      .filter((booking) => !["cancelled", "completed", "no_show"].includes(booking.status))
      .map((booking) => {
        const customer = state.customers.find((item) => item.id === booking.customerId);
        if (!customer?.phone) {
          return null;
        }
        const bookingPhone = normalizeVietnamPhone(customer.phone);
        if (bookingPhone !== normalizedCustomerPhone) {
          return null;
        }
        const slot = bookingSlotKey(booking.bookingAt);
        if (!slot) {
          return null;
        }
        if (slot.dayKey !== selectedBookingSlot.dayKey || slot.timeKey !== selectedBookingSlot.timeKey) {
          return null;
        }
        const receiverName =
          state.users.find((user) => user.id === booking.createdByUserId)?.fullName ?? "Không rõ";
        return {
          booking,
          receiverName,
        };
      })
      .filter((item): item is { booking: Booking; receiverName: string } => item !== null)
      .sort(
        (a, b) =>
          dayjs(a.booking.bookingAt).valueOf() - dayjs(b.booking.bookingAt).valueOf() ||
          a.booking.id.localeCompare(b.booking.id)
      );
  }, [
    branchId,
    normalizedCustomerPhone,
    selectedBookingSlot,
    state.bookings,
    state.customers,
    state.users,
  ]);

  const duplicateInfosForAlert = useMemo<BookingDuplicateInfo[]>(
    () =>
      duplicateCandidates.map((item) => ({
        bookingId: item.booking.id,
        bookingAt: item.booking.bookingAt,
        guestCount: item.booking.guestCount,
        receiverFullName: item.receiverName,
      })),
    [duplicateCandidates]
  );

  const duplicateWarningMessage = useMemo(
    () => formatBookingDuplicateAlertMessage(duplicateInfosForAlert, bookingAt ?? undefined),
    [bookingAt, duplicateInfosForAlert]
  );

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
        try {
          await updateBookingStatus(booking.id, "cancelled");
          notifications.show({ color: "green", message: "Đã hủy booking." });
        } catch (error) {
          notifications.show({
            color: "red",
            message: error instanceof Error ? error.message : "Không hủy được booking.",
          });
        }
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
        try {
          await updateBookingStatus(booking.id, "completed");
          notifications.show({ color: "green", message: "Đã hoàn thành booking." });
        } catch (error) {
          notifications.show({
            color: "red",
            message: error instanceof Error ? error.message : "Không hoàn thành được booking.",
          });
        }
      },
    });
  };

  const runCheckIn = async (bookingId: string) => {
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    try {
      await checkInBooking(bookingId);
      notifications.show({ color: "green", message: "Đã check-in." });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Check-in thất bại.",
      });
    }
  };

  const filteredAreas = state.areas.filter((area) => area.branchId === branchId);
  const branchTables = useMemo(
    () => state.tables.filter((table) => table.branchId === branchId),
    [branchId, state.tables]
  );

  const branchBookings = useMemo(
    () => state.bookings.filter((booking) => filteredBranchIds.includes(booking.branchId)),
    [filteredBranchIds, state.bookings]
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
    };
  }, [
    editAreaId,
    editBooking,
    editBookingAt,
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

  const editTableConflictMessage = useMemo(() => {
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
  }, [editTableId, editTableSlotConflicts, state.customers, state.tables]);

  const bookingStatusFilterOptions = useMemo(
    () =>
      (["pending", "confirmed", "seated", "checked_in", "no_show", "completed", "cancelled"] as const).map((s) => ({
        value: s,
        label: bookingStatusLabel[s],
      })),
    []
  );

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
      if (listStatusFilter && booking.status !== listStatusFilter) {
        return false;
      }
      const hasTable = Boolean(booking.areaId && booking.tableId);
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
  const getCandidateTables = (booking: Booking, requiredSeats?: number) =>
    getAssignableCandidateTables(booking, state.tables, state.bookings, requiredSeats);

  const runAssign = async (
    booking: Booking,
    target: { areaId: string; tableId: string; guestCount?: number }
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
      if (result.ok) {
        setAssignFormBooking(null);
      }
    } finally {
      setIsAssignSaving(false);
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
  };

  const runAutoAssign = async (booking: Booking, guestForAssign?: number) => {
    const candidates = getCandidateTables(booking, guestForAssign);
    if (candidates.length === 0) {
      notifications.show({
        color: "red",
        message:
          typeof guestForAssign === "number"
            ? "Không còn bàn trống phù hợp với số khách."
            : "Không còn bàn trống để gán tự động.",
      });
      return;
    }
    const picked =
      typeof guestForAssign === "number"
        ? [...candidates].sort((a, b) => a.seats - b.seats || a.name.localeCompare(b.name, "vi"))[0]
        : candidates[Math.floor(Math.random() * candidates.length)];
    await runAssign(booking, {
      areaId: picked.areaId,
      tableId: picked.id,
      guestCount: guestForAssign,
    });
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
  };

  const closeEditBookingModal = () => {
    setEditBooking(null);
    setEditBookingAt(null);
    setEditGuestCount(undefined);
    setEditCustomerPhone("");
    setEditAreaId(null);
    setEditTableId(null);
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
    if ((editAreaId && !editTableId) || (!editAreaId && editTableId)) {
      notifications.show({
        color: "red",
        message: "Vui lòng chọn cả khu vực và bàn, hoặc để trống để chờ xếp bàn.",
      });
      return;
    }
    if (editTableSlotConflicts.length > 0) {
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
        tableId: editTableId,
        allowDuplicate: options?.allowDuplicate,
      });
      if (!result.ok && result.code === DUPLICATE_BOOKING_CODE && result.duplicates?.length) {
        notifications.show({ color: "orange", message: result.message });
        confirmDuplicateBookingSecond(result.duplicates, () => {
          void submitEditBooking({ allowDuplicate: true });
        });
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

  const openAssignOptions = (booking: Booking) => {
    modals.closeAll();
    const guestSpecified = isGuestCountSpecified(booking);
    const modalId = modals.open({
      title: "Gán khách vào bàn",
      children: <></>,
    });
    modals.updateModal({
      modalId,
      children: (
        <Stack gap="sm">
          <Text size="sm">
            Khách{" "}
            <strong>
              {state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—"}
            </strong>{" "}
            · {dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY")}
          </Text>
          {guestSpecified ? (
            <AssignGuestSpecifiedOptionsBody
              booking={booking}
              modalId={modalId}
              persistGuestCount={(id, n) => updateBookingGuestCount(id, n)}
              onManual={(guestCount) => openManualAssignModal(booking, guestCount)}
              onAuto={(guestCount) => void runAutoAssign(booking, guestCount)}
            />
          ) : (
            <>
              <Text size="sm" c="dimmed">
                Booking này chưa có số khách.
              </Text>
              <Group grow>
                <Button
                  variant="default"
                  onClick={() => {
                    const nestedModalId = modals.open({
                      title: "Nhập số khách rồi chọn cách gán",
                      children: <></>,
                    });
                    modals.updateModal({
                      modalId: nestedModalId,
                      children: (
                        <AssignGuestCountPromptBody
                          onBack={() => modals.close(nestedModalId)}
                          onManual={(guest) => {
                            modals.close(nestedModalId);
                            modals.close(modalId);
                            window.setTimeout(() => {
                              openManualAssignModal(booking, guest);
                            }, MANUAL_ASSIGN_MODAL_OPEN_DELAY_MS);
                          }}
                          onAuto={(guest) => {
                            modals.close(nestedModalId);
                            modals.close(modalId);
                            void runAutoAssign(booking, guest);
                          }}
                        />
                      ),
                    });
                  }}
                >
                  Nhập số khách
                </Button>
                <Button
                  onClick={() => {
                    modals.close(modalId);
                    void runAutoAssign(booking);
                  }}
                >
                  Tự động ngẫu nhiên bàn trống
                </Button>
              </Group>
            </>
          )}
        </Stack>
      ),
    });
  };

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

  const sortedBookings = useMemo(() => {
    const getValue = (booking: Booking) => {
      const acc = sortStatus.columnAccessor as string;
      if (acc === "customerId") {
        return state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
      }
      if (acc === "guestCount") {
        return booking.guestCount;
      }
      if (acc === "areaTable") {
        const areaName = state.areas.find((item) => item.id === booking.areaId)?.name ?? "";
        const tableName = state.tables.find((item) => item.id === booking.tableId)?.name ?? "";
        return `${areaName} ${tableName}`;
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
    return [...searchedBookings].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);
      const compare = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "vi");
      return sortStatus.direction === "asc" ? compare : -compare;
    });
  }, [
    searchedBookings,
    sortStatus,
    state.areas,
    state.customers,
    state.tables,
    state.users,
  ]);

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

  const todayReceptionStatusFilterOptions = useMemo(() => {
    const labels = new Set(
      todayBookings.map((booking) => getTodayReceptionStatusLabel(booking))
    );
    return [...labels]
      .sort((a, b) => a.localeCompare(b, "vi"))
      .map((label) => ({ value: label, label }));
  }, [getTodayReceptionStatusLabel, todayBookings]);

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
      const hasTable = Boolean(booking.areaId && booking.tableId);
      if (todayTableAssignFilter === "assigned" && !hasTable) {
        return false;
      }
      if (todayTableAssignFilter === "unassigned" && hasTable) {
        return false;
      }
      if (
        todayReceptionStatusFilter &&
        getTodayReceptionStatusLabel(booking) !== todayReceptionStatusFilter
      ) {
        return false;
      }
      if (todayGuestTypeFilter && getTodayGuestTypeLabel(booking) !== todayGuestTypeFilter) {
        return false;
      }
      return true;
    });
  }, [
    getTodayGuestTypeLabel,
    getTodayReceptionStatusLabel,
    todayBookings,
    todayGuestTypeFilter,
    todayReceptionStatusFilter,
    todayStatusFilter,
    todayTableAssignFilter,
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
      const area = state.areas.find((item) => item.id === booking.areaId);
      const table = state.tables.find((item) => item.id === booking.tableId);
      const noteText = stripUnknownGuestTag(booking.note) ?? "";
      const haystack = [
        customer?.fullName ?? "",
        displayCustomerPhone(customer?.phone),
        dayjs(booking.bookingAt).format("HH:mm"),
        dayjs(booking.bookingAt).format("DD/MM/YYYY HH:mm"),
        String(booking.guestCount),
        area?.name ?? "",
        table?.name ?? "",
        formatTodayBookingAreaTable(booking, area?.name, table?.name),
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
    getTodayGuestTypeLabel,
    getTodayReceptionStatusLabel,
    state.areas,
    state.customers,
    state.tables,
    state.users,
    todayPipelineFilteredBookings,
    todaySearchQuery,
  ]);

  const todaySortedBookings = useMemo(() => {
    const getValue = (booking: Booking) => {
      const acc = todaySortStatus.columnAccessor as string;
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
        const areaName = state.areas.find((item) => item.id === booking.areaId)?.name ?? "";
        const tableName = state.tables.find((item) => item.id === booking.tableId)?.name ?? "";
        return formatTodayBookingAreaTable(booking, areaName, tableName);
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
    return [...todaySearchedBookings].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);
      const compare =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), "vi");
      return todaySortStatus.direction === "asc" ? compare : -compare;
    });
  }, [
    getTodayGuestTypeLabel,
    getTodayReceptionStatusLabel,
    state.areas,
    state.customers,
    state.tables,
    state.users,
    todaySearchedBookings,
    todaySortStatus,
  ]);

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

  const openBookingInList = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      setListStatusFilter(null);
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

  const submitCreateBooking = async (options?: { allowDuplicate?: boolean }) => {
    if (!customerName || !branchId || !bookingAt) {
      notifications.show({ color: "red", message: "Cần ít nhất tên khách và thời gian đến." });
      return;
    }
    if (normalizedCustomerPhone && !isPlausibleVietnamPhone(normalizedCustomerPhone)) {
      notifications.show({
        color: "red",
        message:
          "Số điện thoại không đúng định dạng Việt Nam (ví dụ 0912345678, +84912345678).",
      });
      return;
    }
    const result = await createBooking({
      customerName: formatVietnamesePersonName(customerName),
      customerPhone: normalizedCustomerPhone || undefined,
      branchId,
      guestCount: typeof guestCount === "number" && Number.isFinite(guestCount) ? Math.max(1, guestCount) : undefined,
      bookingAt: dayjs(bookingAt).toISOString(),
      note,
      guestType,
      allowDuplicate: options?.allowDuplicate,
    });
    if (!result.ok && result.code === DUPLICATE_BOOKING_CODE && result.duplicates?.length) {
      notifications.show({ color: "orange", message: result.message });
      confirmDuplicateBookingSecond(result.duplicates, () => {
        void submitCreateBooking({ allowDuplicate: true });
      });
      return;
    }
    notifications.show({
      color: result.ok ? "green" : "red",
      message: result.message,
    });
    if (result.ok) {
      setCustomerName("");
      setCustomerPhone("");
      setGuestCount(undefined);
      setNote("");
      setGuestType("Khách thường");
      setCreateModalOpened(false);
    }
  };

  const handleCreate = async () => {
    if (duplicateInfosForAlert.length === 0) {
      await submitCreateBooking();
      return;
    }
    confirmDuplicateBookingSecond(duplicateInfosForAlert, () => {
      void submitCreateBooking({ allowDuplicate: true });
    });
  };

  const createForm = (
    <PortalSectionCard>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Chi nhánh: <strong>{branchName}</strong>
        </Text>
        <Group justify="flex-start">
          <VoiceBookingAssistant
            branch={branchId ? { id: branchId, name: branchName } : null}
            areas={filteredAreas.map((a) => ({ id: a.id, name: a.name }))}
            tables={branchTables.map((t) => ({
              id: t.id,
              name: t.name,
              seats: t.seats,
              areaId: t.areaId,
              status: t.status,
            }))}
            onCreateBooking={createBooking}
          />
        </Group>
        <TextInput
          label="Tên khách"
          placeholder="Họ và tên"
          value={customerName}
          onChange={(event) => setCustomerName(event.currentTarget.value)}
          onBlur={() => setCustomerName((v) => formatVietnamesePersonName(v))}
          size={isCompact ? "md" : "sm"}
        />
        <TextInput
          label="Số điện thoại"
          placeholder="09… (tùy chọn)"
          inputMode="tel"
          value={customerPhone}
          onChange={(event) => setCustomerPhone(event.currentTarget.value)}
          size={isCompact ? "md" : "sm"}
        />
        <Select
          label="Loại khách"
          placeholder="Chọn loại khách"
          data={BOOKING_GUEST_TYPE_OPTIONS.map((label) => ({ value: label, label }))}
          value={guestType}
          onChange={setGuestType}
          allowDeselect={false}
          size={isCompact ? "md" : "sm"}
        />
        {duplicateWarningMessage ? (
          <Alert color="orange" variant="light" title="Cảnh báo trùng booking">
            {duplicateWarningMessage}
          </Alert>
        ) : null}
        <Text size="sm" c="dimmed">
          Khu vực, trạng thái bàn và bàn gán sẽ được cấu hình ở mục <strong>Sơ đồ</strong>.
        </Text>
        <Text size="sm" c="dimmed">
          Booking tạo từ đây sẽ ở trạng thái <strong>Chờ xếp bàn</strong>.
        </Text>
        <DateTimePicker
          value={bookingAt}
          onChange={setBookingAt}
          label="Thời gian đến"
          valueFormat="DD/MM/YYYY HH:mm"
          size={isCompact ? "md" : "sm"}
          popoverProps={portalModalOverlayPopoverProps}
          timePickerProps={{ popoverProps: portalModalOverlayPopoverProps }}
        />
        <NumberInput
          label="Số khách (tùy chọn)"
          value={guestCount}
          onChange={(value) => setGuestCount(parseGuestCountFromNumberInput(value))}
          min={1}
          allowDecimal={false}
          clampBehavior="strict"
          placeholder="Để trống nếu chưa rõ"
          size={isCompact ? "md" : "sm"}
        />
        <Textarea
          label="Ghi chú"
          placeholder="Tùy chọn"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          autosize
          minRows={2}
          size={isCompact ? "md" : "sm"}
        />
        <PortalStickyAction>
          <Button fullWidth size={isCompact ? "md" : "sm"} onClick={() => void handleCreate()}>
            Tạo booking
          </Button>
        </PortalStickyAction>
      </Stack>
    </PortalSectionCard>
  );

  const bookingsSearchPlaceholder =
    "Tìm theo khách, SĐT, giờ đến, giờ check-in, khu, bàn, trạng thái...";

  const bookingsListFiltersCompact = (
    <Stack gap="sm">
      <Group align="flex-end" gap="sm" wrap="nowrap">
        <TextInputWithVoice
          placeholder={bookingsSearchPlaceholder}
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.currentTarget.value);
            setPage(1);
          }}
          size="md"
          voiceIconSize="md"
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          variant="default"
          size="md"
          aria-expanded={listMobileFiltersOpen}
          onClick={() => setListMobileFiltersOpen((open) => !open)}
          rightSection={
            listMobileFiltersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />
          }
        >
          {listMobileFiltersOpen ? "Ẩn bộ lọc" : "Bộ lọc"}
        </Button>
      </Group>
      <Collapse expanded={listMobileFiltersOpen}>
        <Stack gap="sm" pt="xs">
          <Select
            label="Trạng thái"
            placeholder="Tất cả"
            clearable
            data={bookingStatusFilterOptions}
            value={listStatusFilter}
            onChange={(value) => {
              setListStatusFilter((value as BookingStatus | null) ?? null);
              setPage(1);
            }}
            size="md"
          />
          <Select
            label="Bàn"
            data={tableAssignFilterOptions}
            value={listTableAssignFilter}
            onChange={(value) => {
              setListTableAssignFilter((value as "all" | "assigned" | "unassigned") ?? "all");
              setPage(1);
            }}
            size="md"
          />
        </Stack>
      </Collapse>
    </Stack>
  );

  const bookingsTable = (
    <PortalSectionCard>
      <Stack gap="sm">
        <Text fw={600}>Danh sách booking</Text>
        <Group align="flex-end" gap="sm" wrap="nowrap" justify="flex-start">
          <TextInputWithVoice
            placeholder={bookingsSearchPlaceholder}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.currentTarget.value);
              setPage(1);
            }}
            size="sm"
            style={{ flex: "1 1 12rem", minWidth: 0 }}
            voiceIconSize="sm"
          />
          <Select
            label="Trạng thái"
            placeholder="Tất cả"
            clearable
            data={bookingStatusFilterOptions}
            value={listStatusFilter}
            onChange={(value) => {
              setListStatusFilter((value as BookingStatus | null) ?? null);
              setPage(1);
            }}
            size="sm"
            w={168}
            miw={168}
          />
          <Select
            label="Bàn"
            data={tableAssignFilterOptions}
            value={listTableAssignFilter}
            onChange={(value) => {
              setListTableAssignFilter((value as "all" | "assigned" | "unassigned") ?? "all");
              setPage(1);
            }}
            size="sm"
            w={168}
            miw={168}
          />
        </Group>
      </Stack>
      <div style={{ height: 12 }} />
      <DataTable
        minHeight={260}
        scrollAreaProps={portalDataTableScrollAreaProps}
        withTableBorder
        records={pagedBookings}
        totalRecords={sortedBookings.length}
        recordsPerPage={desktopBookingsPageSize}
        recordsPerPageOptions={[...DESKTOP_BOOKINGS_PAGE_SIZE_OPTIONS]}
        recordsPerPageLabel="Số dòng mỗi trang"
        onRecordsPerPageChange={(n) => {
          setDesktopBookingsPageSize(n);
          setPage(1);
        }}
        page={Math.min(
          page,
          Math.max(1, Math.ceil(sortedBookings.length / desktopBookingsPageSize))
        )}
        onPageChange={setPage}
        sortStatus={sortStatus}
        onSortStatusChange={(next) => {
          setSortStatus(next);
          setPage(1);
        }}
        rowStyle={(booking) =>
          booking.id === listFocusBookingId
            ? {
                animation: `booking-list-row-pulse ${LIST_BOOKING_PULSE_CYCLE_MS}ms ease-in-out ${LIST_BOOKING_PULSE_CYCLES} forwards`,
              }
            : undefined
        }
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
            render: (booking) => {
              if (!booking.areaId || !booking.tableId) {
                return "Chờ xếp bàn";
              }
              const area = state.areas.find((item) => item.id === booking.areaId);
              const table = state.tables.find((item) => item.id === booking.tableId);
              return `${area?.name ?? "—"} · ${table?.name ?? "—"}`;
            },
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
          {
            accessor: "actions",
            title: "Thao tác",
            render: (booking) => (
              booking.status === "cancelled" || booking.status === "completed" || booking.status === "no_show" ? null : (
                <Group gap={6} wrap="wrap">
                  {canEditBookingOrder(booking) ? (
                    <Button
                      size="compact-xs"
                      variant="outline"
                      onClick={() => openEditBookingModal(booking)}
                    >
                      Sửa
                    </Button>
                  ) : null}
                  {booking.status === "pending" ? (
                    <Button
                      size="compact-xs"
                      variant="outline"
                      color="blue"
                      onClick={() => openAssignOptions(booking)}
                    >
                      Gán vào bàn
                    </Button>
                  ) : null}
                  <BookingCheckInButton
                    size="compact-xs"
                    disabled={booking.status !== "confirmed"}
                    onCheckIn={() => runCheckIn(booking.id)}
                  />
                  {booking.status === "checked_in" || booking.status === "seated" ? (
                    <Button
                      size="compact-xs"
                      variant="filled"
                      color="green"
                      onClick={() => openCompleteBookingConfirm(booking)}
                    >
                      Hoàn thành
                    </Button>
                  ) : (
                    <Button
                      size="compact-xs"
                      variant="outline"
                      color="red"
                      onClick={() => openCancelBookingConfirm(booking)}
                    >
                      Hủy
                    </Button>
                  )}
                </Group>
              )
            ),
          },
        ]}
      />
    </PortalSectionCard>
  );

  const mobileListPaginationNav = (
    <Group justify="center" gap="xs">
      <Button
        variant="default"
        size="compact-sm"
        disabled={page <= 1}
        onClick={() => setPage((p) => Math.max(1, p - 1))}
      >
        Trước
      </Button>
      <Text size="sm" c="dimmed">
        {page}/{totalListPages}
      </Text>
      <Button
        variant="default"
        size="compact-sm"
        disabled={page >= totalListPages}
        onClick={() => setPage((p) => Math.min(totalListPages, p + 1))}
      >
        Sau
      </Button>
    </Group>
  );

  const mobileTodayPaginationNav = (
    <Group justify="center" gap="xs">
      <Button
        variant="default"
        size="compact-sm"
        disabled={todayPage <= 1}
        onClick={() => setTodayPage((p) => Math.max(1, p - 1))}
      >
        Trước
      </Button>
      <Text size="sm" c="dimmed">
        {todayPage}/{totalTodayListPages}
      </Text>
      <Button
        variant="default"
        size="compact-sm"
        disabled={todayPage >= totalTodayListPages}
        onClick={() => setTodayPage((p) => Math.min(totalTodayListPages, p + 1))}
      >
        Sau
      </Button>
    </Group>
  );

  const mobileListPaginationBar =
    sortedBookings.length > 0 ? (
      <Stack gap="xs">
        <Select
          label="Số thẻ mỗi trang"
          size="sm"
          data={mobilePageSizeSelectData}
          value={String(mobileBookingsPageSize)}
          onChange={(v) => {
            if (!v) return;
            setMobileBookingsPageSize(Number(v));
            setPage(1);
          }}
          allowDeselect={false}
        />
        {mobileListPaginationNav}
        <Text size="xs" c="dimmed" ta="center">
          {sortedBookings.length} booking · trang {page}/{totalListPages}
        </Text>
      </Stack>
    ) : null;

  const bookingsCards = (
    <Stack gap="sm">
      {mobileListPaginationBar}
      {pagedBookings.length === 0 ? (
        <Text c="dimmed" size="sm">
          Chưa có booking nào.
        </Text>
      ) : (
        pagedBookings.map((booking) => {
          const cust = state.customers.find((item) => item.id === booking.customerId);
          const customer = cust?.fullName ?? "—";
          const phone = displayCustomerPhone(cust?.phone);
          const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "—";
          const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "—";
          const creator =
            state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
            "Không rõ";
          const locationLine =
            booking.areaId && booking.tableId ? `${area} · Bàn ${table}` : "Chờ xếp bàn";
          return (
            <Card
              key={booking.id}
              withBorder
              radius="md"
              padding="md"
              style={{ cursor: "pointer" }}
              className={
                booking.id === listFocusBookingId ? "booking-list-row-pulse" : undefined
              }
              onClick={() => openMobileBookingDetail(booking, "list")}
            >
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700} lineClamp={2}>
                      {customer}
                    </Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      {phone}
                    </Text>
                  </div>
                  <Badge color={bookingStatusColor[booking.status]} variant="light" size="lg">
                    {bookingStatusLabel[booking.status]}
                  </Badge>
                </Group>
                <Text size="sm" fw={500}>
                  {dayjs(booking.bookingAt).format("HH:mm · DD/MM/YYYY")}
                </Text>
                {booking.checkedInAt ? (
                  <Text size="xs" c="dimmed">
                    Check-in: {dayjs(booking.checkedInAt).format("HH:mm · DD/MM/YYYY")}
                  </Text>
                ) : null}
                <Text size="sm" c="dimmed">
                  {locationLine}
                </Text>
                <Text size="xs" c="dimmed">
                  {isGuestCountSpecified(booking) ? `${booking.guestCount} khách` : "Chưa rõ số khách"} ·{" "}
                  {creator}
                </Text>
                {booking.lastEditedAt ? (
                  <Text size="xs" c="dimmed">
                    Sửa: {bookingLastEditorName(booking, state.users)} ·{" "}
                    {dayjs(booking.lastEditedAt).format("HH:mm DD/MM/YYYY")}
                  </Text>
                ) : null}
                {stripUnknownGuestTag(booking.note) ? (
                  <Text size="xs" c="dimmed" lineClamp={3}>
                    {stripUnknownGuestTag(booking.note)}
                  </Text>
                ) : null}
                <Group grow gap="xs" onClick={(event) => event.stopPropagation()}>
                  {booking.status === "cancelled" || booking.status === "completed" || booking.status === "no_show" ? null : (
                    <>
                      {canEditBookingOrder(booking) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditBookingModal(booking)}
                        >
                          Sửa
                        </Button>
                      ) : null}
                      {booking.status === "pending" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          color="blue"
                          onClick={() => openAssignOptions(booking)}
                        >
                          Gán vào bàn
                        </Button>
                      ) : null}
                      <BookingCheckInButton
                        size="sm"
                        disabled={booking.status !== "confirmed"}
                        onCheckIn={() => runCheckIn(booking.id)}
                      />
                      {booking.status === "checked_in" || booking.status === "seated" ? (
                        <Button
                          size="sm"
                          variant="filled"
                          color="green"
                          onClick={() => openCompleteBookingConfirm(booking)}
                        >
                          Hoàn thành
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          color="red"
                          onClick={() => openCancelBookingConfirm(booking)}
                        >
                          Hủy
                        </Button>
                      )}
                    </>
                  )}
                </Group>
              </Stack>
            </Card>
          );
        })
      )}
      {mobileListPaginationBar}
    </Stack>
  );

  const mobileTodayPaginationBar =
    todaySortedBookings.length > 0 ? (
      <Stack gap="xs">
        <Select
          label="Số thẻ mỗi trang"
          size="sm"
          data={mobilePageSizeSelectData}
          value={String(mobileBookingsPageSize)}
          onChange={(v) => {
            if (!v) return;
            setMobileBookingsPageSize(Number(v));
            setTodayPage(1);
          }}
          allowDeselect={false}
        />
        {mobileTodayPaginationNav}
        <Text size="xs" c="dimmed" ta="center">
          {todaySortedBookings.length} booking · trang {todayPage}/{totalTodayListPages}
        </Text>
      </Stack>
    ) : null;

  const todayCards = (
    <Stack gap="sm">
      {mobileTodayPaginationBar}
      {pagedTodayBookings.length === 0 ? (
        <Text c="dimmed" size="sm">
          {todayBookings.length === 0
            ? "Chưa có booking nào cho hôm nay."
            : "Không có booking khớp bộ lọc hiện tại."}
        </Text>
      ) : (
        pagedTodayBookings.map((booking) => {
          const cust = state.customers.find((item) => item.id === booking.customerId);
          const customer = cust?.fullName ?? "—";
          const phone = displayCustomerPhone(cust?.phone);
          const area = state.areas.find((item) => item.id === booking.areaId)?.name;
          const table = state.tables.find((item) => item.id === booking.tableId)?.name;
          const locationLine = formatTodayBookingAreaTable(booking, area, table);
          const receptionStatus = getReceptionBookingStatus(booking, receptionThresholds);
          const creator =
            state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
            "Không rõ";
          const note = stripUnknownGuestTag(booking.note);
          return (
            <Card
              key={booking.id}
              withBorder
              radius="md"
              padding="md"
              style={{ cursor: "pointer" }}
              onClick={() => openMobileBookingDetail(booking, "today")}
            >
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700} lineClamp={2}>
                      {customer}
                    </Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      {phone}
                    </Text>
                  </div>
                  <Badge color={receptionStatus.color} variant="light" size="lg">
                    {receptionStatus.label}
                  </Badge>
                </Group>
                <Text size="sm" fw={500}>
                  {dayjs(booking.bookingAt).format("HH:mm")}
                </Text>
                <Text size="sm" c="dimmed">
                  {isGuestCountSpecified(booking) ? `${booking.guestCount} khách` : "Chưa rõ số khách"} ·{" "}
                  {getTodayGuestTypeLabel(booking)}
                </Text>
                <Text size="sm" c="dimmed">
                  {locationLine}
                </Text>
                <Text size="xs" c="dimmed">
                  Người nhận: {creator}
                </Text>
                {note ? (
                  <Text size="xs" c="dimmed" lineClamp={3}>
                    {note}
                  </Text>
                ) : null}
                {canEditBookingOrder(booking) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditBookingModal(booking);
                    }}
                  >
                    Sửa giờ / số khách
                  </Button>
                ) : null}
              </Stack>
            </Card>
          );
        })
      )}
      {mobileTodayPaginationBar}
    </Stack>
  );

  const todayTableFiltersCompact = (
    <Stack gap="sm">
      <Group align="flex-end" gap="sm" wrap="nowrap">
        <TextInputWithVoice
          placeholder={todaySearchPlaceholder}
          value={todaySearchQuery}
          onChange={(event) => {
            setTodaySearchQuery(event.currentTarget.value);
            setTodayPage(1);
          }}
          size="md"
          voiceIconSize="md"
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          variant="default"
          size="md"
          aria-expanded={todayMobileFiltersOpen}
          onClick={() => setTodayMobileFiltersOpen((open) => !open)}
          rightSection={
            todayMobileFiltersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />
          }
        >
          {todayMobileFiltersOpen ? "Ẩn bộ lọc" : "Bộ lọc"}
        </Button>
      </Group>
      <Collapse expanded={todayMobileFiltersOpen}>
        <Stack gap="sm" pt="xs">
          <Select
            label="Trạng thái"
            placeholder="Tất cả"
            clearable
            data={bookingStatusFilterOptions}
            value={todayStatusFilter}
            onChange={(value) => {
              setTodayStatusFilter((value as BookingStatus | null) ?? null);
              setTodayPage(1);
            }}
            size="md"
          />
          <Select
            label="Hiển thị lễ tân"
            placeholder="Tất cả"
            clearable
            data={todayReceptionStatusFilterOptions}
            value={todayReceptionStatusFilter}
            onChange={(value) => {
              setTodayReceptionStatusFilter(value);
              setTodayPage(1);
            }}
            size="md"
          />
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
          <Select
            label="Bàn"
            data={tableAssignFilterOptions}
            value={todayTableAssignFilter}
            onChange={(value) => {
              setTodayTableAssignFilter((value as "all" | "assigned" | "unassigned") ?? "all");
              setTodayPage(1);
            }}
            size="md"
          />
        </Stack>
      </Collapse>
    </Stack>
  );

  const bookingsTodayTable = (
    <PortalSectionCard>
      <Stack gap="sm">
        <Text fw={600}>Booking hôm nay</Text>
        <Text size="sm" c="dimmed">
          {todaySortedBookings.length}/{todayBookings.length} booking
          {todayBookings.length !== todaySortedBookings.length ? " (đã lọc)" : ""} trong ngày.
        </Text>
        <Group align="flex-end" gap="sm" wrap="wrap" justify="flex-start">
            <TextInputWithVoice
              placeholder={todaySearchPlaceholder}
              value={todaySearchQuery}
              onChange={(event) => {
                setTodaySearchQuery(event.currentTarget.value);
                setTodayPage(1);
              }}
              size="sm"
              style={{ flex: "1 1 12rem", minWidth: 0 }}
              voiceIconSize="sm"
            />
            <Select
              label="Trạng thái"
              placeholder="Tất cả"
              clearable
              data={bookingStatusFilterOptions}
              value={todayStatusFilter}
              onChange={(value) => {
                setTodayStatusFilter((value as BookingStatus | null) ?? null);
                setTodayPage(1);
              }}
              size="sm"
              w={148}
              miw={148}
            />
            <Select
              label="Hiển thị lễ tân"
              placeholder="Tất cả"
              clearable
              data={todayReceptionStatusFilterOptions}
              value={todayReceptionStatusFilter}
              onChange={(value) => {
                setTodayReceptionStatusFilter(value);
                setTodayPage(1);
              }}
              size="sm"
              w={148}
              miw={148}
            />
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
            <Select
              label="Bàn"
              data={tableAssignFilterOptions}
              value={todayTableAssignFilter}
              onChange={(value) => {
                setTodayTableAssignFilter((value as "all" | "assigned" | "unassigned") ?? "all");
                setTodayPage(1);
              }}
              size="sm"
              w={132}
              miw={132}
            />
        </Group>
      </Stack>
      <div style={{ height: 12 }} />
      <DataTable
        minHeight={260}
        scrollAreaProps={portalDataTableScrollAreaProps}
        withTableBorder
        records={pagedTodayBookings}
        totalRecords={todaySortedBookings.length}
        recordsPerPage={todayDesktopPageSize}
        recordsPerPageOptions={[...TODAY_DESKTOP_PAGE_SIZE_OPTIONS]}
        recordsPerPageLabel="Số dòng mỗi trang"
        onRecordsPerPageChange={(n) => {
          setTodayDesktopPageSize(n);
          setTodayPage(1);
        }}
        page={Math.min(
          todayPage,
          Math.max(1, Math.ceil(todaySortedBookings.length / todayDesktopPageSize))
        )}
        onPageChange={setTodayPage}
        sortStatus={todaySortStatus}
        onSortStatusChange={(next) => {
          setTodaySortStatus(next);
          setTodayPage(1);
        }}
        onRowClick={({ record }) => openBookingInList(record)}
        rowStyle={() => ({ cursor: "pointer" })}
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
            render: (booking) => {
              const area = state.areas.find((item) => item.id === booking.areaId);
              const table = state.tables.find((item) => item.id === booking.tableId);
              return formatTodayBookingAreaTable(booking, area?.name, table?.name);
            },
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
          {
            accessor: "actions",
            title: "Thao tác",
            render: (booking) =>
              canEditBookingOrder(booking) ? (
                <Button
                  size="compact-xs"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEditBookingModal(booking);
                  }}
                >
                  Sửa
                </Button>
              ) : null,
          },
        ]}
      />
    </PortalSectionCard>
  );

  const assignModalTableOptions = useMemo(() => {
    if (!assignFormBooking) {
      return [];
    }
    const requiredSeats =
      typeof assignManualGuestCount === "number" && Number.isFinite(assignManualGuestCount)
        ? assignManualGuestCount
        : isGuestCountSpecified(assignFormBooking)
          ? assignFormBooking.guestCount
          : undefined;
    return getCandidateTables(assignFormBooking, requiredSeats)
      .filter((table) => (assignAreaId ? table.areaId === assignAreaId : true))
      .map((table) => ({
        value: table.id,
        label: `${table.name} · ${table.seats} ghế`,
      }));
  }, [assignAreaId, assignFormBooking, assignManualGuestCount, state.bookings, state.tables]);

  /** When the table list is empty only because no table in scope has enough seats (vs conflicts / no tables). */
  const assignModalTableCapacityHint = useMemo(() => {
    if (!assignFormBooking) {
      return null;
    }
    const requiredSeats =
      typeof assignManualGuestCount === "number" && Number.isFinite(assignManualGuestCount)
        ? assignManualGuestCount
        : isGuestCountSpecified(assignFormBooking)
          ? assignFormBooking.guestCount
          : undefined;

    const candidateTables = getCandidateTables(assignFormBooking, requiredSeats).filter((table) =>
      assignAreaId ? table.areaId === assignAreaId : true
    );
    if (candidateTables.length > 0) {
      return null;
    }
    if (!requiredSeats || requiredSeats < 1) {
      return null;
    }

    const branchTables = state.tables.filter(
      (table) => table.branchId === assignFormBooking.branchId && table.status !== "locked"
    );
    const tablesInScope = assignAreaId
      ? branchTables.filter((table) => table.areaId === assignAreaId)
      : branchTables;
    if (tablesInScope.length === 0) {
      return null;
    }

    const maxSeatsInScope = Math.max(...tablesInScope.map((table) => table.seats));
    if (requiredSeats <= maxSeatsInScope) {
      return null;
    }

    return assignAreaId
      ? `Trong khu vực đã chọn, không có bàn nào đủ chỗ cho ${requiredSeats} khách (tối đa ${maxSeatsInScope} ghế/bàn). Chọn khu vực khác hoặc giảm số khách.`
      : `Không có bàn nào đủ chỗ cho ${requiredSeats} khách (bàn lớn nhất hiện có: ${maxSeatsInScope} ghế). Giảm số khách hoặc cấu hình bàn lớn hơn.`;
  }, [assignAreaId, assignFormBooking, assignManualGuestCount, state.bookings, state.tables]);

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
    const requiredSeats =
      typeof editGuestCount === "number" && Number.isFinite(editGuestCount)
        ? editGuestCount
        : isGuestCountSpecified(editAssignCandidate)
          ? editAssignCandidate.guestCount
          : undefined;
    const options = getCandidateTables(editAssignCandidate, requiredSeats)
      .filter((table) => (editAreaId ? table.areaId === editAreaId : true))
      .map((table) => ({
        value: table.id,
        label: `${table.name} · ${table.seats} ghế`,
      }));
    if (editTableId && !options.some((item) => item.value === editTableId)) {
      const current = state.tables.find((table) => table.id === editTableId);
      if (current) {
        options.unshift({
          value: current.id,
          label: `${current.name} · ${current.seats} ghế`,
        });
      }
    }
    return options;
  }, [
    editAreaId,
    editAssignCandidate,
    editGuestCount,
    editTableId,
    state.bookings,
    state.tables,
  ]);

  const editModalTableCapacityHint = useMemo(() => {
    if (!editAssignCandidate) {
      return null;
    }
    const requiredSeats =
      typeof editGuestCount === "number" && Number.isFinite(editGuestCount)
        ? editGuestCount
        : isGuestCountSpecified(editAssignCandidate)
          ? editAssignCandidate.guestCount
          : undefined;
    const candidateTables = getCandidateTables(editAssignCandidate, requiredSeats).filter(
      (table) => (editAreaId ? table.areaId === editAreaId : true)
    );
    if (candidateTables.length > 0) {
      return null;
    }
    if (!requiredSeats || requiredSeats < 1) {
      return null;
    }
    const branchTables = state.tables.filter(
      (table) =>
        table.branchId === editAssignCandidate.branchId && table.status !== "locked"
    );
    const tablesInScope = editAreaId
      ? branchTables.filter((table) => table.areaId === editAreaId)
      : branchTables;
    if (tablesInScope.length === 0) {
      return null;
    }
    const maxSeatsInScope = Math.max(...tablesInScope.map((table) => table.seats));
    if (requiredSeats <= maxSeatsInScope) {
      return null;
    }
    return editAreaId
      ? `Trong khu vực đã chọn, không có bàn nào đủ chỗ cho ${requiredSeats} khách (tối đa ${maxSeatsInScope} ghế/bàn).`
      : `Không có bàn nào đủ chỗ cho ${requiredSeats} khách (bàn lớn nhất: ${maxSeatsInScope} ghế).`;
  }, [editAreaId, editAssignCandidate, editGuestCount, state.bookings, state.tables]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        <PortalPageTitle order={isCompact ? 3 : 2} mb={0}>
          Đặt bàn
        </PortalPageTitle>
        <Button
          color="brand"
          size={isCompact ? "md" : "sm"}
          onClick={() => setCreateModalOpened(true)}
        >
          Tạo mới
        </Button>
      </Group>

      <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List grow>
          <Tabs.Tab value="today">Booking hôm nay</Tabs.Tab>
          <Tabs.Tab value="list">Danh sách booking</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="today" pt="md">
          {isCompact ? (
            <PortalSectionCard>
              <Stack gap="md">
                <Text fw={600}>Booking hôm nay</Text>
                <Text size="sm" c="dimmed">
                  {todaySortedBookings.length}/{todayBookings.length} booking
                  {todayBookings.length !== todaySortedBookings.length ? " (đã lọc)" : ""} trong ngày.
                </Text>
                {todayTableFiltersCompact}
                {todayCards}
              </Stack>
            </PortalSectionCard>
          ) : (
            bookingsTodayTable
          )}
        </Tabs.Panel>
        <Tabs.Panel value="list" pt="md">
          {isCompact ? (
            <PortalSectionCard>
              <Stack gap="md">
                <Text fw={600}>Danh sách booking</Text>
                {bookingsListFiltersCompact}
                {bookingsCards}
              </Stack>
            </PortalSectionCard>
          ) : (
            bookingsTable
          )}
        </Tabs.Panel>
      </Tabs>
      <Drawer
        opened={mobileDetailBookingLive != null}
        onClose={closeMobileBookingDetail}
        title={
          mobileDetailBookingLive
            ? (state.customers.find((item) => item.id === mobileDetailBookingLive.customerId)
                ?.fullName ?? "Chi tiết booking")
            : "Chi tiết booking"
        }
        position="bottom"
        size="92%"
        transitionProps={{ transition: "slide-up" }}
        styles={{
          content: { height: "92dvh", maxHeight: "92dvh" },
          body: { paddingTop: 4 },
        }}
      >
        {mobileDetailBookingLive ? (
          (() => {
            const booking = mobileDetailBookingLive;
            const customer = state.customers.find((item) => item.id === booking.customerId);
            const area = state.areas.find((item) => item.id === booking.areaId)?.name;
            const table = state.tables.find((item) => item.id === booking.tableId)?.name;
            const locationLine =
              booking.areaId && booking.tableId
                ? `${area ?? "—"} · Bàn ${table ?? "—"}`
                : "Chờ xếp bàn";
            const creator =
              state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
              "Không rõ";
            const note = stripUnknownGuestTag(booking.note);
            const receptionStatus = getReceptionBookingStatus(booking, receptionThresholds);
            const statusBadge =
              mobileDetailSource === "today" ? (
                <Badge color={receptionStatus.color} variant="light" size="lg">
                  {receptionStatus.label}
                </Badge>
              ) : (
                <Badge color={bookingStatusColor[booking.status]} variant="light" size="lg">
                  {bookingStatusLabel[booking.status]}
                </Badge>
              );

            return (
              <Stack gap="md">
                <Group justify="flex-end">{statusBadge}</Group>
                <Stack gap="sm">
                  <BookingDetailField
                    label="Giờ đặt"
                    value={
                      <Text size="sm" fw={500}>
                        {dayjs(booking.bookingAt).format("HH:mm · DD/MM/YYYY")}
                      </Text>
                    }
                  />
                  {mobileDetailSource === "list" ? (
                    <BookingDetailField
                      label="Giờ check-in"
                      value={
                        booking.checkedInAt ? (
                          <Text size="sm">{dayjs(booking.checkedInAt).format("HH:mm · DD/MM/YYYY")}</Text>
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )
                      }
                    />
                  ) : null}
                  <BookingDetailField
                    label="Số điện thoại"
                    value={<Text size="sm">{displayCustomerPhone(customer?.phone)}</Text>}
                  />
                  <BookingDetailField
                    label="Khu vực / Bàn"
                    value={
                      <Text size="sm">
                        {mobileDetailSource === "today"
                          ? formatTodayBookingAreaTable(booking, area, table)
                          : locationLine}
                      </Text>
                    }
                  />
                  <BookingDetailField
                    label="Số khách"
                    value={
                      <Text size="sm">
                        {isGuestCountSpecified(booking)
                          ? `${booking.guestCount} khách`
                          : "Chưa rõ"}
                      </Text>
                    }
                  />
                  {mobileDetailSource === "today" ? (
                    <BookingDetailField
                      label="Loại khách"
                      value={<Text size="sm">{getTodayGuestTypeLabel(booking)}</Text>}
                    />
                  ) : null}
                  <BookingDetailField
                    label={mobileDetailSource === "today" ? "Người nhận" : "Người tạo"}
                    value={<Text size="sm">{creator}</Text>}
                  />
                  <BookingDetailField
                    label="Người sửa"
                    value={<Text size="sm">{bookingLastEditorName(booking, state.users)}</Text>}
                  />
                  <BookingDetailField
                    label="Lúc sửa"
                    value={
                      booking.lastEditedAt ? (
                        <Text size="sm">{dayjs(booking.lastEditedAt).format("HH:mm · DD/MM/YYYY")}</Text>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )
                    }
                  />
                  <BookingDetailField
                    label="Ghi chú"
                    value={
                      note ? (
                        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                          {note}
                        </Text>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )
                    }
                  />
                </Stack>
                {booking.status === "cancelled" ||
                booking.status === "completed" ||
                booking.status === "no_show" ? null : (
                  <>
                    <Divider />
                    <Group grow gap="xs">
                      {canEditBookingOrder(booking) ? (
                        <Button
                          size="md"
                          variant="outline"
                          onClick={() => {
                            closeMobileBookingDetail();
                            openEditBookingModal(booking);
                          }}
                        >
                          Sửa
                        </Button>
                      ) : null}
                      {booking.status === "pending" ? (
                        <Button
                          size="md"
                          variant="outline"
                          color="blue"
                          onClick={() => {
                            closeMobileBookingDetail();
                            openAssignOptions(booking);
                          }}
                        >
                          Gán vào bàn
                        </Button>
                      ) : null}
                      <BookingCheckInButton
                        size="compact-xs"
                        disabled={booking.status !== "confirmed"}
                        onCheckIn={() => void runCheckIn(booking.id)}
                      />
                      {booking.status === "checked_in" || booking.status === "seated" ? (
                        <Button
                          size="md"
                          variant="filled"
                          color="green"
                          onClick={() => openCompleteBookingConfirm(booking)}
                        >
                          Hoàn thành
                        </Button>
                      ) : (
                        <Button
                          size="md"
                          variant="outline"
                          color="red"
                          onClick={() => openCancelBookingConfirm(booking)}
                        >
                          Hủy
                        </Button>
                      )}
                    </Group>
                  </>
                )}
              </Stack>
            );
          })()
        ) : null}
      </Drawer>
      <Modal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        title="Tạo mới"
        size="lg"
        centered
      >
        {createForm}
      </Modal>
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
            <DateTimePicker
              value={editBookingAt}
              onChange={setEditBookingAt}
              label="Thời gian đến"
              valueFormat="DD/MM/YYYY HH:mm"
              size={isCompact ? "md" : "sm"}
              popoverProps={portalModalOverlayPopoverProps}
              timePickerProps={{ popoverProps: portalModalOverlayPopoverProps }}
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
            <NumberInput
              label="Số khách"
              description="Để trống nếu chưa rõ số khách."
              value={editGuestCount}
              onChange={(value) => setEditGuestCount(parseGuestCountFromNumberInput(value))}
              min={1}
              allowDecimal={false}
              clampBehavior="strict"
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
                onChange={setEditTableId}
                searchable
                clearable
                disabled={!editAreaId}
                size={isCompact ? "md" : "sm"}
                comboboxProps={{ zIndex: portalModalOverlayPopoverProps.zIndex }}
              />
            </Group>
            {editModalTableCapacityHint ? (
              <Text size="xs" c="dimmed">
                {editModalTableCapacityHint}
              </Text>
            ) : null}
            <Text size="xs" c="dimmed">
              Để trống khu vực và bàn nếu booking vẫn chờ xếp bàn.
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={closeEditBookingModal}>
                Hủy
              </Button>
              <Button
                loading={isEditSaving}
                disabled={editTableSlotConflicts.length > 0}
                onClick={() => void submitEditBooking()}
              >
                Lưu
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
      {assignFormBooking ? (
        <Modal
          opened
          onClose={() => setAssignFormBooking(null)}
          title="Gán thủ công booking vào bàn"
          size="lg"
          centered
          zIndex={MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX}
          overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        >
          <Stack gap="sm">
            <Button
              variant="default"
              size="compact-sm"
              w="fit-content"
              onClick={() => {
                const b = assignFormBooking;
                setAssignFormBooking(null);
                if (b) {
                  window.setTimeout(() => openAssignOptions(b), 0);
                }
              }}
            >
              ← Quay lại
            </Button>
            <Text size="sm" c="dimmed">
              {state.customers.find((item) => item.id === assignFormBooking.customerId)?.fullName ?? "—"} ·{" "}
              {dayjs(assignFormBooking.bookingAt).format("HH:mm DD/MM/YYYY")}
            </Text>
            <NumberInput
              label="Số khách"
              description={
                isGuestCountSpecified(assignFormBooking)
                  ? "Có thể chỉnh lại trước khi gán bàn."
                  : undefined
              }
              min={1}
              value={assignManualGuestCount}
              onChange={(value) =>
                setAssignManualGuestCount(parseGuestCountFromNumberInput(value))
              }
              allowDecimal={false}
              clampBehavior="strict"
            />
            <Group grow>
              <Select
                label="Khu vực"
                data={assignModalAreaOptions}
                value={assignAreaId}
                onChange={(value) => {
                  setAssignAreaId(value);
                  setAssignTableId(null);
                }}
                searchable
                clearable
                comboboxProps={{ zIndex: MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX }}
              />
              <Select
                label="Bàn"
                data={assignModalTableOptions}
                value={assignTableId}
                onChange={setAssignTableId}
                searchable
                comboboxProps={{ zIndex: MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX }}
              />
            </Group>
            {assignModalTableCapacityHint ? (
              <Text size="xs" c="dimmed">
                {assignModalTableCapacityHint}
              </Text>
            ) : null}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAssignFormBooking(null)}>
                Đóng
              </Button>
              <Button
                loading={isAssignSaving}
                onClick={() => {
                  if (!assignAreaId || !assignTableId) {
                    notifications.show({ color: "red", message: "Vui lòng chọn khu vực và bàn." });
                    return;
                  }
                  if (typeof assignManualGuestCount !== "number" || assignManualGuestCount < 1) {
                    notifications.show({ color: "red", message: "Vui lòng nhập số khách hợp lệ." });
                    return;
                  }
                  void runAssign(assignFormBooking, {
                    areaId: assignAreaId,
                    tableId: assignTableId,
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
