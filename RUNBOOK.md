# RUNBOOK

Quy trình xử lý sự cố. Spec v0.9 mục 55.6.

**Bus factor hiện tại = 1.** File này tồn tại để khi người viết code nghỉ phép, người khác vẫn xử lý được. Mỗi mục có SQL copy-paste được ngay.

Chạy SQL ở: Supabase Dashboard → SQL Editor (chọn đúng **production**, không phải dev).

---

## 1. Cấp lại mật khẩu cho người dùng

Dùng giao diện: Quản trị → Người dùng → Cấp lại mật khẩu. Mật khẩu hiện **một lần**, gửi cho họ qua kênh nội bộ.

Nút này hoạt động cho **cả hai loại tài khoản** (cột "Account" trong bảng):
- **Supabase** — admin tự tạo (mục 27), đăng nhập bằng email thật qua Supabase Auth.
- **Local** — người dùng tự đăng ký ở trang đăng nhập ("Request an account"), username/password do app tự lưu và xác thực (`lib/auth/password.ts`), không có email, không có tài khoản Supabase Auth nào đứng sau.

Hệ thống không gửi email — đó là quyết định có chủ đích (mục 27), không phải thiếu sót.

Nếu giao diện hỏng và cần sửa tay: tài khoản **Supabase** đổi mật khẩu bằng `auth.users.encrypted_password` (xem mục 1a). Tài khoản **Local** thì KHÔNG có gì trong `auth.users` — sửa trực tiếp `user_profiles.password_hash`:

```sql
-- chỉ dùng cho tài khoản auth_provider = 'local'
select username, auth_provider from public.user_profiles where username = 'ten_dang_nhap';
```

Việc tự tay băm mật khẩu scrypt đúng định dạng app cần (`scrypt:<saltHex>:<hashHex>`) không làm được bằng SQL thường — trường hợp này ưu tiên sửa qua giao diện; chỉ nhờ người viết code nếu giao diện thật sự không dùng được.

---

## 1a. Đặt lại mật khẩu tài khoản Supabase bằng tay (khi giao diện không dùng được)

```sql
update auth.users
set encrypted_password = crypt('MatKhauMoi123', gen_salt('bf'))
where email = 'nguoi@congty.com';
```

Chỉ áp dụng cho tài khoản **Supabase** (admin). Không có tác dụng với tài khoản **Local**.

---

## 1b. Duyệt yêu cầu tài khoản mới (self-service signup)

Ai cũng vào được trang đăng nhập và bấm "Request an account" để tự tạo tài khoản **Local**. Tài khoản này luôn tạo ra ở trạng thái **is_active = false** và quyền **Viewer / read-only** — không đăng nhập được, không sửa được gì cho tới khi Admin duyệt.

Duyệt: Quản trị → Người dùng, tìm dòng có nhãn **"Local · pending"**, bấm **Reactivate** — đúng nút dùng để kích hoạt lại người bị vô hiệu hoá, không có hàng đợi riêng. Sau khi duyệt, đổi Role/Preset nếu cần (mặc định chỉ xem được).

---

## 2. Vô hiệu hoá / bật lại tài khoản

Giao diện: Quản trị → Người dùng. Người bị vô hiệu hoá không thao tác được ngay cả khi phiên đăng nhập cũ còn hạn.

Nếu giao diện hỏng:

```sql
update user_profiles set is_active = false where email = 'nguoi@congty.com';
```

Không bao giờ xoá dòng trong `user_profiles` — nó còn được tham chiếu bởi `created_by`, `updated_by`, `changed_by` trong lịch sử.

---

## 3. Khôi phục thiết bị đã archive khi giao diện không cho

Nguyên nhân thường gặp: thiết bị cha của nó cũng đang archive. Khôi phục cha trước, con sau.

Nếu cần làm tay:

```sql
-- xem thiết bị cha có đang archive không
select e.serial_number, e.archived_at,
       p.serial_number as cha, p.archived_at as cha_archived_at
  from equipment e left join equipment p on p.id = e.parent_id
 where e.serial_number = 'SERIAL_CAN_KHOI_PHUC';

-- khôi phục (thay SERIAL)
select restore_equipment(
  (select id from equipment where serial_number = 'SERIAL'),
  (select version from equipment where serial_number = 'SERIAL'),
  (select id from user_profiles where role = 'admin' limit 1),
  'runbook-restore');
```

Dùng RPC chứ đừng `update` tay: RPC ghi lịch sử và kiểm tra ràng buộc.

---

## 4. Sửa một lần đổi thiết bị cha bị nhầm

Không có "undo". Cách đúng là đổi ngược lại — vẫn ghi lịch sử đầy đủ.

