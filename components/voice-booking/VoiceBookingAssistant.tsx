"use client";

import dayjs from "dayjs";
import {
  Button,
  Group,
  Modal,
  Radio,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { BookingDateTimeFields } from "@/components/booking-datetime-fields";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookingTablePicker } from "@/components/booking-table-picker/booking-table-picker";
import { GuestCountNumberInput } from "@/components/booking-management/guest-count-number-input";
import { confirmDuplicateBookingSecond } from "@/components/booking-duplicate-confirm";
import {
  BOOKING_GUEST_TYPE_OPTIONS,
  WALK_IN_CUSTOMER_NAME,
  type BookingArrivalIntent,
} from "@/lib/booking-meta";
import { DUPLICATE_BOOKING_CODE } from "@/lib/booking-duplicate";
import { normalizeGuestTypeHint } from "@/lib/voice-booking/guest-type";
import { matchAreaId, matchTableId, type AreaLite, type TableLite } from "@/lib/voice-booking/match";
import { formatVietnamesePersonName } from "@/lib/voice-booking/format";
import { warmUpMicrophoneForSpeech } from "@/lib/voice-booking/mic-warmup";
import { tableStatusLabel } from "@/lib/display";
import { usePortalModalLayoutProps } from "@/lib/use-portal-modal-layout";
import type { Area, Booking, DiningTable, TableMergeGroup } from "@/lib/types";

type ActionResult = {
  ok: boolean;
  message: string;
  code?: typeof DUPLICATE_BOOKING_CODE;
  duplicates?: import("@/lib/booking-duplicate").BookingDuplicateInfo[];
};

type VoiceBookingDraft = {
  customerName?: string;
  customerPhone?: string;
  guestCount?: number;
  bookingAtLocal?: string;
  areaNameHint?: string;
  tableNameHint?: string;
  note?: string;
  guestType?: string;
};

type VoiceBookingResponse =
  | {
      draft: VoiceBookingDraft;
      missing: Array<"customerName" | "bookingAtLocal">;
      clarificationQuestion?: string;
    }
  | { error: string };

function normalizeVietnamPhone(raw: string): string {
  const s = raw.replace(/[\s.-]/g, "");
  if (s.startsWith("+84")) return `0${s.slice(3)}`;
  if (s.startsWith("84") && s.length >= 10) return `0${s.slice(2)}`;
  return s;
}

function isPlausibleVietnamPhone(normalized: string): boolean {
  return /^0[1-9]\d{8,9}$/.test(normalized);
}

type SpeechRecognitionResultLike = {
  transcript?: string;
};

type SpeechRecognitionAlternativeLike = [SpeechRecognitionResultLike, ...SpeechRecognitionResultLike[]];

type SpeechRecognitionResultEntryLike = {
  isFinal: boolean;
  0?: SpeechRecognitionResultLike;
} & SpeechRecognitionAlternativeLike;

type SpeechRecognitionResultListLike = ArrayLike<SpeechRecognitionResultEntryLike>;

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

type SpeechApi = typeof window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

function getSpeechRecognition(ww: SpeechApi) {
  return ww.SpeechRecognition ?? ww.webkitSpeechRecognition ?? null;
}

export type VoiceBookingFormFields = {
  customerName: string;
  customerPhone: string;
  guestCount: number | null;
  bookingAt: string | null;
  areaId: string | null;
  tableId: string | null;
  mergeGroupId: string | null;
  note: string;
  guestType: string | null;
};

export type VoiceBookingFieldPatch = Partial<
  Pick<VoiceBookingFormFields, "areaId" | "tableId" | "mergeGroupId">
>;

export type VoiceBookingMergeGroupLite = {
  id: string;
  mergedName: string;
  areaId: string;
};

