# Database v2 — bản thiết kế (nguồn chính)

Cập nhật: 02/10/2026. **Mọi quyết định thiết kế database mới đều ghi vào file này.** Database được xây lại từ đầu; file chỉ mô tả thiết kế mới.

Làm sau: module Sửa chữa (Repair).

Ký hiệu: **✔** = bắt buộc (`not null`) · **PK** = khóa chính · **FK** = khóa ngoại · **UQ** = không được trùng. *Cần chốt* = điểm chưa quyết định.

## Menu ↔ bảng

| Menu | Bảng | Mục |
| --- | --- | --- |
| Dashboard | Không có bảng riêng. Đọc `equipments`, `calibration_equipments`, `golden_samples`, `statuses` và view `recent_activities` (thay đổi gần đây) | [1](#1-dashboard) |
| Equipment | `equipments`, `equipment_histories` | [2](#2-equipment) |
| Calibration | `calibration_equipments`, `calibration_histories` | [3](#3-calibration) |
| Golden | `golden_samples`, `golden_sample_histories` | [4](#4-golden-sample) |
| Configuration | `part_numbers`, `locations`, `types`, `statuses`, `levels`, `departments`, `calibration_configurations`, `calibration_vendors`, `configuration_histories` | [5](#5-configuration) |
| User Management | `user_profiles`, `user_histories` | [6](#6-user-management) |
| *(hệ thống, không có menu)* | `notifications`, `error_log` | [7](#7-bảng-hệ-thống) |

## Quy ước chung

| Quy ước | Thiết kế |
| --- | --- |
| Tên bảng | `snake_case`, số nhiều. Bảng dữ liệu gốc dùng chung không có tiền tố (`part_numbers`, `locations`, `types`, `statuses`, `levels`, `departments`). Bảng của một module có tiền tố module (`equipment_`, `calibration_`, `golden_sample_`, `user_`) |
| Khóa chính | **Mọi bảng** có cột `id uuid` riêng làm PK, tự sinh bằng `gen_random_uuid()` — kể cả khi bảng đã có cột UQ khác |
| Định danh | Mọi liên kết và logic dựa vào `id`, không dựa vào chữ. Bảng dữ liệu gốc không có cột mã (`code`). |
| Tên hiển thị | `display_name` — chữ người dùng thấy, admin đặt sao hiển thị vậy, sửa thoải mái |
| Thứ tự | `sort_order` |
| Thời gian | `created_at`, `updated_at` kiểu `timestamptz`; `updated_at` tự cập nhật bằng trigger `set_updated_at` |
| Người tạo/sửa | `created_by`, `updated_by` → FK `user_profiles.id` |
| Dữ liệu gốc | Admin tạo **một lần** ở Configuration, mọi trang cần thì trỏ tới. Xóa = ẩn (`is_active = false`). **Trừ** `statuses`: admin sửa / xóa thật; đang được dùng thì không xóa được |
| Màu trạng thái | Không lưu trong database — dùng màu hệ thống, thiết kế chung cho toàn project (bàn sau) |
| Xóa dữ liệu | Thiết bị và golden sample xóa thật (không có Archive). Xóa thiết bị có con: chọn xóa cả cây con hoặc giữ con (con gắn vào cha cũ) |
| FK | Mọi cột FK phải trỏ tới một bảng có trang thêm / sửa / xóa. Trường không có bảng để trỏ tới thì là chữ gõ tự do (`text`) |
| Form | Trường trên form cố định trong code — không có tính năng admin đổi nhãn / ẩn / hiện / bắt buộc |
| Lịch sử | Mỗi module **một** bảng lịch sử, tên `<module>_histories`, cùng khuôn — xem [Khuôn bảng lịch sử](#khuôn-bảng-lịch-sử). Không có bảng nhật ký chung |
| Tách module | Module chỉ trỏ tới dữ liệu gốc dùng chung, và một chiều sang module khác khi cần (Calibration → Equipment). Equipment không trỏ sang Calibration |
| Phân quyền | Theo **nhóm** (`user_profiles.role`): Admin / User / Readonly — xem [Phân quyền theo nhóm](#phân-quyền-theo-nhóm). Không cấp quyền lẻ cho từng người |
| Bảo mật | RLS chặn hết; chỉ server (service_role) đọc/ghi |

## Sơ đồ liên kết

```
Configuration (dữ liệu gốc dùng chung + cấu hình hiệu chuẩn)
  part_numbers   locations   types   statuses   levels   departments
  calibration_configurations ──► part_numbers  (part_number_id, UQ)
  calibration_vendors
  configuration_histories                      (record_id, không FK)

Equipment
  equipments ──► part_numbers  (part_number_id)
             ──► types         (type_id)
             ──► statuses      (status_id)
             ──► levels        (level_id)
             ──► locations     (location_id)
             ──► equipments    (parent_id — cây cha–con)
  equipment_histories          (equipment_id, không FK)

Calibration  (phụ thuộc một chiều vào Equipment)
  calibration_equipments ──► equipments           (equipment_id, UQ — mỗi thiết bị một dòng)
                         ──► statuses             (status_id)
                         ──► calibration_vendors  (vendor_id)
  calibration_histories                           (equipment_id, không FK)

Golden sample
  golden_samples ──► locations  (location_id)
                 ──► statuses   (status_id)
  golden_sample_histories       (golden_sample_id, không FK)

User Management
  user_profiles ──► departments  (department_id)
  user_histories                  (user_id, không FK)

Hệ thống
  notifications ──► user_profiles  (recipient_id)
  error_log
```

## Phân quyền theo nhóm

Mỗi tài khoản thuộc **một** nhóm (`user_profiles.role`). Quyền của từng nhóm cố định trong code; admin chỉ chọn nhóm cho tài khoản.

| Menu / thao tác | Admin | User | Readonly |
| --- | --- | --- | --- |
| Dashboard | Xem | Xem | Xem |
| Equipment — xem, tìm kiếm, xuất Excel | ✔ | ✔ | ✔ |
| Equipment — thêm, sửa, đổi vị trí, Move / Swap / Detach, import Excel | ✔ | ✔ | — |
| Equipment — xóa | ✔ | — | — |
| Calibration — xem, tìm kiếm, xuất Excel | ✔ | ✔ | ✔ |
| Calibration — đưa thiết bị vào Dashboard, cập nhật hiệu chuẩn | ✔ | ✔ | — |
| Calibration — bỏ thiết bị khỏi Dashboard | ✔ | — | — |
| Golden — xem, tìm kiếm, xuất Excel | ✔ | ✔ | ✔ |
| Golden — thêm, sửa, đổi vị trí | ✔ | ✔ | — |
| Golden — xóa | ✔ | — | — |
| Configuration (mọi trang) — xem và sửa | ✔ | — (không thấy menu) | — (không thấy menu) |
| User Management | ✔ | — | — |
| Xem lịch sử (tab History) | ✔ | ✔ | ✔ |

Tóm tắt: **Admin** làm được mọi thứ · **User** thêm / sửa / cập nhật, không xóa, không vào Configuration và User Management · **Readonly** chỉ xem, tìm kiếm và xuất Excel (xem được thì xuất được).

User nhập sai thì sửa lại (cập nhật), không xóa. Muốn đánh dấu một dòng không còn dùng thì đổi trạng thái (ví dụ Inactive) — danh sách trạng thái admin tạo ở Configuration › Status.

## Khuôn bảng lịch sử

Mọi bảng `*_histories` dùng chung khuôn này; chỉ khác cột trỏ về đối tượng chính của module.

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `<đối tượng>_id` | uuid | ✔ | | **không** FK (cố ý — lịch sử còn lại sau khi dòng gốc bị xóa); index (`<đối tượng>_id`, `created_at desc`) | Đối tượng bị thay đổi |
| `label` | text | ✔ | | | Tên đối tượng lúc thay đổi để hiển thị, ví dụ serial `SN-001`, `display_name` của dòng cấu hình, `username` — vẫn đọc được sau khi đối tượng bị xóa |
| `action` | text | ✔ | | danh sách cố định theo từng bảng | Hành động |
| `changes` | jsonb | ✔ | `{}` | | Giá trị cũ → mới: `{ trường: { old, new } }`. Trường FK lưu `display_name` tại thời điểm đó. Với `DELETE`: chụp lại toàn bộ dòng trước khi xóa |
| `note` | text | | | | Ghi chú, ví dụ "xóa theo cha SN-001" |
| `source` | text | ✔ | `ui` | `ui` / `import` / `script` | Nguồn thay đổi |
| `created_at` | timestamptz | ✔ | now() | index (`created_at desc`) | Thời điểm thay đổi |
| `created_by` | uuid | | | FK `user_profiles` | Người thay đổi |

Quy tắc:
- **Database tự ghi lịch sử** bằng trigger trên mỗi bảng chính, trong cùng giao dịch với thay đổi. Server không tự thêm dòng lịch sử.
- Mọi thêm / sửa / xóa đi qua hàm `app_write` (kèm người thao tác, ghi chú, nguồn), hoặc các hàm thao tác riêng của Equipment (Đổi vị trí, Move, Swap, Detach, Xóa, Import Excel). Chi tiết ở `database/04_functions.sql`.
- Sửa mà không đổi giá trị nào thì không ghi lịch sử.
- `action` được nhận ra từ các trường thay đổi, ví dụ chỉ đổi vị trí → `CHANGE_LOCATION`, đổi `calibration_date` → `CALIBRATE`, `account_status` từ `pending` sang `active` → `APPROVE`.
- `note` do hệ thống đặt: `via_parent:<serial>` (thay đổi theo thiết bị cha: đổi vị trí, xóa cả cây), `swap_with:<serial>` (Swap), `stayed:<serial>` (con ở lại chỗ cũ khi thiết bị cha được chuyển / tách / đổi vị trí), `stayed_swap:<serial>` (con ở lại khi thiết bị cha đổi chỗ), `parent_deleted:<serial>` (thiết bị cha bị xóa, con được giữ). Màn hình dịch sang chữ dễ đọc.
- Không bao giờ ghi vào `changes`: `password_hash`, `token_version`, `sessions_revoked_at`.
- Chỉ thêm, không sửa / xóa dòng lịch sử (database chặn: `HISTORY_IS_APPEND_ONLY`).

---

## 1. Dashboard

Không có bảng riêng — chỉ đọc từ các module.

| Khối trên Dashboard | Đọc từ | Ai thấy |
| --- | --- | --- |
| Số lượng theo trạng thái — Equipment, Calibration, Golden, mỗi trạng thái tô bằng `statuses.color` | `equipments`, `calibration_equipments`, `golden_samples`, `statuses` | Mọi nhóm |
| Số lượng thiết bị theo vị trí / loại | `equipments` | Mọi nhóm |
| Thiết bị quá hạn / sắp đến hạn hiệu chuẩn | `calibration_equipments` (`due_date` so với hôm nay và `warning_days`) | Mọi nhóm |
| **Thay đổi gần đây** | view `recent_activities` | Mọi nhóm; dòng của Configuration và User Management chỉ Admin thấy |

### View `recent_activities` — thay đổi gần đây (tính khi đọc, không lưu)

Gộp các bảng lịch sử thành một danh sách, mới nhất lên đầu. Không chứa dữ liệu riêng.

| Trường | Nguồn | Ý nghĩa |
| --- | --- | --- |
| `module` | tên bảng lịch sử | `equipment` / `calibration` / `golden_sample` / `configuration` / `user` |
| `object_id` | `<đối tượng>_id` | Đối tượng bị thay đổi — bấm để mở chi tiết (nếu chưa bị xóa) |
| `label` | `label` | Tên đối tượng, ví dụ `SN-001` |
| `action` | `action` | Hành động, ví dụ `UPDATE`, `CHANGE_LOCATION`, `CALIBRATE` |
| `changes` | `changes` | Giá trị cũ → mới, ví dụ Location `B3F1` → `B3F2` |
| `created_by` | `created_by` | Người thay đổi |
| `created_at` | `created_at` | Thời điểm |

Nguồn: `equipment_histories`, `calibration_histories`, `golden_sample_histories`, `configuration_histories`, `user_histories`.

Trên Dashboard: mặc định hiện 50 thay đổi mới nhất; lọc được theo module, người thay đổi, khoảng thời gian.

---

## 2. Equipment

### `equipments` — thiết bị

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | Mã bất biến; dùng trong link QR `/equipment/{id}` |
| `jabil_id` | text | | | | Mã nội bộ Jabil, ví dụ P12316 |
| `part_number_id` | uuid | | | FK `part_numbers`; index | Mã part |
| `serial_number` | text | ✔ | | index; **không** UQ — trùng chỉ cảnh báo | Số serial in trên thiết bị |
| `asset` | text | | | index | Mã tài sản kiểm kê |
| `type_id` | uuid | | | FK `types`; index | Loại thiết bị |
| `status_id` | uuid | | | FK `statuses` (`on delete restrict`); chỉ chọn trạng thái có `equipment`; index | Trạng thái vận hành |
| `level_id` | uuid | | | FK `levels` | Level trên dây chuyền |
| `location_id` | uuid | ✔ | | FK `locations`; index | Vị trí hiện tại; có cha thì tự theo vị trí của cha |
| `remark` | text | | | form giới hạn 1000 ký tự | Ghi chú; bắt buộc khi trạng thái có `requires_remark` |
| `parent_id` | uuid | | | FK `equipments` (`on delete cascade` — xóa cha thì xóa cả cây con); check `id <> parent_id`; index | Thiết bị cha; đặt khi thêm (form, import Excel), đổi trong form Sửa hoặc qua Move / Swap / Detach |
| `created_at` | timestamptz | ✔ | now() | | |
| `created_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |

Quy tắc nghiệp vụ:
- Thiết bị con luôn cùng vị trí với thiết bị cha.
- Thao tác cây trên thiết bị **có con** — Đổi vị trí, Gắn vào / Đổi cha (Move), Tách khỏi cha (Detach), Swap, Xóa, và đổi cha / vị trí trong form Sửa — bắt buộc người dùng chọn cách xử lý thiết bị con (`p_children` của các hàm trong `04_functions.sql`, mặc định `follow`):
  - **Đi theo** (`follow`): cả nhánh con đi cùng thiết bị (Xóa: xóa cả nhánh).
  - **Ở lại chỗ cũ** (`stay`): con trực tiếp giữ nguyên vị trí và gắn vào thiết bị **đến thay** (Swap: con của A → B, con của B → A) hoặc thiết bị **cha cũ** (Move / Detach / Xóa); không có cha cũ, hoặc Đổi vị trí, thì con đứng riêng. Cháu luôn đi cùng con của nó.
- Swap: không swap với cha / con của chính nó; chặn swap không thay đổi gì (cùng cha, cùng vị trí, trừ khi chọn con ở lại — khi đó hai bên đổi con cho nhau).
- Lịch sử thiết bị bị xóa cùng cây ghi đúng serial của thiết bị cha (lấy từ lịch sử khi cha đã bị xóa).
- Serial trùng chỉ cảnh báo, không chặn.

Trường trên form thiết bị (theo thứ tự): Serial Number ✔, Part Number, Jabil ID, Asset, Type, Level, Status, Thiết bị cha, Location ✔ (trừ khi có cha), Remark. Có cha thì `location_id` = vị trí của cha (server tự đặt, bỏ qua giá trị gửi lên). Sửa `parent_id` trong form: cha mới → server gọi `equipment_move` (lịch sử `MOVE`), bỏ trống → `equipment_detach` (`DETACH`); server kiểm tra cha tồn tại và không nằm trong cây con trước khi ghi. Thiết bị có con mà đổi cha / vị trí: form hỏi thêm `children_mode` (đi theo / ở lại), truyền xuống `p_children`. Import Excel: cột Parent serial number + Parent part number (tìm cha trong hệ thống hoặc trong cùng file); hàm `equipment_import` nhận sẵn `id` + `parent_id` của từng dòng do server đặt.

### `equipment_histories` — lịch sử thiết bị

Theo [khuôn bảng lịch sử](#khuôn-bảng-lịch-sử), cột trỏ về là `equipment_id`.

| `action` | Khi nào |
| --- | --- |
| `CREATE` | Tạo thiết bị (form hoặc import) |
| `UPDATE` | Sửa thông tin |
| `CHANGE_LOCATION` | Đổi vị trí (ghi cho thiết bị được đổi và từng thiết bị con đi theo) |
| `MOVE` | Đổi cha |
| `SWAP` | Đổi chỗ với thiết bị khác |
| `DETACH` | Tách khỏi cha |
| `DELETE` | Xóa (ghi cho **từng** thiết bị trong cây khi xóa cha) |

Tab History của thiết bị đọc bảng này. Thiết bị đã xóa: tra cứu lịch sử theo serial (đọc `changes` của dòng `DELETE`).

---

## 3. Calibration

| Trang | Làm gì | Bảng |
| --- | --- | --- |
| Calibration (Dashboard hiệu chuẩn) | Setup: chỉ chọn thiết bị — chu kỳ tự lấy theo part number. Theo dõi: mỗi thiết bị một dòng; mỗi lần hiệu chuẩn, user cập nhật ngày / trạng thái / vendor / ghi chú ngay trên dòng đó | `calibration_equipments` |

Chu kỳ và vendor cấu hình ở [Configuration](#5-configuration). Trạng thái dùng `statuses` chung. Lần hiệu chuẩn trước không mất: mỗi lần cập nhật ghi giá trị cũ → mới vào `calibration_histories`. Xóa thiết bị thì dòng hiệu chuẩn xóa theo; lịch sử vẫn còn.

### `calibration_equipments` — Dashboard hiệu chuẩn

Mỗi thiết bị cần hiệu chuẩn là một dòng, luôn giữ trạng thái **hiện tại**. Bỏ khỏi Dashboard = xóa dòng — chỉ Admin. User không xóa: nhập sai thì sửa lại, thiết bị tạm không hiệu chuẩn thì đổi `status_id` (ví dụ Inactive).

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ai nhập | Ý nghĩa |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | | |
| `equipment_id` | uuid | ✔ | | FK `equipments.id` (`on delete cascade`); **UQ** | Setup | `id` của thiết bị trong `equipments`; mỗi thiết bị tối đa một dòng |
| `status_id` | uuid | | | FK `statuses` (`on delete restrict`); chỉ chọn trạng thái có `calibration` | User | Trạng thái hiệu chuẩn hiện tại |
| `vendor_id` | uuid | | | FK `calibration_vendors` | User | Vendor thực hiện lần hiệu chuẩn gần nhất |
| `calibration_date` | date | | | | User | Ngày hiệu chuẩn gần nhất; trống = chưa hiệu chuẩn |
| `due_date` | date | | | check ≥ `calibration_date`; index | **Tự tính** | `calibration_date` + `interval_months` của part number thiết bị; tính lại khi `calibration_date` đổi, admin đổi chu kỳ, hoặc thiết bị đổi part number |
| `remark` | text | | | | User | Ghi chú; bắt buộc khi trạng thái có `requires_remark` |
| `created_by` | uuid | | | FK `user_profiles` | | |
| `created_at` | timestamptz | ✔ | now() | | | |
| `updated_by` | uuid | | | FK `user_profiles` | | |
| `updated_at` | timestamptz | ✔ | now() | | | |

- Hiển thị (đọc qua `equipment_id`, không lưu lại): Serial, Part Number, Type, chu kỳ.
- Thêm thiết bị: thiết bị phải có part number, và part number đó phải có chu kỳ — nếu chưa có thì báo lỗi "part number chưa có chu kỳ hiệu chuẩn".
- Thiết bị đã ở Dashboard mà sau đó đổi sang part number chưa có chu kỳ: dòng vẫn giữ, `due_date` để trống và hiện cảnh báo "chưa có chu kỳ" cho tới khi admin đặt chu kỳ.
- Quá hạn / sắp đến hạn không lưu trong database và **không** gửi thông báo: tô màu cột `due_date` (đỏ = quá hạn, vàng = còn ≤ `warning_days` ngày) và liệt kê trên Dashboard chính.

### `calibration_histories` — lịch sử hiệu chuẩn

Theo [khuôn bảng lịch sử](#khuôn-bảng-lịch-sử), cột trỏ về là `equipment_id`.

| `action` | Khi nào | `changes` lưu |
| --- | --- | --- |
| `ADD` | Đưa thiết bị vào Dashboard | `equipment_id`, part number, `interval_months` lúc thêm |
| `REMOVE` | Bỏ khỏi Dashboard (kể cả khi thiết bị bị xóa) | Toàn bộ dòng trước khi xóa |
| `UPDATE` | Sửa vendor, trạng thái, ghi chú (không phải lần hiệu chuẩn mới); `due_date` đổi do đổi chu kỳ / part number | Trường đổi: cũ → mới |
| `CALIBRATE` | Nhập lần hiệu chuẩn mới (đổi `calibration_date`) | `calibration_date`, `due_date`, `status`, `vendor`, `remark`: cũ → mới |

Xem lại các lần hiệu chuẩn của một thiết bị = lọc `action = 'CALIBRATE'` theo `equipment_id`.

---

## 4. Golden sample

Golden sample = PCBA tốt đã biết kết quả, dùng trên line để kiểm tra tester / thiết bị.

| Trang | Làm gì | Bảng |
| --- | --- | --- |
| Golden | Danh sách golden sample: thêm / sửa / xóa, đổi vị trí | `golden_samples` |

Xóa golden sample là xóa thật; lịch sử vẫn còn trong `golden_sample_histories`.

### `golden_samples` — golden sample

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `part_number` | text | ✔ | | index; gõ tự do | Part number của PCBA |
| `serial_number` | text | ✔ | | index; gõ tự do; **không** UQ — trùng chỉ cảnh báo | Số serial của PCBA |
| `location_id` | uuid | ✔ | | FK `locations.id`; index | Vị trí hiện tại |
| `status_id` | uuid | | | FK `statuses` (`on delete restrict`); chỉ chọn trạng thái có `golden_sample`; index | Trạng thái, ví dụ Active / Inactive — User đánh dấu hỏng / ngừng dùng bằng trạng thái thay vì xóa |
| `utd_part_number` | text | | | gõ tự do | UTD part number |
| `origin` | text | | | gõ tự do | Nguồn gốc |
| `purpose` | text | | | gõ tự do | Mục đích sử dụng |
| `remark` | text | | | form giới hạn 1000 ký tự | Ghi chú; bắt buộc khi trạng thái có `requires_remark` |
| `created_by` | uuid | | | FK `user_profiles` | |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

### `golden_sample_histories` — lịch sử golden sample

Theo [khuôn bảng lịch sử](#khuôn-bảng-lịch-sử), cột trỏ về là `golden_sample_id`.

| `action` | Khi nào |
| --- | --- |
| `CREATE` | Thêm golden sample |
| `UPDATE` | Sửa thông tin |
| `CHANGE_LOCATION` | Đổi vị trí |
| `DELETE` | Xóa (chụp lại toàn bộ dòng trước khi xóa) |

---

## 5. Configuration

Mọi trang cấu hình nằm ở menu **Configuration**, chỉ **Admin** vào được. Form ở các module chỉ chọn từ các danh sách này, không gõ tự do.

| Trang | Bảng | Được dùng bởi |
| --- | --- | --- |
| Configuration › Part Number | `part_numbers` | `equipments`, `calibration_configurations` |
| Configuration › Location | `locations` | `equipments`, `golden_samples` |
| Configuration › Type | `types` | `equipments` |
| Configuration › Status | `statuses` | `equipments`, `calibration_equipments`, `golden_samples` |
| Configuration › Level | `levels` | `equipments` |
| Configuration › Department | `departments` | `user_profiles` |
| Configuration › Calibration Interval | `calibration_configurations` | `calibration_equipments` |
| Configuration › Calibration Vendor | `calibration_vendors` | `calibration_equipments` |

Quy tắc:
- **Xóa** = ẩn (`is_active = false`): dòng đang dùng giữ nguyên, nhưng không chọn được cho dữ liệu mới. Riêng `statuses` và `calibration_configurations` xóa thật, bị chặn khi đang được dùng.
- `display_name` không được trùng trong cùng bảng.
- Import Excel: tìm theo `display_name` (không phân biệt hoa/thường). Giá trị chưa có (hoặc đã ẩn) → báo lỗi dòng đó là "chưa có", không tự tạo mới.

### `part_numbers` — mã part

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `display_name` | text | ✔ | | UQ (không phân biệt hoa/thường) | Mã part |
| `sort_order` | integer | ✔ | `0` | index (`sort_order`, `display_name`) | Thứ tự hiển thị |
| `is_active` | boolean | ✔ | `true` | | `false` = ngừng dùng cho dữ liệu mới |
| `created_by` | uuid | | | FK `user_profiles` | |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

### `locations` — vị trí

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `display_name` | text | ✔ | | UQ (không phân biệt hoa/thường) | Tên vị trí, ví dụ `B3F1` hoặc `Building 3 - Floor 1` — admin đặt sao hiển thị vậy |
| `sort_order` | integer | ✔ | `0` | index (`sort_order`, `display_name`) | Thứ tự hiển thị và sắp xếp mặc định của danh sách |
| `is_active` | boolean | ✔ | `true` | | `false` = ngừng dùng cho dữ liệu mới |
| `created_by` | uuid | | | FK `user_profiles` | |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

### `types` — loại

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `display_name` | text | ✔ | | UQ (không phân biệt hoa/thường) | Tên loại |
| `description` | text | | | | Mô tả |
| `sort_order` | integer | ✔ | `0` | index (`sort_order`, `display_name`) | Thứ tự hiển thị |
| `is_active` | boolean | ✔ | `true` | | |
| `created_by` | uuid | | | FK `user_profiles` | |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

Dữ liệu mẫu: Tester, Base, Fixture, Equipment. *Bàn sau:* icon theo loại trên UI.

### `statuses` — trạng thái

Admin tạo mọi trạng thái ở một chỗ và chọn trạng thái nào **dùng cho trang nào**. Mỗi trang chỉ được chọn trạng thái có tên trang đó trong `applies_to`.

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `display_name` | text | ✔ | | UQ (không phân biệt hoa/thường) | Tên trạng thái |
| `sort_order` | integer | ✔ | `0` | index (`sort_order`, `display_name`) | Thứ tự hiển thị |
| `applies_to` | text[] | ✔ | | mỗi phần tử là `equipment` / `calibration` / `golden_sample`; ít nhất một phần tử | Trạng thái này dùng cho trang nào (admin tích chọn) |
| `requires_remark` | boolean | ✔ | `false` | | Chọn trạng thái này thì Remark thành bắt buộc (ở mọi trang dùng trạng thái này) |
| `color` | text | ✔ | `gray` | `green` / `yellow` / `red` / `blue` / `gray` | Màu hiển thị của trạng thái trên toàn hệ thống (tag, Dashboard). Admin bắt buộc chọn khi thêm |
| `created_by` | uuid | | | FK `user_profiles` | |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

Quy tắc:
- Form thiết bị chỉ hiện trạng thái có `equipment`; Dashboard hiệu chuẩn chỉ hiện trạng thái có `calibration`; form golden sample chỉ hiện trạng thái có `golden_sample`.
- Bỏ tích một trang khỏi `applies_to` bị chặn nếu trang đó đang có dòng dùng trạng thái này.
- `color` chỉ là một trong 5 màu hệ thống bên dưới, không nhập mã màu tự do. Database lưu tên màu; mã màu sáng / tối nằm ở giao diện (docs/JABIL_UI.md), nên đổi sắc độ một màu thì mọi trạng thái dùng màu đó đổi theo.

5 màu hệ thống (đỏ, xanh lá, vàng là bắt buộc; thêm xanh dương và xám):

| `color` | Màu | Dùng cho | Ví dụ |
| --- | --- | --- | --- |
| `green` | Xanh lá | Bình thường, đạt, đang chạy | Active, Pass |
| `yellow` | Vàng | Cần chú ý, đang xử lý | Repair |
| `red` | Đỏ | Lỗi, không đạt, phải xử lý ngay | Fail |
| `blue` | Xanh dương | Đang chờ, thông tin, chưa bắt đầu | Wait Registration |
| `gray` | Xám | Ngừng dùng, trung tính | Inactive |

Dữ liệu mẫu (admin tự tạo):

| `display_name` | `applies_to` | `color` |
| --- | --- | --- |
| Active | equipment, calibration, golden_sample | green |
| Inactive | equipment, calibration, golden_sample | gray |
| Repair (bắt buộc remark) | equipment | yellow |
| Wait Registration | equipment | blue |
| Pass | calibration | green |
| Fail | calibration | red |

### `levels` — level trên dây chuyền

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `display_name` | text | ✔ | | UQ (không phân biệt hoa/thường) | Tên level |
| `sort_order` | integer | ✔ | `0` | index (`sort_order`, `display_name`) | Thứ tự hiển thị |
| `is_active` | boolean | ✔ | `true` | | |
| `created_by` | uuid | | | FK `user_profiles` | |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

Dữ liệu mẫu: Unified, EOL, Final Test, Programming, Function Test.

### `departments` — phòng ban

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `display_name` | text | ✔ | | UQ (không phân biệt hoa/thường) | Tên phòng ban |
| `sort_order` | integer | ✔ | `0` | index (`sort_order`, `display_name`) | Thứ tự hiển thị |
| `is_active` | boolean | ✔ | `true` | | `false` = không chọn được cho tài khoản mới |
| `created_by` | uuid | | | FK `user_profiles` | |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

### `calibration_configurations` — chu kỳ hiệu chuẩn theo part number

Admin đặt một lần cho mỗi part number cần hiệu chuẩn. Mọi thiết bị cùng part number dùng chung chu kỳ và số ngày cảnh báo.

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `part_number_id` | uuid | ✔ | | FK `part_numbers.id` (`on delete restrict`); **UQ** | Part number cần hiệu chuẩn; mỗi part number tối đa một dòng |
| `interval_months` | integer | ✔ | | > 0 | Bao lâu hiệu chuẩn lại (tháng); dùng để tự tính `due_date` |
| `warning_days` | integer | ✔ | `30` | > 0 | Còn ≤ `warning_days` ngày đến `due_date` thì thiết bị vào danh sách "sắp đến hạn" trên Dashboard và tô vàng |
| `created_by` | uuid | | | FK `user_profiles` | |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

Quy tắc:
- Admin sửa / xóa thật. Part number đang có thiết bị trên Dashboard hiệu chuẩn thì không xóa được.
- Đổi `interval_months` → `due_date` của mọi thiết bị cùng part number được tính lại.

### `calibration_vendors` — vendor hiệu chuẩn

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `display_name` | text | ✔ | | UQ (không phân biệt hoa/thường) | Tên công ty |
| `sort_order` | integer | ✔ | `0` | index (`sort_order`, `display_name`) | Thứ tự hiển thị |
| `is_active` | boolean | ✔ | `true` | | `false` = không chọn được cho lần hiệu chuẩn mới |
| `created_by` | uuid | | | FK `user_profiles` | |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

Hiệu chuẩn nội bộ: admin tạo một vendor tên ví dụ "Internal".

### `configuration_histories` — lịch sử Configuration

Theo [khuôn bảng lịch sử](#khuôn-bảng-lịch-sử), cột trỏ về là `record_id`, thêm `table_name` (text ✔, ví dụ `locations`) để biết dòng thuộc bảng nào. Một bảng lịch sử cho cả 8 bảng cấu hình.

| `action` | Khi nào |
| --- | --- |
| `CREATE` | Thêm dòng |
| `UPDATE` | Sửa dòng (kể cả ẩn / hiện lại qua `is_active`) |
| `DELETE` | Xóa thật (chỉ `statuses`, `calibration_configurations`) |

---

## 6. User Management

| Trang | Làm gì | Bảng |
| --- | --- | --- |
| User Management (chỉ Admin) | Duyệt / từ chối tài khoản đăng ký; tạo / sửa / khóa tài khoản; chọn nhóm quyền; đặt lại mật khẩu | `user_profiles` |

Luồng đăng ký: người dùng tự đăng ký → tài khoản ở trạng thái `pending`, chưa đăng nhập được → mỗi admin nhận một thông báo `USER_APPROVAL_REQUEST` → admin duyệt (`active`, chọn nhóm quyền lúc duyệt) hoặc từ chối (`rejected`).

Tài khoản **không xóa**, chỉ khóa (`disabled`): mọi bảng đều lưu `created_by` / `updated_by` trỏ về tài khoản, xóa sẽ mất dấu người đã thao tác.

### `user_profiles` — tài khoản

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | Với tài khoản Supabase: trùng id của Supabase Auth |
| `username` | text | ✔ | | UQ; chữ thường, 1–64 ký tự `a-z 0-9 . _ + -`, bắt đầu bằng chữ / số | Tên đăng nhập |
| `full_name` | text | ✔ | | | Họ tên |
| `email` | text | | | UQ (không phân biệt hoa/thường) khi có | Email |
| `employee_id` | text | | | | Mã nhân viên |
| `department_id` | uuid | | | FK `departments` | Phòng ban |
| `role` | text | ✔ | `readonly` | `admin` / `user` / `readonly` | Nhóm quyền — xem [Phân quyền theo nhóm](#phân-quyền-theo-nhóm) |
| `account_status` | text | ✔ | `pending` | `pending` / `active` / `rejected` / `disabled` | Chỉ `active` mới đăng nhập được |
| `approved_by` | uuid | | | FK `user_profiles` | Admin đã duyệt / từ chối |
| `approved_at` | timestamptz | | | | Thời điểm duyệt / từ chối |
| `auth_provider` | text | ✔ | `supabase` | `supabase` / `local` | Đăng nhập bằng Supabase Auth hay tài khoản tự đăng ký |
| `password_hash` | text | | | bắt buộc khi `local`, phải rỗng khi `supabase` | Mật khẩu đã băm (scrypt) cho tài khoản `local` |
| `must_change_password` | boolean | ✔ | `true` | | Bắt đổi mật khẩu ở lần đăng nhập tới |
| `token_version` | integer | ✔ | `1` | | `local`: tăng khi đổi mật khẩu → đăng xuất mọi phiên |
| `sessions_revoked_at` | timestamptz | | | | `supabase`: phiên đăng nhập trước thời điểm này bị từ chối |
| `created_by` | uuid | | | FK `user_profiles` | Trống = tự đăng ký |
| `created_at` | timestamptz | ✔ | now() | | |
| `updated_by` | uuid | | | FK `user_profiles` | |
| `updated_at` | timestamptz | ✔ | now() | | |

Tài khoản do admin tạo: `account_status = active` ngay, không cần duyệt; loại `local` (username + mật khẩu ban đầu do admin đặt); `must_change_password = true` — phải đổi ở lần đăng nhập đầu.

Admin đầu tiên tạo bằng `scripts/seed-first-admin.ts`: tài khoản `supabase` (email + mật khẩu), lịch sử ghi `CREATE` với `source = script`.

Người dùng tự đổi mật khẩu của mình không ghi lịch sử; admin đặt lại mật khẩu ghi `PASSWORD_RESET`.

### `user_histories` — lịch sử tài khoản

Theo [khuôn bảng lịch sử](#khuôn-bảng-lịch-sử), cột trỏ về là `user_id`.

| `action` | Khi nào |
| --- | --- |
| `REGISTER` | Người dùng tự đăng ký |
| `CREATE` | Admin tạo tài khoản |
| `APPROVE` / `REJECT` | Admin duyệt / từ chối tài khoản đăng ký |
| `UPDATE` | Sửa thông tin (họ tên, email, phòng ban…) |
| `ROLE_CHANGE` | Đổi nhóm quyền |
| `DISABLE` / `ENABLE` | Khóa / mở khóa tài khoản |
| `PASSWORD_RESET` | Admin đặt lại mật khẩu |

---

## 7. Bảng hệ thống

### `notifications` — thông báo

Thông báo gửi tới từng người. Quá hạn / sắp đến hạn hiệu chuẩn **không** đi qua đây — chúng được liệt kê trên Dashboard.

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `recipient_id` | uuid | ✔ | | FK `user_profiles` (`on delete cascade`); index (`recipient_id`, `read_at`, `created_at desc`) | Người nhận |
| `type` | text | ✔ | | danh sách cố định (bảng dưới) | Loại thông báo |
| `title` | text | ✔ | | | Tiêu đề hiển thị |
| `message` | text | | | | Nội dung |
| `link` | text | | | | Đường dẫn mở khi bấm vào, ví dụ trang User Management |
| `entity_id` | uuid | | | không FK | Đối tượng liên quan, ví dụ tài khoản đang chờ duyệt |
| `read_at` | timestamptz | | | | Trống = chưa đọc |
| `created_by` | uuid | | | FK `user_profiles` | Người gây ra thông báo (trống = hệ thống) |
| `created_at` | timestamptz | ✔ | now() | | |

| `type` | Gửi cho | Khi nào |
| --- | --- | --- |
| `USER_APPROVAL_REQUEST` | Mọi admin | Có người đăng ký tài khoản mới (`pending`) |
| `USER_APPROVED` | Người đăng ký | Admin duyệt tài khoản — thấy ở lần đăng nhập đầu tiên |
| `USER_ROLE_CHANGED` | Người bị đổi | Admin đổi nhóm quyền (Admin / User / Readonly) |
| `USER_PASSWORD_RESET` | Người bị đặt lại | Admin đặt lại mật khẩu — phải đổi mật khẩu ở lần đăng nhập tới |
| `USER_PROFILE_UPDATED` | Người bị sửa | Admin sửa thông tin tài khoản (họ tên, email, phòng ban…) |

Khi một admin đã xử lý yêu cầu, thông báo của các admin còn lại vẫn giữ nhưng hiện "đã xử lý" (đọc `account_status` qua `entity_id`).

Thông báo chỉ dùng cho việc liên quan đến tài khoản. Thay đổi dữ liệu xem ở khối "Thay đổi gần đây" trên Dashboard.

### `error_log` — nhật ký lỗi

| Trường | Kiểu | ✔ | Mặc định | Ràng buộc / liên kết | Ý nghĩa |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ✔ | tự sinh | PK | |
| `request_id` | text | ✔ | | index | Mã lỗi người dùng đọc trên màn hình báo lỗi |
| `route` | text | | | | API bị lỗi, ví dụ `POST /api/equipment` |
| `user_id` | uuid | | | không FK | Người gặp lỗi |
| `error_code` | text | | | | Mã lỗi |
| `message` | text | | | tối đa 2000 ký tự | Nội dung lỗi |
| `stack` | text | | | tối đa 8000 ký tự | Stack trace |
| `created_at` | timestamptz | ✔ | now() | | |

Tự xóa bản ghi cũ hơn 90 ngày. Admin xem ở trang lỗi hệ thống.
