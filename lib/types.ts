export type Role = "admin" | "general_manager" | "manager" | "employee";

export type TableStatus = "available" | "hold" | "occupied" | "locked";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "seated"
  | "cancelled"
  | "no_show"
  | "checked_in"
  | "completed";

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
  /** Real phone when known; null when the guest did not provide one (stored as NULL in Supabase). */
  phone: string | null;
  note?: string;
}

export interface Booking {
  id: string;
  customerId: string;
  branchId: string;
  areaId: string | null;
  tableId: string | null;
  /** Set when the booking is held by a merged-tables group (Bàn gộp). `tableId` is null in that case. */
  mergeGroupId?: string | null;
  guestCount: number;
  bookingAt: string;
  startTime: string;
  endTime: string;
  /** Set when status becomes checked_in (explicit check-in or walk-in assign). */
  checkedInAt?: string | null;
  noShowMarkedAt?: string | null;
  note?: string;
  createdByUserId: string;
  /** Set when an order edit is saved (time, guest count, phone). */
  lastEditedAt?: string | null;
  lastEditedByUserId?: string | null;
  status: BookingStatus;
}

export type WaitlistStatus = "waiting" | "offered" | "expired" | "cancelled" | "promoted";

export interface BookingWaitlistEntry {
  id: string;
  tableId: string;
  branchId: string;
  areaId: string | null;
  customerId: string;
  bookingId?: string | null;
  desiredStartTime: string;
  desiredEndTime: string;
  partySize: number;
  status: WaitlistStatus;
  position: number;
  offeredAt?: string | null;
  offerExpiresAt?: string | null;
  promotedBookingId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingRuntimeSettings {
  standardTurnaroundMinutes: number;
  noShowGraceMinutes: number;
  waitlistOfferTtlMinutes: number;
  /** SL từ đây trở lên → nhãn Đoàn (khi ghi chú không nói rõ). */
  groupPartyGuestThreshold: number;
  /** Số booking completed tối thiểu → Khách quen. */
  repeatCustomerMinCompleted: number;
  /** Cửa sổ phút quanh giờ đến cho trạng thái Chờ đến. */
  receptionArrivalGraceMinutes: number;
}

export interface TableBlockState {
  tableId: string | null;
  mergeGroupId?: string | null;
  slotStartTime: string;
  slotEndTime: string;
  confirmedSchedule: Booking[];
  waitlistQueue: BookingWaitlistEntry[];
}

export interface InternalNotification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  branchId?: string;
}

/**
 * Merged-tables group (Bàn gộp N): a logical container in `Sơ đồ` that bundles 2+ tables
 * so a booking can occupy the combined capacity. Numbered per area, reusable after release.
 */
export interface TableMergeGroup {
  id: string;
  branchId: string;
  areaId: string;
  /** Auto-incremented number within the area; displayed as `Bàn gộp {autoNumber}`. */
  autoNumber: number;
  /** Always `Bàn gộp {autoNumber}` for active groups (server keeps this in sync). */
  mergedName: string;
  /** Sum of member table seats at the time of the latest membership change. */
  totalCapacity: number;
  /** Member table ids in `order_index` order. */
  tableIds: string[];
  status: "active" | "released";
  /** Inclusive calendar start (YYYY-MM-DD) when the merge is in effect on the floor map. */
  startDate: string;
  /** Inclusive calendar end (YYYY-MM-DD); after this day the group is auto-released. */
  endDate: string;
  createdAt: string;
  releasedAt?: string | null;
}

export interface AppStateSnapshot {
  users: AppUser[];
  branches: Branch[];
  areas: Area[];
  tables: DiningTable[];
  customers: Customer[];
  bookings: Booking[];
  /** Active table merge groups across all branches. */
  mergeGroups: TableMergeGroup[];
  notifications: InternalNotification[];
  bookingRuntimeSettings: BookingRuntimeSettings;
  activeBranchId?: string;
}
