# RUNBOOK

Quy trình xử lý sự cố.

**Bus factor hiện tại = 1.** File này tồn tại để khi người viết code nghỉ phép, người khác vẫn xử lý được. Ưu tiên làm trên giao diện; SQL chỉ dùng khi giao diện không vào được.

Chạy SQL ở: Supabase Dashboard → SQL Editor (chọn đúng **production**, không phải dev). Mọi lệnh sửa dữ liệu đi qua `public.app_write(...)` hoặc các RPC `equipment_*` để lịch sử vẫn được ghi — không `update` / `delete` thẳng vào bảng. Thiết kế database: [database/README.md](database/README.md).

Tài khoản có hai loại (cột `user_profiles.auth_provider`):

- **local** — tự đăng ký ở trang đăng nhập, hoặc Admin tạo trong User Management. Mật khẩu do app lưu (`user_profiles.password_hash`, scrypt — `lib/auth/password.ts`).
- **supabase** — admin đầu tiên tạo bằng `npm run seed:admin` (hoặc Cách C trong `database/README.md`). Mật khẩu nằm ở Supabase Auth (`auth.users`).

Hệ thống không gửi email — mật khẩu mới do Admin báo cho người dùng qua kênh nội bộ.

---

## 1. Đặt lại mật khẩu

Giao diện: **User Management** → mở tài khoản → **Thao tác ▾ → Đặt lại mật khẩu** → nhập mật khẩu mới (ít nhất 10 ký tự). Dùng được cho cả hai loại tài khoản. Người đó phải đổi mật khẩu ở lần đăng nhập tới, và mọi phiên đăng nhập cũ bị đăng xuất.

Admin không đặt lại mật khẩu của chính mình ở đây — tự đổi ở menu tài khoản (góc phải trên) → **Cài đặt tài khoản → Đổi mật khẩu**.

**Admin duy nhất quên mật khẩu** (không ai vào được User Management):

- Tài khoản **supabase**:

  ```sql
  update auth.users
  set encrypted_password = crypt('MatKhauMoi123', gen_salt('bf'))
  where email = 'nguoi@congty.com';
  ```

- Tài khoản **local**: mật khẩu scrypt không đặt được bằng SQL. Tạo một admin mới theo `database/README.md` → *Tạo admin đầu tiên* (Cách A hoặc C), đăng nhập bằng admin mới rồi đặt lại mật khẩu cho tài khoản cũ trên giao diện.

---

## 2. Duyệt tài khoản mới

Ai cũng tự đăng ký được ở trang đăng nhập (**Đăng ký**). Tài khoản mới ở trạng thái `pending`, nhóm quyền `readonly`, chưa đăng nhập được. Mọi Admin nhận tin ở chuông **Thông báo**.

Duyệt: **User Management** → lọc nhanh **Chờ duyệt (n)** → mở tài khoản → **Duyệt** (chọn nhóm quyền Admin / User / Readonly) hoặc **Từ chối**.

Admin cũng tạo tài khoản trực tiếp được: **User Management → Thêm tài khoản** (tài khoản local, người dùng phải đổi mật khẩu ở lần đăng nhập đầu).

Khi giao diện không vào được (đổi `man.tran` thành username cần duyệt):

```sql
select public.app_write('user_profiles', 'update', id,
  '{"account_status": "active", "role": "readonly"}'::jsonb,
  null, null, 'runbook', 'script')
from public.user_profiles
where username = 'man.tran' and account_status = 'pending';
```

---

## 3. Khóa / mở khóa tài khoản

Giao diện: **User Management** → mở tài khoản → **Thao tác ▾ → Khóa tài khoản** (mở lại: **Mở khóa tài khoản**). Có hiệu lực ngay ở thao tác kế tiếp, kể cả khi phiên đăng nhập cũ còn hạn — người bị khóa được đưa về trang đăng nhập. Không tự khóa chính mình được, và luôn phải còn ít nhất một Admin đang hoạt động (`LAST_ADMIN`).

