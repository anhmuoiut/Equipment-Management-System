# Equipment Management

> **UI requirements for developers and AI assistants:** Read [docs/JABIL_UI.md](docs/JABIL_UI.md) before adding or changing UI. It defines the accepted branding, compact layout, shared components, themes and responsive behavior.

Web app nội bộ quản lý Tester / Base / Fixture / Equipment, thay cách ghi chép bằng Excel.

Thiết kế nằm ngay trong repo: [docs/DATABASE_MODIFIED.md](docs/DATABASE_MODIFIED.md) (database), [docs/APP_SHELL.md](docs/APP_SHELL.md), [docs/DETAIL_MODEL.md](docs/DETAIL_MODEL.md) và [docs/JABIL_UI.md](docs/JABIL_UI.md) (giao diện). Đổi thiết kế thì sửa tài liệu trong `docs/` cùng lúc với code.

**Quy mô mục tiêu:** pilot 10–20 người, 1.000–2.000 thiết bị, Excel vẫn chạy song song.

---

## Tình trạng hiện tại

Database và giao diện đã xong:

| Phần | Nội dung |
|---|---|
| Khung ứng dụng | Top bar, sidebar 6 mục, EN / VI, sáng / tối, chuông thông báo — [docs/APP_SHELL.md](docs/APP_SHELL.md) |
| Dashboard | Số liệu tổng, trạng thái theo màu, quá hạn / sắp đến hạn hiệu chuẩn, phân bố theo vị trí / loại, thay đổi gần đây |
| Equipment | Masterlist + Detail Panel, cây thiết bị, Đổi vị trí / Đổi cha / Swap / Tách khỏi cha / Xóa (con đi theo hoặc ở lại), Import Excel, nhãn QR in được |
| Calibration | Dashboard hiệu chuẩn tự đồng bộ theo Setup (part number), ghi nhận hiệu chuẩn, hạn tự tính theo chu kỳ |
| Golden | Masterlist + Detail Panel |
| Configuration | 8 danh sách (Dữ liệu gốc; Hiệu chuẩn: Setup, Vendor) + Error log (chỉ Admin) |
| User Management | Duyệt / từ chối tài khoản tự đăng ký, tạo tài khoản, khóa, đặt lại mật khẩu (chỉ Admin) |

Mọi module dùng chung Masterlist + Detail Panel theo [docs/DETAIL_MODEL.md](docs/DETAIL_MODEL.md). Chưa làm: module Repair.

---

## Chạy trên máy

