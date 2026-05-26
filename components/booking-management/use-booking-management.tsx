"use client";

import dayjs from "dayjs";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useCallback, useMemo, useState } from "react";
import { GuestCountNumberInput } from "@/components/booking-management/guest-count-number-input";
import { BookingRowActions } from "@/components/booking-management/booking-row-actions";
import { ChangeBookingTableModal } from "@/components/floor-map/change-booking-table-modal";
import {
  canEditBookingOrder,
  MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX,
  MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX,
  portalModalOverlayPopoverProps,
} from "@/components/booking-management/shared";
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
  displayCustomerPhone,
  findAssignableSlotConflictsAtTable,
  formatTableSlotConflictMessage,
  getAssignableCandidateTables,
  isGuestCountSpecified,
  isSyntheticPhoneValue,
} from "@/lib/booking-meta";
import { bookingRowBusyStyle } from "@/lib/busy-row-style";
import { getTableEffectiveGuestCapacity } from "@/lib/table-capacity";
import { useBusyId } from "@/lib/use-busy-id";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking } from "@/lib/types";

export function useBookingManagement() {
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
  } = useAppContext();
  const isCompact = usePortalCompact();
  const {
    busyId: busyBookingId,
    isBusy: isBookingRowBusy,
    run: runBookingRowAction,
  } = useBusyId();

  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editBookingAt, setEditBookingAt] = useState<string | null>(null);
  const [editGuestCount, setEditGuestCount] = useState<number | undefined>(undefined);
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editAreaId, setEditAreaId] = useState<string | null>(null);
  const [editTableId, setEditTableId] = useState<string | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);

  const [assignFormBooking, setAssignFormBooking] = useState<Booking | null>(null);
  const [assignManualGuestCount, setAssignManualGuestCount] = useState<number | undefined>(undefined);
  const [assignAreaId, setAssignAreaId] = useState<string | null>(null);
  const [assignTableId, setAssignTableId] = useState<string | null>(null);
  const [isAssignSaving, setIsAssignSaving] = useState(false);
  const [changeTableBooking, setChangeTableBooking] = useState<Booking | null>(null);
  const [isChangeTableSaving, setIsChangeTableSaving] = useState(false);

  const branchBookings = useMemo(
    () => state.bookings.filter((booking) => filteredBranchIds.includes(booking.branchId)),
    [filteredBranchIds, state.bookings]
  );

  const getCandidateTables = useCallback(
    (booking: Booking, requiredSeats?: number) =>
      getAssignableCandidateTables(booking, state.tables, state.bookings, requiredSeats),
    [state.bookings, state.tables]
  );

  const openCancelBookingConfirm = useCallback(
    (booking: Booking) => {
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
    },
    [hasSupabase, runBookingRowAction, state.customers, updateBookingStatus]
  );

  const openCompleteBookingConfirm = useCallback(
    (booking: Booking) => {
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
    },
    [hasSupabase, runBookingRowAction, state.customers, updateBookingStatus]
  );

  const runCheckIn = useCallback(
    async (bookingId: string) => {
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
    },
    [checkInBooking, hasSupabase, runBookingRowAction]
  );

  const runAssign = useCallback(
    async (
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
    },
    [assignBookingToTable]
  );

  const openManualAssignModal = useCallback((booking: Booking, guestForAssign?: number) => {
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
  }, []);

  // Back-compat name: previously opened intermediate options modal.
  const openAssignOptions = openManualAssignModal;

  const openEditBookingModal = useCallback(
    (booking: Booking) => {
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
    },
    [state.customers]
  );

  const closeEditBookingModal = useCallback(() => {
    setEditBooking(null);
    setEditBookingAt(null);
    setEditGuestCount(undefined);
    setEditCustomerPhone("");
    setEditAreaId(null);
    setEditTableId(null);
  }, []);

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

  const submitEditBooking = useCallback(
    async (options?: { allowDuplicate?: boolean }) => {
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
          confirmDuplicateBookingSecond(
            result.duplicates,
            () => {
              void submitEditBooking({ allowDuplicate: true });
            },
            () => undefined
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
    },
    [
      closeEditBookingModal,
      editAreaId,
      editBooking,
      editBookingAt,
      editCustomerPhone,
      editGuestCount,
      editTableConflictMessage,
      editTableId,
      editTableSlotConflicts.length,
      updateBookingOrder,
    ]
  );

  const handleSubmitChangeTable = useCallback(
    async (target: { areaId: string; tableId: string }) => {
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
        }
      } finally {
        setIsChangeTableSaving(false);
      }
    },
    [changeBookingTable, changeTableBooking]
  );

  const renderBookingActions = useCallback(
    (booking: Booking) => (
      <BookingRowActions
        booking={booking}
        busy={isBookingRowBusy(booking.id)}
        onEdit={openEditBookingModal}
        onChangeTable={setChangeTableBooking}
        onAssign={openManualAssignModal}
        onCheckIn={(bookingId) => void runCheckIn(bookingId)}
        onComplete={openCompleteBookingConfirm}
        onCancel={openCancelBookingConfirm}
      />
    ),
    [
      isBookingRowBusy,
      openManualAssignModal,
      openCancelBookingConfirm,
      openCompleteBookingConfirm,
      openEditBookingModal,
      runCheckIn,
    ]
  );

  const getBookingRowStyle = useCallback(
    (bookingId: string) => bookingRowBusyStyle(isBookingRowBusy(bookingId)),
    [isBookingRowBusy]
  );

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
    getCandidateTables,
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
    const candidateTables = getCandidateTables(editAssignCandidate, requiredSeats).filter((table) =>
      editAreaId ? table.areaId === editAreaId : true
    );
    if (candidateTables.length > 0 || !requiredSeats || requiredSeats < 1) {
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
    const maxGuestsInScope = Math.max(
      ...tablesInScope.map((table) => getTableEffectiveGuestCapacity(table.seats))
    );
    if (requiredSeats <= maxGuestsInScope) {
      return null;
    }
    return editAreaId
      ? `Trong khu vực đã chọn, không có bàn nào đủ chỗ cho ${requiredSeats} khách (tối đa ${maxGuestsInScope} khách/bàn).`
      : `Không có bàn nào đủ chỗ cho ${requiredSeats} khách (bàn lớn nhất: ${maxGuestsInScope} khách).`;
  }, [editAreaId, editAssignCandidate, editGuestCount, getCandidateTables, state.tables]);

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
  }, [assignAreaId, assignFormBooking, assignManualGuestCount, getCandidateTables]);

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
    if (candidateTables.length > 0 || !requiredSeats || requiredSeats < 1) {
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
    const maxGuestsInScope = Math.max(
      ...tablesInScope.map((table) => getTableEffectiveGuestCapacity(table.seats))
    );
    if (requiredSeats <= maxGuestsInScope) {
      return null;
    }
    return assignAreaId
      ? `Trong khu vực đã chọn, không có bàn nào đủ chỗ cho ${requiredSeats} khách (tối đa ${maxGuestsInScope} khách/bàn).`
      : `Không có bàn nào đủ chỗ cho ${requiredSeats} khách (bàn lớn nhất: ${maxGuestsInScope} khách).`;
  }, [assignAreaId, assignFormBooking, assignManualGuestCount, getCandidateTables, state.tables]);

  const bookingManagementModals = (
    <>
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
          onClose={() => setAssignFormBooking(null)}
          title="Gán thủ công booking vào bàn"
          size="lg"
          centered
          zIndex={MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX}
          overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {state.customers.find((item) => item.id === assignFormBooking.customerId)?.fullName ??
                "—"}{" "}
              · {dayjs(assignFormBooking.bookingAt).format("HH:mm DD/MM/YYYY")}
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
    </>
  );

  return {
    renderBookingActions,
    bookingManagementModals,
    busyBookingId,
    isBookingRowBusy,
    getBookingRowStyle,
    openEditBookingModal,
    openAssignOptions,
    setChangeTableBooking,
    runCheckIn,
    openCompleteBookingConfirm,
    openCancelBookingConfirm,
  };
}
