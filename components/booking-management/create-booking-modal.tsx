"use client";

import dayjs from "dayjs";
import {
  Alert,
  Button,
  Modal,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MergeRecommendationCard } from "@/components/booking-management/merge-recommendation-card";
import { confirmDuplicateBookingSecond } from "@/components/booking-duplicate-confirm";
import {
  PortalSectionCard,
  PortalStickyAction,
} from "@/components/portal-page";
import {
  VoiceBookingAssistant,
  type VoiceBookingFormFields,
} from "@/components/voice-booking/VoiceBookingAssistant";
import { useAppContext } from "@/contexts/app-context";
import {
  bookingSlotKey,
  DUPLICATE_BOOKING_CODE,
  formatBookingDuplicateAlertMessage,
  isPlausibleVietnamPhone,
  normalizeVietnamPhone,
  type BookingDuplicateInfo,
} from "@/lib/booking-duplicate";
import { recommendMergeGroups, type MergeRecommendation } from "@/lib/booking-meta";
import { getTableEffectiveGuestCapacity } from "@/lib/table-capacity";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking } from "@/lib/types";
import { formatVietnamesePersonName } from "@/lib/voice-booking/format";

export type CreateBookingModalProps = {
  opened: boolean;
  onClose: () => void;
  /** When user chooses to view an existing duplicate booking from the confirm dialog. */
  onFocusExistingBooking?: (booking: Booking) => void;
};

const emptyVoiceFields = (): VoiceBookingFormFields => ({
  customerName: "",
  customerPhone: "",
  guestCount: null,
  bookingAt: dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm"),
  areaId: null,
  tableId: null,
  note: "",
  guestType: "Khách thường",
});

