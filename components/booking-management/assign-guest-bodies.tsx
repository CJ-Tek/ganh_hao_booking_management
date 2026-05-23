"use client";

import { Button, Group, NumberInput, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import {
  MANUAL_ASSIGN_MODAL_OPEN_DELAY_MS,
  parseGuestCountFromNumberInput,
} from "@/components/booking-management/shared";
import { type Booking } from "@/lib/types";

export function AssignGuestCountPromptBody(props: {
  onBack?: () => void;
  onManual: (guestCount: number) => void;
}) {
  const { onBack, onManual } = props;
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
      <Button
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
        Chọn bàn thủ công
      </Button>
    </Stack>
  );
}

export function AssignGuestSpecifiedOptionsBody(props: {
  booking: Booking;
  modalId: string;
  persistGuestCount: (bookingId: string, guestCount: number) => Promise<{ ok: boolean; message: string }>;
  onManual: (guestCount: number) => void;
}) {
  const { booking, modalId, persistGuestCount, onManual } = props;
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
      typeof guestDraft === "number" && Number.isFinite(guestDraft) ? guestDraft : committedGuest
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
            onChange={(v) => setGuestDraft(parseGuestCountFromNumberInput(v) ?? guestDraft)}
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
      <Button
        disabled={persistingGuest}
        onClick={() => {
          modals.close(modalId);
          window.setTimeout(() => {
            onManual(resolvedGuest);
          }, MANUAL_ASSIGN_MODAL_OPEN_DELAY_MS);
        }}
      >
        Chọn bàn thủ công
      </Button>
    </Stack>
  );
}
