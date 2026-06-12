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
import { BookingDateTimeFields } from "@/components/booking-datetime-fields";
import { notifications } from "@mantine/notifications";
import { useCallback, useMemo, useState } from "react";
import { BookingModalContextBanner } from "@/components/booking-management/booking-modal-context-banner";
import { EditBookingModalTitle } from "@/components/booking-management/edit-booking-modal-title";
import { GuestCountNumberInput } from "@/components/booking-management/guest-count-number-input";
import { BookingRowActions } from "@/components/booking-management/booking-row-actions";
import { BookingTablePicker } from "@/components/booking-table-picker/booking-table-picker";
import { ChangeBookingTableModal } from "@/components/floor-map/change-booking-table-modal";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import {
  canEditBookingOrder,
  MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX,
  MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX,
  portalModalOverlayPopoverProps,
} from "@/components/booking-management/shared";
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
  displayCustomerPhone,
  findAssignableSlotConflictsAtTable,
  formatTableSlotConflictMessage,
  getAssignableCandidateTables,
  getAssignableMergeGroups,
  hasAssignableSlotConflictAtMergeGroup,
  isGuestCountSpecified,
  isSyntheticPhoneValue,
} from "@/lib/booking-meta";
import { bookingRowBusyStyle } from "@/lib/busy-row-style";
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
    queueBooking,
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
  const [editMergeGroupId, setEditMergeGroupId] = useState<string | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);

  const [assignFormBooking, setAssignFormBooking] = useState<Booking | null>(null);
  const [assignManualGuestCount, setAssignManualGuestCount] = useState<number | undefined>(undefined);
  const [assignAreaId, setAssignAreaId] = useState<string | null>(null);
  const [assignTableId, setAssignTableId] = useState<string | null>(null);
  const [assignMergeGroupId, setAssignMergeGroupId] = useState<string | null>(null);
  const [isAssignSaving, setIsAssignSaving] = useState(false);
  const [changeTableBooking, setChangeTableBooking] = useState<Booking | null>(null);
  const [isChangeTableSaving, setIsChangeTableSaving] = useState(false);

  const branchBookings = useMemo(
    () => state.bookings.filter((booking) => filteredBranchIds.includes(booking.branchId)),
    [filteredBranchIds, state.bookings]
  );

  const getCandidateTables = useCallback(
    (booking: Booking) =>
      getAssignableCandidateTables(booking, state.tables, state.bookings),
    [state.bookings, state.tables]
  );

  const openCancelBookingConfirm = useCallback(
    (booking: Booking) => {
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
    },
    [hasSupabase, runBookingRowAction, state.customers, updateBookingStatus]
  );

  const openCompleteBookingConfirm = useCallback(
    (booking: Booking) => {
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

  const openQueueBookingConfirm = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((c) => c.id === booking.customerId);
      const name = customer?.fullName ?? "—";
      const hadTable = Boolean(booking.tableId || booking.mergeGroupId);
      openPortalModalsConfirmModal({
        title: "Chuyển về chờ xếp bàn",
        children: (
          <Text size="sm">
            Chuyển booking của <strong>{name}</strong> về <strong>Chờ xếp bàn</strong>
            {hadTable ? " và giải phóng bàn hiện tại" : ""}? Khách có thể được gán bàn lại sau.
          </Text>
        ),
        labels: { cancel: "Quay lại", confirm: "Chuyển chờ xếp bàn" },
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
    },
    [hasSupabase, queueBooking, runBookingRowAction, state.customers]
  );

  const runAssign = useCallback(
    async (
      booking: Booking,
      target: {
        areaId: string;
        tableId?: string | null;
        mergeGroupId?: string | null;
        guestCount?: number;
      }
    ) => {
      setIsAssignSaving(true);
      try {
        const result = await assignBookingToTable({
          bookingId: booking.id,
          areaId: target.areaId,
          tableId: target.mergeGroupId ? null : target.tableId,
          mergeGroupId: target.mergeGroupId ?? null,
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
    setAssignMergeGroupId(null);
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
      setEditMergeGroupId(booking.mergeGroupId ?? null);
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
    setEditMergeGroupId(null);
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

  const editMergeGroupSlotBlocked = useMemo(() => {
    if (!editAssignCandidate?.mergeGroupId) {
      return false;
    }
    const group = state.mergeGroups.find((item) => item.id === editAssignCandidate.mergeGroupId);
    if (!group) {
      return false;
    }
    return hasAssignableSlotConflictAtMergeGroup(
      editAssignCandidate,
      group,
      branchBookings
    );
  }, [branchBookings, editAssignCandidate, state.mergeGroups]);

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
      editMergeGroupId,
      editMergeGroupSlotBlocked,
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
        onQueue={openQueueBookingConfirm}
      />
    ),
    [
      isBookingRowBusy,
      openManualAssignModal,
      openCancelBookingConfirm,
      openCompleteBookingConfirm,
      openEditBookingModal,
      openQueueBookingConfirm,
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
  }, [editAreaId, editAssignCandidate, editTableId, getCandidateTables, state.tables]);

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
    return getCandidateTables(assignFormBooking)
      .filter((table) => (assignAreaId ? table.areaId === assignAreaId : true))
      .map((table) => ({
        value: table.id,
        label: table.name,
      }));
  }, [assignAreaId, assignFormBooking, getCandidateTables]);

  const assignSelectableTableIds = useMemo(() => {
    if (!assignFormBooking) {
      return undefined;
    }
    return new Set(getCandidateTables(assignFormBooking).map((table) => table.id));
  }, [assignFormBooking, getCandidateTables]);

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

  const bookingManagementModals = (
    <>
      <Modal
        opened={editBooking != null}
        onClose={closeEditBookingModal}
        title={
          editBooking ? (
            <EditBookingModalTitle
              customerName={
                state.customers.find((item) => item.id === editBooking.customerId)?.fullName ?? "—"
              }
            />
          ) : (
            "Chỉnh booking"
          )
        }
        size="xl"
        centered
        zIndex={MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX}
      >
        {editBooking ? (
          <Stack gap="sm">
            <BookingDateTimeFields
              value={editBookingAt}
              onChange={setEditBookingAt}
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
        <PortalStandardModal
          opened
          onClose={() => setAssignFormBooking(null)}
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
              disabled={isAssignSaving}
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
              <Button variant="default" onClick={() => setAssignFormBooking(null)}>
                Đóng
              </Button>
              <Button
                loading={isAssignSaving}
                onClick={() => {
                  if (!assignAreaId || (!assignTableId && !assignMergeGroupId)) {
                    notifications.show({
                      color: "red",
                      message: "Vui lòng chọn khu vực và một bàn hoặc cụm gộp.",
                    });
                    return;
                  }
                  if (assignTableId && assignMergeGroupId) {
                    notifications.show({
                      color: "red",
                      message: "Chỉ chọn bàn lẻ hoặc cụm gộp, không chọn cả hai.",
                    });
                    return;
                  }
                  if (typeof assignManualGuestCount !== "number" || assignManualGuestCount < 1) {
                    notifications.show({ color: "red", message: "Vui lòng nhập số khách hợp lệ." });
                    return;
                  }
                  void runAssign(assignFormBooking, {
                    areaId: assignAreaId,
                    tableId: assignTableId,
                    mergeGroupId: assignMergeGroupId,
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
    openQueueBookingConfirm,
  };
}
