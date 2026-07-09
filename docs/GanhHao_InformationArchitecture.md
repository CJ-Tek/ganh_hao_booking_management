# Information Architecture — Gành Hào Booking System

This app is about the booking management for Gành Hào restaurant without the view of the customer, only support the general manager and manager view. The user management should be role-base type. The app should only support Vietnamese.

---

## 1. Hai cổng người dùng

### 1.1 Cổng Quản Lý Tổng (Admin & General Manager)
| Module | Mô tả |
|--------|-------|
| Dashboard tổng | Xem tổng quan 2 chi nhánh, lịch sử booking theo nhân viên |
| Quản lý chi nhánh | Cấu hình chi nhánh, khu vực, sức chứa |

### 1.2 Cổng Quản Lý Chi Nhánh (Manager)
| Module | Mô tả |
|--------|-------|
| Dashboard chi nhánh | Chỉ hiển thị dữ liệu chi nhánh được assign |
| Lịch đặt bàn | Xem theo ngày / tuần, lọc theo khu vực |

---

## 2. Shared Modules (dùng chung 2 cổng)

| Module | Loại | Mô tả |
|--------|------|-------|
| Sơ đồ nhà hàng | Frontend | Floor Map Interactive — hiển thị khu vực & bàn theo thực tế |
| Booking | Full-stack | Tạo / sửa / hủy đặt bàn, chọn khu vực & bàn trên sơ đồ |
| Quản lý bàn | Full-stack | Thêm/sửa/xóa bàn, trạng thái bàn real-time |
| Quản lý khách hàng | Full-stack | Lưu thông tin, lịch sử đặt bàn |
| Thông báo nội bộ | Full-stack | Cảnh báo bàn sắp đến giờ, xung đột booking |
| Xác thực & phân quyền | Backend | 2 cổng: Quản lý tổng / Quản lý chi nhánh |
| Quản lý khu vực | Full-stack | Cấu hình chi nhánh, khu vực, sức chứa (Admin setting) |
| Tài liệu & đào tạo | Docs | Hướng dẫn sử dụng & đào tạo nhân viên |

---

## 3. Luồng chính — Tạo mới đặt bàn

```
Đăng nhập (no need OAuth)
    ↓
Dashboard — Chọn chi nhánh
    ↓
Floor Map — Chọn khu vực
    ↓
Chọn bàn — Trạng thái real-time
    ↓
Xác nhận — Lưu & thông báo
    ↑ (nếu xung đột bàn → quay lại chọn bàn)
```

---

## 4. Luồng check-in khách đến

```
Bước 1 · Xác nhận       — Kiểm tra thông tin khách, ghi chú đặc biệt
    ↓
Bước 2 · Check-in       — Dẫn khách vào bàn, bàn chuyển trạng thái "Đã ngồi"
    ↓
Bước 3 · Cập nhật bàn   — Broadcast real-time → Floor Map & Calendar tự cập nhật
    ↓
Bước 4 · Thông báo      — Tự động thông báo bếp, nhắc nhân viên phục vụ, ghi lịch sử
    ↓
Bước 5 · Hoàn tất       — Duy trì trạng thái bàn và theo dõi thời gian ngồi
```

**Trạng thái bàn chuẩn toàn hệ thống:**
- `available` → Trống
- `hold` → Giữ chỗ
- `occupied` → Đã ngồi
- `locked` → Khóa

**Quy tắc tự động + thủ công:**
- Tạo booking với "Giữ chỗ" (giờ tương lai) → tự động `hold`
- Tạo booking với "Vào bàn ngay" (giờ hiện tại) hoặc check-in → tự động `occupied`
- Hủy booking cuối cùng của bàn (không còn booking active) → tự động `available`
- Người dùng vẫn có thể đổi tay trạng thái sang `available` / `hold` / `occupied` / `locked`

---

## 5. Danh sách màn hình cần thiết kế

### Nhóm A — Core screens
| # | Màn hình | Mô tả |
|---|----------|-------|
| 1 | Login | 2 cổng đăng nhập (Admin / Chi nhánh) |
| 2 | Dashboard overview | Tổng quan số liệu, trạng thái 2 chi nhánh |
| 3 | Floor Map interactive | Sơ đồ bàn khu vực, chọn bàn booking |
| 4 | Booking form | Tạo / chỉnh sửa đặt bàn |
| 5 | Calendar view | Lịch theo ngày / tuần |
| 6 | Table management | Danh sách & quản lý bàn |
For the point 3, this one should have 2 features:
- Ability to add a restaurant floor plan picture as a background.
- Allow the manager to drag and drop the table block to their desired position on the background.
-> All these things can be saved for each specific user.

### Nhóm B — Supporting screens
| # | Màn hình | Mô tả |
|---|----------|-------|
| 7 | Khách hàng | Danh sách + hồ sơ chi tiết |
| 8 | Thông báo | Bell icon + popover + trang thông báo |
| 9 | Khu vực & bàn | Settings cấu hình |
| 10 | User management | Quản lý tài khoản & phân quyền |
| 11 | 404 / Empty states | Trạng thái lỗi, rỗng dữ liệu |

---

## 6. Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Frontend | React.js, Mantine UI, Lucide |
| Backend | Next.js, REST API |
| Database | Supabase — see [database-schema.md](./database-schema.md) for tables, columns, FKs, and data flows |
| Deploy | Vercel |
| Table engine | mantine-datable |
| Git | https://github.com/LeeJarvis98/ganh_hao_booking_management |

---

## 7. Color Scheme
- Light theme with this color array:
[
  "#ecf6fe",
  "#d8e9f7",
  "#abd1f0",
  "#7db9eb",
  "#59a4e7",
  "#4597e5",
  "#3a90e5",
  "#2e7dcc",
  "#236fb7",
  "#0c61a4"
]
- 0C61A4 is the main one.

---

## 8. Logo
Stored in public/logo folder:
- vertical.png has the logo on top, and the text at below -> Suitable for article, blog, terms, etc...
- horizontal.png has the logo at the left, and the text at the right -> Suitable for header, footer, etc...
- main_logo.png has only the logo -> Suitable for loading icon, or decorated icon.