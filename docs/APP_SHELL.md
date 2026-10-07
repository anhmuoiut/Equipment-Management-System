# Khung sườn ứng dụng (App Shell)

Cập nhật: 03/10/2026. Code — menu: [components/layout/AppSidebar.tsx](../components/layout/AppSidebar.tsx); danh sách con Configuration: [components/configuration/ConfigNav.tsx](../components/configuration/ConfigNav.tsx); route: `app/(app)/…`.

Khung gồm top bar, sidebar (thu gọn được, thành ngăn kéo trên điện thoại), sáng / tối và ngôn ngữ. Nội dung trong từng trang theo [DETAIL_MODEL.md](DETAIL_MODEL.md) (Masterlist + Detail Panel); dữ liệu theo [DATABASE_MODIFIED.md](DATABASE_MODIFIED.md); màu, font, kích thước theo [JABIL_UI.md](JABIL_UI.md).

## 1. Menu

Sáu mục, **một cấp duy nhất**, đúng thứ tự:

| # | Menu | Icon | Đường dẫn | Ai thấy | Nội dung |
| --- | --- | --- | --- | --- | --- |
| 1 | Dashboard | `LayoutDashboard` | `/` | Mọi nhóm | Số liệu tổng hợp, thiết bị quá hạn / sắp đến hạn hiệu chuẩn, thay đổi gần đây |
| 2 | Equipment | `LayoutList` | `/equipment` | Mọi nhóm | Masterlist thiết bị |
| 3 | Calibration | `Gauge` | `/calibration` | Mọi nhóm | Masterlist (Dashboard) hiệu chuẩn |
| 4 | Golden | `CircuitBoard` | `/golden` | Mọi nhóm | Masterlist golden sample |
| — | *(đường kẻ ngăn)* | | | | |
| 5 | Configuration | `SlidersHorizontal` | `/configuration/…` | **Chỉ Admin** | Danh sách cấu hình + Error log |
| 6 | User Management | `Users` | `/users` | **Chỉ Admin** | Masterlist tài khoản |

- User và Readonly chỉ thấy 4 mục đầu (không có đường kẻ ngăn).
- Không có số đếm cạnh menu. Thiết bị quá hạn xem ở Dashboard; tài khoản chờ duyệt báo qua chuông thông báo.

---

## 2. Top bar, sidebar, điện thoại

| Phần | Quy tắc |
| --- | --- |
| Top bar | Logo Jabil + **SolarEdge Equipment Management** bên trái (một dòng); bên phải: ngôn ngữ + sáng / tối · chuông thông báo · menu tài khoản. Điện thoại: chỉ còn `☰` · thương hiệu · chuông · tài khoản (nút tròn, không mũi tên); **ngôn ngữ và sáng / tối nằm trong menu tài khoản** (English ✓ / Tiếng Việt, Chuyển sang chế độ tối) |
| Sidebar | Nền Prussian, mục đang chọn màu Picton; nút thu gọn ở đầu sidebar (còn icon, rê chuột hiện tên, ghi nhớ lựa chọn). Sidebar chỉ có các mục menu: không có chữ chú thích phía trên và không có dòng trạng thái / ghi chú phía dưới |
| Điện thoại / màn hẹp (≤ 800px) | Sidebar ẩn, nút `☰` trên top bar mở sidebar phủ lên nội dung, chọn menu xong tự đóng. Ngăn kéo chỉ có sáu mục. Bảng thông báo phủ ngang màn hình ngay dưới top bar |
| Tiêu đề trang | Nằm trong nội dung trang, không lặp lại trên top bar |
| Kích thước | Theo bảng "Current compact dimensions" trong [JABIL_UI.md](JABIL_UI.md) |

Không có cấp menu thứ hai trong sidebar.

---

## 3. Trang Configuration

Các danh sách cấu hình được chọn bằng **danh sách con bên trái trong trang**, gom theo nhóm. Bấm tên nhóm để **mở / đóng** (thả xuống) các mục bên trong:

