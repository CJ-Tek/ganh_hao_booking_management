export type Role = "admin" | "general_manager" | "manager";

export type TableStatus = "available" | "hold" | "occupied" | "locked";
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "checked_in" | "completed";

export interface AppUser {
  id: string;
  username: string;
  password: string;
  fullName: string;
  role: Role;
  branchIds: string[];
}

export interface Branch {
  id: string;
  name: string;
  address: string;
}

export interface Area {
  id: string;
  branchId: string;
  name: string;
  capacity: number;
  /** Floor map grid columns (persisted when using Supabase). */
  floorGridColumns?: number;
  /** Floor map grid rows (persisted when using Supabase). */
  floorGridRows?: number;
  /** Node spacing (px) on floor map; see `lib/floor-map-layout.ts` for clamps and defaults. */
  floorNodeSpacing?: number;
}

export interface DiningTable {
  id: string;
  branchId: string;
  areaId: string;
  name: string;
  seats: number;
  status: TableStatus;
  positionX: number;
  positionY: number;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  note?: string;
}

export interface Booking {
  id: string;
  customerId: string;
  branchId: string;
  areaId: string | null;
  tableId: string | null;
  guestCount: number;
  bookingAt: string;
  /** Set when status becomes checked_in (explicit check-in or walk-in assign). */
  checkedInAt?: string | null;
  note?: string;
  createdByUserId: string;
  status: BookingStatus;
}

export interface InternalNotification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  branchId?: string;
}

export interface AppStateSnapshot {
  users: AppUser[];
  branches: Branch[];
  areas: Area[];
  tables: DiningTable[];
  customers: Customer[];
  bookings: Booking[];
  notifications: InternalNotification[];
  activeBranchId?: string;
}