Khi giao diện không vào được:

```sql
select public.app_write('user_profiles', 'update', id,
  '{"account_status": "disabled"}'::jsonb,
  null, null, 'runbook', 'script')
from public.user_profiles
where username = 'ten.dang.nhap';
-- mở lại: '{"account_status": "active"}'
```

Không bao giờ xóa dòng trong `user_profiles` (`app_write` chặn sẵn) — tài khoản còn được tham chiếu bởi `created_by`, `updated_by` và lịch sử. Muốn chặn ai thì khóa.

---

## 4. Sửa một lần Đổi vị trí / Đổi cha / Swap bị nhầm

Không có "undo". Cách đúng là làm thao tác ngược lại — lịch sử ghi đủ cả hai lần.

1. Mở thiết bị → tab **Lịch sử** để xem vị trí / thiết bị cha trước đó.
2. Trên chính thiết bị đó: **Thao tác ▾ → Đổi cha** (về cha cũ), **Tách khỏi cha** (nếu trước đó không có cha) hoặc **Đổi vị trí**. Thiết bị có con sẽ được hỏi con đi theo hay ở lại chỗ cũ — chọn giống lần làm trước.

Xem lịch sử bằng SQL (id lấy từ đường dẫn `/equipment?id=…` — serial được phép trùng nên đừng tìm theo serial):

```sql
select created_at, action, changes, note
  from public.equipment_histories
 where equipment_id = 'ID_THIET_BI'
 order by created_at desc
 limit 10;
```

---

## 5. Thêm / sửa danh sách chọn (Location, Part Number, Status, …)

Giao diện: **Configuration** (chỉ Admin) → chọn danh sách ở cột trái → **Thêm**, hoặc mở dòng → **Sửa**. `sort_order` quyết định thứ tự trong các ô chọn.

- Part Number, Location, Type, Level, Department, Hiệu chuẩn › Vendor: không xóa, chỉ **Thao tác ▾ → Ẩn**. Giá trị đã ẩn không chọn được nữa, nhưng bản ghi đang dùng vẫn hiện đúng (kèm "Đã ẩn"); **Hiện lại** khi cần.
- Status và Hiệu chuẩn › Setup: xóa thật. Status đang được dùng thì database chặn (`STATUS_IN_USE`).
- Hiệu chuẩn › **Setup**: mỗi part number phải hiệu chuẩn một dòng (chọn trong các PN đang có thiết bị) với chu kỳ, số ngày báo trước và status mặc định. Thiết bị có PN đó **tự lên** Dashboard hiệu chuẩn; xóa Setup thì chúng rời Dashboard (lịch sử vẫn giữ).

---

## 6. Tra lỗi người dùng báo lại

Lỗi hệ thống (5xx) hiện kèm **mã yêu cầu** (`req_…`) ngay trong thông báo — nhờ người dùng đọc hoặc chụp lại mã đó.

Giao diện: **Configuration → Hệ thống → Error log** → tìm theo mã yêu cầu, mở dòng để xem route, người dùng, message và stack.

```sql
select * from public.error_log where request_id = 'req_xxxxx';
```

`error_log` giữ 90 ngày (tự xóa bản ghi cũ hơn). Log của Vercel chỉ giữ khoảng 1 giờ, nên đây là nguồn chính để tra lỗi cũ.

Lỗi nghiệp vụ (4xx — thiếu chu kỳ hiệu chuẩn, trùng tên, không đủ quyền…) **không** vào `error_log`: thông báo trên màn hình đã nói đúng lý do. Khi chạy `npm run dev`, terminal in thêm mã và lý do của từng lỗi 4xx.

---

## 7. Khôi phục từ bản sao lưu

Bản sao lưu: GitHub → Actions → **Daily database backup** → mở lần chạy → artifact `db-backup-<id>` (giữ 30 ngày), bên trong là `eq-YYYY-MM-DD.sql.gz`. Workflow cần secret `SUPABASE_DB_URL` (connection string của production) — đặt ở GitHub, app không đọc biến này.

