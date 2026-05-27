"use client";

import dayjs from "dayjs";
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { GuestCountNumberInput } from "@/components/booking-management/guest-count-number-input";
import { useAppContext } from "@/contexts/app-context";
import { formatTableGuestCapacityHint } from "@/lib/table-capacity";
import {
  promoteWaitlistEntryNowInSupabase,
  transferWaitlistEntryBranchInSupabase,
  updateWaitlistEntryInSupabase,
} from "@/lib/supabase-store";
import { type BookingWaitlistEntry } from "@/lib/types";
import { usePortalCompact } from "@/lib/use-portal-compact";

const WAITLIST_MODAL_Z_INDEX = 600;
const waitlistModalPopoverProps = { zIndex: WAITLIST_MODAL_Z_INDEX + 20 };

export type WaitlistEntryModalMode = "edit" | "transfer" | "promote";

function buildAreaOptions(
  areas: { id: string; name: string; branchId: string }[],
  branchId: string
) {
  return [...areas]
    .filter((area) => area.branchId === branchId)
    .map((area) => ({ value: area.id, label: area.name }))
    .sort((left, right) => left.label.localeCompare(right.label, "vi"));
}

function buildTableOptions(
  tables: { id: string; name: string; areaId: string; branchId: string; seats: number }[],
  branchId: string,
  areaId: string | null
) {
  if (!areaId) {
    return [];
  }
  return [...tables]
    .filter((table) => table.branchId === branchId && table.areaId === areaId)
    .map((table) => ({
      value: table.id,
      label: `${table.name} (${formatTableGuestCapacityHint(table.seats)})`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "vi"));
}

export function WaitlistEntryModals(props: {
  entry: BookingWaitlistEntry | null;
  mode: WaitlistEntryModalMode | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { entry, mode, onClose, onSaved } = props;
  const { state, hasSupabase } = useAppContext();
  const isCompact = usePortalCompact();
  const [saving, setSaving] = useState(false);

  const [partySize, setPartySize] = useState<number | undefined>(1);
  const [desiredStartAt, setDesiredStartAt] = useState<string | null>(null);
  const [desiredEndAt, setDesiredEndAt] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const turnaroundMinutes =
    state.bookingRuntimeSettings?.standardTurnaroundMinutes ?? 90;

  useEffect(() => {
    if (!entry || !mode) {
      return;
    }
    setPartySize(entry.partySize);
    setDesiredStartAt(entry.desiredStartTime);
    setDesiredEndAt(entry.desiredEndTime);
    setAreaId(entry.areaId ?? state.tables.find((t) => t.id === entry.tableId)?.areaId ?? null);
    setTableId(entry.tableId);
    setBranchId(entry.branchId);
  }, [entry, mode, state.tables]);

  const activeBranchId =
    mode === "transfer" ? branchId : entry?.branchId ?? null;

  const areaOptions = useMemo(
    () =>
      activeBranchId
        ? buildAreaOptions(state.areas, activeBranchId)
        : [],
    [activeBranchId, state.areas]
  );

  const tableOptions = useMemo(
    () =>
      activeBranchId
        ? buildTableOptions(state.tables, activeBranchId, areaId)
        : [],
    [activeBranchId, areaId, state.tables]
  );

  const branchOptions = useMemo(
    () =>
      [...state.branches]
        .map((branch) => ({ value: branch.id, label: branch.name }))
        .sort((left, right) => left.label.localeCompare(right.label, "vi")),
    [state.branches]
  );

  const selectedTable = tableId
    ? state.tables.find((table) => table.id === tableId)
    : undefined;

  const tableCapacityHint = selectedTable
    ? `Sức chứa bàn: ${formatTableGuestCapacityHint(selectedTable.seats)}.`
    : null;

  const customerName = entry
    ? (state.customers.find((item) => item.id === entry.customerId)?.fullName ?? "—")
    : "—";

  const handleStartChange = (value: string | null) => {
    setDesiredStartAt(value);
    if (value && mode === "edit") {
      setDesiredEndAt(dayjs(value).add(turnaroundMinutes, "minute").toISOString());
    }
  };

  const closeModal = () => {
    if (!saving) {
      onClose();
    }
  };

  const runSave = async (action: () => Promise<{ ok: boolean; message: string }>) => {
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    setSaving(true);
    try {
      const result = await action();
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        await onSaved();
        onClose();
      }
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không thể lưu thay đổi.",
      });
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = () => {
    if (!entry || !areaId || !tableId || !desiredStartAt || !desiredEndAt) {
      notifications.show({ color: "red", message: "Vui lòng điền đủ thông tin." });
      return;
    }
    if (partySize == null || partySize < 1) {
      notifications.show({ color: "red", message: "Vui lòng nhập số khách hợp lệ." });
      return;
    }
    if (!dayjs(desiredEndAt).isAfter(dayjs(desiredStartAt))) {
      notifications.show({
        color: "red",
        message: "Giờ kết thúc phải sau giờ bắt đầu.",
      });
      return;
    }
    void runSave(() =>
      updateWaitlistEntryInSupabase({
        waitlistEntryId: entry.id,
        partySize,
        desiredStartTime: dayjs(desiredStartAt).toISOString(),
        desiredEndTime: dayjs(desiredEndAt).toISOString(),
        areaId,
        tableId,
      })
    );
  };

  const submitTransfer = () => {
    if (!entry || !branchId || !areaId || !tableId) {
      notifications.show({ color: "red", message: "Vui lòng chọn chi nhánh, khu và bàn." });
      return;
    }
    if (partySize == null || partySize < 1) {
      notifications.show({ color: "red", message: "Vui lòng nhập số khách hợp lệ." });
      return;
    }
    void runSave(() =>
      transferWaitlistEntryBranchInSupabase({
        waitlistEntryId: entry.id,
        branchId,
        areaId,
        tableId,
        partySize,
      })
    );
  };

  const submitPromote = () => {
    if (!entry || !areaId || !tableId) {
      notifications.show({ color: "red", message: "Vui lòng chọn khu vực và bàn." });
      return;
    }
    void runSave(() =>
      promoteWaitlistEntryNowInSupabase({
        waitlistEntryId: entry.id,
        areaId,
        tableId,
      })
    );
  };

  const modalTitle =
    mode === "edit"
      ? "Chỉnh suất hàng chờ"
      : mode === "transfer"
        ? "Chuyển sang chi nhánh khác"
        : mode === "promote"
          ? "Mời khách vào bàn"
          : "";

  const modalOpened = entry != null && mode != null;

  return (
    <Modal
      opened={modalOpened}
      onClose={closeModal}
      title={modalTitle}
      size="lg"
      centered
      zIndex={WAITLIST_MODAL_Z_INDEX}
      overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
    >
      {entry && mode ? (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Khách <strong>{customerName}</strong>
            {mode !== "transfer" ? (
              <>
                {" "}
                · {state.branches.find((b) => b.id === entry.branchId)?.name ?? "—"}
              </>
            ) : null}
          </Text>

          {mode === "transfer" ? (
            <Select
              label="Chi nhánh đích"
              data={branchOptions}
              value={branchId}
              onChange={(value) => {
                setBranchId(value);
                setAreaId(null);
                setTableId(null);
              }}
              searchable
              size={isCompact ? "md" : "sm"}
              comboboxProps={waitlistModalPopoverProps}
            />
          ) : null}

          <GuestCountNumberInput
            label="Số khách"
            required
            value={partySize}
            onChange={setPartySize}
            size={isCompact ? "md" : "sm"}
          />

          {mode === "edit" ? (
            <>
              <DateTimePicker
                label="Giờ bắt đầu"
                value={desiredStartAt}
                onChange={handleStartChange}
                valueFormat="DD/MM/YYYY HH:mm"
                size={isCompact ? "md" : "sm"}
                popoverProps={waitlistModalPopoverProps}
                timePickerProps={{ popoverProps: waitlistModalPopoverProps }}
              />
              <DateTimePicker
                label="Giờ kết thúc"
                value={desiredEndAt}
                onChange={setDesiredEndAt}
                valueFormat="DD/MM/YYYY HH:mm"
                size={isCompact ? "md" : "sm"}
                popoverProps={waitlistModalPopoverProps}
                timePickerProps={{ popoverProps: waitlistModalPopoverProps }}
              />
            </>
          ) : (
            <Text size="sm">
              Khung giờ:{" "}
              <strong>
                {dayjs(entry.desiredStartTime).format("HH:mm DD/MM/YYYY")} –{" "}
                {dayjs(entry.desiredEndTime).format("HH:mm")}
              </strong>
            </Text>
          )}

          <Group grow align="flex-start">
            <Select
              label="Khu vực"
              placeholder={activeBranchId ? "Chọn khu vực" : "Chọn chi nhánh trước"}
              data={areaOptions}
              value={areaId}
              onChange={(value) => {
                setAreaId(value);
                setTableId(null);
              }}
              searchable
              disabled={!activeBranchId}
              size={isCompact ? "md" : "sm"}
              comboboxProps={waitlistModalPopoverProps}
            />
            <Select
              label="Bàn"
              placeholder={areaId ? "Chọn bàn" : "Chọn khu vực trước"}
              data={tableOptions}
              value={tableId}
              onChange={setTableId}
              searchable
              disabled={!areaId}
              size={isCompact ? "md" : "sm"}
              comboboxProps={waitlistModalPopoverProps}
            />
          </Group>

          {tableCapacityHint ? (
            <Text size="xs" c="dimmed">
              {tableCapacityHint}
            </Text>
          ) : null}

          {mode === "promote" ? (
            <Text size="xs" c="dimmed">
              Hệ thống sẽ tạo hoặc cập nhật booking xác nhận nếu khung giờ trên bàn còn trống.
            </Text>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" onClick={closeModal} disabled={saving}>
              Đóng
            </Button>
            <Button
              loading={saving}
              onClick={() => {
                if (mode === "edit") {
                  submitEdit();
                } else if (mode === "transfer") {
                  submitTransfer();
                } else {
                  submitPromote();
                }
              }}
            >
              {mode === "promote" ? "Mời vào bàn" : "Lưu"}
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}
