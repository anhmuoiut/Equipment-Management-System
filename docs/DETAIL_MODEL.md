# Masterlist & Detail Panel — bố cục chung toàn project

Cập nhật: 04/10/2026 (điện thoại: thẻ thay bảng, mục 3.11). Code: [mục 6](#6-triển-khai). Mục 5 còn chờ bạn review. Dữ liệu theo [DATABASE_MODIFIED.md](DATABASE_MODIFIED.md); giao diện (màu, font, kích thước) theo [JABIL_UI.md](JABIL_UI.md).

## 1. Nguyên tắc

1. **Mọi module đi cùng một luồng:** bấm menu → mở **Masterlist** (bảng danh sách) → bấm vào một dòng → mở **Detail Panel** bên phải.
2. **Masterlist hiện đủ các trường** của module thành các cột.
3. **Detail Panel hiện đủ mọi trường** của bản ghi, chia nhóm cho dễ đọc. Không bỏ trường nào.
4. **Một kiểu Masterlist và một kiểu Detail Panel** cho Equipment, Calibration, Golden, Configuration, User Management. Mỗi module chỉ khai báo cột / trường / thao tác của mình; khung là component dùng chung.
5. **Một panel cho cả xem / sửa / thêm mới / thao tác.** Không mở form riêng, không mở hộp thoại chồng lên panel.

Không bao giờ hiện: mật khẩu đã băm, mã phiên đăng nhập và các trường kỹ thuật tương tự.

---

## 2. Masterlist — trang danh sách chung

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Equipment                                                    1.245 thiết bị   │  ← tiêu đề trang + tổng số
│ [🔍 Tìm kiếm…        ] [Bộ lọc ▾] [Tùy chọn hiển thị] [Xuất Excel] [Import] [+ Thêm] │  ← thanh công cụ
├──────────────────────────────────────────────────────────────────────────────┤
│    No  Status    Serial number  Part number  Location  Type   Jabil ID  …     │  ← tiêu đề cột: bấm để sắp xếp
│ ⊟  1   ● Active  SN-001         P12316       B3F1      Tester J-100201  …     │
│ └  2   ● Active  SN-002         P20001       B3F1      Base   J-100202  …     │  ← bấm dòng → mở Detail Panel
│ …                                                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Thành phần | Quy tắc chung cho mọi module |
| --- | --- |
| Tiêu đề trang | Tên module + tổng số bản ghi (theo bộ lọc hiện tại) trên **cùng một dòng** |
| Tìm kiếm | Một ô, tìm trên các cột chữ (serial, part number, tên…) |
| Bộ lọc | Lọc theo các cột chọn từ danh sách (Status, Type, Location, Nhóm quyền…) |
| Tùy chọn hiển thị | Mỗi người tự ẩn / hiện cột, kéo đổi thứ tự, "Khôi phục mặc định". Mặc định **hiện đủ cột**. Lưu trên trình duyệt của từng người |
| Xuất Excel | Mọi nhóm quyền (xem được thì xuất được); xuất đúng các cột và bộ lọc đang hiện |
| Thanh công cụ hẹp | Khi danh sách hẹp (Detail Panel đang mở cạnh, dưới ~800px), `Tùy chọn hiển thị`, `Xuất Excel` và công cụ của module (Import…) chỉ còn icon — vẫn có tên (`aria-label`) và tooltip — để thanh công cụ nằm một hàng. `Bộ lọc` và `+ Thêm` luôn có chữ |
| Import | Chỉ trang có import (Equipment, Golden) — Admin, User. Mở trong khung bên phải như `+ Thêm` (`?tool=import`): 1. tải file mẫu, 2. chọn file → kiểm tra (chưa ghi), 3. hết lỗi → Import. Xem mục 7 |
| `+ Thêm` | Admin, User (Configuration, User Management: chỉ Admin). Mở Detail Panel ở chế độ Thêm mới |
| Cột đầu | `No` (số thứ tự theo bộ lọc / sắp xếp hiện tại). Equipment thêm cột quan hệ cha–con trước `No` |
| Cột Status | Đứng ngay sau `No` ở mọi module có trạng thái; tag có chữ + màu |
| Cột định danh | Ngay sau Status là serial (chữ đậm), rồi part number và vị trí, cột phụ (Jabil ID, Asset, Level, Remark…) ở cuối. Khi Detail Panel mở, danh sách chỉ còn chỗ cho vài cột đầu — những cột đó phải đủ để nhận ra thiết bị |
| Sắp xếp | Bấm tiêu đề cột để sắp xếp tăng / giảm |
| Bấm dòng | Mở Detail Panel của dòng đó; dòng đang mở được tô nền chọn |
| Trống / đang tải / lỗi | Dùng trạng thái chung: khung xương khi tải; chưa có bản ghi nào → thông báo + nút `+ Thêm` (nếu có quyền); không khớp bộ lọc → thông báo + `Xóa bộ lọc`; tải lỗi → thông báo lỗi + `Thử lại` |
| Bảng rộng | Cuộn ngang **bên trong** khung bảng, tiêu đề cột luôn hiện khi cuộn dọc. Ô nhiều chữ (Remark, Mô tả…) chỉ hiện tối đa hai dòng — đủ chữ ở tooltip và trong Detail Panel — để một ghi chú dài không làm cả dòng cao gấp ba. (Điện thoại không dùng bảng: xem [3.11](#311-trên-điện-thoại)) |

---

## 3. Detail Panel — khung chi tiết chung

### 3.1 Vị trí trên màn hình

```
┌──────────────────────────────────────┬────────────────────────────────────┐
│ Masterlist (vẫn dùng được)           │ ‹ ›  SN-001 [● Active]              │
│                                      │ P12316 · Tester  [Sửa][Thao tác▾][✕]│
│  No Status  P/N     S/N     Type …   │       📍 B3F1 · Cập nhật 10:24 …     │
│  1  ●       P12316  SN-001  Tester … │ ◀ đang chọn                         │
│  2  ●       P20001  SN-002  Base   … ├────────────────────────────────────┤
│  3  ●       P20002  SN-003  Base   … │ Thông tin │ Cây thiết bị │ Lịch sử │
│  …                                   ├────────────────────────────────────┤
│                                      │ ĐỊNH DANH                           │
│                                      │ Serial number     Part number       │
│                                      │ SN-001            P12316            │
│                                      │ Jabil ID          Asset             │
│                                      │ P12316            A-00045           │
│                                      │ …                                   │
│                                      ├────────────────────────────────────┤
│                                      │ Có thay đổi chưa lưu [Hoàn tác][Hủy][Lưu]│
└──────────────────────────────────────┴────────────────────────────────────┘
```

Cùng nội dung, chỉ khác cách đặt theo độ rộng màn hình:

| Màn hình | Cách hiện | Masterlist |
| --- | --- | --- |
| **Desktop rộng** (≥ 1280px) | Panel **bên phải**, rộng 640px (hẹp dần tới 560px khi màn hình dưới ~1450px, để danh sách còn đủ chỗ), đặt cạnh masterlist | Vẫn hiện và bấm được; bấm dòng khác thì panel đổi theo |
| **Laptop nhỏ / tablet** (801–1279px) | Panel trượt ra **phủ lên** phần phải của masterlist, rộng 640px (tối đa bằng màn hình trừ 48px) | Phần còn thấy được làm mờ; bấm vào phần mờ **không** đóng panel. Chuyển bản ghi bằng `‹ ›` |
| **Điện thoại** (≤ 800px) | Panel chiếm **toàn màn hình** — xem [3.11](#311-trên-điện-thoại) | Danh sách thẻ, ẩn khi panel mở; nút `←` quay về đúng vị trí cũ |

Nút `⤢` (desktop / tablet) mở cùng nội dung ở trang riêng (`/equipment/{id}`, `/golden/{id}`…), rộng hết màn hình. Link QR cũng mở trang này. Trang riêng có `←` (về danh sách, mở đúng bản ghi) thay cho `✕`, và không có `‹ ›`.

### 3.2 Header

| Dòng | Nội dung | Ghi chú |
| --- | --- | --- |
| 1 | `‹ ›` · **Tên chính** · tag trạng thái | Tên chính = định danh dễ nhận nhất (serial, họ tên, `display_name`). `‹ ›` chỉ hiện khi có bản ghi trước / sau; không có icon trang trí |
| 2 | Định danh phụ | Ví dụ part number · loại |
| 3 | Thông tin nhanh | Vị trí (chữ đậm hơn, vì đó là điều người dùng tìm đầu tiên), cập nhật lần cuối (giờ + người). Tối đa 3 mục |
| Phải | Nút chính của module (nếu có) · `[Sửa]` · `[Thao tác ▾]` · `[⤢]` · `[✕]` | `[Thao tác ▾]` (nút có chữ — nút chỉ có dấu ⋯ dễ bị bỏ qua) chứa các thao tác khác; Xóa luôn ở cuối, màu đỏ |

Header và thanh tab **luôn hiện** khi cuộn; chỉ phần thân cuộn.

### 3.3 Duyệt qua các bản ghi (Trước / Sau)

| Cách | Hành vi |
| --- | --- |
| Nút `‹` `›` | Sang bản ghi trước / sau **theo đúng thứ tự, bộ lọc và sắp xếp hiện tại** của masterlist |
| Phím `↑` / `↓` (hoặc `K` / `J`) | Như trên, khi con trỏ không nằm trong ô nhập |
| Đầu / cuối danh sách | Nút tương ứng bị tắt |
| Đang sửa, chưa lưu | Hỏi "Lưu / Bỏ thay đổi / Ở lại" trước khi chuyển |

### 3.4 Tab

| Vị trí | Tab | Có ở |
| --- | --- | --- |
| Đầu | **Thông tin** | Mọi module |
| Giữa | Tab riêng của module (0–1 tab) | Equipment: Cây thiết bị |
| Cuối | **Lịch sử** | Mọi module — đọc bảng `*_histories` của module, dạng dòng thời gian `Trường: cũ → mới` |

Khi **thêm mới** chỉ có tab Thông tin.

### 3.5 Thân — cách trình bày trường

- **Hiện đủ mọi trường** của bản ghi, chia **nhóm**; mỗi nhóm có tiêu đề nhỏ viết hoa.
- Nhóm cuối của mọi module là **Thông tin hệ thống** (chỉ đọc): Tạo bởi · Tạo lúc · Cập nhật bởi · Cập nhật lúc.
- Lưới **2 cột** trong panel; điện thoại: 2 cột khi xem, 1 cột khi sửa. Ghi chú (remark) chiếm cả hàng.
- Mỗi trường: **nhãn ở trên, giá trị ở dưới**. Trống thì hiện `—`.
- Trường FK hiện `display_name` (ví dụ vị trí `B3F1`, không hiện id).
- Trường **tự tính** (ví dụ `due_date`) luôn chỉ đọc, kèm chú thích "Tự tính".
- Trường **chỉ đổi bằng thao tác riêng** (ví dụ vị trí của thiết bị có cha) vẫn hiện nhưng khóa, kèm chú thích cách đổi.
- Chế độ sửa: chính các ô đó chuyển thành ô nhập **tại chỗ**, không đổi bố cục. Trường bắt buộc có dấu `*` đỏ; lỗi hiện ngay dưới ô.

### 3.6 Chế độ

| Chế độ | Mở bằng | Khác biệt |
| --- | --- | --- |
| **Xem** (mặc định) | Bấm dòng trong masterlist, `‹ ›`, link / QR | Mọi trường chỉ đọc. Không có footer |
| **Sửa** | Nút `[Sửa]` | Ô thành ô nhập tại chỗ; footer `[Hoàn tác] [Hủy] [Lưu]`. Nút Lưu tắt khi chưa có thay đổi |
| **Thêm mới** | Nút `+ Thêm` trên masterlist | Cùng panel, ô trống, chỉ tab Thông tin, header ghi "Thêm …". Lưu xong chuyển sang Xem bản ghi vừa tạo |
| **Thao tác** | Nút chính của module hoặc một mục trong `[Thao tác ▾]` (ví dụ Đổi vị trí, Swap, Ghi nhận hiệu chuẩn, Duyệt) | Thân panel được **thay bằng màn hình thao tác** (tiêu đề + vài trường + xem trước kết quả); nút `← Quay lại` và footer `[Hủy] [tên thao tác]` — nút chính ghi đúng việc nó làm (`Swap`, `Đổi vị trí`, `Gắn vào cha`, `Duyệt`…), chỉ dùng `Xác nhận` khi không có tên nào cụ thể hơn. Khi đang chạy chỉ có **một** chỉ báo tải. **Không mở hộp thoại thứ hai** |

**Xóa** cũng không mở hộp thoại: footer đổi sang màu đỏ "Xóa SN-001? Không hoàn tác được. `[Hủy]` `[Xóa]`".

### 3.7 Đóng panel

| Đang ở chế độ | Đóng bằng |
| --- | --- |
| Xem | `✕`, phím Esc |
| Sửa / Thêm mới / Thao tác | `✕` hoặc `[Hủy]`. Esc = Hủy. Có thay đổi chưa lưu → hỏi "Bỏ thay đổi?" |

Không có kiểu "bấm ra ngoài để đóng" — bấm vào masterlist chỉ là chọn dòng khác (đang sửa thì hỏi trước như 3.3).

### 3.8 Nút theo nhóm quyền

| Nhóm | `[Sửa]` | Nút chính / `[Thao tác ▾]` | Xóa | Lịch sử | Xuất Excel |
| --- | --- | --- | --- | --- | --- |
| Admin | ✔ | ✔ | ✔ | ✔ | ✔ |
| User | ✔ | ✔ (trừ xóa) | — | ✔ | ✔ |
| Readonly | — | — | — | ✔ | ✔ |

Configuration và User Management chỉ Admin mở được.

### 3.9 Khác

| Mục | Quy tắc |
| --- | --- |
| Bàn phím | Tab di chuyển trong panel; đóng panel thì focus về dòng đã mở |
| Mở bản ghi liên quan | Bấm thiết bị cha / con / "Mở thiết bị" / "Mở chi tiết hiệu chuẩn" → panel chuyển sang bản ghi đó, có nút quay lại bản ghi trước |
| Đang tải / lỗi | Khung xương giữ nguyên bố cục header + nhóm trường; lỗi hiện ở đầu thân panel |

### 3.10 Chỗ chừa sẵn cho module khác (extension point)

Chi tiết của một module có thể hiện một **nhóm chỉ đọc** do module khác cung cấp, mà không phải đọc bảng của module đó. Hiện dùng cho: nhóm **Hiệu chuẩn** trong chi tiết thiết bị (mục 4.1). Sau này Repair cũng gắn vào cùng cách. Nâng cấp module cung cấp không phải sửa module hiển thị.

### 3.11 Trên điện thoại

Mục tiêu: **quét nhanh → tìm thiết bị → xem trạng thái / vị trí → làm việc cần làm**, bằng **một tay**. Điện thoại không phải bản desktop thu nhỏ: danh sách là các thẻ, nút hay dùng nằm ở **đáy màn hình** (vùng ngón cái), đầu màn hình chỉ giữ tên và điều hướng. Desktop và tablet (> 800px) giữ nguyên.

**Danh sách (Masterlist)** — không ép bảng vào màn hình hẹp:

```
┌─────────────────────────────┐
│ Equipment   64 of 64 records│
│ [🔍 Tìm kiếm…    ] [⛭] [⋮]  │  ← tìm · Lọc & sắp xếp (badge = số đang bật) · menu ⋮
│ [Quá hạn] [Sắp đến hạn]     │  ← lọc nhanh (nếu module có)
├─────────────────────────────┤
│ SN-10007 ↳           ● Active│  ← Serial (đậm) · tag trạng thái
│ 📍 B3F1 · P20001 · Base     │  ← Vị trí đậm · part number · loại · Jabil ID
├─────────────────────────────┤
│ SN-10021           ● Repair │
│ 📍 Lab 2 · P30005           │
│ 🗓 14/10/2026 [DUE SOON]    │  ← Calibration: hạn hiệu chuẩn có màu
└─────────────────────────────┘                    ( + )  ← nút thêm nổi
```

| Thành phần | Trên điện thoại |
| --- | --- |
| Thẻ dòng | Mỗi module khai báo `mobileCard` (`RowCard`: tiêu đề + tag + vài dòng phụ); module không khai báo thì dựng thẻ chung từ các cột. Chỉ phần tử inline (thẻ là một `<button>`). Bấm thẻ = mở chi tiết. Serial dài xuống dòng, không cắt. Dòng quá hạn / sắp đến hạn có vạch màu ở mép trái |
| Thanh công cụ | Chỉ **tìm kiếm + Lọc & sắp xếp + ⋮** (Xuất Excel, Import…). Không có "Tùy chọn hiển thị" (thẻ có trường cố định), không có nút `+ Thêm` trên thanh (đã có nút nổi `+`), không có dải nút cuộn ngang |
| Lọc & sắp xếp | Tấm trượt từ đáy: các ô lọc (chọn của hệ điều hành), "Sắp xếp theo" + A → Z / Z → A, `[Xóa bộ lọc]` · `[Xem N kết quả]`. Khi đóng, bộ lọc / sắp xếp đang bật hiện thành chip bấm để gỡ |
| Thêm mới | Nút `+` nổi ở góc dưới phải của mọi module có quyền thêm (ẩn khi panel đang mở) |
| Tiêu đề | Tên trang và số bản ghi **cùng một dòng**. Trang Configuration: ô chọn danh sách ở đầu trang đã nêu tên → ẩn tiêu đề lặp (vẫn có cho trình đọc màn hình) |
| Tải thêm | Vẽ 200 thẻ một lần, cuộn gần cuối thì vẽ tiếp |
| Đang tải / trống / lỗi | Thẻ khung xương · "Chưa có bản ghi" · "Không khớp" + `[Xóa bộ lọc]` · lỗi + `[Thử lại]` |

**Chi tiết (Detail Panel)** — toàn màn hình:

```
┌─────────────────────────────┐
│ ←  SN-001  ● Active    ‹  › │  ← quay lại · tên + tag · bản ghi trước / sau
│    P12316 · Tester  📍 B3F1 │  ← định danh phụ + vị trí (một dòng, xuống dòng nếu dài)
├─────────────────────────────┤
│ Thông tin │ Cây │ Lịch sử   │
├─────────────────────────────┤
│ ĐỊNH DANH                   │
│ Serial number   Part number │  ← xem: trường ngắn 2 cột
│ SN-001          P12316      │
│ …                           │
├─────────────────────────────┤
│ [      Sửa      ] [Thao tác▾]│  ← thanh đáy: nút chính · menu Thao tác
└─────────────────────────────┘
```

| Thành phần | Trên điện thoại |
| --- | --- |
| Thanh trên | `←` quay lại · tên chính + tag trạng thái · `‹ ›` (chỉ hiện khi có bản ghi trước / sau; trang toàn trang mở từ QR không có). Không có `⤢`, `✕`. Nút ≥ 44px |
| Dòng phụ | Định danh phụ + **mục đầu của thông tin nhanh** (vị trí; với hiệu chuẩn là hạn). Phần còn lại của thông tin nhanh ở tab Thông tin |
| Tab | Một hàng, cao 44px, vuốt ngang được |
| Thân | **Xem**: trường ngắn hai cột (`wide` chiếm cả hàng). **Sửa / thêm mới**: một cột, ô nhập cao ≥ 44px, chữ 16px (không bị iOS tự phóng to) |
| Thanh đáy (khi xem) | `[nút chính]` + `[Sửa]` + `[Thao tác ▾]`. Nút chính thứ hai trở đi (ví dụ Từ chối) nằm trong menu Thao tác. Readonly không có nút nào → không có thanh đáy |
| Thanh đáy (khi sửa / có thay đổi chưa lưu / xóa) | `[Hoàn tác]` `[Hủy]` `[Lưu]` hoặc `[Ở lại]` `[Bỏ thay đổi]` `[Lưu]` hoặc `[Hủy]` `[Xóa]` — nút chia đều bề rộng, cao 48px, chừa vùng an toàn của máy |
| `[Thao tác ▾]` | Mở danh sách từ **đáy màn hình**, mỗi dòng cao 48px; Xóa ở cuối, màu đỏ |
| Màn hình thao tác | Thân panel thay bằng màn hình thao tác; `[Hủy]` `[Xác nhận]` **bám đáy** (không có nút "Quay lại" thứ hai) |
| Ô chọn (`SearchableSelect`) | Tấm trượt từ đáy, mỗi lựa chọn cao 48px; ô tìm chỉ hiện khi danh sách dài (> 7) và không tự bật bàn phím |
| Bàn phím | Viewport `interactive-widget=resizes-content`: bàn phím mở thì panel và thanh đáy co lại phía trên nó (Chrome / Android) |
| Cây thiết bị | Dạng thụt lề giữ nguyên; mỗi dòng cao tối thiểu 44px |

### 3.12 Component dùng chung

| Component | Vai trò |
| --- | --- |
| `Masterlist` | Trang danh sách: tiêu đề + tổng số, thanh công cụ, bảng, sắp xếp, lọc, chọn dòng |
| `ColumnSettings` | Tùy chọn hiển thị cột |
| `DetailPanel` | Khung chi tiết: header (`‹ ›`, `⤢`, `✕`), tab, thân cuộn, footer; xử lý đóng / xác nhận / focus / chuyển bản ghi |
| `RecordPage` | Cùng nội dung `DetailPanel` nhưng toàn trang (mở toàn trang, link QR) |
| `DetailSection` | Một nhóm trường: tiêu đề + lưới 2 cột |
| `RecordDetail` | Vẽ nhóm (`SectionDef`) và trường (`FieldDef`) module khai báo: nhãn, giá trị khi xem, ô nhập khi sửa, chú thích, lỗi; lo chế độ xem / sửa / thêm mới / xóa |
| `ActionScreen`, `ActionField` | Màn hình thao tác thay thân panel; tự khóa màn hình khi đang gửi và hiện lỗi |
| `DetailHistory` | Tab Lịch sử: dòng thời gian từ bảng `*_histories` |

Nằm ở phần dùng chung (`components/ui`). Mỗi module chỉ truyền vào cột / nhóm / trường / tab / thao tác của mình — không module nào tự viết khung riêng.

---

## 4. Áp dụng cho từng module

Mỗi module gồm: **Masterlist** (các cột, mặc định hiện đủ) và **Detail Panel** (header, tab, nhóm trường, thao tác). Mọi Detail Panel đều kết thúc bằng nhóm **Thông tin hệ thống** (mục 3.5) — không nhắc lại ở từng module.

### 4.1 Equipment

**Masterlist:**

| | No | Status | Serial number | Part number | Location | Type | Jabil ID | Asset | Level | Parent | Remark |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ⊟ | 1 | ● Active | SN-001 | P12316 | B3F1 | Tester | J-100201 | A-00045 | EOL | | |
| └ | 2 | ● Active | SN-002 | P20001 | B3F1 | Base | J-100202 | A-00046 | EOL | SN-001 | |

Cột đầu (⊟ / └) cho biết thiết bị có con / là con của thiết bị khác.

**Detail Panel:**

| Phần | Nội dung |
| --- | --- |
| Header | **Serial number** · tag Status / P/N · Type / 📍 Location · Cha: `SN-…` · Cập nhật |
| Tab | Thông tin · **Cây thiết bị** · Lịch sử |
| Nhóm **Định danh** | Serial number `*` · Part number · Jabil ID · Asset |
| Nhóm **Phân loại** | Type (chọn part number → theo part number, khóa) · Level (có cha → theo cha, khóa; khi xem ghi nhỏ "theo thiết bị cha") · Status |
| Nhóm **Vị trí & quan hệ** | Location `*` (đã chọn cha thì khóa, hiện vị trí của cha — "Theo thiết bị cha, bỏ chọn cha để đặt vị trí riêng"; khi xem ghi nhỏ "theo thiết bị cha") · Thiết bị cha (không bắt buộc; chọn được cả khi thêm lẫn khi sửa, tìm theo serial / part number / vị trí; không chọn được chính nó và con cháu; khi xem: chip SN · PN bấm để mở, chưa có cha thì "Không có cha" + thao tác chữ **Gắn vào thiết bị cha**) · Thiết bị con (cả dòng; khi xem: chip SN · PN của con trực tiếp, bấm để mở, + thao tác chữ **Thêm thiết bị con**). Thao tác trong ô là nút dạng chữ (không viền) và chỉ hiện khi xem, với người sửa được. Sửa cha: chọn cha mới = Đổi cha (vị trí theo cha mới, cả cây con đi theo); bỏ trống = Tách khỏi cha (giữ vị trí hiện tại, rồi đổi vị trí nếu có chọn) |
| Nhóm **Ghi chú** | Remark (bắt buộc khi trạng thái yêu cầu) |
| Nhóm **Hiệu chuẩn** (chỉ đọc, từ module Calibration) | Có trong Dashboard hiệu chuẩn: Status · Calibration date · Due date (màu đỏ / vàng) · Vendor · Chu kỳ · nút "Mở chi tiết hiệu chuẩn". Không có: "Chưa theo dõi hiệu chuẩn" + lý do (chưa có part number / part number chưa có trong Configuration › Hiệu chuẩn › Setup) |
| `[Thao tác ▾]` (màn hình thao tác) | Thêm thiết bị con (mở form Thêm thiết bị, cha điền sẵn và **khóa** — hiện SN · PN · vị trí của cha; muốn cha khác thì lưu xong rồi Đổi cha; Location ghi "Theo thiết bị cha.") · Đổi vị trí · Gắn vào thiết bị cha (khi chưa có cha) / Đổi cha (khi đã có cha) · Swap (đổi cha, vị trí và trạng thái; xem trước ghi rõ mỗi bên nhận chỗ nào, trạng thái nào) · Tách khỏi cha · Xóa (Admin; thiết bị có con mở màn hình Xóa riêng, không có con thì xác nhận ở footer). Đổi cha / Tách khỏi cha cũng làm được ngay trong form Sửa |
| Thiết bị có con | Mọi thao tác trên làm thiết bị di chuyển / bị xóa (và đổi cha / vị trí trong form Sửa) hiện cảnh báo vàng "A có n thiết bị con: …" và **bắt buộc chọn** (không có mặc định, nút Xác nhận khóa đến khi chọn): **Đi theo** — cả nhánh đi cùng; **Ở lại chỗ cũ** — con giữ vị trí, gắn vào thiết bị đến thay (Swap) hoặc thiết bị cha cũ (không có thì đứng riêng). Mỗi lựa chọn ghi rõ kết quả; mục Kết quả liệt kê con đi đâu. Xóa: "Xóa cả thiết bị con" / "Giữ lại thiết bị con". Swap hai thiết bị cùng cha + cùng vị trí mà chọn Đi theo (hoặc không bên nào có con) → báo "không thay đổi gì", khóa Xác nhận |
| Sau thao tác | Tải lại cả masterlist (thiết bị đổi chỗ, thiết bị con, cờ "có con", cột Thiết bị cha đều cập nhật), không chỉ dòng đang xem |

#### Tab Cây thiết bị (sơ đồ phân tầng)

Mục đích duy nhất: **nhìn nhanh cấu trúc cha – con**. Mỗi dòng chỉ hiện **Part number** và **Serial number**; muốn xem gì thêm thì bấm vào dòng để mở chi tiết thiết bị đó. Dạng **cây thụt lề** (giống cây thư mục) — vừa với panel, giống hệt trên điện thoại, thu gọn được từng nhánh.

```
[🔍 Tìm PN / SN trong cây ]           [Mở hết] [Thu gọn] [Về thiết bị đang xem]

▾ P12316   SN-000                       ← thiết bị cha
  ├─ ▾ P20001   SN-001                  ← đang xem: viền đậm, nền nhạt
  │    ├─   P30005   SN-010
  │    └─   P30006   SN-011
  └─ ▸ P20002   SN-002                  ← nhánh đang thu gọn (có con)
```

| Thành phần | Quy tắc |
| --- | --- |
| Mỗi dòng | `▸/▾` (chỉ khi có con) · **Part number** (đậm) · Serial number. Không có PN thì hiện `—` |
| Hai vùng bấm | Bấm `▸/▾` **chỉ** mở / đóng nhánh; bấm phần còn lại của dòng mở chi tiết thiết bị đó |
| Dòng đang xem | Viền đậm màu chọn + nền nhạt — không thêm chữ / tag |
| Đường nối | Đường dọc / ngang nối cha → con theo cấp |
| Mặc định khi mở | Mở sẵn chuỗi từ gốc đến thiết bị đang xem và một cấp con của nó; nếu cả cây ≤ 30 thiết bị thì mở hết |
| `[Mở hết]` / `[Thu gọn]` | Mở / đóng toàn bộ nhánh |
| Ô tìm | Gõ PN hoặc SN → tô nổi bật dòng khớp, tự mở các nhánh chứa dòng khớp |
| `[Về thiết bị đang xem]` | Cuộn lại và mở nhánh tới dòng đang xem |
| Tên dài | Cắt bằng `…`; rê chuột / giữ ngón tay hiện đầy đủ |
| Bàn phím | `↑ ↓` chọn dòng, `→` mở nhánh, `←` đóng nhánh, `Enter` mở chi tiết |

Không hiện trong cây: icon / tên loại, trạng thái, vị trí, dòng tổng số cha / con / cháu — xem trong tab Thông tin.

### 4.2 Calibration

**Masterlist:**

| No | Status | Serial number | Part number | Type | Location | Vendor | Calibration date | Due date | Chu kỳ | Remark |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ● Active | SN-001 | P12316 | Tester | B3F1 | ABC Lab | 15/12/2025 | **15/12/2026** | 12 tháng | |

Cột Due date tô đỏ (quá hạn) / vàng (sắp đến hạn). Serial, Part number, Type, Location lấy từ thiết bị (chỉ đọc).

**Detail Panel:**

| Phần | Nội dung |
| --- | --- |
| Header | **Serial number** · tag Status / P/N · Type / Due date (màu) · Chu kỳ N tháng |
| Nút chính | **`[Ghi nhận hiệu chuẩn]`** (Admin, User) |
| Tab | Thông tin · Lịch sử (có bộ lọc "Chỉ lần hiệu chuẩn") |
| Nhóm **Thiết bị** (chỉ đọc) | Serial · Part number · Type · Location · nút "Mở thiết bị" |
| Nhóm **Hiệu chuẩn** | Vendor · Calibration date · Due date (Tự tính; Over Due / Due Soon theo số ngày báo trước). Status nằm ở nhóm Thiết bị, chỉ đọc — là status của thiết bị |
| Nhóm **Chu kỳ** (chỉ đọc, từ Configuration) | Chu kỳ (tháng) · Báo trước (ngày) |
| Nhóm **Ghi chú** | Remark |

| Nút | Dùng khi | Màn hình | Ghi lịch sử |
| --- | --- | --- | --- |
| `[Ghi nhận hiệu chuẩn]` | Vừa hiệu chuẩn xong | Màn hình thao tác: Ngày hiệu chuẩn `*` · Status `*` · Vendor · Remark · xem trước "Hạn mới: dd/mm/yyyy" | `CALIBRATE` |
| `[Sửa]` | Sửa thông tin nhập sai (kể cả ngày) | Sửa tại chỗ trong tab Thông tin | `UPDATE` |

Không có `+ Thêm` và không xóa: thiết bị tự lên / rời Dashboard theo Configuration › Hiệu chuẩn › Setup.

### 4.3 Golden

**Masterlist:**

| No | Status | Part number | Serial number | UTD part number | Location | Origin | Purpose | Remark |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ● Active | PCBA-7781 | GS-0001 | UTD-7781-A | B3F2 | Customer | ICT check | |

**Detail Panel:**

| Phần | Nội dung |
| --- | --- |
| Header | **Serial number** · tag Status / P/N / 📍 Location · Cập nhật |
| Tab | Thông tin · Lịch sử |
| Nhóm **Định danh** | Part number `*` · Serial number `*` · UTD part number |
| Nhóm **Vị trí & trạng thái** | Location `*` · Status |
| Nhóm **Thông tin thêm** | Origin · Purpose |
| Nhóm **Ghi chú** | Remark |
| `[Thao tác ▾]` | Xóa (Admin) |

### 4.4 Configuration

Mỗi trang cấu hình (Part Number, Location, Type, Status, Level, Department; Hiệu chuẩn: Setup, Vendor) dùng cùng Masterlist + Detail Panel.

**Masterlist:** `No` + các cột của bảng đó.

| Trang | Cột |
| --- | --- |
| Location / Part Number / Level / Department / Vendor | No · Tên · Thứ tự · Đang dùng |
| Type | No · Tên · Mô tả · Thứ tự · Đang dùng |
| Status | No · Tên · Bắt buộc remark · Màu · Thứ tự (một danh sách chung cho cả project) |
| Setup | No · Part number · Chu kỳ (tháng) · Báo trước (ngày) · Status mặc định. Part number chỉ chọn khi thêm (trong các PN đang có thiết bị) |

**Detail Panel:**

| Phần | Nội dung |
| --- | --- |
| Header | **`display_name`** (Setup: part number) · tag Đang dùng / Đã ẩn / Tên trang cấu hình |
| Tab | Thông tin · Lịch sử |
| Nhóm **Thông tin** | Đủ các trường như cột masterlist |
| `[Thao tác ▾]` | Ẩn / Hiện lại (bảng có `is_active`) · Xóa (`statuses`, `calibration_configurations`) |

### 4.5 User Management

**Masterlist:**

| No | Trạng thái | Họ tên | Username | Email | Mã nhân viên | Phòng ban | Nhóm quyền |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ● Chờ duyệt | Nguyễn Văn A | nguyenvana | a.nguyen@jabil.com | 100234 | TE | Readonly |

Lọc nhanh "Chờ duyệt" để admin xử lý tài khoản đăng ký.

**Detail Panel:**

| Phần | Nội dung |
| --- | --- |
| Header | **Họ tên** · tag Trạng thái tài khoản · tag Nhóm quyền / username / Phòng ban · Tạo lúc |
| Nút chính | Tài khoản `pending`: `[Duyệt]` `[Từ chối]` — màn hình thao tác (duyệt thì chọn nhóm quyền) |
| Tab | Thông tin · Lịch sử |
| Nhóm **Tài khoản** | Username `*` · Họ tên `*` · Email · Mã nhân viên · Phòng ban |
| Nhóm **Phân quyền** | Nhóm quyền (Admin / User / Readonly) |
| Nhóm **Trạng thái** (chỉ đọc) | Trạng thái tài khoản · Duyệt bởi · Duyệt lúc · Loại tài khoản (Supabase / Local) · Phải đổi mật khẩu (Có / Không) |
| `[Thao tác ▾]` (màn hình thao tác) | Đặt lại mật khẩu · Khóa / Mở khóa |

Không hiện: mật khẩu đã băm, `token_version`, `sessions_revoked_at`.

---

## 5. Cần bạn review

1. **Cột Masterlist** của Calibration, Golden, Configuration, User Management (mục 4.2–4.5) — đã hiện đủ trường giống Equipment; thứ tự cột có cần đổi không?
2. **Bố cục trên điện thoại** (mục 3.11) — danh sách dạng thẻ, thanh đáy có nút chính + Thao tác, `‹ ›` ở thanh trên. Có ổn không?

## 6. Triển khai

| Component | File | Ghi chú |
| --- | --- | --- |
| `Masterlist`, `RowCard`, `ColumnSettings` | [components/ui/masterlist/](../components/ui/masterlist) | Tải đủ dữ liệu một lần, tìm / lọc / sắp xếp ngay trên trình duyệt; vẽ dần 200 dòng khi cuộn. Xuất Excel đúng cột và dòng đang hiện. Điện thoại: thẻ (`RowCard`) thay bảng; `usePhone` ([lib/client/usePhone.ts](../lib/client/usePhone.ts)) là nơi duy nhất quyết định "đang ở điện thoại" cho JS |
| `DetailPanel`, `DetailSection`, `DetailValue` | [components/ui/detail/DetailPanel.tsx](../components/ui/detail/DetailPanel.tsx) | Header, tab, thân cuộn, footer |
| `ActionMenu` | [components/ui/ActionMenu.tsx](../components/ui/ActionMenu.tsx) | Nút `[Thao tác ▾]` / `⋮`: danh sách thả xuống; trên điện thoại mở từ đáy màn hình |
| `RecordDetail`, `ActionScreen`, `ActionField` | [components/ui/detail/RecordDetail.tsx](../components/ui/detail/RecordDetail.tsx) | Xem / Sửa / Thêm mới / Thao tác / Xóa; nhóm "Thông tin hệ thống" tự thêm ở cuối |
| `DetailHistory` | [components/ui/detail/DetailHistory.tsx](../components/ui/detail/DetailHistory.tsx) | Dòng thời gian `Trường: cũ → mới` |
| `ModuleWorkspace` | [components/ui/workspace/ModuleWorkspace.tsx](../components/ui/workspace/ModuleWorkspace.tsx) | Masterlist + Detail Panel; `?id=` mở lại bản ghi, `?new=1` mở thêm mới, `?tool=` mở công cụ của module (`tools`, ví dụ Import) cùng khung bên phải; ‹ › và phím ↑ ↓ / J K |
| `RecordPage` | [components/ui/workspace/RecordPage.tsx](../components/ui/workspace/RecordPage.tsx) | Toàn trang: `/equipment/{id}`, `/calibration/{id}`, `/golden/{id}`, `/users/{id}` |
| Equipment | [components/equipment/](../components/equipment) | Tab Cây thiết bị, màn hình Đổi vị trí / Đổi cha / Swap / Tách khỏi cha; Import Excel ([EquipmentImport.tsx](../components/equipment/EquipmentImport.tsx), server [lib/services/equipmentImport.ts](../lib/services/equipmentImport.ts)) |
| Calibration | [components/calibration/](../components/calibration) | Ghi nhận hiệu chuẩn; nhóm Hiệu chuẩn gắn vào chi tiết thiết bị qua [equipmentExtension.tsx](../components/calibration/equipmentExtension.tsx) — trang [app/(app)/equipment/page.tsx](../app/(app)/equipment/page.tsx) ghép hai module, Equipment không import Calibration |
| Golden, Configuration, User Management | [components/golden/](../components/golden), [components/configuration/](../components/configuration), [components/users/](../components/users) | |

Bổ sung khi làm:

- **Lọc nhanh** cạnh Bộ lọc: Calibration có "Quá hạn" / "Sắp đến hạn"; User Management có "Chờ duyệt (n)". Dòng quá hạn / sắp đến hạn có vạch màu ở mép trái.
- Trường chọn từ Configuration chỉ hiện giá trị **đang dùng**. Giá trị đã ẩn mà bản ghi đang giữ vẫn hiện, kèm chữ "(Đã ẩn)".
- Serial trùng: vẫn lưu, thông báo "serial này đã có ở bản ghi khác".
- Tag trạng thái tô theo màu Admin chọn ở Configuration › Status (5 màu, `statuses.color`), luôn kèm chữ.
- Đang tải / lỗi: mọi vùng tải dữ liệu dùng `useFetch` ([lib/client/useFetch.ts](../lib/client/useFetch.ts)) — giữ dữ liệu cũ khi tải lại, bỏ qua phản hồi cũ, lỗi hiện kèm nút Thử lại. Màn hình thao tác (`ActionScreen`) tự khóa khi đang gửi; lỗi luôn là câu theo mã lỗi (`errorMessage()`), không có thao tác nào im lặng.

**Import Excel (Equipment):**

- **File mẫu** sinh lúc bấm tải (`GET /api/equipment/import/template`), nên luôn khớp Configuration lúc đó — ví dụ Admin có Level 1–5 thì file ghi "Chọn: 1, 2, 3, 4, 5". Sheet `Equipment`: dòng 1 ghi chú từng cột nhận gì (bắt buộc, độ dài, danh sách, Status nào cần Remark), dòng 2 tiêu đề (`*` = bắt buộc), nhập từ dòng 3. Cột chọn có ô thả xuống; bấm vào ô hiện chú thích; ô dạng chữ (giữ số 0 đầu serial). Thêm sheet Hướng dẫn và Giá trị hợp lệ (nguồn của ô thả xuống, khóa sửa). Configuration đổi thì tải lại mẫu.
- **Cột** theo thứ tự form Thêm thiết bị: Serial number ✔, Part number, Jabil ID, Asset, Type, Level, Status, Location ✔ (trừ khi có cha), Parent serial number, Parent part number, Remark.
- **Thiết bị cha**: `Parent serial number` tìm trong thiết bị đã có **và** các dòng khác của file (không phân biệt hoa / thường, thứ tự dòng không quan trọng — dòng con đứng trước dòng cha vẫn được). `Parent part number` chỉ cần khi serial đó trùng ở nhiều thiết bị (tìm cả mã đã ẩn). Có cha thì để trống Location: vị trí theo cha (cả chuỗi cha – con trong file); ghi Location khác vị trí của cha → lỗi. Không tìm thấy / khớp nhiều thiết bị / vòng lặp trong file → lỗi dòng đó.
- **Kiểm tra** (`POST /api/equipment/import`) cùng quy tắc với form: giá trị chọn tìm theo tên, không phân biệt hoa / thường; chưa có / đã ẩn / trạng thái không dùng cho Equipment → lỗi; Remark bắt buộc theo Status. Serial trùng (trong hệ thống hoặc trong file) chỉ cảnh báo. Báo lỗi theo số dòng Excel.
- **Tất cả hoặc không**: còn dòng lỗi thì nút Import tắt; Import kiểm tra lại từ đầu rồi ghi qua `equipment_import` trong một giao dịch, lịch sử `CREATE` nguồn `import`. Tối đa 1000 dòng, 5 MB, chỉ `.xlsx`.

**Import Excel (Golden):** cùng cách làm và giao diện ([ImportPanel](../components/ui/ImportPanel.tsx)) — `GET /api/golden/import/template`, `POST /api/golden/import`, ghi qua `golden_import`. Sheet `Golden`, cột: Part number ✔, Serial number ✔, UTD part number, Location ✔, Status ✔, Origin, Purpose, Remark. Khác Equipment: Part number là chữ tự do (không phải Configuration) và không có thiết bị cha. Mã: [lib/goldenImport.ts](../lib/goldenImport.ts), [lib/services/goldenImport.ts](../lib/services/goldenImport.ts). Cần chạy lại `database/04_functions.sql` để có `golden_import`.

**Chưa làm:** Repair làm sau theo DATABASE_MODIFIED.md.

## Tham khảo

- Side panel thay modal khi cần vẫn thấy trang phía sau — [Carbon: Create flows](https://carbondesignsystem.com/community/patterns/create-flows/), [Carbon: Modal](https://carbondesignsystem.com/components/modal/usage/)
- Danh sách + panel chi tiết — [Cloudscape: Split view](https://cloudscape.design/patterns/resource-management/view/split-view/)
- Chuyển bản ghi bằng phím / nút trước – sau — [Linear: Peek](https://linear.app/docs/peek)
- Tránh đóng nhầm và overlay chồng overlay — [NN/G: Accidental overlay dismissal](https://www.nngroup.com/articles/accidental-overlay-dismissal/)
- Cây thu gọn, hai vùng bấm, tìm trong cây — [Primer: TreeView](https://primer.style/product/components/tree-view/guidelines/), [Spectrum: Tree view](https://spectrum.adobe.com/page/tree-view/)
- Bảng cho người dùng tự chọn cột — [Cloudscape: Table view](https://cloudscape.design/patterns/resource-management/view/table-view/)
