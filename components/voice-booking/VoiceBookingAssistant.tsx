"use client";

import dayjs from "dayjs";
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useMemo, useRef, useState } from "react";
import { matchAreaId, matchTableId, type AreaLite, type TableLite } from "@/lib/voice-booking/match";
import { formatVietnamesePersonName } from "@/lib/voice-booking/format";
import { tableStatusLabel } from "@/lib/display";

type ActionResult = { ok: boolean; message: string };

type VoiceBookingDraft = {
  customerName?: string;
  customerPhone?: string;
  guestCount?: number;
  bookingAtLocal?: string;
  areaNameHint?: string;
  tableNameHint?: string;
  note?: string;
};

type VoiceBookingResponse =
  | {
      draft: VoiceBookingDraft;
      missing: Array<"customerName" | "customerPhone" | "guestCount" | "bookingAtLocal" | "tableId">;
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

export function VoiceBookingAssistant(props: {
  branch: { id: string; name: string } | null;
  areas: AreaLite[];
  tables: TableLite[];
  onCreateBooking: (input: {
    customerName: string;
    customerPhone: string;
    branchId: string;
    areaId: string;
    tableId: string;
    guestCount: number;
    bookingAt: string;
    note?: string;
  }) => Promise<ActionResult>;
}) {
  const { branch, areas, tables, onCreateBooking } = props;

  const [opened, setOpened] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [guestCount, setGuestCount] = useState<number>(4);
  const [bookingAt, setBookingAt] = useState<string | null>(
    dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm")
  );
  const [areaId, setAreaId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [clarify, setClarify] = useState<string | null>(null);

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
      label: `${t.name} · ${t.seats} ghế${
        t.status ? ` · ${tableStatusLabel[t.status as keyof typeof tableStatusLabel] ?? String(t.status)}` : ""
      }`,
    }));
  }, [tables, areaId]);

  const hasSpeech = typeof window !== "undefined" && Boolean(getSpeechRecognition(window as SpeechApi));

  const startListening = () => {
    if (!hasSpeech) {
      notifications.show({
        color: "red",
        title: "Không hỗ trợ giọng nói",
        message: "Trình duyệt không hỗ trợ Web Speech API. Dùng Chrome/Edge.",
      });
      return;
    }
    const SR = getSpeechRecognition(window as SpeechApi);
    if (!SR) return;
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
      setTranscript((finalText + " " + interim).trim());
    };

    rec.onerror = () => {
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    setTranscript("");
    setClarify(null);
    setIsListening(true);
    rec.start();
  };

  const stopListening = () => {
    const rec = recognitionRef.current;
    if (rec && isListening) {
      rec.stop();
    }
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
      const res = await fetch("/api/voice-booking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript: t,
          nowIso: new Date().toISOString(),
          branch,
          areas,
          tables,
        }),
      });
      const data = (await res.json()) as VoiceBookingResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Không phân tích được.");
      }

      const d = data.draft;
      if (d.customerName) setCustomerName(formatVietnamesePersonName(d.customerName));
      if (d.customerPhone) setCustomerPhone(d.customerPhone);
      if (typeof d.guestCount === "number" && Number.isFinite(d.guestCount)) setGuestCount(d.guestCount);
      if (d.bookingAtLocal) setBookingAt(d.bookingAtLocal);
      if (d.note) setNote(d.note);

      const matchedAreaId = matchAreaId(areas, d.areaNameHint);
      const matchedTableId = matchTableId(tables, d.tableNameHint, {
        preferAreaId: matchedAreaId,
        minSeats: typeof d.guestCount === "number" ? d.guestCount : null,
      });

      if (matchedAreaId) setAreaId(matchedAreaId);
      if (matchedTableId) setTableId(matchedTableId);

      if (data.clarificationQuestion) setClarify(data.clarificationQuestion);
      setTimeout(() => setIsParsing(false), 0);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      notifications.show({ color: "red", title: "Phân tích thất bại", message });
      setIsParsing(false);
    }
  };

  const submit = async () => {
    if (!branch) return;
    if (!bookingAt) {
      notifications.show({ color: "red", title: "Thiếu giờ", message: "Chọn ngày/giờ." });
      return;
    }
    if (!areaId || !tableId) {
      notifications.show({ color: "red", title: "Thiếu bàn", message: "Chọn khu và bàn." });
      return;
    }
    const phoneNorm = normalizeVietnamPhone(customerPhone);
    if (!customerName.trim()) {
      notifications.show({ color: "red", title: "Thiếu tên", message: "Nhập tên khách." });
      return;
    }
    if (!isPlausibleVietnamPhone(phoneNorm)) {
      notifications.show({
        color: "red",
        title: "SĐT không hợp lệ",
        message: "Nhập số VN (vd: 0912345678 hoặc +84912345678).",
      });
      return;
    }

    const result = await onCreateBooking({
      customerName: formatVietnamesePersonName(customerName),
      customerPhone: phoneNorm,
      branchId: branch.id,
      areaId,
      tableId,
      guestCount,
      bookingAt: dayjs(bookingAt).toISOString(),
      note: note.trim() ? note.trim() : undefined,
    });

    if (result.ok) {
      notifications.show({ color: "green", title: "Thành công", message: "Đã tạo booking." });
      setOpened(false);
    } else {
      notifications.show({ color: "red", title: "Tạo booking thất bại", message: result.message });
    }
  };

  return (
    <>
      <Button variant="light" onClick={() => setOpened(true)}>
        Đặt bàn bằng giọng nói
      </Button>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Đặt bàn bằng giọng nói" size="lg">
        <Stack gap="md">
          {!branch ? (
            <Text c="dimmed">Chưa có chi nhánh trong scope hiện tại.</Text>
          ) : (
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Group gap="xs">
                  <Badge variant="light">Chi nhánh</Badge>
                <Text fw={600}>{branch.name}</Text>
                </Group>
                <Text size="sm" c="dimmed">
                  Bấm <strong>Ghi âm</strong> → nói 1 câu → bấm <strong>Phân tích</strong> → kiểm tra lại → tạo booking.
                </Text>
              </Stack>
              <Group gap="xs" align="center">
                <Button
                  onClick={() => (isListening ? stopListening() : startListening())}
                  color={isListening ? "red" : "blue"}
                  variant="filled"
                  disabled={!hasSpeech}
                >
                  {isListening ? "Dừng" : "Ghi âm"}
                </Button>
                <Button
                  onClick={() => void parseTranscript()}
                  loading={isParsing}
                  disabled={!transcript.trim() || isListening}
                >
                  Phân tích
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    setTranscript("");
                    setClarify(null);
                  }}
                  disabled={isListening || isParsing || !transcript.trim()}
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
            placeholder="Ví dụ: đặt bàn 4 người lúc 19:30 tối nay, khu A, bàn 3, tên Huy, số 0912..."
          />

          {isListening ? (
            <Text size="sm" c="blue.7">
              Đang nghe…
            </Text>
          ) : null}

          {clarify ? (
            <Text size="sm" c="orange.7">
              Cần bổ sung: {clarify}
            </Text>
          ) : null}

          <Group grow align="flex-start">
            <TextInput
              label="Tên khách"
              placeholder="Nguyễn Văn A"
              value={customerName}
              onChange={(e) => setCustomerName(e.currentTarget.value)}
              onBlur={() => setCustomerName((v) => formatVietnamesePersonName(v))}
            />
            <TextInput
              label="Số điện thoại"
              placeholder="09… / +84…"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.currentTarget.value)}
            />
          </Group>

          <Group grow align="flex-start">
            <NumberInput
              label="Số khách"
              value={guestCount}
              onChange={(v) => setGuestCount(typeof v === "number" ? v : 1)}
              min={1}
            />
            <DateTimePicker
              label="Thời gian đến"
              value={bookingAt ? dayjs(bookingAt).toDate() : null}
              onChange={(d) => setBookingAt(d ? dayjs(d).format("YYYY-MM-DDTHH:mm") : null)}
              valueFormat="DD/MM/YYYY HH:mm"
              clearable={false}
            />
          </Group>

          <Group grow align="flex-start">
            <Select
              label="Khu vực"
              data={areaOptions}
              value={areaId}
              onChange={(v) => {
                setAreaId(v);
                setTableId(null);
              }}
              searchable
              clearable
            />
            <Select
              label="Bàn"
              data={tableOptions}
              value={tableId}
              onChange={setTableId}
              searchable
              clearable
            />
          </Group>

          {areaAvailability ? (
            <Text size="sm" c="dimmed">
              Tình trạng khu: {areaAvailability.total} bàn · Trống {areaAvailability.byStatus.available ?? 0} · Giữ chỗ{" "}
              {areaAvailability.byStatus.hold ?? 0} · Đang ngồi {areaAvailability.byStatus.occupied ?? 0} · Khóa{" "}
              {areaAvailability.byStatus.locked ?? 0}
            </Text>
          ) : null}

          <Textarea
            label="Ghi chú"
            placeholder="Tùy chọn: sinh nhật, dị ứng, ghế em bé…"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            autosize
            minRows={2}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Đóng
            </Button>
            <Button onClick={() => void submit()} disabled={!branch || isListening || isParsing}>
              Xác nhận & tạo booking
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