export function CreateBookingModal({
  opened,
  onClose,
  onFocusExistingBooking,
}: CreateBookingModalProps) {
  const {
    state,
    currentUser,
    filteredBranchIds,
    createBooking,
    setActiveBranchId,
    createTableMergeGroup,
  } = useAppContext();
  const isCompact = usePortalCompact();
  const branchId = filteredBranchIds[0] ?? null;

  const [isCreating, setIsCreating] = useState(false);
  const [createBranchId, setCreateBranchId] = useState<string | null>(branchId);
  const [voiceFields, setVoiceFields] = useState<VoiceBookingFormFields>(emptyVoiceFields);
  const [recommendationBusyKey, setRecommendationBusyKey] = useState<string | null>(null);

  const resetCreateForm = useCallback(() => {
    setVoiceFields(emptyVoiceFields());
    setCreateBranchId(branchId);
  }, [branchId]);

  const closeModal = useCallback(() => {
    if (!isCreating) {
      resetCreateForm();
      onClose();
    }
  }, [isCreating, onClose, resetCreateForm]);

  useEffect(() => {
    if (!opened) {
      return;
    }
    setCreateBranchId(branchId);
  }, [branchId, opened]);

  const { customerName, customerPhone, guestCount, bookingAt, note, guestType, areaId, tableId } =
    voiceFields;

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

  const createBranchName =
    createBranchId ? state.branches.find((b) => b.id === createBranchId)?.name ?? "—" : "—";
  const createBranchOptions = useMemo(
    () => state.branches.map((branch) => ({ value: branch.id, label: branch.name })),
    [state.branches]
  );
  const createBranchAreas = useMemo(
    () => state.areas.filter((area) => area.branchId === createBranchId),
    [createBranchId, state.areas]
  );
  const createBranchTables = useMemo(
    () => state.tables.filter((table) => table.branchId === createBranchId),
    [createBranchId, state.tables]
  );

  const submitCreateBooking = async (options?: { allowDuplicate?: boolean }) => {
    if (!customerName.trim() || !createBranchId || !bookingAt) {
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
    setIsCreating(true);
    let result;
    try {
      result = await createBooking({
        customerName: formatVietnamesePersonName(customerName),
        customerPhone: normalizedCustomerPhone || undefined,
        branchId: createBranchId,
        areaId: areaId ?? undefined,
        tableId: tableId ?? undefined,
        guestCount:
          typeof guestCount === "number" && Number.isFinite(guestCount)
            ? Math.max(1, guestCount)
            : undefined,
        bookingAt: dayjs(bookingAt).toISOString(),
        note: note.trim() || undefined,
        guestType,
        allowDuplicate: options?.allowDuplicate,
      });
    } finally {
      setIsCreating(false);
    }
    if (!result.ok && result.code === DUPLICATE_BOOKING_CODE && result.duplicates?.length) {
      notifications.show({ color: "orange", message: result.message });
      confirmDuplicateBookingSecond(
        result.duplicates,
        () => {
          void submitCreateBooking({ allowDuplicate: true });
        },
        (bookingId) => {
          const target = state.bookings.find((item) => item.id === bookingId);
          if (target) {
            onFocusExistingBooking?.(target);
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
      const switchedFrom = branchId;
      resetCreateForm();
      onClose();
      if (
        currentUser?.role === "manager" &&
        switchedFrom &&
        createBranchId !== switchedFrom
      ) {
        notifications.show({
          color: "blue",
          message: "Đã tạo booking ở chi nhánh khác. Nhấn để quay về chi nhánh đang vận hành.",
          autoClose: 6000,
          onClick: () => setActiveBranchId(switchedFrom),
        });
      }
    }
  };

  const handleCreate = async () => {
    if (duplicateInfosForAlert.length === 0) {
      await submitCreateBooking();
      return;
    }
    confirmDuplicateBookingSecond(
      duplicateInfosForAlert,
      () => {
        void submitCreateBooking({ allowDuplicate: true });
      },
      (bookingId) => {
        const target = state.bookings.find((item) => item.id === bookingId);
        if (target) {
          onFocusExistingBooking?.(target);
        }
      }
    );
  };

  const createFormMergeRecommendations = useMemo<MergeRecommendation[]>(() => {
    if (!createBranchId || typeof guestCount !== "number" || guestCount < 1) {
      return [];
    }
    const branchTables = state.tables.filter(
      (table) => table.branchId === createBranchId && table.status !== "locked"
    );
    if (branchTables.length === 0) {
      return [];
    }
    const maxSingleGuestCapacity = branchTables.reduce(
      (acc, table) => Math.max(acc, getTableEffectiveGuestCapacity(table.seats)),
      0
    );
    if (guestCount <= maxSingleGuestCapacity) {
      return [];
    }
    const nowIso = new Date().toISOString();
    const startIso = bookingAt ? dayjs(bookingAt).toISOString() : nowIso;
    const endIso = bookingAt ? dayjs(bookingAt).add(2, "hour").toISOString() : nowIso;
    const pseudoBooking: Booking = {
      id: "__create-form__",
      customerId: "",
      branchId: createBranchId,
      areaId: null,
      tableId: null,
      mergeGroupId: null,
      bookingAt: startIso,
      startTime: startIso,
      endTime: endIso,
      status: "pending",
      guestCount,
      createdByUserId: currentUser?.id ?? "",
    };
    return recommendMergeGroups(pseudoBooking, {
      areaTables: branchTables,
      mergeGroups: state.mergeGroups,
      allBookings: state.bookings,
      targetSeats: guestCount,
      areaId: null,
    });
  }, [bookingAt, createBranchId, currentUser?.id, guestCount, state.bookings, state.mergeGroups, state.tables]);

  const createFormDisabled = isCreating;

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      closeOnClickOutside={!isCreating}
      closeOnEscape={!isCreating}
      title="Tạo mới"
      size="lg"
      centered
    >
      <PortalSectionCard>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Chi nhánh đang tạo booking: <strong>{createBranchName}</strong>
          </Text>
          <Select
            label="Chi nhánh booking"
            data={createBranchOptions}
            value={createBranchId}
            onChange={(value) => setCreateBranchId(value)}
            allowDeselect={false}
            disabled={createFormDisabled}
            size={isCompact ? "md" : "sm"}
          />
          {opened ? (
          <VoiceBookingAssistant
            key={createBranchId ?? "no-branch"}
            embedded
            hideSubmitButton
            disabled={createFormDisabled}
            branch={createBranchId ? { id: createBranchId, name: createBranchName } : null}
            areas={createBranchAreas.map((a) => ({ id: a.id, name: a.name }))}
            tables={createBranchTables.map((t) => ({
              id: t.id,
              name: t.name,
              seats: t.seats,
              areaId: t.areaId,
              status: t.status,
            }))}
            onFieldsChange={setVoiceFields}
            onCreateBooking={createBooking}
          />
          ) : null}
          {duplicateWarningMessage ? (
            <Alert color="orange" variant="light" title="Cảnh báo trùng booking">
              {duplicateWarningMessage}
            </Alert>
          ) : null}
          {createFormMergeRecommendations.length > 0 && typeof guestCount === "number" ? (
            <MergeRecommendationCard
              recommendations={createFormMergeRecommendations}
              tables={state.tables.filter((table) => table.branchId === createBranchId)}
              targetSeats={guestCount}
              busyKey={recommendationBusyKey}
              maxItems={3}
              onUseExisting={async () => {
                notifications.show({
                  color: "blue",
                  message: 'Sau khi tạo booking, dùng "Gán" trên danh sách rồi chọn cụm gộp.',
                });
              }}
              onMergeAndApply={async (rec) => {
                const firstTable = state.tables.find((table) => table.id === rec.tableIds[0]);
                if (!firstTable || !firstTable.areaId) {
                  notifications.show({
                    color: "red",
                    message: "Không xác định được khu vực để gộp bàn.",
                  });
                  return;
                }
                setRecommendationBusyKey(`combo:${rec.tableIds.join(",")}`);
                try {
                  const mergeDay = dayjs(bookingAt ?? undefined).format("YYYY-MM-DD");
                  const result = await createTableMergeGroup({
                    branchId: createBranchId!,
                    areaId: firstTable.areaId,
                    tableIds: rec.tableIds,
                    startDate: mergeDay,
                    endDate: mergeDay,
                  });
                  notifications.show({
                    color: result.ok ? "green" : "red",
                    message: result.ok
                      ? `${result.message}. Tạo booking xong, hệ thống sẽ ưu tiên gán vào cụm này.`
                      : result.message,
                  });
                } finally {
                  setRecommendationBusyKey(null);
                }
              }}
            />
          ) : null}
          <Text size="sm" c="dimmed">
            Booking tạo từ đây sẽ ở trạng thái <strong>Chờ xếp bàn</strong> (trừ khi đã chọn khu/bàn).
          </Text>
          <PortalStickyAction>
            <Button
              fullWidth
              size={isCompact ? "md" : "sm"}
              loading={isCreating}
              disabled={isCreating}
              onClick={() => void handleCreate()}
            >
              Tạo booking
            </Button>
          </PortalStickyAction>
        </Stack>
      </PortalSectionCard>
    </Modal>
  );
}