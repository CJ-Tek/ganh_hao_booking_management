"use client";

import dayjs from "dayjs";
import {
  Alert,
  Button,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookingCreatedNextStepModal,
  type BookingCreatedNextStepPayload,
} from "@/components/booking-management/booking-created-next-step-modal";
import { confirmDuplicateBookingSecond } from "@/components/booking-duplicate-confirm";
import { PortalSectionCard } from "@/components/portal-page";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import {
  VoiceBookingAssistant,
  type VoiceBookingFieldPatch,
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
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking } from "@/lib/types";
import { formatVietnamesePersonName } from "@/lib/voice-booking/format";

export type CreateBookingModalProps = {
  opened: boolean;
  onClose: () => void;
  /** When user chooses to view an existing duplicate booking from the confirm dialog. */
  onFocusExistingBooking?: (booking: Booking) => void;
  /** When already on Sơ đồ — open day-list modal for the new booking instead of routing. */
  onViewCreatedBookingInFloorMap?: (payload: BookingCreatedNextStepPayload) => void;
};

const emptyVoiceFields = (): VoiceBookingFormFields => ({
  customerName: "",
  customerPhone: "",
  guestCount: null,
  bookingAt: dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm"),
  areaId: null,
  tableId: null,
  mergeGroupId: null,
  note: "",
  guestType: "Khách thường",
});

export function CreateBookingModal({
  opened,
  onClose,
  onFocusExistingBooking,
  onViewCreatedBookingInFloorMap,
}: CreateBookingModalProps) {
  const {
    state,
    currentUser,
    filteredBranchIds,
    createBooking,
    setActiveBranchId,
  } = useAppContext();
  const isCompact = usePortalCompact();
  const branchId = filteredBranchIds[0] ?? null;

  const [isCreating, setIsCreating] = useState(false);
  const [createBranchId, setCreateBranchId] = useState<string | null>(branchId);
  const [voiceFields, setVoiceFields] = useState<VoiceBookingFormFields>(emptyVoiceFields);
  const [voiceFieldPatch, setVoiceFieldPatch] = useState<VoiceBookingFieldPatch | null>(null);
  const [createdNextStep, setCreatedNextStep] = useState<BookingCreatedNextStepPayload | null>(
    null
  );
  const [createdNextStepOpened, setCreatedNextStepOpened] = useState(false);

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

  const {
    customerName,
    customerPhone,
    guestCount,
    bookingAt,
    note,
    guestType,
    areaId,
    tableId,
    mergeGroupId,
  } = voiceFields;

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
  const createBranchMergeGroups = useMemo(
    () => state.mergeGroups.filter((group) => group.branchId === createBranchId),
    [createBranchId, state.mergeGroups]
  );

  const applyCreateFormTableSelection = useCallback(
    (selection: VoiceBookingFieldPatch) => {
      setVoiceFieldPatch(selection);
    },
    []
  );

  const submitCreateBooking = async (options?: { allowDuplicate?: boolean }) => {
    if (!customerName.trim() || !createBranchId || !bookingAt) {
      notifications.show({ color: "red", message: "Cần ít nhất tên khách và thời gian đến." });
      return;
    }
    const hasTable = Boolean(tableId);
    const hasMergeGroup = Boolean(mergeGroupId);
    if (
      (areaId && !hasTable && !hasMergeGroup) ||
      (!areaId && (hasTable || hasMergeGroup)) ||
      (hasTable && hasMergeGroup)
    ) {
      notifications.show({
        color: "red",
        message:
          "Chọn khu vực kèm một bàn hoặc một cụm gộp, hoặc để trống cả hai để chờ xếp bàn.",
      });
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
        tableId: mergeGroupId ? undefined : tableId ?? undefined,
        mergeGroupId: mergeGroupId ?? undefined,
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
    if (!result.ok) {
      notifications.show({ color: "red", message: result.message });
    } else if (!result.bookingId) {
      notifications.show({ color: "green", message: result.message });
    }
    if (result.ok) {
      const switchedFrom = branchId;
      const createdForOtherBranch = Boolean(
        switchedFrom && createBranchId && createBranchId !== switchedFrom
      );
      const createdName = formatVietnamesePersonName(customerName);
      resetCreateForm();
      onClose();
      if (result.bookingId && !createdForOtherBranch) {
        setCreatedNextStep({
          bookingId: result.bookingId,
          bookingAt: dayjs(bookingAt).toISOString(),
          customerName: createdName,
          message: result.message,
          guestCountSpecified:
            typeof guestCount === "number" && Number.isFinite(guestCount) && guestCount >= 1,
        });
        setCreatedNextStepOpened(true);
      } else if (
        result.bookingId &&
        createdForOtherBranch &&
        currentUser?.role !== "manager"
      ) {
        notifications.show({ color: "green", message: result.message });
      }
      if (currentUser?.role === "manager" && createdForOtherBranch) {
        notifications.show({
          color: "blue",
          message: "Đã tạo booking ở chi nhánh khác.",
          autoClose: 6000,
          onClick: () => setActiveBranchId(switchedFrom!),
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

  const createFormDisabled = isCreating;

  return (
    <>
    <PortalStandardModal
      opened={opened}
      onClose={closeModal}
      closeOnClickOutside={!isCreating}
      closeOnEscape={!isCreating}
      title="Tạo booking"
      size="xl"
      footer={
        <Button
          fullWidth
          size={isCompact ? "md" : "sm"}
          loading={isCreating}
          disabled={isCreating}
          onClick={() => void handleCreate()}
        >
          Tạo booking
        </Button>
      }
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
              areaId: t.areaId,
              status: t.status,
            }))}
            tablePickerAreas={createBranchAreas}
            tablePickerTables={createBranchTables}
            tablePickerMergeGroups={createBranchMergeGroups}
            tablePickerBookings={state.bookings}
            mergeGroups={createBranchMergeGroups.map((group) => ({
              id: group.id,
              mergedName: group.mergedName,
              areaId: group.areaId,
            }))}
            fieldPatch={voiceFieldPatch}
            onFieldPatchConsumed={() => setVoiceFieldPatch(null)}
            onFieldsChange={setVoiceFields}
            onCreateBooking={createBooking}
          />
          ) : null}
          {duplicateWarningMessage ? (
            <Alert color="orange" variant="light" title="Cảnh báo trùng booking">
              {duplicateWarningMessage}
            </Alert>
          ) : null}
          <Text size="sm" c="dimmed">
            Booking tạo từ đây sẽ ở trạng thái <strong>Chờ xếp bàn</strong> (trừ khi đã chọn khu/bàn).
          </Text>
        </Stack>
      </PortalSectionCard>
    </PortalStandardModal>
    <BookingCreatedNextStepModal
      opened={createdNextStepOpened}
      onClose={() => {
        setCreatedNextStepOpened(false);
        setCreatedNextStep(null);
      }}
      payload={createdNextStep}
      onViewInFloorMap={onViewCreatedBookingInFloorMap}
    />
    </>
  );
}