# Equipment Management

> **UI requirements for developers and AI assistants:** Read [docs/JABIL_UI.md](docs/JABIL_UI.md) before adding or changing UI. It defines the accepted branding, compact layout, shared components, themes and responsive behavior.

Web app nội bộ quản lý Tester / Base / Fixture / Equipment, thay cách ghi chép bằng Excel.

Triển khai theo **Spec v0.9**. Mọi quyết định kiến trúc trong code đều có chú thích trỏ về số mục trong spec — khi sửa code, sửa spec trước.

**Quy mô mục tiêu (mục 1a):** pilot 10–20 người, 1.000–2.000 thiết bị, Excel vẫn chạy song song.

---

## Tình trạng hiện tại

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Scaffold, config, portability (`output: standalone`) | ✅ Xong |
| 1 | Toàn bộ bảng, index, trigger, RLS lockdown, RPC + grants, seed | ✅ Xong, **59/59 test pass** |
| 2 | `withAuth`, session, User Management API | ✅ API xong |
| 3 | Field Config, Preset, Location Config API | ✅ API xong |
| 4 | Form engine sinh từ `field_definitions` | ✅ Xong |
| 5 | Dashboard: search/filter/sort/pagination server-side | ✅ Xong |
| 6 | Chuỗi phân cấp, drawer chi tiết, thao tác cấu trúc | ✅ Xong |
| 7 | (RPC — đã xong ở Phase 1) | ✅ Xong |
| 8 | Lịch sử thay đổi | ✅ Xong |
| 8b | **Giao diện Quản trị** (users, preset, location, field, lỗi) | ✅ Xong |
| 9 | Migration script từ Excel + reconcile.sql | ⬜ Chưa làm |
| 10 | Backup workflow + keepalive | ✅ Xong |

Backend, database và giao diện vận hành chính đã hoàn chỉnh: `tsc --noEmit` 0 lỗi, `next build` sạch, 27 route + 2 trang.
Còn lại: giao diện Quản trị (API đã sẵn, gọi bằng curl được) và script nhập liệu từ Excel.

---

## Run on macOS

