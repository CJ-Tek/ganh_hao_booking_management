import dayjs from "dayjs";
import {
  AppStateSnapshot,
  AppUser,
  Area,
  Booking,
  Branch,
  Customer,
  DiningTable,
  InternalNotification,
} from "./types";

export const seedUsers: AppUser[] = [
  {
    id: "u-admin",
    username: "admin",
    password: "123456",
    fullName: "Quản trị hệ thống",
    role: "admin",
    branchIds: ["cn-1", "cn-2"],
  },
  {
    id: "u-gm",
    username: "tongquanly",
    password: "123456",
    fullName: "Quản lý tổng",
    role: "general_manager",
    branchIds: ["cn-1", "cn-2"],
  },
  {
    id: "u-mgr-1",
    username: "manager-vt",
    password: "123456",
    fullName: "Quản lý chi nhánh Vũng Tàu",
    role: "manager",
    branchIds: ["cn-1"],
  },
  {
    id: "u-mgr-2",
    username: "manager-hcm",
    password: "123456",
    fullName: "Quản lý chi nhánh Hồ Chí Minh",
    role: "manager",
    branchIds: ["cn-2"],
  },
];

export const seedBranches: Branch[] = [
  {
    id: "cn-1",
    name: "Gành Hào Vũng Tàu",
    address: "03 Trần Phú, Vũng Tàu",
  },
  {
    id: "cn-2",
    name: "Gành Hào Hồ Chí Minh",
    address: "12 Nguyễn Hữu Cảnh, Bình Thạnh",
  },
];

export const seedAreas: Area[] = [
  { id: "kv-1", branchId: "cn-1", name: "Sảnh biển", capacity: 120 },
  { id: "kv-2", branchId: "cn-1", name: "Phòng VIP", capacity: 40 },
  { id: "kv-3", branchId: "cn-2", name: "Sân vườn", capacity: 90 },
  { id: "kv-4", branchId: "cn-2", name: "Phòng máy lạnh", capacity: 70 },
];

export const seedTables: DiningTable[] = [
  {
    id: "b-1",
    branchId: "cn-1",
    areaId: "kv-1",
    name: "Bàn 01",
    seats: 6,
    status: "available",
    positionX: 80,
    positionY: 80,
  },
  {
    id: "b-2",
    branchId: "cn-1",
    areaId: "kv-1",
    name: "Bàn 02",
    seats: 8,
    status: "hold",
    positionX: 220,
    positionY: 120,
  },
  {
    id: "b-3",
    branchId: "cn-1",
    areaId: "kv-2",
    name: "VIP 1",
    seats: 10,
    status: "occupied",
    positionX: 160,
    positionY: 90,
  },
  {
    id: "b-4",
    branchId: "cn-2",
    areaId: "kv-3",
    name: "Sân 1",
    seats: 4,
    status: "arriving",
    positionX: 100,
    positionY: 160,
  },
  {
    id: "b-5",
    branchId: "cn-2",
    areaId: "kv-4",
    name: "Lạnh 03",
    seats: 6,
    status: "available",
    positionX: 260,
    positionY: 150,
  },
];

export const seedCustomers: Customer[] = [
  { id: "c-1", fullName: "Nguyễn Văn A", phone: "0909123456" },
  { id: "c-2", fullName: "Trần Thị B", phone: "0909345678", note: "Dị ứng hải sản" },
  { id: "c-3", fullName: "Lê Quốc C", phone: "0909987654" },
];

export const seedBookings: Booking[] = [
  {
    id: "bk-1",
    customerId: "c-1",
    branchId: "cn-1",
    areaId: "kv-1",
    tableId: "b-2",
    guestCount: 6,
    bookingAt: dayjs().add(2, "hour").toISOString(),
    note: "Sinh nhật",
    createdByUserId: "u-mgr-1",
    status: "confirmed",
  },
  {
    id: "bk-2",
    customerId: "c-2",
    branchId: "cn-2",
    areaId: "kv-3",
    tableId: "b-4",
    guestCount: 4,
    bookingAt: dayjs().add(1, "day").hour(19).minute(0).toISOString(),
    createdByUserId: "u-mgr-2",
    status: "confirmed",
  },
];

export const seedNotifications: InternalNotification[] = [
  {
    id: "n-1",
    title: "Nhắc giờ check-in",
    message: "Bàn 02 chi nhánh Vũng Tàu còn 30 phút đến giờ đón khách.",
    createdAt: dayjs().subtract(10, "minute").toISOString(),
    isRead: false,
    branchId: "cn-1",
  },
  {
    id: "n-2",
    title: "Xung đột đặt bàn",
    message: "Bàn Sân 1 bị trùng giờ 19:00 hôm nay, vui lòng kiểm tra.",
    createdAt: dayjs().subtract(40, "minute").toISOString(),
    isRead: false,
    branchId: "cn-2",
  },
];

export const initialState: AppStateSnapshot = {
  users: seedUsers,
  branches: seedBranches,
  areas: seedAreas,
  tables: seedTables,
  customers: seedCustomers,
  bookings: seedBookings,
  notifications: seedNotifications,
  activeBranchId: "cn-1",
  floorBackgrounds: {},
};
