import type { AppStateSnapshot, AppUser, BookingStatus } from "./types";

/** Shown when an employee attempts any mutation other than allowed completion. */
export const EMPLOYEE_MUTATION_BLOCKED =
  "Tài khoản nhân viên chỉ được dùng mục Sơ đồ và đánh dấu Hoàn thành cho bàn đang ở trạng thái Đã ngồi.";

export function isEmployeeUser(user: AppUser | null | undefined): boolean {
  return user?.role === "employee";
}

/**
 * Employees may only set booking → completed when the table is occupied (Đã ngồi)
 * and the booking is already checked in (matches floor-map “Hoàn thành” flow).
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
    booking.status !== "checked_in" ||
    !table ||
    table.status !== "occupied"
  ) {
    throw new Error(
      "Chỉ được Hoàn thành khi bàn đang ở trạng thái Đã ngồi và booking đã check-in."
    );
  }
}
