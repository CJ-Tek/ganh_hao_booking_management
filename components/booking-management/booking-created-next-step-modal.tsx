"use client";

import dayjs from "dayjs";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/contexts/app-context";
import { isGuestCountSpecified } from "@/lib/booking-meta";
import { buildFloorMapHref } from "@/lib/floor-map-routes";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { useMemo } from "react";

export type BookingCreatedNextStepPayload = {
  bookingId: string;
  bookingAt: string;
  customerName?: string;
  message?: string;
  /** When false, Sơ đồ is hidden (chưa rõ số khách — xếp bàn trên sơ đồ chưa phù hợp). */
  guestCountSpecified?: boolean;
};

export type BookingCreatedNextStepModalProps = {
  opened: boolean;
  onClose: () => void;
  payload: BookingCreatedNextStepPayload | null;
  /** When already on Sơ đồ — open Danh sách booking modal in place instead of routing. */
  onViewInFloorMap?: (payload: BookingCreatedNextStepPayload) => void;
};

export function BookingCreatedNextStepModal({
  opened,
  onClose,
  payload,
  onViewInFloorMap,
}: BookingCreatedNextStepModalProps) {
  const router = useRouter();
  const { state } = useAppContext();
  const isCompact = usePortalCompact();

  const showFloorMapOption = useMemo(() => {
    if (!payload) {
      return false;
    }
    const booking = state.bookings.find((item) => item.id === payload.bookingId);
    if (booking) {
      return isGuestCountSpecified(booking);
    }
    return payload.guestCountSpecified ?? false;
  }, [payload, state.bookings]);

  if (!payload) {
    return null;
  }

  const visitLabel = dayjs(payload.bookingAt).format("HH:mm DD/MM/YYYY");
  const visitDate = dayjs(payload.bookingAt);

  const customerLabel = payload.customerName ? (
    <>
      {" "}
      của <strong>{payload.customerName}</strong>
    </>
  ) : null;

  const extraMessage =
    payload.message &&
    !/^Đã tạo booking thành công\.?$/i.test(payload.message.trim()) &&
    !/^Đã tạo booking trên cụm .+\.$/i.test(payload.message.trim())
      ? payload.message
      : null;

  const goToBookingList = () => {
    const params = new URLSearchParams({
      tab: "list",
      focusBooking: payload.bookingId,
    });
    onClose();
    router.push(`/bookings?${params.toString()}`);
  };

  const goToFloorMap = () => {
    onClose();
    if (onViewInFloorMap) {
      onViewInFloorMap(payload);
      return;
    }
    router.push(buildFloorMapHref(visitDate));
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Đã tạo booking"
      size="sm"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          {extraMessage ? (
            <>
              {extraMessage}
              <br />
              <br />
            </>
          ) : null}
          {showFloorMapOption ? (
            <>
              Đã tạo booking
              {customerLabel} (suất {visitLabel}). Bạn muốn xem ở{" "}
              <strong>Danh sách booking</strong> hay <strong>Sơ đồ</strong>?
            </>
          ) : (
            <>
              Đã tạo booking
              {customerLabel} (suất {visitLabel}). Chưa có số khách — mở{" "}
              <strong>Danh sách booking</strong> để bổ sung và xếp bàn sau.
            </>
          )}
        </Text>
        {showFloorMapOption ? (
          <Group gap="sm" grow={isCompact}>
            <Button variant="filled" color="brand" onClick={goToBookingList}>
              Danh sách booking
            </Button>
            <Button variant="filled" color="brand" onClick={goToFloorMap}>
              Sơ đồ
            </Button>
          </Group>
        ) : (
          <Button variant="filled" color="brand" fullWidth onClick={goToBookingList}>
            Danh sách booking
          </Button>
        )}
        <Button variant="default" fullWidth onClick={onClose}>
          Đóng
        </Button>
      </Stack>
    </Modal>
  );
}
