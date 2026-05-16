"use client";

import { Alert, Button, NumberInput, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { RouteGuard } from "@/components/route-guard";
import { useAppContext } from "@/contexts/app-context";
import type { BookingRuntimeSettings } from "@/lib/types";

function parsePositiveInt(value: number | string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.round(n);
}

export default function BookingRulesSettingsPage() {
  const { state, updateBookingRuntimeSettings, hasSupabase } = useAppContext();
  const [draft, setDraft] = useState<BookingRuntimeSettings>(state.bookingRuntimeSettings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(state.bookingRuntimeSettings);
  }, [state.bookingRuntimeSettings]);

  const handleSave = async () => {
    const payload: BookingRuntimeSettings = {
      ...state.bookingRuntimeSettings,
      groupPartyGuestThreshold: parsePositiveInt(
        draft.groupPartyGuestThreshold,
        state.bookingRuntimeSettings.groupPartyGuestThreshold
      ),
      repeatCustomerMinCompleted: parsePositiveInt(
        draft.repeatCustomerMinCompleted,
        state.bookingRuntimeSettings.repeatCustomerMinCompleted
      ),
      receptionArrivalGraceMinutes: parsePositiveInt(
        draft.receptionArrivalGraceMinutes,
        state.bookingRuntimeSettings.receptionArrivalGraceMinutes
      ),
    };

    setSaving(true);
    try {
      const result = await updateBookingRuntimeSettings(payload);
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setDraft(payload);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <RouteGuard allowedRoles={["admin", "general_manager"]}>
      <Stack gap="md">
        <PortalPageTitle>Cấu hình Booking hôm nay</PortalPageTitle>
        <Text size="sm" c="dimmed">
          Ngưỡng dùng cho màn <strong>Booking hôm nay</strong> (loại khách, trạng thái Chờ đến).
          Áp dụng toàn hệ thống cho mọi chi nhánh.
        </Text>
        {!hasSupabase ? (
          <Alert color="yellow" title="Chưa kết nối Supabase">
            Có thể chỉnh tạm trên trình duyệt; dữ liệu không đồng bộ server.
          </Alert>
        ) : null}
        <PortalSectionCard>
          <Stack gap="md">
            <NumberInput
              label="Ngưỡng Đoàn (số khách)"
              description="Từ số khách này trở lên, tự gắn loại Đoàn nếu ghi chú không nói rõ."
              min={1}
              allowDecimal={false}
              clampBehavior="strict"
              value={draft.groupPartyGuestThreshold}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  groupPartyGuestThreshold: parsePositiveInt(
                    value,
                    prev.groupPartyGuestThreshold
                  ),
                }))
              }
            />
            <NumberInput
              label="Ngưỡng Khách quen (số booking hoàn thành)"
              description="Khách đã hoàn thành ít nhất N lần tại chi nhánh đang xem."
              min={1}
              allowDecimal={false}
              clampBehavior="strict"
              value={draft.repeatCustomerMinCompleted}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  repeatCustomerMinCompleted: parsePositiveInt(
                    value,
                    prev.repeatCustomerMinCompleted
                  ),
                }))
              }
            />
            <NumberInput
              label="Cửa sổ Chờ đến (phút)"
              description="Trước/sau giờ đến bao nhiêu phút vẫn hiện trạng thái Chờ đến."
              min={1}
              allowDecimal={false}
              clampBehavior="strict"
              value={draft.receptionArrivalGraceMinutes}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  receptionArrivalGraceMinutes: parsePositiveInt(
                    value,
                    prev.receptionArrivalGraceMinutes
                  ),
                }))
              }
            />
            <Button loading={saving} onClick={() => void handleSave()}>
              Lưu cấu hình
            </Button>
          </Stack>
        </PortalSectionCard>
      </Stack>
    </RouteGuard>
  );
}