```sql
-- tìm lại thiết bị cha cũ trong lịch sử
select changes -> 'parent_id' ->> 'old' as cha_cu, created_at, request_id
  from audit_log
 where entity_type = 'equipment'
   and entity_id = (select id from equipment where serial_number = 'SERIAL')
   and action in ('MOVE','SWAP','DETACH')
 order by created_at desc limit 5;
```

Rồi dùng giao diện để đổi cha về lại. Nếu cha cũ là `null` thì dùng Tách khỏi cha.

---

## 5. Thêm hoặc sửa vị trí

Giao diện: Quản trị → Vị trí. `sort_order` quyết định thứ tự hiển thị mặc định của toàn bộ danh sách thiết bị.

Vị trí đang được dùng **không xoá được**, chỉ tắt (`is_active = false`). Thiết bị cũ vẫn hiển thị đúng vị trí đó.

---

## 6. Tra cứu lỗi người dùng báo lại

Người dùng đọc cho bạn **mã yêu cầu** hiện trong thông báo lỗi.

```sql
select * from error_log where request_id = 'req_xxxxx';

-- thao tác nào đã chạy trong cùng yêu cầu đó
select action, entity_id, changes, created_at
  from audit_log where request_id = 'req_xxxxx' order by created_at;
```

Log của Vercel chỉ giữ khoảng 1 giờ, nên đây là nguồn duy nhất tra được lỗi của hôm qua.

Xem nhanh 50 lỗi gần nhất: Quản trị → Nhật ký lỗi.

---

## 7. Khôi phục từ bản sao lưu

Bản sao lưu nằm ở GitHub → Actions → `Daily database backup` → artifact của lần chạy.

```bash
gunzip -c eq-YYYY-MM-DD.sql.gz | psql "$SUPABASE_DB_URL"
```

**Phải khôi phục thử vào project dev ít nhất một lần trước khi mở pilot.** Bản sao lưu chưa thử khôi phục là bản sao lưu chưa tồn tại.

Nếu khôi phục vào project Supabase mới, chạy lại `003_rls_lockdown.sql` sau khi nạp dữ liệu — quyền của `service_role` không nằm trong bản dump.

---

## 8. Supabase project bị tạm dừng

Gói miễn phí tạm dừng project sau 1 tuần không hoạt động. **Không mất dữ liệu.**

Supabase Dashboard → project → nút Restore. Chờ vài phút.

Phòng ngừa: workflow `keepalive.yml` gọi `/api/health` hằng ngày. Lưu ý workflow theo lịch của GitHub tự tắt sau ~60 ngày repo không có hoạt động — nếu nghỉ dài, kiểm tra lại nó còn chạy không.

---

## 9. Xem hạn mức hằng tháng

Xem 1 lần/tháng. Cả bốn ngưỡng đều là tín hiệu **đi tối ưu**, không phải tín hiệu nâng gói.

| Chỉ số | Xem ở đâu | Ngưỡng | Nếu vượt |
|---|---|---|---|
| Vercel Active CPU | Vercel → Usage | 3 / 4 giờ | Tìm query N+1 hoặc thiếu index |
| Supabase DB size | Supabase → Reports | 300 / 500 MB | Kiểm tra `audit_log` có phình bất thường |
| Supabase egress | Supabase → Reports | 3 / 5 GB | Kiểm tra phân trang có bị bỏ qua ở đâu |
| Vercel invocations | Vercel → Usage | 500k / 1M | Kiểm tra frontend có polling thừa |

---

## 10. Chạy lại toàn bộ dữ liệu từ đầu

Chỉ làm trên **dev**. Trên production thì phải xuất dữ liệu ra trước.

```bash
npx tsx scripts/export-to-csv.ts > backup-$(date +%F).csv
```

Rồi chạy lại lần lượt `001` → `004` và `seed/001_seed.sql`, sau đó `scripts/migrate-from-excel.ts`.

Script nhập liệu là idempotent: chạy lại sẽ xoá sạch và nạp lại, không cộng dồn.

---

## Ba điều không được làm

**Không `update equipment` bằng tay để đổi `parent_id` hoặc `current_location_id`.** Sẽ bỏ qua cascade xuống thiết bị con, bỏ qua ghi lịch sử, và làm dữ liệu lệch nhau. Luôn dùng RPC hoặc giao diện.

**Không xoá dòng trong `audit_log`.** Bảng chỉ ghi thêm. Nếu cần dọn dung lượng thì xuất ra rồi mới xoá theo lô có ngày cụ thể, và ghi lại việc đó.

**Không gỡ khối `revoke`/`grant` ở cuối `004_functions.sql`.** Không có nó, bất kỳ ai có anon key — nằm công khai trong mã nguồn trang web — đều gọi thẳng được `archive_equipment` và bỏ qua toàn bộ tầng phân quyền.
