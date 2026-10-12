# AutoPearson

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/anhtuank9/AutoPearson?quickstart=1)

AutoPearson là công cụ Playwright chạy trên máy cá nhân hoặc GitHub Codespaces để xử lý các assignment đang mở trong Pearson English Connect. Công cụ đăng nhập, duyệt assignment theo hạn nộp mới nhất, xử lý từng lesson dưới 100%, dùng **Save & Exit**, rồi tải lại danh sách để xác nhận điểm.

> Dự án độc lập, không liên kết hoặc được Pearson xác nhận. Chỉ sử dụng với tài khoản và nội dung bạn được phép thao tác.

## Chọn cách chạy

| Cách | Phù hợp khi |
| --- | --- |
| **Cách 1 — Máy tính cá nhân** | Muốn thấy và thao tác trực tiếp với cửa sổ Chrome/Edge |
| **Cách 2 — GitHub Codespaces** | Muốn chạy hoàn toàn trên máy ảo GitHub bằng Chromium headless |

## Cách 1 — Chạy trên máy tính cá nhân

### Yêu cầu

- Git và Node.js 20 trở lên.
- Google Chrome, hoặc Microsoft Edge nếu cấu hình `PEARSON_BROWSER=msedge`.
- Tài khoản có quyền truy cập Pearson English Connect.

### Windows

```powershell
git clone https://github.com/anhtuank9/AutoPearson.git
cd AutoPearson
npm ci
Copy-Item .env.example .env
notepad .env
.\run.ps1
```

### macOS hoặc Linux

```bash
git clone https://github.com/anhtuank9/AutoPearson.git
cd AutoPearson
npm ci
cp .env.example .env
# Mở .env bằng trình soạn thảo và điền tài khoản nếu muốn đăng nhập tự động.
npm start
```

Điền cả `PEARSON_USERNAME` và `PEARSON_PASSWORD` để đăng nhập tự động. Để trống cả hai nếu muốn tự đăng nhập trong cửa sổ trình duyệt. `.env` đã được loại khỏi Git.

Nếu dùng Chromium do Playwright quản lý:

```bash
npx playwright install chromium
```

Sau đó đặt `PEARSON_BROWSER=chromium` trong `.env`.

## Cách 2 — Chạy bằng GitHub Codespaces

Codespaces chạy công cụ trên máy ảo của GitHub bằng Chromium headless, nên không cần cài Node.js hoặc Chrome trên máy cá nhân.

1. Mở **Code → Codespaces → New with options** trong repository. GitHub sẽ đề xuất hai Codespaces Secret `PEARSON_USERNAME` và `PEARSON_PASSWORD`.
2. Nhập tài khoản Pearson của riêng bạn và cho phép hai secret truy cập repository này. Secret được GitHub cung cấp dưới dạng biến môi trường và không được ghi vào source code.
3. Tạo Codespace và chờ lệnh thiết lập tự cài Node dependencies cùng Chromium.
4. Trong terminal của Codespace, chạy:

```bash
npm start
```

Có thể dùng nút **Open in GitHub Codespaces** phía trên sau khi đã tạo hai secret. Chế độ headless yêu cầu đủ cả tên đăng nhập và mật khẩu; đăng nhập thủ công không khả dụng trong chế độ này.

## Cách hoạt động

- Assignment đang mở được xử lý theo hạn nộp mới nhất.
- Assignment `Submitted` hoặc `Completed`, lesson đạt 100%, và nút `START`/`CONTINUE` bị khóa được bỏ qua và báo trong kết quả.
- Trang tham khảo không có câu hỏi được chuyển qua bằng **Next**.
- Trang có nút **Done** được hoàn tất bằng nút đó.
- Trang câu hỏi được **Check** tối đa theo `PEARSON_CHECK_LIMIT`. Khi **Show Answers** xuất hiện, công cụ đọc đáp án hiển thị, ẩn đáp án, reset khi cần và điền lại.
- Các dạng đã hỗ trợ gồm ô nhập, dropdown, lựa chọn đơn/nhiều, kéo thả, sắp xếp, tô từ, bảng radio, multiple gap và nối cặp bằng canvas.
- Sau lesson cuối, công cụ dùng **Save & Exit** và xác nhận điểm trên danh sách. Lesson chưa đạt 100% được thử lại tối đa ba lượt.
- Công cụ không nhấn nút `SUBMIT` của toàn assignment.

