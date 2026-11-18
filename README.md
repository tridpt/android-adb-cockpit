# 📱 DroidRay — Android ADB Cockpit (`android-adb-cockpit`)

**Bàn Điều Khiển Điện Thoại Android Qua Wi-Fi/USB • 1-Click Xiaomi HyperOS / Samsung One UI Debloater (Không Cần Root) • Privacy AppOps Auditor • Trình Chiếu Màn Hình & Trích Xuất APK Đẩy Sang `osint-dashboard` / `virus-scanner`**

---

## 🎯 Bài Toán Thực Tế Giải Quyết

Điện thoại Android (đặc biệt là **Xiaomi HyperOS / MIUI**, **Samsung One UI**) thường gặp 3 vấn đề nghiêm trọng:
1. **Hàng chục dịch vụ ngầm chạy quảng cáo & thu thập dữ liệu** (`com.miui.msa.global`, `com.miui.analytics`, `com.miui.daemon`, `com.samsung.android.rubin.app`, `com.aura.oobe.samsung`...) gây nóng máy, ngốn RAM và tụt pin nhanh.
2. **Tự động đóng ngầm các ứng dụng quan trọng** (như **MsgGuard PRO**, Zalo, Messenger) do cơ chế `com.miui.powerkeeper` / `Joyose` / `Samsung GOS`.
3. **Ứng dụng lạ / Trojan giả mạo** (như app giả mạo Dịch Vụ Công VNeID, Bàn phím AI lạ, App vay tiền tín dụng đen) lén đọc **Bộ nhớ tạm (Clipboard chứa OTP / địa chỉ ví Crypto)**, bật **Định vị GPS**, **Camera**, **Micro** lúc máy đang khóa màn hình ban đêm.

---

## ✨ 3 Tính Năng Cốt Lõi

### 1. 🧹 1-Click Xiaomi / Samsung Debloater & Bảo Vệ App Quan Trọng (Không Cần Root)
- Tự động quét danh sách gói trên điện thoại và đối chiếu với **Cơ sở dữ liệu DroidRay Bloatware & Spyware Intelligence**.
- Phân loại trực quan:
  - `📢 Quảng cáo & Theo dõi ngầm` (`MSA`, `Analytics`, `MIUI Daemon`, `Samsung Rubin`, `AppCloud Aura`...)
  - `🔥 Gây nóng máy & Tự đóng App ngầm` (`MIUI PowerKeeper`, `Joyose`, `Samsung GOS`...)
  - `🗑️ App rác cài sẵn` (`GetApps`, `Quick Apps`, `YellowPage`, `Samsung Free`, `Meta Services`...)
  - `🚨 Nghi vấn Mã độc / Spyware` (Giả mạo VNeID, Clipper đánh tráo ví Crypto, SpyLoan, Stalkerware...)
  - `🛡️ Ứng dụng quan trọng cần bảo vệ` (`MsgGuard PRO`, `Zalo`, `Messenger`, `SmartBanking`...)
- **Gỡ bỏ & Khôi phục an toàn 1-Click**: Dùng `adb shell pm uninstall -k --user 0 <pkg>` và khôi phục tức thì bằng `adb shell cmd package install-existing <pkg>` mà không cần Root hay mở khóa Bootloader.
- **Chống tắt ngầm 24/7 cho MsgGuard PRO**: Cấp quyền Doze Whitelist (`dumpsys deviceidle whitelist +com.msgguard.app`), `RUN_ANY_IN_BACKGROUND allow` và vô hiệu hóa `PowerKeeper`.

### 2. 🕵️ Privacy AppOps Auditor (Bắt Quả Tang Quyền Ngầm Lúc Khóa Màn Hình)
- Soi lịch sử `dumpsys appops` chi tiết theo từng mốc thời gian và trạng thái màn hình (`🌙 Lúc khóa màn hình` vs `🕵️ Chạy ngầm`).
- Bắt quả tang ứng dụng lén gọi `READ_CLIPBOARD` (đọc OTP / đánh tráo địa chỉ ví USDT), `RECORD_AUDIO`, `CAMERA`, `FINE_LOCATION`, `READ_SMS`, `BIND_ACCESSIBILITY_SERVICE`.
- **1-Click Khóa Cứng (`appops set <pkg> <OP> ignore`)**: Trả về dữ liệu rỗng (Clipboard trống, Micro im lặng) khiến ứng dụng theo dõi bị vô hiệu hóa hoàn toàn mà không báo lỗi.

### 3. 📦 Trình Chiếu Màn Hình & Trích Xuất APK 1-Click ➔ `osint-dashboard` / `virus-scanner`
- **Live Screen Mirror & Touch Remote**: Xem màn hình điện thoại trực tiếp trên trình duyệt, click chuột để chạm (`adb shell input tap`), bấm Home/Back/Đa nhiệm, gửi văn bản từ bàn phím PC và xóa sạch Clipboard chống lộ OTP.
- **Trích xuất `.APK` 1-Click (`pm path` + `adb pull`)**: Rút file `.APK` của bất kỳ ứng dụng nào trên điện thoại ra thư mục `data/extracted-apks/` trên PC.
- **Mổ xẻ & Liên thông hệ sinh thái**:
  - **Đẩy thẳng sang `osint-dashboard` (OmniTrace - Port `4090`)**: Gửi nhị phân APK tới `/api/osint/malware`, sinh quy tắc **YARA**, trích xuất C2 Domains/IPs và tự động vẽ nút liên kết trên đồ thị điều tra.
  - **Đẩy thẳng sang `virus-scanner`**: Gọi trực tiếp `d:\AI_App\virus-scanner\scanner.py` để quét bằng **Microsoft Defender** + kiểm tra cấu trúc nén ZIP/APK, hoặc mở thẳng cửa sổ giao diện `virus-scanner` trên Desktop.

---

## 🚀 Cách Khởi Chạy

```bash
cd d:\AI_App\android-adb-cockpit
node server.js
```
Hoặc nhấp đúp vào file `start.bat`, sau đó mở trình duyệt tại:
👉 **http://localhost:4099**