```bash
gunzip -c eq-YYYY-MM-DD.sql.gz | psql "$SUPABASE_DB_URL"
```

**Phải khôi phục thử vào project dev ít nhất một lần trước khi mở pilot.** Bản sao lưu chưa thử khôi phục là bản sao lưu chưa tồn tại.

Bản dump không chứa phân quyền (`--no-acl`). Nếu khôi phục vào một project Supabase **mới**, sau khi nạp dữ liệu chạy thêm khối phân quyền ở cuối `database/02_schema.sql`:

```sql
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant  all on all tables    in schema public to service_role;
grant  execute on all functions in schema public to service_role;
```

---

## 8. Supabase project bị tạm dừng

Gói miễn phí tạm dừng project sau 1 tuần không hoạt động. **Không mất dữ liệu.**

Supabase Dashboard → project → nút Restore. Chờ vài phút.

Phòng ngừa: workflow `.github/workflows/keepalive.yml` gọi `/api/health` hằng ngày (cần variable `APP_URL`). Workflow theo lịch của GitHub tự tắt sau ~60 ngày repo không có hoạt động — nếu nghỉ dài, kiểm tra lại nó còn chạy không.

---

## 9. Xem hạn mức hằng tháng

Xem 1 lần/tháng. Cả bốn ngưỡng đều là tín hiệu **đi tối ưu**, không phải tín hiệu nâng gói.

| Chỉ số | Xem ở đâu | Ngưỡng | Nếu vượt |
|---|---|---|---|
| Vercel Active CPU | Vercel → Usage | 3 / 4 giờ | Tìm truy vấn lặp hoặc thiếu index |
| Supabase DB size | Supabase → Reports | 300 / 500 MB | Kiểm tra các bảng `*_histories` có phình bất thường |
| Supabase egress | Supabase → Reports | 3 / 5 GB | Masterlist tải đủ danh sách mỗi lần mở trang — vượt ngưỡng thì chuyển sang phân trang phía server |
| Vercel invocations | Vercel → Usage | 500k / 1M | Chuông thông báo hỏi mỗi phút khi tab đang mở — kiểm tra có polling nào khác được thêm vào |

---

## 10. Làm lại database từ đầu

Chỉ làm trên **dev**. Trên production phải lấy dữ liệu ra trước: bản sao lưu ở mục 7, và/hoặc **Xuất Excel** trên Masterlist của từng module (xuất đúng các cột và dòng đang hiện — bấm **Xóa bộ lọc** và hiện đủ cột ở **Tùy chọn hiển thị** trước khi xuất).

Rồi làm theo `database/README.md`: chạy `01_reset_blank.sql` → `02_schema.sql` → (`03_seed_sample.sql`) → `04_functions.sql`, tạo admin đầu tiên, nhập lại Configuration, rồi nhập thiết bị bằng **Equipment → Import Excel** (tải file mẫu, điền, kiểm tra, Import — cả file trong một giao dịch).

---

## Ba điều không được làm

**Không `update public.equipments` bằng tay để đổi `parent_id` hoặc `location_id`.** Sẽ bỏ qua việc kéo theo thiết bị con, bỏ qua ghi lịch sử và làm dữ liệu lệch nhau. Luôn dùng giao diện hoặc các RPC `equipment_move` / `equipment_detach` / `equipment_change_location` / `equipment_swap`.

**Không sửa / xóa dòng trong các bảng `*_histories`.** Database chặn sẵn (`HISTORY_IS_APPEND_ONLY`); mọi thay đổi đều ghi thêm dòng mới.

**Không gỡ khối `revoke` / `grant` ở cuối `database/02_schema.sql` và `database/04_functions.sql`.** Không có nó, bất kỳ ai có anon key — nằm công khai trong mã nguồn trang web — đều gọi thẳng được `app_write` / `equipment_*` và bỏ qua toàn bộ tầng phân quyền.