Khi gặp loại câu hỏi chưa hỗ trợ hoặc giao diện Pearson thay đổi, công cụ dừng tại trang đó và ghi dữ liệu vào `diagnostics/` thay vì tự bỏ qua câu hỏi.

## Cấu hình

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PEARSON_USERNAME` | trống | Tên đăng nhập; phải đi cùng mật khẩu |
| `PEARSON_PASSWORD` | trống | Mật khẩu; phải đi cùng tên đăng nhập |
| `PEARSON_BROWSER` | `chrome` | `chrome`, `msedge`, một kênh beta/dev/canary, hoặc `chromium` |
| `PEARSON_HEADLESS` | `0` | Đặt `1` để chạy không có giao diện; Codespaces tự bật |
| `PEARSON_START_URL` | URL English Connect | Điểm bắt đầu; chỉ chấp nhận miền English Connect |
| `PEARSON_MAX_ASSIGNMENTS` | `100` | Giới hạn vòng lặp danh sách assignment |
| `PEARSON_MAX_PAGES` | `300` | Giới hạn số trang trong một lesson |
| `PEARSON_CHECK_LIMIT` | `5` | Số lần Check tối đa trước Show Answers |
| `PEARSON_ASSIGNMENT_FILTER` | trống | Chỉ xử lý assignment có tên chứa chuỗi này |
| `PEARSON_LESSON_FILTER` | trống | Chỉ xử lý lesson có tên chứa chuỗi này |
| `PEARSON_VIEWPORT_HEIGHT` | `900` | Chiều cao cửa sổ trình duyệt |
| `PEARSON_TRACE_ANSWERS` | `0` | Ghi trace chi tiết khi đặt thành `1` |

## Mã thoát

- `0`: không còn assignment đang mở cần xử lý trong phạm vi lọc.
- `1`: lỗi đăng nhập, giao diện, loại câu hỏi hoặc thao tác trình duyệt.
- `2`: đã chạy xong nhưng còn lesson không thể mở hoặc assignment đã đóng dưới 100%.

## Kiểm tra dự án

```bash
npm run verify
```

`npm run check` kiểm tra cú pháp. `npm test` chạy các bài kiểm thử trình duyệt cho cấu hình, Check/Reset/Uncheck, Show Answers, ô nhập, dropdown, kéo thả, Done, Save & Exit và nối cặp.

## Quyền riêng tư và chẩn đoán

- Không commit `.env`, `diagnostics/` hoặc hồ sơ trình duyệt.
- File chẩn đoán có thể chứa tên khóa học, nội dung câu hỏi, đáp án và thông tin hiển thị trên màn hình. Hãy xem và xóa dữ liệu cá nhân trước khi chia sẻ trong issue.
- Công cụ chạy cục bộ; thông tin đăng nhập chỉ được dùng để điền biểu mẫu Pearson trong phiên trình duyệt.

## Giới hạn

Giao diện và nội dung lesson do Pearson cung cấp có thể thay đổi. Bài ghi âm, nội dung bên thứ ba nhúng hoặc dạng câu hỏi mới có thể cần bộ xử lý bổ sung. Assignment bị giáo viên đóng hoặc khóa sau hạn nộp không thể được công cụ mở lại.

## Đóng góp và giấy phép

Xem [CONTRIBUTING.md](CONTRIBUTING.md) trước khi gửi thay đổi. Dự án được phát hành theo giấy phép [MIT](LICENSE).
