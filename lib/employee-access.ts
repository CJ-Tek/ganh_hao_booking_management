import type { AppStateSnapshot, AppUser, BookingStatus } from "./types";

/** Portal home for employee accounts. */
export const EMPLOYEE_PORTAL_HOME = "/bookings";

/** Shown when an employee attempts any mutation other than allowed completion. */
export const EMPLOYEE_MUTATION_BLOCKED =
  "Tài khoản nhân viên chỉ được xem và đánh dấu Hoàn thành cho booking đang ở trạng thái Đã vào bàn trên chi nhánh được gán.";

/** Booking statuses an employee may complete. */
export const EMPLOYEE_COMPLETABLE_BOOKING_STATUSES = [
  "seated",
  "checked_in",
] as const satisfies readonly BookingStatus[];

export function isEmployeeUser(user: AppUser | null | undefined): boolean {
  return user?.role === "employee";
}

export function isEmployeeCompletableBookingStatus(status: BookingStatus): boolean {
  return (EMPLOYEE_COMPLETABLE_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}

/**
 * Employees may only set booking → completed when the table is occupied (Đã ngồi)
 * and the booking is already seated/checked-in on an assigned branch.
 */
export function assertEmployeeMaySetBookingStatus(
  snapshot: AppStateSnapshot,
  bookingId: string,
  status: BookingStatus,
  user?: AppUser | null
): void {
  if (status !== "completed") {
    throw new Error(EMPLOYEE_MUTATION_BLOCKED);
  }
  const booking = snapshot.bookings.find((b) => b.id === bookingId);
  if (!booking || !isEmployeeCompletableBookingStatus(booking.status)) {
    throw new Error(
      "Chỉ được Hoàn thành khi booking đã check-in hoặc đang ở trạng thái Đã vào bàn."
    );
  }
  if (user && !user.branchIds.includes(booking.branchId)) {
    throw new Error("Bạn chỉ được Hoàn thành booking trên chi nhánh được gán.");
  }
  const table =
    booking.tableId != null ? snapshot.tables.find((t) => t.id === booking.tableId) : undefined;
  if (!table || table.status !== "occupied") {
    throw new Error(
      "Chỉ được Hoàn thành khi bàn đang ở trạng thái Đã ngồi và booking đã check-in."
    );
  }
}
