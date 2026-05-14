"use client";

import dayjs from "dayjs";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
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
import { DateTimePicker } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { Mic, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyAction,
} from "@/components/portal-page";
import { VoiceBookingAssistant } from "@/components/voice-booking/VoiceBookingAssistant";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import {
  displayCustomerPhone,
  isGuestCountSpecified,
  stripUnknownGuestTag,
} from "@/lib/booking-meta";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking, type BookingStatus } from "@/lib/types";
import { formatVietnamesePersonName } from "@/lib/voice-booking/format";
import { warmUpMicrophoneForSpeech } from "@/lib/voice-booking/mic-warmup";

function branchScopeKey(branchIds: string[]) {
  return [...branchIds].sort().join("|") || "none";
}

/** Chuẩn hóa số điện thoại VN (+84 → 0…). */
function normalizeVietnamPhone(raw: string): string {
  const s = raw.replace(/[\s.-]/g, "");
  if (s.startsWith("+84")) {
    return `0${s.slice(3)}`;
  }
  if (s.startsWith("84") && s.length >= 10) {
    return `0${s.slice(2)}`;
  }
  return s;
}

function isPlausibleVietnamPhone(normalized: string): boolean {
  return /^0[1-9]\d{8,9}$/.test(normalized);
}

/** Speech engines often append a sentence-ending period; strip it from search. */
function trimVoiceSearchTranscript(text: string): string {
  return text.replace(/\.+$/u, "").trimEnd();
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

/** Mantine NumberInput may emit string while editing; keep a single parse path for guest counts. */
function parseGuestCountFromNumberInput(value: number | string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function AssignGuestCountPromptBody(props: {
  onManual: (guestCount: number) => void;
  onAuto: (guestCount: number) => void;
}) {
  const { onManual, onAuto } = props;
  const [guestCount, setGuestCount] = useState<number | undefined>(undefined);
  return (
    <Stack>
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
    updateBookingStatus,
    checkInBooking,
    hasSupabase,
  } = useAppContext();

  const isCompact = usePortalCompact();

  const branchId = filteredBranchIds[0] ?? null;
  const branchName =
    branchId ? state.branches.find((b) => b.id === branchId)?.name ?? "—" : "—";

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [guestCount, setGuestCount] = useState<number | undefined>(undefined);
  const [bookingAt, setBookingAt] = useState<string | null>(
    dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm")
  );
  const [note, setNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [listStatusFilter, setListStatusFilter] = useState<BookingStatus | null>(null);
  const [listTableAssignFilter, setListTableAssignFilter] = useState<
    "all" | "assigned" | "unassigned"
  >("all");
  const [isListeningSearch, setIsListeningSearch] = useState(false);
  /** Mic priming before SpeechRecognition — avoids Chromium missing the first phrase. */
  const [isWarmingVoiceSearch, setIsWarmingVoiceSearch] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
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

  const listPageSize = isCompact ? mobileBookingsPageSize : desktopBookingsPageSize;

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

  const bookingStatusFilterOptions = useMemo(
    () =>
      (["pending", "confirmed", "checked_in", "completed", "cancelled"] as const).map((s) => ({
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

  const startVoiceSearch = async () => {
    const ww = window as SpeechApi;
    const SR = getSpeechRecognition(ww);
    if (!SR) {
      notifications.show({
        color: "red",
        message: "Trình duyệt không hỗ trợ tìm kiếm bằng giọng nói.",
      });
      return;
    }
    if (isWarmingVoiceSearch || isListeningSearch) return;

    setIsWarmingVoiceSearch(true);
    try {
      await warmUpMicrophoneForSpeech();
    } catch (e) {
      setIsWarmingVoiceSearch(false);
      const name = e instanceof Error ? e.name : "";
      notifications.show({
        color: "red",
        message:
          name === "NotAllowedError"
            ? "Cho phép micro trong trình duyệt rồi thử tìm bằng giọng nói lại."
            : "Không bật được micro. Kiểm tra thiết bị rồi thử lại.",
      });
      return;
    }
    setIsWarmingVoiceSearch(false);

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
        if (event.results[i].isFinal) {
          finalText += txt;
        } else {
          interim += txt;
        }
      }
      setSearchQuery(trimVoiceSearchTranscript((finalText + " " + interim).trim()));
    };
    rec.onerror = () => setIsListeningSearch(false);
    rec.onend = () => setIsListeningSearch(false);
    setIsListeningSearch(true);
    try {
      rec.start();
    } catch {
      setIsListeningSearch(false);
      recognitionRef.current = null;
      notifications.show({
        color: "red",
        message: "Không khởi động được nhận diện giọng nói.",
      });
    }
  };

  const stopVoiceSearch = () => {
    if (!isListeningSearch) {
      return;
    }
    recognitionRef.current?.stop();
  };

  const hasConflictAtTable = (booking: Booking, tableId: string) =>
    state.bookings.some(
      (item) =>
        item.id !== booking.id &&
        item.tableId === tableId &&
        dayjs(item.bookingAt).toISOString() === dayjs(booking.bookingAt).toISOString() &&
        (item.status === "confirmed" || item.status === "checked_in")
    );

  /** Use booking.branchId — not filteredBranchIds[0] — so areas/tables match the booking's chi nhánh. */
  const getCandidateTables = (booking: Booking, requiredSeats?: number) =>
    state.tables
      .filter((table) => table.branchId === booking.branchId && table.status !== "locked")
      .filter((table) => {
        if (requiredSeats && table.seats < requiredSeats) {
          return false;
        }
        return !hasConflictAtTable(booking, table.id);
      });

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
    setAssignManualGuestCount(
      typeof guestForAssign === "number" && Number.isFinite(guestForAssign)
        ? guestForAssign
        : undefined
    );
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

  const openAssignOptions = (booking: Booking) => {
    const guestSpecified = isGuestCountSpecified(booking);
    const modalId = modals.open({
      title: "Gán khách vào bàn",
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
            <>
              <Text size="sm" c="dimmed">
                Đã có số khách: <strong>{booking.guestCount}</strong>.
              </Text>
              <Group grow>
                <Button
                  variant="default"
                  onClick={() => {
                    modals.close(modalId);
                    openManualAssignModal(booking, booking.guestCount);
                  }}
                >
                  Chọn thủ công
                </Button>
                <Button
                  onClick={() => {
                    modals.close(modalId);
                    void runAutoAssign(booking, booking.guestCount);
                  }}
                >
                  Tự động gán theo số khách
                </Button>
              </Group>
            </>
          ) : (
            <>
              <Text size="sm" c="dimmed">
                Booking này chưa có số khách.
              </Text>
              <Group grow>
                <Button
                  variant="default"
                  onClick={() => {
                    modals.close(modalId);
                    let nestedModalId = "";
                    nestedModalId = modals.open({
                      title: "Nhập số khách rồi chọn cách gán",
                      children: (
                        <AssignGuestCountPromptBody
                          onManual={(guest) => {
                            modals.close(nestedModalId);
                            openManualAssignModal(booking, guest);
                          }}
                          onAuto={(guest) => {
                            modals.close(nestedModalId);
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

  const handleCreate = async () => {
    if (!customerName || !branchId || !bookingAt) {
      notifications.show({ color: "red", message: "Cần ít nhất tên khách và thời gian đến." });
      return;
    }
    const phoneRaw = customerPhone.trim();
    const phoneNorm = phoneRaw ? normalizeVietnamPhone(phoneRaw) : "";
    if (phoneNorm && !isPlausibleVietnamPhone(phoneNorm)) {
      notifications.show({
        color: "red",
        message:
          "Số điện thoại không đúng định dạng Việt Nam (ví dụ 0912345678, +84912345678).",
      });
      return;
    }
    const result = await createBooking({
      customerName: formatVietnamesePersonName(customerName),
      customerPhone: phoneNorm || undefined,
      branchId,
      guestCount: typeof guestCount === "number" && Number.isFinite(guestCount) ? Math.max(1, guestCount) : undefined,
      bookingAt: dayjs(bookingAt).toISOString(),
      note,
    });
    notifications.show({
      color: result.ok ? "green" : "red",
      message: result.message,
    });
    if (result.ok) {
      setCustomerName("");
      setCustomerPhone("");
      setGuestCount(undefined);
      setNote("");
    }
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

  const voiceSearchInputSection = (actionIconSize: "sm" | "md") => (
    <Tooltip label={isListeningSearch ? "Dừng ghi âm" : "Tìm bằng giọng nói"} withArrow>
      <ActionIcon
        variant={isListeningSearch ? "filled" : "subtle"}
        color={isListeningSearch ? "red" : "gray"}
        loading={isWarmingVoiceSearch}
        size={actionIconSize}
        radius="sm"
        onClick={() => {
          if (isListeningSearch) {
            stopVoiceSearch();
          } else {
            void startVoiceSearch();
          }
        }}
        aria-label={isListeningSearch ? "Dừng ghi âm" : "Tìm bằng giọng nói"}
      >
        {isListeningSearch ? (
          <Square size={actionIconSize === "md" ? 15 : 13} strokeWidth={2.5} fill="currentColor" />
        ) : (
          <Mic size={actionIconSize === "md" ? 19 : 17} strokeWidth={2} />
        )}
      </ActionIcon>
    </Tooltip>
  );

  const bookingsTable = (
    <PortalSectionCard>
      <Stack gap="sm">
        <Text fw={600}>Danh sách booking</Text>
        {isCompact ? (
          <Stack gap="sm">
            <TextInput
              placeholder="Tìm theo khách, SĐT, giờ đến, giờ check-in, khu, bàn, trạng thái..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                setPage(1);
              }}
              size="md"
              rightSection={voiceSearchInputSection("md")}
              rightSectionWidth={44}
              rightSectionPointerEvents="all"
            />
            <Group grow align="flex-end" wrap="wrap" gap="sm">
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
            </Group>
          </Stack>
        ) : (
          <Group align="flex-end" gap="sm" wrap="nowrap" justify="flex-start">
            <TextInput
              placeholder="Tìm theo khách, SĐT, giờ đến, giờ check-in, khu, bàn, trạng thái..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.currentTarget.value);
                setPage(1);
              }}
              size="sm"
              style={{ flex: "1 1 12rem", minWidth: 0 }}
              rightSection={voiceSearchInputSection("sm")}
              rightSectionWidth={40}
              rightSectionPointerEvents="all"
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
        )}
      </Stack>
      <div style={{ height: 12 }} />
      <DataTable
        minHeight={isCompact ? 200 : 260}
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
              booking.status === "cancelled" || booking.status === "completed" ? null : (
                <Group gap={6} wrap="wrap">
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
                  {booking.status === "checked_in" ? (
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

  const bookingsCards = (
    <Stack gap="sm">
      {sortedBookings.length > 0 ? (
        <Stack gap="sm">
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
          {totalListPages > 1 ? mobileListPaginationNav : null}
        </Stack>
      ) : null}
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
            <Card key={booking.id} withBorder radius="md" padding="md">
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
                {stripUnknownGuestTag(booking.note) ? (
                  <Text size="xs" c="dimmed" lineClamp={3}>
                    {stripUnknownGuestTag(booking.note)}
                  </Text>
                ) : null}
                <Group grow gap="xs">
                  {booking.status === "cancelled" || booking.status === "completed" ? null : (
                    <>
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
                      {booking.status === "checked_in" ? (
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
      {sortedBookings.length > 0 && totalListPages > 1 ? mobileListPaginationNav : null}
    </Stack>
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

  return (
    <Stack gap="md">
      <PortalPageTitle order={isCompact ? 3 : 2}>
        {isCompact ? "Đặt bàn" : "Đặt bàn"}
      </PortalPageTitle>

      <Tabs defaultValue="create" keepMounted={false}>
        <Tabs.List grow>
          <Tabs.Tab value="create">Tạo mới</Tabs.Tab>
          <Tabs.Tab value="list">Danh sách booking</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="create" pt="md">
          {createForm}
        </Tabs.Panel>
        <Tabs.Panel value="list" pt="md">
          {isCompact ? (
            <PortalSectionCard>
              <Stack gap="md">
                <Text size="sm" fw={600}>
                  Danh sách booking
                </Text>
                <Group gap="xs" grow>
                  <TextInput
                    placeholder="Tìm booking..."
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.currentTarget.value);
                      setPage(1);
                    }}
                  />
                  <Button
                    size="sm"
                    variant={isListeningSearch ? "filled" : "default"}
                    color={isListeningSearch ? "red" : "gray"}
                    loading={isWarmingVoiceSearch}
                    onClick={() => {
                      if (isListeningSearch) {
                        stopVoiceSearch();
                      } else {
                        void startVoiceSearch();
                      }
                    }}
                  >
                    {isListeningSearch ? "Dừng" : "Giọng nói"}
                  </Button>
                </Group>
                {bookingsCards}
              </Stack>
            </PortalSectionCard>
          ) : (
            bookingsTable
          )}
        </Tabs.Panel>
      </Tabs>
      {assignFormBooking ? (
        <Modal
          opened
          onClose={() => setAssignFormBooking(null)}
          title="Gán thủ công booking vào bàn"
          size="lg"
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {state.customers.find((item) => item.id === assignFormBooking.customerId)?.fullName ?? "—"} ·{" "}
              {dayjs(assignFormBooking.bookingAt).format("HH:mm DD/MM/YYYY")}
            </Text>
            {!isGuestCountSpecified(assignFormBooking) ? (
              <NumberInput
                label="Số khách"
                min={1}
                value={assignManualGuestCount}
                onChange={(value) =>
                  setAssignManualGuestCount(parseGuestCountFromNumberInput(value))
                }
                allowDecimal={false}
                clampBehavior="strict"
              />
            ) : null}
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
              />
              <Select
                label="Bàn"
                data={assignModalTableOptions}
                value={assignTableId}
                onChange={setAssignTableId}
                searchable
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
                  if (
                    !isGuestCountSpecified(assignFormBooking) &&
                    (typeof assignManualGuestCount !== "number" || assignManualGuestCount < 1)
                  ) {
                    notifications.show({ color: "red", message: "Vui lòng nhập số khách hợp lệ." });
                    return;
                  }
                  void runAssign(assignFormBooking, {
                    areaId: assignAreaId,
                    tableId: assignTableId,
                    guestCount: isGuestCountSpecified(assignFormBooking)
                      ? undefined
                      : assignManualGuestCount ?? undefined,
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
