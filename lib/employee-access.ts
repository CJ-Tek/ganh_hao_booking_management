import type { AppStateSnapshot, AppUser, BookingStatus } from "./types";

/** Portal home for employee accounts. */
export const EMPLOYEE_PORTAL_HOME = "/bookings";

/** Shown when an employee attempts any mutation other than allowed completion. */
export const EMPLOYEE_MUTATION_BLOCKED =
  "Tài khoản nhân viên chỉ được dùng mục Đặt bàn và đánh dấu Hoàn thành cho booking đang ở trạng thái Đã vào bàn.";

/** Booking statuses an employee may complete from the Đặt bàn view. */
export const EMPLOYEE_COMPLETABLE_BOOKING_STATUSES = ["seated", "checked_in"] as const satisfies readonly BookingStatus[];

export function isEmployeeUser(user: AppUser | null | undefined): boolean {
  return user?.role === "employee";
}

/**
 * Employees may only set booking → completed when the table is occupied (Đã ngồi)
 * and the booking is already seated (matches Đặt bàn “Hoàn thành” flow).
 */
export function assertEmployeeMaySetBookingStatus(
  snapshot: AppStateSnapshot,
  bookingId: string,
  status: BookingStatus
): void {
  if (status !== "completed") {
    throw new Error(EMPLOYEE_MUTATION_BLOCKED);
  }
  const booking = snapshot.bookings.find((b) => b.id === bookingId);
  const table =
    booking?.tableId != null
      ? snapshot.tables.find((t) => t.id === booking.tableId)
      : undefined;
  if (
    !booking ||
    (booking.status !== "checked_in" && booking.status !== "seated") ||
    !table ||
    table.status !== "occupied"
  ) {
    throw new Error(
      "Chỉ được Hoàn thành khi bàn đang ở trạng thái Đã ngồi và booking đã check-in."
    );
  }
}
