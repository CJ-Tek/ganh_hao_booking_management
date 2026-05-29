import type { BookingRuntimeSettings } from "@/lib/types";

export const DEFAULT_BOOKING_RUNTIME_SETTINGS: BookingRuntimeSettings = {
  standardTurnaroundMinutes: 90,
  noShowGraceMinutes: 15,
  groupPartyGuestThreshold: 20,
  repeatCustomerMinCompleted: 2,
  receptionArrivalGraceMinutes: 15,
};