Dùng Node.js 24.9 trở lên.

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Mở địa chỉ Local mà Next.js in ra khi báo Ready (thường là http://127.0.0.1:3000).

- Giữ `.env.local` cũ là dùng lại đúng Supabase project và tài khoản — đổi máy không cần chạy lại SQL hay tạo lại admin.
- Không chép `node_modules` hoặc `.next` giữa Windows và macOS (chứa thư viện / file build theo hệ điều hành) — mỗi máy tự `npm ci`.
- Không chạy `npm run build` trong lúc `npm run dev` đang chạy: hai lệnh dùng chung thư mục `.next` và làm hỏng nhau. Lỡ chạy thì tắt dev server, xóa `.next`, chạy lại `npm run dev`.

## Chạy lần đầu

```bash
npm install
cp .env.example .env.local     # điền giá trị từ Supabase → Settings → API
```

Điền thêm `LOCAL_AUTH_SECRET` — một chuỗi ngẫu nhiên bất kỳ, ít nhất 32 ký tự, giữ bí mật như `SUPABASE_SERVICE_ROLE_KEY`. Dùng để ký phiên đăng nhập của tài khoản **local** (xem [Tài khoản](#tài-khoản)). Sinh nhanh bằng:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 1. Database

Chạy lần lượt trên Supabase SQL Editor (**dev project trước**) — chi tiết và cách kiểm tra kết quả ở [database/README.md](database/README.md):

```
database/01_reset_blank.sql   ← XÓA SẠCH schema public (mọi bảng + dữ liệu)
database/02_schema.sql        ← tạo 20 bảng + 1 view
database/03_seed_sample.sql   ← tùy chọn: dữ liệu mẫu Configuration
database/04_functions.sql     ← nghiệp vụ: lịch sử tự động, Move / Swap, Import, tự tính hạn hiệu chuẩn
```

### 2. Admin đầu tiên

```bash
npm run seed:admin -- admin@congty.com "Nguyen Van A" ten.dang.nhap
```

Hoặc tự đăng ký trên trang đăng nhập rồi nâng quyền bằng SQL — xem [database/README.md](database/README.md#tạo-admin-đầu-tiên).

Bắt buộc: duyệt và tạo tài khoản ở User Management cần quyền Admin, mà lúc đầu chưa có admin nào.

### 3. Chạy

```bash
npm run dev
curl localhost:3000/api/health
```

---

## Kiểm tra

```bash
npm run lint
npm run typecheck
npm test          # vitest: service, auth, API client + smoke test từng module (jsdom) — không cần database
npm run build
```

---

## Bốn thứ không được phá

Đây là những quyết định mà vi phạm sẽ không báo lỗi ngay nhưng sẽ hỏng về sau.

### 1. Không route nào export handler trần

```ts
export const POST = withAuth(handler, { role: EDITORS });
```

`service_role` bypass RLS hoàn toàn, nên RLS **không** bảo vệ được rủi ro "quên check quyền trong một route". `withAuth` là lớp bảo vệ thật. Kiểm tra:

```bash
grep -rLn "withAuth" app/api --include=route.ts     # phải rỗng
```

### 2. `service_role` key chỉ đọc ở đúng một file

`lib/supabase/admin.ts`. Ba lớp chặn: `import 'server-only'` (build fail nếu lọt vào client bundle) → ESLint `no-restricted-imports` → không có tiền tố `NEXT_PUBLIC_`.

### 3. Mọi function trong database phải có `revoke` + `grant`

PostgreSQL mặc định `GRANT EXECUTE` cho `PUBLIC`. Không có khối `revoke` / `grant` ở cuối `database/02_schema.sql` và `database/04_functions.sql`, bất kỳ ai có anon key (nằm công khai trong bundle frontend) đều gọi được `app_write` / `equipment_*` và bypass toàn bộ tầng phân quyền.

### 4. Không dùng API riêng của Vercel

Nguyên tắc portability. Không `Vercel KV / Blob / Postgres / Cron`, không Edge Runtime cho business logic. Cron đặt ở GitHub Actions.

Tuân thủ đúng thì rời Vercel = viết một Dockerfile + đổi env ≈ 1 ngày công. Vi phạm thì con số đó thành vài tuần. `output: 'standalone'` đã bật sẵn.

---

## Ba điều dễ hiểu nhầm trong code

**Lịch sử do database ghi, không phải server.** Trigger `write_history` ghi vào `<module>_histories` trong cùng giao dịch với thay đổi. Server chỉ ghi qua `app_write` / các RPC `equipment_*` (kèm người thao tác, hành động, ghi chú) — đừng tự insert dòng lịch sử.

**Đổi cha / vị trí thiết bị luôn đi qua RPC `equipment_*`.** Cả cây con phải đi theo (hoặc ở lại chỗ cũ — tham số `p_children`) trong một giao dịch, nên `PUT /api/equipment/{id}` nhận `parent_id` / `location_id` nhưng chuyển sang các RPC này thay vì ghi thẳng. Thiết bị có cha thì vị trí theo cha (`LOCATION_INHERITED_READ_ONLY`).

**Lỗi trả về theo mã, chữ hiển thị nằm ở client.** API trả `{ code, message, details, request_id }`; `errorMessage()` (`lib/client/api.ts`) đổi `code` thành câu theo ngôn ngữ đang chọn (`src/i18n/locales/*.json` › `errors`). Thêm mã lỗi mới ở `lib/errors` thì thêm cả câu EN / VI — `lib/client/api.test.ts` báo thiếu.

---

## Vận hành

| Việc | Ở đâu |
|---|---|
| Backup | `.github/workflows/backup.yml` — cần secret `SUPABASE_DB_URL` |
| Chống Supabase pause | `.github/workflows/keepalive.yml` — cần variable `APP_URL` |
| Tra lỗi user báo lại | Configuration → Hệ thống → Error log, tìm theo `request_id` |
| Lấy dữ liệu ra | **Xuất Excel** trên Masterlist từng module; bản sao lưu hằng ngày (RUNBOOK mục 7) |
| Quy trình sự cố | [RUNBOOK.md](RUNBOOK.md) |

Log Vercel Hobby chỉ giữ ~1 giờ, nên `error_log` trong DB mới là nơi điều tra lỗi cũ. Lỗi 4xx không vào `error_log` — câu báo trên màn hình đã nói lý do; khi chạy `npm run dev`, terminal in thêm mã và lý do.

**Backup chưa restore thử là backup chưa tồn tại.** Phải test restore ít nhất 1 lần trước khi cho user vào (RUNBOOK mục 7).

---

## Giao diện

| Màn hình | Đường dẫn | Ai vào được |
|---|---|---|
| Đăng nhập / đăng ký | `/login` | Mọi người |
| Đổi mật khẩu bắt buộc | `/change-password` | Tài khoản có mật khẩu do admin đặt |
| Dashboard | `/` | Mọi nhóm |
| Equipment | `/equipment`, `/equipment/{id}`, nhãn QR `/equipment/{id}/label` | Mọi nhóm |
| Calibration | `/calibration`, `/calibration/{id}` | Mọi nhóm |
| Golden | `/golden`, `/golden/{id}` | Mọi nhóm |
| Configuration | `/configuration/{danh sách}`, `/configuration/error-log` | Admin |
| User Management | `/users`, `/users/{id}` | Admin |

Màu, font, kích thước, sáng / tối và điện thoại theo [docs/JABIL_UI.md](docs/JABIL_UI.md). Khi đang mở chi tiết: ↑ ↓ (hoặc K / J) chuyển bản ghi theo thứ tự danh sách đang hiện, `?id=` trên đường dẫn mở lại đúng bản ghi, nút ⤢ mở chi tiết toàn trang.

---

## Việc còn lại trước khi mở pilot

1. Khôi phục thử bản sao lưu vào project dev (RUNBOOK mục 7).
2. Nhập dữ liệu Excel đang dùng bằng **Equipment → Import Excel** (file mẫu tải trên giao diện).
3. Module Repair (Sửa chữa) — chưa thiết kế; [docs/DATABASE_MODIFIED.md](docs/DATABASE_MODIFIED.md) ghi là làm sau.

---

## Tài khoản

Đăng nhập bằng **username** (chữ thường không dấu, số và `. _ + -`), không bằng email. Có hai loại tài khoản (`user_profiles.auth_provider`):

- **local** — người dùng tự đăng ký ở trang đăng nhập (**Đăng ký**), hoặc Admin tạo ở User Management. Mật khẩu do app lưu và kiểm tra (`lib/auth/password.ts`, scrypt — không có dòng nào trong `auth.users`), phiên đăng nhập là cookie do app ký (`lib/auth/localSession.ts`).
- **supabase** — admin đầu tiên tạo bằng `npm run seed:admin`. Email chỉ dùng ở server để đăng nhập qua Supabase Auth.

Tài khoản tự đăng ký vào ở trạng thái **chờ duyệt** (`pending`), chưa đăng nhập được; mọi Admin nhận thông báo. Admin **Duyệt** (chọn nhóm quyền) hoặc **Từ chối** ở User Management (lọc nhanh "Chờ duyệt").

Nhóm quyền ([lib/permissions/index.ts](lib/permissions/index.ts)): **Admin** — mọi thứ; **User** — xem, thêm, sửa, không xóa, không vào Configuration / User Management; **Readonly** — xem, tìm kiếm, xuất Excel. API kiểm tra lại quyền ở mọi request (`withAuth`), không dựa vào việc ẩn nút.

- Mật khẩu do admin đặt (tài khoản mới, đặt lại mật khẩu) phải đổi ở lần đăng nhập tới (`/change-password`); đặt lại mật khẩu còn đăng xuất mọi phiên cũ của người đó.
- Admin không tự đổi nhóm quyền, tự khóa hay tự đặt lại mật khẩu của mình ở User Management (`CANNOT_MODIFY_SELF`), và luôn phải còn ít nhất một Admin đang hoạt động (`LAST_ADMIN`).
- Tài khoản không bao giờ bị xóa, chỉ khóa — còn được tham chiếu trong lịch sử.
- Mỗi lần thêm / sửa / xóa ghi lịch sử cũ → mới: tab **Lịch sử** của từng bản ghi và **Thay đổi gần đây** trên Dashboard.
- Có giới hạn số lần đăng nhập sai trên mỗi instance (bổ sung cho giới hạn của Supabase Auth), không phải rate limit dùng chung toàn hệ thống.
- Đổi `LOCAL_AUTH_SECRET` sẽ đăng xuất toàn bộ tài khoản local cùng lúc — coi nó như `SUPABASE_SERVICE_ROLE_KEY`, không phải một tùy chọn cấu hình.
- Chưa có "quên mật khẩu" tự phục vụ: Admin đặt lại mật khẩu ở User Management (RUNBOOK mục 1). Hệ thống không gửi email.
