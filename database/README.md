# Database

Thiết kế: [docs/DATABASE_MODIFIED.md](../docs/DATABASE_MODIFIED.md). Thư mục này chứa các file SQL dựng database.

## Chạy theo thứ tự

Mở Supabase → **SQL Editor**, dán từng file vào rồi bấm **Run**:

| # | File | Làm gì | Bắt buộc |
| --- | --- | --- | --- |
| 1 | `01_reset_blank.sql` | Xóa sạch schema `public` (mọi bảng, view, function và **toàn bộ dữ liệu**). Không hoàn tác được. Kết quả kiểm tra cuối file phải ra 0 dòng | Có |
| 2 | `02_schema.sql` | Tạo 19 bảng theo DATABASE_MODIFIED.md, bật RLS. Kết quả kiểm tra cuối file phải ra 19 `BASE TABLE` | Có |
| 3 | `03_seed_sample.sql` | Dữ liệu mẫu cho Configuration: Type, Level, Status, vendor "Internal". Sửa trước khi chạy nếu cần | Không |
| 4 | `04_functions.sql` | Nghiệp vụ: tự ghi lịch sử, `app_write`, Đổi vị trí / Move / Swap / Detach / Xóa (thiết bị con đi theo hoặc ở lại chỗ cũ), Import Excel (Equipment, Golden), tự tính `due_date`, view `recent_activities` (Dashboard — import gộp một dòng). Kết quả kiểm tra cuối file: `history_triggers = 13`, `app_write = 1`, `equipment_import = 1`, `golden_import = 1`, `equipment_swap_args = 4`. Chạy lại được nhiều lần — file này đổi thì chạy lại (database đang có dữ liệu cũng không sao) | Có |
| 5 | Tạo admin đầu tiên | Xem [Tạo admin đầu tiên](#tạo-admin-đầu-tiên) (cần bước 4) | Có |

Tài khoản Supabase Auth đã có (email + mật khẩu) **không** bị xóa ở bước 1. Nếu Supabase project này chỉ dùng cho Equipment Management, bỏ comment dòng `delete from auth.users;` trong `01_reset_blank.sql` trước khi chạy.

App chỉ chạy được khi đã có đủ bước 1, 2, 4 và một admin.

## Tạo admin đầu tiên

Chưa có admin thì không ai duyệt được tài khoản. Chọn **một** trong ba cách.

**Cách A — script** (tài khoản Supabase, đăng nhập bằng username):

```
npm run seed:admin -- email@jabil.com "Họ Tên" ten.dang.nhap
```

- Tự đọc `.env.local` và tự dùng chứng chỉ của Windows (qua được proxy SSL của công ty).
- Email đã có trong Supabase Auth (tài khoản còn giữ sau bước 1): dùng lại tài khoản đó, đặt mật khẩu mới.
- Script in ra mật khẩu tạm một lần duy nhất — đăng nhập bằng **username** rồi đổi mật khẩu.

**Cách B — tự đăng ký rồi nâng quyền bằng SQL** (không cần chạy script):

1. Trang đăng nhập → *Yêu cầu tạo tài khoản* → điền thông tin. Username: chữ thường không dấu, số và `. _ + -`, ví dụ `man.tran`.
2. Trong SQL Editor, đổi `man.tran` thành username vừa đăng ký rồi chạy:

```sql
select public.app_write(
  'user_profiles', 'update', id,
  '{"account_status": "active", "role": "admin"}'::jsonb,
  null, null, 'bootstrap-first-admin', 'script')
from public.user_profiles
where username = 'man.tran';
```

3. Đăng nhập bằng username và mật khẩu đã đăng ký. Lịch sử tài khoản ghi `APPROVE` (nguồn `script`).

**Cách C — thêm thẳng trong database** (không cần script, không cần đăng ký):

1. Cần một tài khoản trong Supabase Auth:
   - Tài khoản đã có (bước 1 không xóa): xem danh sách bằng `select id, email, last_sign_in_at from auth.users;` — dùng được nếu còn nhớ mật khẩu.
   - Hoặc tạo mới: Supabase Dashboard → **Authentication → Users → Add user → Create new user**, nhập email + mật khẩu, tích **Auto Confirm User**.
2. Trong SQL Editor, đổi email / username / họ tên rồi chạy:

```sql
select public.app_write('user_profiles', 'insert', null,
  jsonb_build_object(
    'id', u.id,
    'username', 'man.tran',
    'full_name', 'Trần Văn Mân',
    'email', lower(u.email),
    'role', 'admin',
    'account_status', 'active',
    'auth_provider', 'supabase',
    'must_change_password', false),
  null, null, 'bootstrap-first-admin', 'script')
from auth.users u
where lower(u.email) = lower('email-cua-ban@jabil.com');
```

   Kết quả 1 dòng = đã tạo; 0 dòng = email không có trong Supabase Auth (không thay đổi gì).
3. Đăng nhập bằng **username** + mật khẩu của tài khoản Supabase đó. Lịch sử ghi `CREATE` (nguồn `script`).

## Nghiệp vụ trong database (`04_functions.sql`)

- **Lịch sử tự động**: mọi thêm / sửa / xóa trên bảng chính tự ghi vào `<module>_histories` trong cùng giao dịch, kèm người thao tác. Server không tự thêm dòng lịch sử.
- **`app_write`**: một cửa thêm / sửa / xóa cho server (bảng được phép ghi nằm trong danh sách cố định; không xóa được tài khoản).
- **Equipment**: `equipment_change_location`, `equipment_move`, `equipment_detach`, `equipment_swap`, `equipment_delete` — tham số `p_children`: `follow` (mặc định, cả cây con đi theo / bị xóa theo) hoặc `stay` (con ở lại chỗ cũ, gắn vào thiết bị đến thay hoặc cha cũ); chặn vòng lặp cha – con và swap không thay đổi gì (`SWAP_NO_CHANGE`).
- **Import Excel**: `equipment_import` / `golden_import` thêm mọi dòng của file trong **một** giao dịch (một dòng lỗi → không dòng nào được thêm); lịch sử `CREATE` với nguồn `import`. Server kiểm tra từng dòng trước khi gọi.
- **Calibration**: `due_date = calibration_date + interval_months`; tính lại khi đổi chu kỳ hoặc thiết bị đổi part number. Dashboard hiệu chuẩn tự đồng bộ: thiết bị có part number trong `calibration_configurations` luôn có một dòng (status ban đầu = `default_status_id`), không còn thì dòng bị bỏ.

## Database tự chặn sẵn (trong `02_schema.sql`)

- Thiết bị và golden sample bắt buộc có trạng thái (`status_id not null`); một danh sách trạng thái chung. Trạng thái trên trang Calibration là trạng thái của thiết bị.
- Xóa trạng thái đang được dùng → lỗi khóa ngoại (`STATUS_IN_USE`).
- Sửa hoặc xóa dòng trong bảng lịch sử → lỗi `HISTORY_IS_APPEND_ONLY`.
- Xóa trạng thái, hoặc part number đã có chu kỳ hiệu chuẩn, khi đang được dùng → lỗi khóa ngoại.
- Xóa thiết bị cha (khóa ngoại `on delete cascade`) thì cả cây con bị xóa theo, kèm dòng hiệu chuẩn của từng thiết bị — trừ khi `equipment_delete` được gọi với `p_children = 'stay'` (con được chuyển sang cha cũ trước khi xóa).
- `display_name` và `email` không được trùng, không phân biệt hoa/thường. Serial được phép trùng.
- `error_log` tự xóa bản ghi cũ hơn 90 ngày.
- `updated_at` tự cập nhật mỗi khi sửa dòng.
