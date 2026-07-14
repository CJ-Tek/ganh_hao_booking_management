"use client";

import {
  Alert,
  Button,
  Group,
  Radio,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type { CustomerListRow } from "@/components/customers/customer-compact-card";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { displayCustomerPhone } from "@/lib/booking-meta";
import {
  concatenateMergeNotes,
  defaultMergeFullName,
  defaultMergeNote,
  defaultMergePhone,
  pickSurvivorCustomer,
  uniqueFieldValues,
  validateMergePhoneInput,
} from "@/lib/merge-customers";
import { openPortalConfirmModal } from "@/lib/portal-confirm-modal";
import { usePortalCompact } from "@/lib/use-portal-compact";

const EMPTY_PHONE_VALUE = "__empty_phone__";

type FieldMode = "source" | "custom";

export type MergeCustomersModalProps = {
  opened: boolean;
  customers: CustomerListRow[];
  onClose: () => void;
  onConfirm: (input: {
    survivorId: string;
    sourceIds: string[];
    fullName: string;
    phone: string | null;
    note: string | null;
  }) => Promise<{ ok: boolean; message: string }>;
};

function encodePhoneOption(value: string): string {
  return value === "" ? EMPTY_PHONE_VALUE : value;
}

function decodePhoneOption(value: string): string {
  return value === EMPTY_PHONE_VALUE ? "" : value;
}

function MergeFieldBlock(props: {
  label: string;
  options: string[];
  selectedOption: string;
  onSelectOption: (value: string) => void;
  customMode: boolean;
  onToggleCustom: (custom: boolean) => void;
  customValue: string;
  onCustomValueChange: (value: string) => void;
  multiline?: boolean;
  formatOption?: (value: string) => string;
  customPlaceholder?: string;
  allowEmptyOption?: boolean;
  onConcatenateNotes?: () => void;
  stackOptions: boolean;
}) {
  const {
    label,
    options,
    selectedOption,
    onSelectOption,
    customMode,
    onToggleCustom,
    customValue,
    onCustomValueChange,
    multiline = false,
    formatOption = (value) => value || "(trống)",
    customPlaceholder,
    allowEmptyOption = false,
    onConcatenateNotes,
    stackOptions,
  } = props;

  const visibleOptions = allowEmptyOption
    ? options
    : options.filter((value) => value.length > 0);

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" gap="xs" wrap="wrap">
        <Text fw={700} size="sm">
          {label}
        </Text>
        <Group gap="xs">
          {onConcatenateNotes ? (
            <Button size="compact-xs" variant="subtle" onClick={onConcatenateNotes}>
              Ghép ghi chú
            </Button>
          ) : null}
          <Button
            size="compact-xs"
            variant={customMode ? "filled" : "light"}
            onClick={() => onToggleCustom(!customMode)}
          >
            Tùy chỉnh
          </Button>
        </Group>
      </Group>

      {customMode ? (
        multiline ? (
          <Textarea
            value={customValue}
            onChange={(event) => onCustomValueChange(event.currentTarget.value)}
            placeholder={customPlaceholder}
            minRows={3}
            autosize
          />
        ) : (
          <TextInput
            value={customValue}
            onChange={(event) => onCustomValueChange(event.currentTarget.value)}
            placeholder={customPlaceholder}
          />
        )
      ) : (
        <Radio.Group value={selectedOption} onChange={onSelectOption}>
          <Stack gap={6}>
            {visibleOptions.length === 0 ? (
              <Text size="sm" c="dimmed">
                Không có ghi chú — bật Tùy chỉnh để nhập.
              </Text>
            ) : (
              visibleOptions.map((option) => {
                const value = allowEmptyOption ? encodePhoneOption(option) : option;
                return (
                  <Radio
                    key={value}
                    value={value}
                    label={
                      <Text
                        size="sm"
                        style={{
                          wordBreak: "break-word",
                          maxWidth: stackOptions ? "100%" : "22rem",
                        }}
                      >
                        {formatOption(option)}
                      </Text>
                    }
                  />
                );
              })
            )}
          </Stack>
        </Radio.Group>
      )}
    </Stack>
  );
}