Use Node.js 24.9 or newer. From the outer `Inventory Managerment` folder,
double-click `Start-App.command`, keep its Terminal window open, and open the
Local URL shown when Next.js reports Ready (normally http://127.0.0.1:3000).
Press Control+C in Terminal to stop. `Start-App.cmd` is the Windows launcher.

To start manually from this folder:

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Keep your existing `.env.local` to use the same Supabase project and accounts.
Changing computers does not require rerunning database migrations or seeding
the admin account. For a new configuration, copy `.env.example` to `.env.local`
and fill in the Supabase values before starting.

Do not reuse `node_modules` or `.next` from Windows: they contain platform-specific
dependencies and generated output. Install dependencies separately on each OS
with `npm ci` and let Next.js rebuild its cache. The original Windows dependencies
and caches from the Mac setup are preserved in the outer `.runtime-backups` folder.

For OneDrive, mark the source folder as **Always Keep on This Device** before
running it. Prefer a separate working copy outside OneDrive on each computer so
Windows and macOS do not overwrite each other's `node_modules` and `.next`.

## Chạy lần đầu

```bash
npm install
cp .env.example .env.local     # điền giá trị từ Supabase → Settings → API
```

Điền thêm `LOCAL_AUTH_SECRET` — một chuỗi ngẫu nhiên bất kỳ, ít nhất 32 ký tự, giữ bí mật như `SUPABASE_SERVICE_ROLE_KEY`. Dùng để ký session cho tài khoản **Local** (mục "Tài khoản Local" bên dưới). Sinh nhanh bằng:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 1. Database

Database v2 được dựng lại từ đầu theo [docs/DATABASE_MODIFIED.md](docs/DATABASE_MODIFIED.md). Chạy lần lượt trên Supabase SQL Editor (**dev project trước**) — chi tiết ở [database/README.md](database/README.md):

```
database/01_reset_blank.sql   ← XÓA SẠCH schema public (mọi bảng + dữ liệu)
database/02_schema.sql        ← tạo 19 bảng + 1 view
database/03_seed_sample.sql   ← tùy chọn: dữ liệu mẫu Configuration
database/04_functions.sql     ← nghiệp vụ: lịch sử tự động, Move / Swap, tự tính hạn hiệu chuẩn
```

Giao diện: khung ứng dụng theo [docs/APP_SHELL.md](docs/APP_SHELL.md); mọi module dùng chung Masterlist + Detail Panel theo [docs/DETAIL_MODEL.md](docs/DETAIL_MODEL.md).

### 2. Admin đầu tiên

```bash
npm run seed:admin -- admin@congty.com "Nguyen Van A" ten.dang.nhap
```

Hoặc tự đăng ký trên trang đăng nhập rồi nâng quyền bằng SQL — xem [database/README.md](database/README.md#tạo-admin-đầu-tiên).

Bắt buộc. `POST /api/admin/users` yêu cầu role admin, mà chưa có admin nào tồn tại — vòng lặp chicken-and-egg (mục 55.2).

### 3. Chạy

```bash
npm run dev
curl localhost:3000/api/health
```

---

## Test

```bash
npm test
```

Bộ test SQL của database cũ đã bị xóa cùng schema cũ; test cho database v2 viết lại khi code `04_functions.sql`.

---

## Bốn thứ không được phá

Đây là những quyết định mà vi phạm sẽ không báo lỗi ngay nhưng sẽ hỏng về sau.

### 1. Không route nào export handler trần

```ts
export const POST = withAuth(handler, { role: ['admin','user'], action: 'move' });
```

`service_role` bypass RLS hoàn toàn, nên RLS **không** bảo vệ được rủi ro "quên check quyền trong một route". `withAuth` là lớp bảo vệ thật (mục 3c). Kiểm tra:

```bash
grep -rLn "withAuth" app/api --include=route.ts     # phải rỗng
```

### 2. `service_role` key chỉ đọc ở đúng một file

`lib/supabase/admin.ts`. Ba lớp chặn, đều đã được kiểm chứng là hoạt động:
`import 'server-only'` (build fail nếu lọt vào client bundle) → ESLint `no-restricted-imports` → không có tiền tố `NEXT_PUBLIC_`.

### 3. Mọi RPC phải có `revoke` + `grant`

PostgreSQL mặc định `GRANT EXECUTE` cho `PUBLIC`. Không có khối grant ở cuối `004_functions.sql`, bất kỳ ai có anon key (nằm công khai trong bundle frontend) đều gọi được `archive_equipment` và bypass toàn bộ tầng permission.

Đã kiểm chứng: anon và authenticated bị chặn 10/10 trên cả bảng lẫn function.

### 4. Không dùng API riêng của Vercel

Nguyên tắc portability (mục 3a). Không `Vercel KV / Blob / Postgres / Cron`, không Edge Runtime cho business logic. Cron đặt ở GitHub Actions.

Tuân thủ đúng thì rời Vercel = viết một Dockerfile + đổi env ≈ 1 ngày công. Vi phạm thì con số đó thành vài tuần. `output: 'standalone'` đã bật sẵn.

---

## Ba điều dễ hiểu nhầm trong code

**Descendants không bump version khi Move/Change Location.** Có chủ đích (mục 23). Location của child đã là read-only nên không có kịch bản save đè; bump chỉ tạo `OPTIMISTIC_CONFLICT` giả khiến user mất nội dung đang gõ. Vẫn cascade location và vẫn ghi `MOVE_CASCADE` để audit.

**PUT không nhận `current_location_id` và `parent_id`.** Đổi location của root là thao tác cascade multi-row, không phải Edit thường — nó có endpoint riêng `/change-location` (mục 21a). Parent chỉ đổi qua move/detach/swap. Chặn ở 3 tầng: validator, whitelist trong RPC, và không có trong `field_definitions`.

**Swap không có RPC riêng.** Swap = 2 lần `internal_move` trong cùng transaction (mục 24). Bug fix trong logic cascade chỉ phải sửa một chỗ.

---

## Vận hành

| Việc | Ở đâu |
|---|---|
| Backup | `.github/workflows/backup.yml` — cần secret `SUPABASE_DB_URL` |
| Chống Supabase pause | `.github/workflows/keepalive.yml` — cần variable `APP_URL` |
| Tra lỗi user báo lại | `GET /api/admin/errors`, tìm theo `request_id` |
| Lấy dữ liệu ra (rollback) | `npx tsx scripts/export-to-csv.ts` |
| Quy trình sự cố | `RUNBOOK.md` |

Log Vercel Hobby chỉ giữ ~1 giờ, nên `error_log` trong DB mới là nơi điều tra lỗi cũ (mục 47d).

**Backup chưa restore thử là backup chưa tồn tại.** Phải test restore ít nhất 1 lần trước khi cho user vào (mục 55.8).

---

## Giao diện

| Màn hình | Đường dẫn |
|---|---|
| Đăng nhập | `/login` |
| Danh sách thiết bị + drawer chi tiết | `/` |

Hướng thiết kế lấy từ vernacular xưởng máy: nền xám ngả lục, màu chính là sơn men máy công cụ `#0E5245`, chữ IBM Plex Sans + Plex Mono. Mono **chỉ** dùng cho định danh (serial, part, asset) với tabular figures — trên sàn xưởng `1089` và `l089` là hai thứ khác nhau.

Bảng dữ liệu dày, không card bo góc, không shadow. Điểm nhấn duy nhất là chuỗi phân cấp dạng dây xích trong tab Phân cấp.

Phím tắt: `/` nhảy vào ô tìm kiếm.

---

## Việc còn lại trước khi mở pilot

1. Giao diện Quản trị — API đã xong, chỉ thiếu màn hình
2. Migration script từ Excel + `reconcile.sql` (mục 46, 55.4)
3. Điền `help_text` cho **mọi** field — cột đã có trong schema, đừng để trống (mục 55.5)
4. Chạy hết checklist mục 55.8

## UI and username login (2026-09-18)

Login and the equipment list support EN/VIE and persistent light/dark theme.
The navy/blue design follows the supplied Jabil reference with softly rounded borders.
Username is stored independently in user_profiles.
The existing admin signs in as academy.mantranqp2507 with the unchanged password.
Email resolution stays on the server. Inactive accounts are denied.
The bounded per-instance attempt guard supplements Supabase Auth limits;
it is not a deployment-wide shared rate limiter.

## Local accounts (self-service signup)

Every account used to be a real Supabase Auth account (`auth_provider =
'supabase'`), created by an admin. Migration 006 adds a second kind,
`auth_provider = 'local'`: username + password chosen by the user themself
on the login page ("Request an account"), stored and verified by the app
directly (`lib/auth/password.ts`, scrypt — no auth.users row at all) with
its own signed session cookie (`lib/auth/localSession.ts`) instead of a
Supabase session. Admin accounts should still be created the normal way
(Quản trị → Người dùng → New user) and keep using Supabase Auth.

A submitted request lands with `is_active = false` and every action
permission off — it cannot sign in until an admin reactivates it from the
Users screen (same button used to un-deactivate anyone else; there's no
separate approval queue). The Users table's **Account** column shows
"Supabase", "Local" or "Local · pending" so it's obvious which is which.

Requires `LOCAL_AUTH_SECRET` in `.env.local` (see above). Changing that
value signs every local-account session out at once — treat it like
`SUPABASE_SERVICE_ROLE_KEY`, not like a config toggle.

**Known gaps, not built yet:** no self-service "forgot password" for local
accounts (an admin resets it from the Users screen, same as any account);
no email collected or verified for local accounts by design.

## Admin hardening

Notes from the previous version (to be rewritten for database v2):

- Creating a user, changing role/permissions, activating/deactivating and
  deleting a custom field each run as one database transaction (RPC), with
  old → new values in the audit log. Admin → **Audit log** shows them.
- An admin can't deactivate or demote themselves or reset their own
  password from the Users screen, and the last active admin can't be
  removed (`LAST_ADMIN`).
- Roles are Administrator / User / Viewer. Self-requested (Local) accounts
  arrive as Viewer: **Reactivate** approves them, switching the role to User
  lets them do more than view.
- A password set by an admin (new account or reset) must be replaced at the
  next sign-in (`/change-password`); a reset also signs the account out
  everywhere. The first admin created by `seed-first-admin.ts` goes through
  the same screen.
- The unused `user.manage` permission is removed; `error_log` keeps 90 days.
