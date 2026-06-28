"use client";

import { useCallback, useMemo } from "react";
import { useAppContext } from "@/contexts/app-context";
import { inferGuestTypeLabel } from "@/lib/booking-meta";
import { type Booking } from "@/lib/types";

/** Infer loại khách for booking cards/tables (branch-scoped completed counts). */
export function useBookingGuestTypeLabel(scopeBookings?: readonly Booking[]) {
  const { state, filteredBranchIds } = useAppContext();

  const receptionThresholds = useMemo(
    () => ({
      groupPartyGuestThreshold: state.bookingRuntimeSettings.groupPartyGuestThreshold,
      repeatCustomerMinCompleted: state.bookingRuntimeSettings.repeatCustomerMinCompleted,
      receptionArrivalGraceMinutes: state.bookingRuntimeSettings.receptionArrivalGraceMinutes,
      noShowGraceMinutes: state.bookingRuntimeSettings.noShowGraceMinutes,
      lateGraceMinutes: state.bookingRuntimeSettings.lateGraceMinutes,
    }),
    [state.bookingRuntimeSettings]
  );

  const completedBookingsByCustomer = useMemo(() => {
    const counts = new Map<string, number>();
    const bookings =
      scopeBookings ??
      state.bookings.filter((booking) => filteredBranchIds.includes(booking.branchId));
    for (const booking of bookings) {
      if (booking.status !== "completed") {
        continue;
      }
      counts.set(booking.customerId, (counts.get(booking.customerId) ?? 0) + 1);
    }
    return counts;
  }, [filteredBranchIds, scopeBookings, state.bookings]);

  return useCallback(
    (booking: Booking) =>
      inferGuestTypeLabel(booking, {
        completedBookingCountForCustomer:
          completedBookingsByCustomer.get(booking.customerId) ?? 0,
        thresholds: receptionThresholds,
      }),
    [completedBookingsByCustomer, receptionThresholds]
  );
}