```
┌──────────────────────────┬──────────────────────────────────────────────────┐
│ ▾ DỮ LIỆU GỐC            │ Location                                 6 dòng  │
│     Part Number          │ [🔍 Tìm…] [Tùy chọn hiển thị] [Xuất Excel] [+ Thêm]│
│   ▸ Location             │ ┌──────────────────────────────────────────────┐ │
│     Type                 │ │ No  Tên     Thứ tự                            │ │
│     Tag                  │ │ 1   B3F1    1                                 │ │
│     Level                │ │ …                                             │ │
│     Department           │ └──────────────────────────────────────────────┘ │
│ ▸ HIỆU CHUẨN          (2)│                                                  │
│ ▸ HỆ THỐNG            (1)│                                                  │
└──────────────────────────┴──────────────────────────────────────────────────┘
```

| Nhóm | Mục | Đường dẫn |
| --- | --- | --- |
| DỮ LIỆU GỐC | Part Number | `/configuration/part-numbers` |
| | Location | `/configuration/locations` |
| | Type | `/configuration/types` |
| | Tag | `/configuration/tags` |
| | Level | `/configuration/levels` |
| | Department | `/configuration/departments` |
| HIỆU CHUẨN | Setup — part number phải hiệu chuẩn (trong các PN đang có thiết bị), chu kỳ, số ngày báo trước | `/configuration/calibration-setup` |
| | Vendor | `/configuration/calibration-vendors` |
| HỆ THỐNG | Error log | `/configuration/error-log` |

| Mục | Quy tắc |
| --- | --- |
| Mở / đóng nhóm | Bấm tên nhóm; nhóm đang đóng hiện số mục bên trong, ví dụ `(2)`. Ghi nhớ lựa chọn của từng người |
| Nhóm chứa trang đang xem | Luôn mở khi vào trang (để thấy mục đang chọn) |
| Mở menu Configuration | Vào danh sách đầu tiên (Part Number) |
| Nội dung bên phải | Masterlist + Detail Panel như mọi module |
| Error log | Chỉ xem (không thêm / sửa); vẫn có tìm kiếm, bộ lọc, xuất Excel và Detail Panel để xem chi tiết lỗi |
| Điện thoại | Danh sách con đổi thành ô chọn thả xuống ở đầu trang, các mục chia theo nhóm |

---

## 4. Đường dẫn

| Trang | Đường dẫn | Ghi chú |
| --- | --- | --- |
| Đăng nhập | `/login` | Thiết kế: [JABIL_UI.md](JABIL_UI.md) mục 3 |
| Dashboard | `/` | |
| Equipment | `/equipment`, `/equipment/{id}` | `/{id}` mở Detail Page toàn trang — dùng cho QR và nút `⤢` |
| Nhãn QR | `/equipment/{id}/label` | Trang in nhãn, không có khung ứng dụng; mã QR trỏ tới `/equipment/{id}` |
| Calibration | `/calibration`, `/calibration/{id}` | |
| Golden | `/golden`, `/golden/{id}` | |
| Configuration | `/configuration/{danh sách}` | Chỉ Admin |
| User Management | `/users`, `/users/{id}` | Chỉ Admin |
| Đổi mật khẩu bắt buộc | `/change-password` | Tài khoản có mật khẩu do admin đặt; không có khung ứng dụng |

Mở một đường dẫn không có quyền → chuyển về Dashboard (`/?denied=1`) và báo "Bạn không có quyền xem trang này". API vẫn tự kiểm tra quyền (trả 403), không dựa vào việc ẩn menu.

---

## 5. Nội dung chung của mọi trang

| Phần | Quy tắc |
| --- | --- |
| Tiêu đề trang | Tên trang, số bản ghi ngay bên dưới |
| Thân trang | Dashboard: các khối số liệu. Các trang còn lại: Masterlist + Detail Panel ([DETAIL_MODEL.md](DETAIL_MODEL.md)) |
| Đang tải / trống / lỗi | Dùng chung một kiểu khung xương, thông báo trống, thông báo lỗi |
| Thông báo kết quả | Lưu / xóa thành công hiện thông báo nhỏ góc màn hình rồi tự tắt. Lỗi hiện ngay tại chỗ thao tác, theo mã lỗi và ngôn ngữ đang chọn (`errorMessage()` — `lib/client/api.ts`); lỗi hệ thống kèm mã yêu cầu để báo Admin |