export function VoiceBookingAssistant(props: {
  /** Inline form (no trigger button / nested modal). */
  embedded?: boolean;
  /** Hide built-in submit row — parent provides create action (e.g. CreateBookingModal). */
  hideSubmitButton?: boolean;
  /** Sync field values to parent for duplicate checks, merge hints, etc. */
  onFieldsChange?: (fields: VoiceBookingFormFields) => void;
  /** Parent-driven area/table/merge selection (e.g. merge recommendations). */
  fieldPatch?: VoiceBookingFieldPatch | null;
  onFieldPatchConsumed?: () => void;
  /** Merge groups for the current branch (optional Cụm gộp picker). */
  mergeGroups?: VoiceBookingMergeGroupLite[];
  /** Disable inputs (e.g. while parent is creating booking). */
  disabled?: boolean;
  /** Giữ chỗ vs Ngồi ngay (floor-map table registration). */
  arrivalMode?: BookingArrivalIntent;
  onArrivalModeChange?: (mode: BookingArrivalIntent) => void;
  /** Render arrival mode radios inside the form. */
  showArrivalModeRadios?: boolean;
  /** Disable Ngồi ngay (e.g. table already occupied). */
  immediateModeDisabled?: boolean;
  /** Pre-select table/area and hide pickers (per-table floor map). */
  lockTableId?: string | null;
  lockAreaId?: string | null;
  hideAreaTablePickers?: boolean;
  /** Sync default arrival datetime when parent opens modal (YYYY-MM-DDTHH:mm). */
  initialBookingAt?: string | null;
  branch: { id: string; name: string } | null;
  areas: AreaLite[];
  tables: TableLite[];
  /** Full floor data for Konva table picker (create booking). */
  tablePickerAreas?: Area[];
  tablePickerTables?: DiningTable[];
  tablePickerMergeGroups?: TableMergeGroup[];
  tablePickerBookings?: readonly Booking[];
  onCreateBooking: (input: {
    customerName: string;
    customerPhone?: string;
    branchId: string;
    areaId?: string | null;
    tableId?: string | null;
    mergeGroupId?: string | null;
    guestCount?: number;
    bookingAt: string;
    note?: string;
    guestType?: string | null;
    allowDuplicate?: boolean;
  }) => Promise<ActionResult>;
}) {
  const {
    branch,
    areas,
    tables,
    onCreateBooking,
    embedded = false,
    hideSubmitButton = false,
    onFieldsChange,
    fieldPatch = null,
    onFieldPatchConsumed,
    mergeGroups = [],
    disabled: disabledProp = false,
    arrivalMode = "immediate",
    onArrivalModeChange,
    showArrivalModeRadios = false,
    immediateModeDisabled = false,
    lockTableId = null,
    lockAreaId = null,
    hideAreaTablePickers = false,
    initialBookingAt,
    tablePickerAreas,
    tablePickerTables,
    tablePickerMergeGroups = [],
    tablePickerBookings = [],
  } = props;

  const modalLayout = usePortalModalLayoutProps();

  const useTablePicker =
    !hideAreaTablePickers &&
    Boolean(
      branch?.id &&
        tablePickerAreas &&
        tablePickerTables
    );

  const [opened, setOpened] = useState(false);
  const [isListening, setIsListening] = useState(false);
  /** Brief mic priming before SpeechRecognition — avoids Chromium dropping the first phrase. */
  const [isWarmingMic, setIsWarmingMic] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  /** Transcript (trimmed) at the moment this recording session starts — new speech appends after it. */
  const recordingAppendBaseRef = useRef("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [guestCount, setGuestCount] = useState<number | null>(null);
  const [bookingAt, setBookingAt] = useState<string | null>(
    dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm")
  );
  const [areaId, setAreaId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [mergeGroupId, setMergeGroupId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [guestType, setGuestType] = useState<string | null>("Khách thường");
  const [clarify, setClarify] = useState<string | null>(null);

  useEffect(() => {
    if (lockAreaId) {
      setAreaId(lockAreaId);
    }
    if (lockTableId) {
      setTableId(lockTableId);
    }
  }, [lockAreaId, lockTableId]);

  useEffect(() => {
    if (initialBookingAt) {
      setBookingAt(initialBookingAt);
    }
  }, [initialBookingAt]);

  useEffect(() => {
    if (!fieldPatch) {
      return;
    }
    if (fieldPatch.areaId !== undefined) {
      setAreaId(fieldPatch.areaId);
    }
    if (fieldPatch.tableId !== undefined) {
      setTableId(fieldPatch.tableId);
    }
    if (fieldPatch.mergeGroupId !== undefined) {
      setMergeGroupId(fieldPatch.mergeGroupId);
    }
    onFieldPatchConsumed?.();
  }, [fieldPatch, onFieldPatchConsumed]);

  useEffect(() => {
    onFieldsChange?.({
      customerName,
      customerPhone,
      guestCount,
      bookingAt,
      areaId,
      tableId,
      mergeGroupId,
      note,
      guestType,
    });
  }, [
    areaId,
    bookingAt,
    customerName,
    customerPhone,
    guestCount,
    guestType,
    mergeGroupId,
    note,
    onFieldsChange,
    tableId,
  ]);

  const defaultBookingAt = useCallback(
    () => dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm"),
    []
  );

  const resetForm = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore if already stopped
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setIsWarmingMic(false);
    setTranscript("");
    setCustomerName("");
    setCustomerPhone("");
    setGuestCount(null);
    setBookingAt(defaultBookingAt());
    setAreaId(null);
    setTableId(null);
    setMergeGroupId(null);
    setNote("");
    setGuestType("Khách thường");
    setClarify(null);
    recordingAppendBaseRef.current = "";
  }, [defaultBookingAt]);

  const closeModal = useCallback(() => {
    resetForm();
    setOpened(false);
  }, [resetForm]);

  const guestTypeOptions = useMemo(
    () => BOOKING_GUEST_TYPE_OPTIONS.map((label) => ({ value: label, label })),
    []
  );

  const areaOptions = useMemo(
    () => areas.map((a) => ({ value: a.id, label: a.name })),
    [areas]
  );

  const areaAvailability = useMemo(() => {
    if (!areaId) return null;
    const items = tables.filter((t) => t.areaId === areaId);
    const counts = items.reduce(
      (acc, t) => {
        const s = String(t.status ?? "available");
        acc.total += 1;
        acc.byStatus[s] = (acc.byStatus[s] ?? 0) + 1;
        return acc;
      },
      { total: 0, byStatus: {} as Record<string, number> }
    );
    return counts;
  }, [areaId, tables]);

  const tableOptions = useMemo(() => {
    const filtered = areaId ? tables.filter((t) => t.areaId === areaId) : tables;
    return filtered.map((t) => ({
      value: t.id,
      label: `${t.name}${
        t.status ? ` · ${tableStatusLabel[t.status as keyof typeof tableStatusLabel] ?? String(t.status)}` : ""
      }`,
    }));
  }, [tables, areaId]);

  const mergeGroupOptions = useMemo(() => {
    const filtered = areaId
      ? mergeGroups.filter((group) => group.areaId === areaId)
      : mergeGroups;
    const options = filtered.map((group) => ({
      value: group.id,
      label: group.mergedName,
    }));
    if (
      mergeGroupId &&
      !options.some((item) => item.value === mergeGroupId)
    ) {
      const current = mergeGroups.find((group) => group.id === mergeGroupId);
      if (current) {
        options.unshift({
          value: current.id,
          label: current.mergedName,
        });
      }
    }
    return options;
  }, [areaId, mergeGroupId, mergeGroups]);

  const hasSpeech = typeof window !== "undefined" && Boolean(getSpeechRecognition(window as SpeechApi));
  const formDisabled = disabledProp || isSubmitting;

  const startListening = async () => {
    if (!hasSpeech) {
      notifications.show({
        color: "red",
        title: "Không hỗ trợ giọng nói",
        message: "Trình duyệt không hỗ trợ Web Speech API. Dùng Chrome/Edge.",
      });
      return;
    }
    if (isWarmingMic || isListening) return;

    const SR = getSpeechRecognition(window as SpeechApi);
    if (!SR) return;

    setIsWarmingMic(true);
    try {
      await warmUpMicrophoneForSpeech();
    } catch (e) {
      setIsWarmingMic(false);
      const name = e instanceof Error ? e.name : "";
      notifications.show({
        color: "red",
        title: "Không bật được micro",
        message:
          name === "NotAllowedError"
            ? "Cho phép micro trong trình duyệt rồi thử lại."
            : "Kiểm tra micro và thử lại.",
      });
      return;
    }
    setIsWarmingMic(false);

    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = true;

    let finalText = "";
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalText += txt;
        else interim += txt;
      }
      const newSession = (finalText + " " + interim).trim();
      const base = recordingAppendBaseRef.current;
      setTranscript([base, newSession].filter(Boolean).join(" "));
    };

    rec.onerror = () => {
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recordingAppendBaseRef.current = transcriptRef.current.trim();
    setClarify(null);
    setIsListening(true);
    try {
      rec.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      notifications.show({
        color: "red",
        title: "Lỗi",
        message: "Không khởi động được nhận diện giọng nói.",
      });
    }
  };

  const stopListening = () => {
    const rec = recognitionRef.current;
    if (rec && isListening) {
      rec.stop();
    }
  };

  const applyParsedDraft = (data: Extract<VoiceBookingResponse, { draft: unknown }>) => {
    const d = data.draft;
    if (d.customerName) setCustomerName(formatVietnamesePersonName(d.customerName));
    if (d.customerPhone) setCustomerPhone(d.customerPhone);
    if (typeof d.guestCount === "number" && Number.isFinite(d.guestCount)) setGuestCount(d.guestCount);
    if (d.bookingAtLocal) setBookingAt(d.bookingAtLocal);
    if (d.note) setNote(d.note);

    const parsedGuestType = normalizeGuestTypeHint(d.guestType);
    if (parsedGuestType) setGuestType(parsedGuestType);

    const matchedAreaId = matchAreaId(areas, d.areaNameHint);
    const matchedTableId = matchTableId(tables, d.tableNameHint, {
      preferAreaId: matchedAreaId,
    });

    if (matchedAreaId) setAreaId(matchedAreaId);
    if (matchedTableId) setTableId(matchedTableId);
  };

  const parseTranscript = async () => {
    if (!branch) {
      notifications.show({ color: "red", title: "Thiếu chi nhánh", message: "Cần chọn chi nhánh trước." });
      return;
    }
    const t = transcript.trim();
    if (!t) return;
    setIsParsing(true);
    setClarify(null);
    try {
      const payload = {
        transcript: t,
        nowIso: new Date().toISOString(),
        branch,
        areas,
        tables,
      };

      let lastMessage = "Không phân tích được.";
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch("/api/voice-booking", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as VoiceBookingResponse;
        if (res.ok && !("error" in data)) {
          applyParsedDraft(data);
          if (data.missing.length > 0 && data.clarificationQuestion) {
            setClarify(data.clarificationQuestion);
          } else {
            setClarify(null);
          }
          return;
        }

        lastMessage = "error" in data ? data.error : "Không phân tích được.";
        const retryable =
          attempt === 0 && /no object generated/i.test(lastMessage);
        if (!retryable) break;
      }

      throw new Error(lastMessage);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      notifications.show({ color: "red", title: "Phân tích thất bại", message });
    } finally {
      setIsParsing(false);
    }
  };

  const submit = async () => {
    if (!branch) return;
    if (showArrivalModeRadios && arrivalMode === "hold" && !bookingAt) {
      notifications.show({ color: "red", title: "Thiếu giờ", message: "Chọn ngày/giờ đến." });
      return;
    }
    if (!showArrivalModeRadios && !bookingAt) {
      notifications.show({ color: "red", title: "Thiếu giờ", message: "Chọn ngày/giờ." });
      return;
    }
    const resolvedCustomerName = customerName.trim()
      ? formatVietnamesePersonName(customerName)
      : showArrivalModeRadios && arrivalMode === "immediate"
        ? WALK_IN_CUSTOMER_NAME
        : "";
    if (!resolvedCustomerName) {
      notifications.show({ color: "red", title: "Thiếu tên", message: "Nhập tên khách." });
      return;
    }
    const phoneRaw = customerPhone.trim();
    const phoneNorm = phoneRaw ? normalizeVietnamPhone(phoneRaw) : "";
    if (phoneNorm && !isPlausibleVietnamPhone(phoneNorm)) {
      notifications.show({
        color: "red",
        title: "SĐT không hợp lệ",
        message: "Nhập số VN (vd: 0912345678 hoặc +84912345678).",
      });
      return;
    }

    const runCreate = async (allowDuplicate?: boolean) => {
      const result = await onCreateBooking({
        customerName: resolvedCustomerName,
        customerPhone: phoneNorm || undefined,
        branchId: branch.id,
        areaId: areaId ?? undefined,
        tableId: mergeGroupId ? undefined : tableId ?? undefined,
        mergeGroupId: mergeGroupId ?? undefined,
        guestCount: typeof guestCount === "number" && Number.isFinite(guestCount) ? guestCount : undefined,
        bookingAt:
          showArrivalModeRadios && arrivalMode === "immediate"
            ? dayjs().toISOString()
            : dayjs(bookingAt!).toISOString(),
        note: note.trim() ? note.trim() : undefined,
        guestType,
        allowDuplicate,
      });

      if (!result.ok && result.code === DUPLICATE_BOOKING_CODE && result.duplicates?.length) {
        notifications.show({ color: "orange", title: "Booking trùng", message: result.message });
        confirmDuplicateBookingSecond(result.duplicates, () => {
          void runCreate(true);
        });
        return;
      }

      if (result.ok) {
        notifications.show({ color: "green", title: "Thành công", message: "Đã tạo booking." });
        closeModal();
      } else {
        notifications.show({ color: "red", title: "Tạo booking thất bại", message: result.message });
      }
    };

    setIsSubmitting(true);
    try {
      await runCreate();
    } finally {
      setIsSubmitting(false);
    }
  };

  const formBody = (
        <Stack gap="md">
          {!branch ? (
            <Text c="dimmed">Chưa có chi nhánh trong scope hiện tại.</Text>
          ) : (
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Bấm <strong>Ghi âm</strong> (có thể nhiều lần) hoặc gõ nội dung → <strong>Phân tích</strong> điền các
                  trường có trong câu (không cần đủ thông tin) → kiểm tra lại → tạo booking.
                </Text>
              </Stack>
              <Group gap="xs" align="center">
                <Button
                  onClick={() => (isListening ? stopListening() : void startListening())}
                  color={isListening ? "red" : "blue"}
                  variant="filled"
                  disabled={!hasSpeech}
                  loading={isWarmingMic}
                >
                  {isListening ? "Dừng" : "Ghi âm"}
                </Button>
                <Button
                  onClick={() => void parseTranscript()}
                  loading={isParsing}
                  disabled={formDisabled || !transcript.trim() || isListening || isWarmingMic}
                >
                  Phân tích
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    setTranscript("");
                    setClarify(null);
                  }}
                  disabled={formDisabled || isListening || isParsing || !transcript.trim()}
                >
                  Xóa
                </Button>
              </Group>
            </Group>
          )}

          <Textarea
            label="Nội dung"
            value={transcript}
            onChange={(e) => setTranscript(e.currentTarget.value)}
            autosize
            minRows={3}
            disabled={formDisabled}
            placeholder="Ví dụ: đặt bàn VIP 4 người lúc 19:30 tối nay, khu A, bàn 3, tên Huy, số 0912..."
          />

          {isListening ? (
            <Text size="sm" c="blue.7">
              Đang nghe…
            </Text>
          ) : null}

          {clarify ? (
            <Text size="sm" c="dimmed">
              Gợi ý: {clarify}
            </Text>
          ) : null}

          {showArrivalModeRadios ? (
            <Radio.Group
              label="Đặt bàn"
              value={arrivalMode}
              onChange={(value) =>
                onArrivalModeChange?.(value === "hold" ? "hold" : "immediate")
              }
            >
              <Group gap="md" mt={4} wrap="wrap">
                <Radio value="hold" label="Giữ chỗ" disabled={formDisabled} />
                <Radio
                  value="immediate"
                  label="Ngồi ngay"
                  disabled={formDisabled || immediateModeDisabled}
                />
              </Group>
            </Radio.Group>
          ) : null}

          <Group grow align="flex-start">
            <TextInput
              label={
                showArrivalModeRadios && arrivalMode === "immediate"
                  ? "Tên khách (tuỳ chọn)"
                  : "Tên khách"
              }
              placeholder={
                showArrivalModeRadios && arrivalMode === "immediate"
                  ? `Để trống → ${WALK_IN_CUSTOMER_NAME}`
                  : "Nguyễn Văn A"
              }
              value={customerName}
              onChange={(e) => setCustomerName(e.currentTarget.value)}
              onBlur={() => setCustomerName((v) => formatVietnamesePersonName(v))}
              disabled={formDisabled}
            />
            <TextInput
              label="Số điện thoại"
              placeholder="09… / +84…"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.currentTarget.value)}
              disabled={formDisabled}
            />
          </Group>

          <Group grow align="flex-start">
            <Select
              label="Loại khách"
              placeholder="Chọn loại khách"
              data={guestTypeOptions}
              value={guestType}
              onChange={setGuestType}
              allowDeselect={false}
              disabled={formDisabled}
            />
            <GuestCountNumberInput
              label="Số khách"
              value={guestCount ?? undefined}
              onChange={(value) => setGuestCount(value ?? null)}
              placeholder="Tùy chọn"
              disabled={formDisabled}
              min={1}
            />
          </Group>

          {!(showArrivalModeRadios && arrivalMode === "immediate") ? (
            <BookingDateTimeFields
              value={bookingAt}
              onChange={setBookingAt}
              disabled={formDisabled}
            />
          ) : null}

          {hideAreaTablePickers ? null : useTablePicker && branch ? (
            <BookingTablePicker
              mode="create"
              branchId={branch.id}
              areas={tablePickerAreas!}
              tables={tablePickerTables!}
              mergeGroups={tablePickerMergeGroups}
              bookings={tablePickerBookings}
              layoutDate={
                bookingAt
                  ? dayjs(bookingAt).format("YYYY-MM-DD")
                  : dayjs().format("YYYY-MM-DD")
              }
              areaId={lockAreaId ?? areaId}
              tableId={lockTableId ?? tableId}
              mergeGroupId={mergeGroupId}
              disabled={formDisabled || Boolean(lockAreaId && lockTableId)}
              onChange={(patch) => {
                if (patch.areaId !== undefined && !lockAreaId) {
                  setAreaId(patch.areaId);
                }
                if (patch.tableId !== undefined && !lockTableId) {
                  setTableId(patch.tableId);
                }
                if (patch.mergeGroupId !== undefined) {
                  setMergeGroupId(patch.mergeGroupId);
                }
              }}
            />
          ) : !hideAreaTablePickers ? (
            <Stack gap="sm">
              <Group grow align="flex-start">
                <Select
                  label="Khu vực"
                  data={areaOptions}
                  value={areaId}
                  onChange={(v) => {
                    setAreaId(v);
                    setTableId(null);
                    setMergeGroupId(null);
                  }}
                  clearable
                  disabled={formDisabled || Boolean(lockAreaId)}
                />
                <Select
                  label="Bàn"
                  data={tableOptions}
                  value={tableId}
                  onChange={(value) => {
                    setTableId(value);
                    if (value) {
                      setMergeGroupId(null);
                    }
                  }}
                  clearable
                  disabled={formDisabled || Boolean(lockTableId) || Boolean(mergeGroupId)}
                />
              </Group>
              {areaId && mergeGroupOptions.length > 0 ? (
                <Select
                  label="Cụm gộp (Bàn gộp)"
                  placeholder="Chọn cụm gộp thay cho bàn lẻ"
                  data={mergeGroupOptions}
                  value={mergeGroupId}
                  onChange={(value) => {
                    setMergeGroupId(value);
                    if (value) {
                      setTableId(null);
                    }
                  }}
                  clearable
                  disabled={formDisabled}
                />
              ) : null}
              {areaAvailability ? (
                <Text size="sm" c="dimmed">
                  Tình trạng khu: {areaAvailability.total} bàn · Trống{" "}
                  {areaAvailability.byStatus.available ?? 0} · Giữ chỗ{" "}
                  {areaAvailability.byStatus.hold ?? 0} · Đang ngồi{" "}
                  {areaAvailability.byStatus.occupied ?? 0} · Khóa{" "}
                  {areaAvailability.byStatus.locked ?? 0}
                </Text>
              ) : null}
            </Stack>
          ) : null}

          <Textarea
            label="Ghi chú"
            placeholder="Tùy chọn: sinh nhật, dị ứng, ghế em bé…"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            autosize
            minRows={2}
            disabled={formDisabled}
          />

          {!hideSubmitButton ? (
            <Group justify="flex-end">
              {!embedded ? (
                <Button variant="default" disabled={isSubmitting} onClick={closeModal}>
                  Đóng
                </Button>
              ) : null}
              <Button
                onClick={() => void submit()}
                loading={isSubmitting}
                disabled={!branch || isListening || isParsing || isSubmitting}
              >
                Xác nhận & tạo booking
              </Button>
            </Group>
          ) : null}
        </Stack>
  );

  if (embedded) {
    return formBody;
  }

  return (
    <>
      <Button variant="light" onClick={() => setOpened(true)}>
        Đặt bàn bằng giọng nói
      </Button>

      <Modal
        {...modalLayout}
        opened={opened}
        onClose={closeModal}
        title="Đặt bàn bằng giọng nói"
        size="lg"
      >
        {formBody}
      </Modal>
    </>
  );
}