export function MergeCustomersModal(props: MergeCustomersModalProps) {
  const { opened, customers, onClose, onConfirm } = props;
  const isCompact = usePortalCompact();
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const survivor = useMemo(
    () => (customers.length > 0 ? pickSurvivorCustomer(customers) : null),
    [customers]
  );
  const totalBookings = useMemo(
    () => customers.reduce((sum, row) => sum + row.bookingCount, 0),
    [customers]
  );

  const nameOptions = useMemo(
    () => (survivor ? uniqueFieldValues(customers, "fullName") : []),
    [customers, survivor]
  );
  const phoneOptions = useMemo(
    () => (survivor ? uniqueFieldValues(customers, "phone") : []),
    [customers, survivor]
  );
  const noteOptions = useMemo(
    () => (survivor ? uniqueFieldValues(customers, "note") : []),
    [customers, survivor]
  );

  const [nameMode, setNameMode] = useState<FieldMode>("source");
  const [phoneMode, setPhoneMode] = useState<FieldMode>("source");
  const [noteMode, setNoteMode] = useState<FieldMode>("source");
  const [nameSource, setNameSource] = useState("");
  const [phoneSource, setPhoneSource] = useState(EMPTY_PHONE_VALUE);
  const [noteSource, setNoteSource] = useState("");
  const [nameCustom, setNameCustom] = useState("");
  const [phoneCustom, setPhoneCustom] = useState("");
  const [noteCustom, setNoteCustom] = useState("");

  useEffect(() => {
    if (!opened || !survivor) {
      return;
    }
    const defaultName = defaultMergeFullName(customers, survivor.id);
    const defaultPhone = defaultMergePhone(customers, survivor.id) ?? "";
    const defaultNote = defaultMergeNote(customers, survivor.id);

    setError(null);
    setIsMerging(false);
    setNameMode("source");
    setPhoneMode("source");
    setNoteMode("source");
    setNameSource(defaultName);
    setPhoneSource(encodePhoneOption(defaultPhone));
    setNoteSource(defaultNote);
    setNameCustom(defaultName);
    setPhoneCustom(defaultPhone);
    setNoteCustom(defaultNote);
  }, [opened, survivor, customers]);

  const resolvedName =
    nameMode === "custom" ? nameCustom.trim() : nameSource.trim();
  const resolvedPhoneRaw =
    phoneMode === "custom" ? phoneCustom : decodePhoneOption(phoneSource);
  const resolvedNote =
    noteMode === "custom" ? noteCustom.trim() : noteSource.trim();

  const handleClose = () => {
    if (!isMerging) {
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!survivor) {
      return;
    }
    if (!resolvedName) {
      setError("Tên khách không được để trống.");
      return;
    }
    const phoneCheck = validateMergePhoneInput(resolvedPhoneRaw);
    if (!phoneCheck.ok) {
      setError(phoneCheck.message ?? "Số điện thoại không hợp lệ.");
      return;
    }

    const ok = await openPortalConfirmModal({
      title: "Xác nhận gộp khách",
      message: `Gộp ${customers.length} hồ sơ thành 1 (giữ “${survivor.fullName}”), tổng ${totalBookings} booking sẽ thuộc hồ sơ này. Không thể hoàn tác việc xóa hồ sơ trùng.`,
      confirmLabel: "Gộp",
      confirmColor: "orange",
    });
    if (!ok) {
      return;
    }

    setIsMerging(true);
    setError(null);
    try {
      const result = await onConfirm({
        survivorId: survivor.id,
        sourceIds: customers.map((row) => row.id),
        fullName: resolvedName,
        phone: phoneCheck.phone,
        note: resolvedNote.length > 0 ? resolvedNote : null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <PortalStandardModal
      opened={opened}
      onClose={handleClose}
      closeOnClickOutside={!isMerging}
      closeOnEscape={!isMerging}
      title="Gộp khách hàng"
      size="lg"
      footer={
        <Group justify="flex-end" gap="sm" wrap="nowrap">
          <Button variant="default" disabled={isMerging} onClick={handleClose}>
            Hủy
          </Button>
          <Button
            color="orange"
            loading={isMerging}
            disabled={!survivor || customers.length < 2}
            onClick={() => void handleSubmit()}
          >
            Gộp
          </Button>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Gộp {customers.length} hồ sơ · tổng sau gộp:{" "}
          <Text span fw={700}>
            {totalBookings} booking
          </Text>
          .
        </Text>

        {survivor ? (
          <Alert color="orange" variant="light" title="Hồ sơ giữ lại (tự chọn)">
            <Text size="sm">
              <Text span fw={700}>
                {survivor.fullName}
              </Text>{" "}
              · {displayCustomerPhone(survivor.phone)} · {survivor.bookingCount} booking
              (nhiều booking nhất). Booking từ các hồ sơ khác sẽ chuyển sang hồ sơ này.
            </Text>
          </Alert>
        ) : null}

        <Stack gap="sm">
          <Text fw={700} size="sm">
            Nguồn đang gộp
          </Text>
          {customers.map((row) => (
            <Group key={row.id} justify="space-between" gap="xs" wrap="nowrap">
              <Text size="sm" style={{ minWidth: 0, wordBreak: "break-word" }}>
                {row.fullName}
                {survivor?.id === row.id ? " (giữ lại)" : ""}
              </Text>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {displayCustomerPhone(row.phone)} · {row.bookingCount} booking
              </Text>
            </Group>
          ))}
        </Stack>

        <Text size="sm" fw={600}>
          Chọn giá trị giữ lại hoặc bật Tùy chỉnh để nhập mới.
        </Text>

        <MergeFieldBlock
          label="Tên"
          options={nameOptions}
          selectedOption={nameSource}
          onSelectOption={setNameSource}
          customMode={nameMode === "custom"}
          onToggleCustom={(custom) => {
            setNameMode(custom ? "custom" : "source");
            if (custom && !nameCustom.trim()) {
              setNameCustom(nameSource);
            }
          }}
          customValue={nameCustom}
          onCustomValueChange={setNameCustom}
          customPlaceholder="Nhập tên sau khi gộp"
          stackOptions={Boolean(isCompact)}
        />

        <MergeFieldBlock
          label="Số điện thoại"
          options={phoneOptions}
          selectedOption={phoneSource}
          onSelectOption={setPhoneSource}
          customMode={phoneMode === "custom"}
          onToggleCustom={(custom) => {
            setPhoneMode(custom ? "custom" : "source");
            if (custom && !phoneCustom.trim()) {
              setPhoneCustom(decodePhoneOption(phoneSource));
            }
          }}
          customValue={phoneCustom}
          onCustomValueChange={setPhoneCustom}
          formatOption={(value) => (value ? value : "Không có SĐT")}
          customPlaceholder="Để trống nếu không có SĐT"
          allowEmptyOption
          stackOptions={Boolean(isCompact)}
        />

        <MergeFieldBlock
          label="Ghi chú"
          options={noteOptions}
          selectedOption={noteSource}
          onSelectOption={setNoteSource}
          customMode={noteMode === "custom"}
          onToggleCustom={(custom) => {
            setNoteMode(custom ? "custom" : "source");
            if (custom && !noteCustom.trim()) {
              setNoteCustom(noteSource);
            }
          }}
          customValue={noteCustom}
          onCustomValueChange={setNoteCustom}
          multiline
          formatOption={(value) => value || "(trống)"}
          customPlaceholder="Ghi chú sau khi gộp"
          onConcatenateNotes={() => {
            const joined = concatenateMergeNotes(customers);
            setNoteMode("custom");
            setNoteCustom(joined);
          }}
          stackOptions={Boolean(isCompact)}
        />

        {error ? (
          <Alert color="red" variant="light" title="Không thể gộp">
            {error}
          </Alert>
        ) : null}
      </Stack>
    </PortalStandardModal>
  );
}
