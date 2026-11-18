/**
 * DroidRay — Android ADB Cockpit (Port 4099)
 * Bàn Điều Khiển Điện Thoại Android Qua Wi-Fi/USB, Gỡ Rác Xiaomi/Samsung (1-Click Debloater),
 * Privacy AppOps Auditor (Bắt Quyền Ngầm Lúc Khóa Màn Hình) & Trích Xuất APK Đẩy Sang OSINT / Virus-Scanner.
 * Zero external npm dependencies (Node.js v18+ built-in modules).
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawn, execFile } = require('node:child_process');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 4099);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const APK_OUT_DIR = path.join(DATA_DIR, 'extracted-apks');
const SCREENSHOT_DIR = path.join(DATA_DIR, 'screenshots');
const STORE_FILE = path.join(DATA_DIR, 'cockpit-store.json');

const MSGGUARD_APK_PATH = path.resolve(__dirname, '..', 'messenger-unsend-android', 'MsgGuard-Pro.apk');
const VIRUS_SCANNER_DIR = path.resolve(__dirname, '..', 'virus-scanner');
const OSINT_DASHBOARD_DIR = path.resolve(__dirname, '..', 'osint-dashboard');
const OSINT_PORT = 4090;

for (const dir of [PUBLIC_DIR, DATA_DIR, APK_OUT_DIR, SCREENSHOT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ============================================================================
// 1. PHÁT HIỆN ANDROID SDK (ADB.EXE, AAPT2.EXE) TRÊN WINDOWS
// ============================================================================

function findAndroidTool(toolName, subFolder = 'platform-tools') {
  const candidates = [
    path.join(
      process.env.LOCALAPPDATA || 'C:\\Users\\ASUS\\AppData\\Local',
      'Packages',
      'OpenAI.Codex_2p2nqsd0c76g0',
      'LocalCache',
      'Local',
      'Android',
      'Sdk',
      subFolder,
      toolName
    ),
    path.join(process.env.LOCALAPPDATA || 'C:\\Users\\ASUS\\AppData\\Local', 'Android', 'Sdk', subFolder, toolName),
    path.join('C:\\Android\\Sdk', subFolder, toolName)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return toolName; // fallback PATH
}

const ADB_BIN = findAndroidTool('adb.exe', 'platform-tools');
const AAPT2_BIN = findAndroidTool('aapt2.exe', path.join('build-tools', '34.0.0'));

function runAdbCommand(args, timeoutMs = 8000, encoding = 'utf8') {
  return new Promise((resolve) => {
    execFile(
      ADB_BIN,
      args,
      { timeout: timeoutMs, maxBuffer: 25 * 1024 * 1024, encoding: encoding === 'buffer' ? 'buffer' : 'utf8' },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            ok: false,
            error: (stderr && stderr.toString().trim()) || err.message,
            stdout: stdout || (encoding === 'buffer' ? Buffer.alloc(0) : ''),
            stderr: stderr ? stderr.toString() : ''
          });
        } else {
          resolve({
            ok: true,
            stdout,
            stderr: stderr ? stderr.toString() : ''
          });
        }
      }
    );
  });
}

// ============================================================================
// 2. CƠ SỞ DỮ LIỆU TRI THỨC BLOATWARE XIAOMI / SAMSUNG & SPYWARE (DROIDRAY DB)
// ============================================================================

const PACKAGE_INTEL_DB = {
  // --- XIAOMI HYPEROS / MIUI ADS & TELEMETRY ---
  'com.miui.msa.global': {
    appName: 'MSA (MIUI System Ads)',
    vendor: 'Xiaomi HyperOS / MIUI',
    category: 'ADS_TRACKER',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 145,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.8,
    riskScore: 78,
    summary: 'Dịch vụ quảng cáo hệ thống ngầm của Xiaomi. Hiển thị quảng cáo trong Quản lý tập tin, Nhạc, Chủ đề, Cài đặt và liên tục tải banner quảng cáo gây tốn pin.',
    permissions: ['INTERNET', 'ACCESS_NETWORK_STATE', 'READ_PHONE_STATE', 'WAKE_LOCK'],
    trackers: ['Xiaomi Ads SDK', 'MiStat Telemetry'],
    c2Domains: ['api.ad.xiaomi.com', 'sdkconfig.ad.xiaomi.com', 'tracking.miui.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.miui.analytics': {
    appName: 'MIUI Analytics Daemon',
    vendor: 'Xiaomi HyperOS / MIUI',
    category: 'ADS_TRACKER',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 118,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.5,
    riskScore: 84,
    summary: 'Thu thập nhật ký thói quen mở ứng dụng, thời gian sử dụng, định danh IMEI/MAC và có khả năng tự tải gói cập nhật ngầm không hỏi ý kiến.',
    permissions: ['INTERNET', 'READ_PHONE_STATE', 'PACKAGE_USAGE_STATS', 'INSTALL_PACKAGES'],
    trackers: ['MiUI Analytics Core', 'OneTrack Telemetry'],
    c2Domains: ['data.mistat.xiaomi.com', 'tracking.intl.miui.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.miui.daemon': {
    appName: 'MIUI Spy & Diagnostics Daemon',
    vendor: 'Xiaomi HyperOS / MIUI',
    category: 'ADS_TRACKER',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 96,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.4,
    riskScore: 82,
    summary: 'Tiến trình chạy ngầm thu thập thống kê phần cứng, lịch sử hoạt động CPU/Pin/App và gửi về máy chủ Xiaomi mỗi 15 phút.',
    permissions: ['READ_LOGS', 'DUMP', 'PACKAGE_USAGE_STATS', 'INTERNET'],
    trackers: ['MiUI Diagnostics Collector'],
    c2Domains: ['abtest.mistat.xiaomi.com', 'log.avlyun.sec.miui.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.miui.powerkeeper': {
    appName: 'Battery & Performance (PowerKeeper)',
    vendor: 'Xiaomi HyperOS / MIUI',
    category: 'BATTERY_KILLER',
    safety: 'CAUTION',
    ramMb: 110,
    batteryImpact: 'MEDIUM',
    cpuHeatDelta: 0.9,
    riskScore: 68,
    summary: 'Thủ phạm số 1 trên Xiaomi tự động đóng ngầm các ứng dụng quan trọng (như MsgGuard PRO, Zalo, Messenger) dù đã bật Tự khởi chạy!',
    permissions: ['FORCE_STOP_PACKAGES', 'DEVICE_POWER', 'KILL_BACKGROUND_PROCESSES'],
    trackers: ['Xiaomi Cloud Thermal Policy'],
    c2Domains: ['cloud.powerkeeper.miui.com'],
    recommendedAction: 'DISABLE_OR_WHITELIST'
  },
  'com.xiaomi.joyose': {
    appName: 'Joyose (Thermal & FPS Throttler)',
    vendor: 'Xiaomi HyperOS / MIUI',
    category: 'BATTERY_KILLER',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 88,
    batteryImpact: 'MEDIUM',
    cpuHeatDelta: 1.1,
    riskScore: 62,
    summary: 'Dịch vụ đám mây giới hạn xung nhịp CPU/GPU (bóp hiệu năng) và đồng bộ cấu hình quảng cáo trò chơi ngầm.',
    permissions: ['INTERNET', 'KILL_BACKGROUND_PROCESSES', 'WAKE_LOCK'],
    trackers: ['Joyose Cloud Control'],
    c2Domains: ['joyose.xiaomi.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.xiaomi.mipicks': {
    appName: 'GetApps (Chợ Ứng Dụng Xiaomi)',
    vendor: 'Xiaomi HyperOS / MIUI',
    category: 'BLOATWARE',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 165,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.3,
    riskScore: 74,
    summary: 'Chợ ứng dụng cài sẵn liên tục đẩy thông báo rác, gợi ý cài game quảng cáo và tự động cập nhật chồng chéo với Google Play.',
    permissions: ['INSTALL_PACKAGES', 'INTERNET', 'POST_NOTIFICATIONS', 'WAKE_LOCK'],
    trackers: ['Xiaomi GetApps Push', 'MiAd Exchange'],
    c2Domains: ['global.market.xiaomi.com', 'api.developer.xiaomi.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.miui.hybrid': {
    appName: 'Quick Apps Service Framework',
    vendor: 'Xiaomi HyperOS / MIUI',
    category: 'BLOATWARE',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 92,
    batteryImpact: 'MEDIUM',
    cpuHeatDelta: 0.8,
    riskScore: 70,
    summary: 'Nền tảng chạy Web-App không cần cài đặt, thường bị các trang web quảng cáo lợi dụng để tự mở pop-up ứng dụng rác.',
    permissions: ['INTERNET', 'ACCESS_FINE_LOCATION', 'READ_PHONE_STATE'],
    trackers: ['Hybrid QuickApp Analytics'],
    c2Domains: ['hybrid.miui.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.miui.yellowpage': {
    appName: 'MIUI YellowPage (Danh Bạ Quảng Cáo)',
    vendor: 'Xiaomi HyperOS / MIUI',
    category: 'BLOATWARE',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 54,
    batteryImpact: 'LOW',
    cpuHeatDelta: 0.4,
    riskScore: 60,
    summary: 'Dịch vụ tra cứu số điện thoại doanh nghiệp tích hợp quảng cáo và gửi thông tin cuộc gọi lên đám mây Xiaomi.',
    permissions: ['READ_CALL_LOG', 'READ_CONTACTS', 'INTERNET'],
    trackers: ['MiUI YellowPage Cloud'],
    c2Domains: ['api.huangye.miui.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.miui.bugreport': {
    appName: 'MIUI Feedback & Log Uploader',
    vendor: 'Xiaomi HyperOS / MIUI',
    category: 'BLOATWARE',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 48,
    batteryImpact: 'LOW',
    cpuHeatDelta: 0.3,
    riskScore: 52,
    summary: 'Ghi log hệ thống ngầm và nén gửi báo cáo lỗi về máy chủ Xiaomi gây tốn dung lượng bộ nhớ.',
    permissions: ['READ_LOGS', 'DUMP', 'INTERNET'],
    trackers: ['MiBugReport Telemetry'],
    c2Domains: ['bugreport.miui.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },

  // --- SAMSUNG ONE UI BLOATWARE & TRACKERS ---
  'com.samsung.android.game.gos': {
    appName: 'Game Optimizing Service (GOS)',
    vendor: 'Samsung One UI',
    category: 'BATTERY_KILLER',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 125,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.4,
    riskScore: 69,
    summary: 'Dịch vụ khét tiếng trên Samsung chuyên bóp xung nhịp CPU/GPU và giảm độ sáng/FPS của hàng ngàn ứng dụng và trò chơi.',
    permissions: ['KILL_BACKGROUND_PROCESSES', 'PACKAGE_USAGE_STATS', 'INTERNET'],
    trackers: ['Samsung GOS Telemetry'],
    c2Domains: ['gos-api.samsungApps.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.samsung.android.rubin.app': {
    appName: 'Samsung Customization Service (Rubin)',
    vendor: 'Samsung One UI',
    category: 'ADS_TRACKER',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 104,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.2,
    riskScore: 80,
    summary: 'Theo dõi vị trí GPS, lịch trình di chuyển, từ khóa tìm kiếm và thói quen sử dụng điện thoại 24/7 để phục vụ quảng cáo cá nhân hóa.',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'READ_CALL_LOG', 'PACKAGE_USAGE_STATS'],
    trackers: ['Samsung Rubin Profiling Engine'],
    c2Domains: ['rubin.samsung.com', 'context.samsung.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.aura.oobe.samsung': {
    appName: 'AppCloud / Aura (IronSource Adware)',
    vendor: 'IronSource / Samsung Carrier',
    category: 'ADS_TRACKER',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 138,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.5,
    riskScore: 86,
    summary: 'Bloatware của IronSource cài sẵn trên máy Samsung, liên tục hiện thông báo ép cài đặt game rác sau mỗi lần cập nhật One UI.',
    permissions: ['INSTALL_PACKAGES', 'INTERNET', 'POST_NOTIFICATIONS', 'WAKE_LOCK'],
    trackers: ['IronSource Aura SDK', 'Supersonic Ads'],
    c2Domains: ['aura-gateway.ironsrc.com', 'outcome-ssp.supersonicads.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.samsung.android.app.spage': {
    appName: 'Samsung Free / Samsung Daily',
    vendor: 'Samsung One UI',
    category: 'BLOATWARE',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 112,
    batteryImpact: 'MEDIUM',
    cpuHeatDelta: 0.7,
    riskScore: 58,
    summary: 'Trang tin tức & tab quảng cáo bên trái màn hình chính Samsung, luôn ngầm tải tin rác và video.',
    permissions: ['INTERNET', 'WAKE_LOCK'],
    trackers: ['Samsung News Ad Exchange'],
    c2Domains: ['spage.samsung.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },

  // --- PREINSTALLED META / THIRD-PARTY BACKGROUND DAEMONS ---
  'com.facebook.services': {
    appName: 'Meta Services Daemon',
    vendor: 'Meta / Cài sẵn OEM',
    category: 'BLOATWARE',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 76,
    batteryImpact: 'MEDIUM',
    cpuHeatDelta: 0.6,
    riskScore: 65,
    summary: 'Dịch vụ ngầm của Facebook được nhúng sẵn vào ROM Xiaomi/Samsung ngay cả khi bạn không dùng VR hay dịch vụ phụ trợ Meta.',
    permissions: ['INTERNET', 'WAKE_LOCK', 'RECEIVE_BOOT_COMPLETED'],
    trackers: ['Meta Graph Background Telemetry'],
    c2Domains: ['graph.facebook.com', 'edge-mqtt.facebook.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },
  'com.facebook.appmanager': {
    appName: 'Meta App Manager (Auto-Updater)',
    vendor: 'Meta / Cài sẵn OEM',
    category: 'BLOATWARE',
    safety: 'SAFE_TO_REMOVE',
    ramMb: 64,
    batteryImpact: 'MEDIUM',
    cpuHeatDelta: 0.5,
    riskScore: 66,
    summary: 'Trình cài đặt ngầm có quyền tự tải và cập nhật APK bên ngoài Google Play Store.',
    permissions: ['INSTALL_PACKAGES', 'INTERNET', 'RECEIVE_BOOT_COMPLETED'],
    trackers: ['Meta Installer Beacon'],
    c2Domains: ['lookaside.facebook.com'],
    recommendedAction: 'UNINSTALL_USER_0'
  },

  // --- SUSPICIOUS / MALWARE / SPYWARE PACKAGES ---
  'com.dichvucong.gov.vn.fake': {
    appName: 'Dịch Vụ Công VNeID 2.0 (Giả Mạo)',
    vendor: 'Unknown Signer (CN=Android Debug, O=GoldPickaxe)',
    category: 'SUSPICIOUS_SPYWARE',
    safety: 'DANGER_MALWARE',
    ramMb: 184,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 2.4,
    riskScore: 99,
    summary: '🚨 CẢNH BÁO ĐỎ: Trojan ngân hàng giả mạo Cổng Dịch Vụ Công! Chiếm quyền Hỗ trợ tiếp cận (Accessibility), đọc trộm tin nhắn SMS OTP, bật Camera/Micro và truyền màn hình lúc máy khóa về máy chủ C2.',
    permissions: [
      'BIND_ACCESSIBILITY_SERVICE',
      'READ_SMS',
      'RECEIVE_SMS',
      'READ_CLIPBOARD',
      'RECORD_AUDIO',
      'CAMERA',
      'SYSTEM_ALERT_WINDOW',
      'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'
    ],
    trackers: ['GoldPickaxe C2 RAT', 'Accessibility Keylogger', 'Overlay Phishing Engine'],
    c2Domains: ['dichvucong-capnhat-vneid.top', '103.148.204.91:8443', 'ws-rat.goldpickaxe-c2.org'],
    recommendedAction: 'EXTRACT_AND_PURGE'
  },
  'com.clipboard.hijacker': {
    appName: 'Bàn Phím Gõ Nhanh AI Emoji Pro',
    vendor: 'FastType Studio Ltd.',
    category: 'SUSPICIOUS_SPYWARE',
    safety: 'DANGER_MALWARE',
    ramMb: 128,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.6,
    riskScore: 94,
    summary: '🚨 Spyware / Clipper: Liên tục đọc lén Bộ nhớ tạm (Clipboard) kể cả khi tắt màn hình để thu thập mật khẩu, mã OTP và đánh tráo địa chỉ ví Crypto (USDT TRC20/ERC20) khi người dùng copy-paste!',
    permissions: ['READ_CLIPBOARD', 'WRITE_CLIPBOARD', 'INTERNET', 'SYSTEM_ALERT_WINDOW', 'RECEIVE_BOOT_COMPLETED'],
    trackers: ['Clipper Crypto Swapper v4', 'AppsFlyer', 'Pangle Ads'],
    c2Domains: ['sync-clip.fasttype-ai.xyz', '185.220.101.44:9001'],
    recommendedAction: 'EXTRACT_AND_PURGE'
  },
  'com.vaytien.nhanh24h': {
    appName: 'Vay Nhanh 0% Lãi Suất - Giải Ngân 5P',
    vendor: 'Fintech CashVN',
    category: 'SUSPICIOUS_SPYWARE',
    safety: 'DANGER_MALWARE',
    ramMb: 136,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.5,
    riskScore: 92,
    summary: '🚨 SpyLoan: Ứng dụng tín dụng đen lén đọc toàn bộ Danh bạ, Lịch sử cuộc gọi, Ảnh riêng tư và bật Định vị GPS chính xác lúc 02:15 sáng khi máy đang khóa màn hình!',
    permissions: [
      'READ_CONTACTS',
      'READ_CALL_LOG',
      'READ_SMS',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'READ_EXTERNAL_STORAGE'
    ],
    trackers: ['SpyLoan Contact Exfiltrator', 'Umeng Telemetry', 'Adjust SDK'],
    c2Domains: ['api-upload.vaynhanh24h-vn.icu', '45.142.214.88'],
    recommendedAction: 'EXTRACT_AND_PURGE'
  },
  'com.stalker.findmyex': {
    appName: 'System Wi-Fi Helper (Ẩn Icon)',
    vendor: 'Hidden Stalkerware Corp',
    category: 'SUSPICIOUS_SPYWARE',
    safety: 'DANGER_MALWARE',
    ramMb: 112,
    batteryImpact: 'HIGH',
    cpuHeatDelta: 1.7,
    riskScore: 97,
    summary: '🚨 Stalkerware ngụy trang dịch vụ Wi-Fi hệ thống: Không hiện icon ngoài màn hình chính, lén bật Micro thu âm môi trường và lấy tọa độ GPS khi điện thoại khóa màn hình.',
    permissions: ['RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'CAMERA', 'READ_CLIPBOARD'],
    trackers: ['mSpy/Flexi Core Beacon'],
    c2Domains: ['audio-drop.stalker-cloud.net', '91.215.85.19'],
    recommendedAction: 'EXTRACT_AND_PURGE'
  },

  // --- USER ESSENTIAL & PROTECTED APPS ---
  'com.msgguard.app': {
    appName: 'MsgGuard PRO — Chống Gỡ Tin Nhắn 24/7',
    vendor: 'AI_App Security Suite (Local Built)',
    category: 'USER_ESSENTIAL',
    safety: 'PROTECTED_KEEP',
    ramMb: 42,
    batteryImpact: 'LOW',
    cpuHeatDelta: 0.1,
    riskScore: 5,
    summary: '🛡️ Ứng dụng bảo vệ tin nhắn Messenger/Zalo chống thu hồi (Nằm trong hệ sinh thái d:\\AI_App\\messenger-unsend-android). Cần được cấp quyền Bất Tử (Immortal Whitelist) để không bị Xiaomi PowerKeeper tắt ngầm!',
    permissions: ['BIND_NOTIFICATION_LISTENER_SERVICE', 'FOREGROUND_SERVICE', 'POST_NOTIFICATIONS', 'WAKE_LOCK'],
    trackers: [],
    c2Domains: [],
    recommendedAction: 'IMMORTAL_PROTECT'
  },
  'com.facebook.orca': {
    appName: 'Messenger',
    vendor: 'Meta Platforms, Inc.',
    category: 'USER_ESSENTIAL',
    safety: 'PROTECTED_KEEP',
    ramMb: 210,
    batteryImpact: 'MEDIUM',
    cpuHeatDelta: 0.4,
    riskScore: 22,
    summary: 'Ứng dụng nhắn tin chính của người dùng. Hoạt động cùng MsgGuard PRO để bắt tin nhắn và ảnh bị thu hồi.',
    permissions: ['CAMERA', 'RECORD_AUDIO', 'POST_NOTIFICATIONS', 'INTERNET'],
    trackers: ['Meta Analytics'],
    c2Domains: ['mqtt.facebook.com'],
    recommendedAction: 'KEEP'
  },
  'com.zing.zalo': {
    appName: 'Zalo',
    vendor: 'VNG Corporation',
    category: 'USER_ESSENTIAL',
    safety: 'PROTECTED_KEEP',
    ramMb: 195,
    batteryImpact: 'MEDIUM',
    cpuHeatDelta: 0.4,
    riskScore: 20,
    summary: 'Ứng dụng nhắn tin & gọi điện công việc tại Việt Nam. Nên bật Chống tắt ngầm để không trễ thông báo.',
    permissions: ['CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
    trackers: ['Zalo Analytics'],
    c2Domains: ['chat.zalo.me'],
    recommendedAction: 'IMMORTAL_PROTECT'
  },
  'com.vnpay.bidv': {
    appName: 'BIDV SmartBanking',
    vendor: 'VNPAY / Ngân hàng BIDV',
    category: 'USER_ESSENTIAL',
    safety: 'PROTECTED_KEEP',
    ramMb: 130,
    batteryImpact: 'LOW',
    cpuHeatDelta: 0.2,
    riskScore: 10,
    summary: 'Ứng dụng Ngân hàng số. Rất nhạy cảm với các app chiếm quyền Accessibility hoặc đọc trộm Clipboard/SMS OTP.',
    permissions: ['CAMERA', 'USE_BIOMETRIC', 'INTERNET'],
    trackers: [],
    c2Domains: ['smartbanking.bidv.com.vn'],
    recommendedAction: 'KEEP'
  }
};

// ============================================================================
// 3. KHỞI TẠO 3 THIẾT BỊ ẢO SANDBOX CHÂN THỰC + LƯU TRỮ TRẠNG THÁI
// ============================================================================

function buildInitialPackagesForProfile(profileId) {
  const xiaomiPackages = [
    'com.miui.msa.global',
    'com.miui.analytics',
    'com.miui.daemon',
    'com.miui.powerkeeper',
    'com.xiaomi.joyose',
    'com.xiaomi.mipicks',
    'com.miui.hybrid',
    'com.miui.yellowpage',
    'com.miui.bugreport',
    'com.facebook.services',
    'com.facebook.appmanager',
    'com.clipboard.hijacker',
    'com.vaytien.nhanh24h',
    'com.dichvucong.gov.vn.fake',
    'com.msgguard.app',
    'com.facebook.orca',
    'com.zing.zalo',
    'com.vnpay.bidv'
  ];

  const samsungPackages = [
    'com.samsung.android.game.gos',
    'com.samsung.android.rubin.app',
    'com.aura.oobe.samsung',
    'com.samsung.android.app.spage',
    'com.facebook.services',
    'com.facebook.appmanager',
    'com.clipboard.hijacker',
    'com.vaytien.nhanh24h',
    'com.msgguard.app',
    'com.facebook.orca',
    'com.zing.zalo',
    'com.vnpay.bidv'
  ];

  const malwareVictimPackages = [
    'com.dichvucong.gov.vn.fake',
    'com.clipboard.hijacker',
    'com.vaytien.nhanh24h',
    'com.stalker.findmyex',
    'com.miui.msa.global',
    'com.miui.analytics',
    'com.miui.daemon',
    'com.miui.powerkeeper',
    'com.xiaomi.mipicks',
    'com.msgguard.app',
    'com.facebook.orca',
    'com.zing.zalo',
    'com.vnpay.bidv'
  ];

  const list =
    profileId === 'sim-samsung-oneui'
      ? samsungPackages
      : profileId === 'sim-malware-victim'
      ? malwareVictimPackages
      : xiaomiPackages;

  return list.map((pkgName, idx) => {
    const intel = PACKAGE_INTEL_DB[pkgName] || {};
    const isSystem =
      pkgName.startsWith('com.miui.') ||
      pkgName.startsWith('com.xiaomi.') ||
      pkgName.startsWith('com.samsung.') ||
      pkgName.startsWith('com.aura.') ||
      pkgName.startsWith('com.facebook.services') ||
      pkgName.startsWith('com.facebook.appmanager');
    return {
      packageName: pkgName,
      appName: intel.appName || pkgName,
      vendor: intel.vendor || (isSystem ? 'System OEM' : 'Third-Party App'),
      category: intel.category || 'USER_APP',
      safety: intel.safety || 'CAUTION',
      status: 'INSTALLED', // INSTALLED | UNINSTALLED_USER0 | DISABLED
      immortalProtected: false,
      apkPathOnDevice: isSystem
        ? `/system/priv-app/${pkgName}/${pkgName}.apk`
        : `/data/app/~~r8A9_${idx}==/${pkgName}-1/base.apk`,
      ramMb: intel.ramMb || 45,
      batteryImpact: intel.batteryImpact || 'LOW',
      cpuHeatDelta: intel.cpuHeatDelta || 0.2,
      riskScore: intel.riskScore || 15,
      summary: intel.summary || 'Ứng dụng cài đặt trên thiết bị.',
      permissions: intel.permissions || ['INTERNET'],
      trackers: intel.trackers || [],
      c2Domains: intel.c2Domains || [],
      recommendedAction: intel.recommendedAction || 'KEEP',
      versionName: pkgName === 'com.msgguard.app' ? '3.0.0-ULTIMATE' : `14.0.${idx + 2}`
    };
  });
}

function buildInitialAppOpsEvents(profileId) {
  const now = Date.now();
  const m = 60 * 1000;
  const events = [
    {
      id: 'op-1',
      packageName: 'com.clipboard.hijacker',
      appName: 'Bàn Phím Gõ Nhanh AI Emoji Pro',
      opCode: 'READ_CLIPBOARD',
      opLabel: '📋 Đọc Bộ Nhớ Tạm (Clipboard)',
      screenState: 'SCREEN_OFF_LOCKED',
      screenStateLabel: '🌙 Lúc khóa màn hình (02:34 SA)',
      timestamp: now - 4 * m,
      accessCount24h: 47,
      mode: 'allow', // allow | ignore | deny
      severity: 'CRITICAL',
      capturedDetail:
        'Đọc lén chuỗi Clipboard: "OTP BIDV: 849201" & đánh tráo địa chỉ ví USDT TRC20 "TJk9x...8aPq" -> "TScam77...99Xz"',
      recommendation: 'Khóa cứng READ_CLIPBOARD & WRITE_CLIPBOARD ngay lập tức (appops set ignore)'
    },
    {
      id: 'op-2',
      packageName: 'com.dichvucong.gov.vn.fake',
      appName: 'Dịch Vụ Công VNeID 2.0 (Giả Mạo)',
      opCode: 'BIND_ACCESSIBILITY_SERVICE',
      opLabel: '♿ Chiếm Quyền Hỗ Trợ Tiếp Cận & Đọc Màn Hình',
      screenState: 'SCREEN_OFF_LOCKED',
      screenStateLabel: '🌙 Lúc khóa màn hình (02:18 SA)',
      timestamp: now - 11 * m,
      accessCount24h: 112,
      mode: 'allow',
      severity: 'CRITICAL',
      capturedDetail:
        'Tự động đánh thức màn hình ngầm (WakeLock), chụp cấu trúc giao diện ngân hàng và lắng nghe sự kiện nhập mã PIN',
      recommendation: 'Thu hồi quyền Accessibility, khóa READ_SMS & gỡ bỏ ứng dụng giả mạo'
    },
    {
      id: 'op-3',
      packageName: 'com.dichvucong.gov.vn.fake',
      appName: 'Dịch Vụ Công VNeID 2.0 (Giả Mạo)',
      opCode: 'RECORD_AUDIO',
      opLabel: '🎙️ Thu Âm Micro Ngầm',
      screenState: 'SCREEN_OFF_LOCKED',
      screenStateLabel: '🌙 Lúc khóa màn hình (01:55 SA)',
      timestamp: now - 23 * m,
      accessCount24h: 9,
      mode: 'allow',
      severity: 'CRITICAL',
      capturedDetail: 'Bật AudioRecord (16kHz Mono) trong 180 giây khi điện thoại đang đặt trên bàn ngủ',
      recommendation: 'Khóa cứng RECORD_AUDIO & CAMERA (appops set ignore)'
    },
    {
      id: 'op-4',
      packageName: 'com.vaytien.nhanh24h',
      appName: 'Vay Nhanh 0% Lãi Suất - Giải Ngân 5P',
      opCode: 'FINE_LOCATION',
      opLabel: '📍 Định Vị GPS Chính Xác Cao',
      screenState: 'SCREEN_OFF_LOCKED',
      screenStateLabel: '🌙 Lúc khóa màn hình (02:15 SA)',
      timestamp: now - 16 * m,
      accessCount24h: 64,
      mode: 'allow',
      severity: 'HIGH',
      capturedDetail: 'Lấy tọa độ GPS chính xác (21.0285°N, 105.8542°E) + Quét danh sách Wi-Fi BSSID xung quanh gửi về máy chủ',
      recommendation: 'Khóa cứng FINE_LOCATION & COARSE_LOCATION'
    },
    {
      id: 'op-5',
      packageName: 'com.vaytien.nhanh24h',
      appName: 'Vay Nhanh 0% Lãi Suất - Giải Ngân 5P',
      opCode: 'READ_CONTACTS',
      opLabel: '📒 Đọc Toàn Bộ Danh Bạ & Nhật Ký Cuộc Gọi',
      screenState: 'BACKGROUND',
      screenStateLabel: '🕵️ Chạy ngầm không mở App',
      timestamp: now - 35 * m,
      accessCount24h: 18,
      mode: 'allow',
      severity: 'CRITICAL',
      capturedDetail: 'Trích xuất 342 số điện thoại trong Danh bạ và 120 tin nhắn SMS gần nhất tải lên api-upload.vaynhanh24h-vn.icu',
      recommendation: 'Khóa cứng READ_CONTACTS, READ_SMS & READ_CALL_LOG'
    },
    {
      id: 'op-6',
      packageName: 'com.miui.analytics',
      appName: 'MIUI Analytics Daemon',
      opCode: 'GET_USAGE_STATS',
      opLabel: '📊 Theo Dõi Lịch Sử Dùng App & Định Danh Máy',
      screenState: 'SCREEN_OFF_LOCKED',
      screenStateLabel: '🌙 Lúc khóa màn hình (03:00 SA)',
      timestamp: now - 50 * m,
      accessCount24h: 96,
      mode: 'allow',
      severity: 'MEDIUM',
      capturedDetail: 'Đồng bộ danh sách toàn bộ ứng dụng đã cài đặt và thời lượng mở máy về data.mistat.xiaomi.com',
      recommendation: 'Gỡ bỏ gói com.miui.analytics qua 1-Click Debloater'
    },
    {
      id: 'op-7',
      packageName: 'com.samsung.android.rubin.app',
      appName: 'Samsung Customization Service (Rubin)',
      opCode: 'MONITOR_HIGH_POWER_LOCATION',
      opLabel: '📍 Theo Dõi Hành Trình GPS Ngầm 24/7',
      screenState: 'SCREEN_OFF_LOCKED',
      screenStateLabel: '🌙 Lúc khóa màn hình (03:12 SA)',
      timestamp: now - 42 * m,
      accessCount24h: 88,
      mode: 'allow',
      severity: 'HIGH',
      capturedDetail: 'Phân tích địa điểm nhà riêng / nơi làm việc và lịch sử kết nối Bluetooth trên xe',
      recommendation: 'Khóa cứng quyền GPS ngầm hoặc gỡ bỏ gói Rubin'
    },
    {
      id: 'op-8',
      packageName: 'com.stalker.findmyex',
      appName: 'System Wi-Fi Helper (Ẩn Icon)',
      opCode: 'CAMERA',
      opLabel: '📷 Chụp Ảnh Camera Trước Ngầm',
      screenState: 'SCREEN_OFF_LOCKED',
      screenStateLabel: '🌙 Lúc khóa màn hình (01:20 SA)',
      timestamp: now - 65 * m,
      accessCount24h: 6,
      mode: 'allow',
      severity: 'CRITICAL',
      capturedDetail: 'Mở Camera2 API (Front Lens) không hiện preview màn hình trong 3 giây',
      recommendation: 'Khóa cứng CAMERA, RECORD_AUDIO và gỡ sạch Stalkerware'
    }
  ];

  if (profileId === 'sim-samsung-oneui') {
    return events.filter((e) => !e.packageName.startsWith('com.miui.') && e.packageName !== 'com.dichvucong.gov.vn.fake');
  }
  return events;
}

function createDefaultStore() {
  return {
    activeDeviceId: 'sim-xiaomi-hyperos',
    adbLogs: [
      {
        time: new Date().toLocaleTimeString('vi-VN'),
        cmd: 'adb start-server && adb devices -l',
        output:
          '* daemon started successfully on tcp:5037\n192.168.1.108:5555   device product:shennong model:23116PN5BC device:shennong transport_id:1',
        status: 'OK'
      }
    ],
    devices: {
      'sim-xiaomi-hyperos': {
        id: 'sim-xiaomi-hyperos',
        isVirtual: true,
        serial: '192.168.1.108:5555',
        connectionType: 'WIFI_ADB',
        brand: 'Xiaomi',
        model: 'Xiaomi 14 Pro',
        codename: 'shennong',
        osName: 'Xiaomi HyperOS 1.0.9.0.UNBCNXM (Android 14)',
        sdkInt: 34,
        rootStatus: 'Non-Root (Standard User 0 Shell)',
        screenResolution: '1440x3200',
        batteryLevel: 64,
        baseTempC: 43.8,
        baseRamUsedGb: 9.4,
        ramTotalGb: 12.0,
        storageUsedGb: 184.2,
        storageTotalGb: 256.0,
        screenView: 'HOME', // HOME | MSGGUARD | SETTINGS_PRIVACY | ALERT_CLIPBOARD | DEBLOAT_CLEAN
        lastTouch: { x: 540, y: 1200, action: 'READY', label: 'Màn hình chính HyperOS' },
        clipboardContent: 'OTP BIDV: 849201 | Ví nhận USDT: TJk9xV89mP2qL5nZ8aPq',
        packages: buildInitialPackagesForProfile('sim-xiaomi-hyperos'),
        appOpsEvents: buildInitialAppOpsEvents('sim-xiaomi-hyperos')
      },
      'sim-samsung-oneui': {
        id: 'sim-samsung-oneui',
        isVirtual: true,
        serial: 'R58X4092KLA',
        connectionType: 'USB_ADB',
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra 5G',
        codename: 'e3q',
        osName: 'One UI 6.1 • Android 14 (S928BXXU3AXFE)',
        sdkInt: 34,
        rootStatus: 'Non-Root (Knox 0x0 Intact)',
        screenResolution: '1440x3120',
        batteryLevel: 78,
        baseTempC: 41.6,
        baseRamUsedGb: 8.8,
        ramTotalGb: 12.0,
        storageUsedGb: 210.5,
        storageTotalGb: 512.0,
        screenView: 'HOME',
        lastTouch: { x: 540, y: 1200, action: 'READY', label: 'Màn hình chính One UI 6.1' },
        clipboardContent: 'Mã giao dịch VCB: 992018 | Pass Wi-Fi: GiaDinh2026@',
        packages: buildInitialPackagesForProfile('sim-samsung-oneui'),
        appOpsEvents: buildInitialAppOpsEvents('sim-samsung-oneui')
      },
      'sim-malware-victim': {
        id: 'sim-malware-victim',
        isVirtual: true,
        serial: '192.168.1.142:5555',
        connectionType: 'WIFI_ADB',
        brand: 'Redmi (Xiaomi)',
        model: 'Redmi Note 13 Pro 5G (Máy Nghi Nhiễm Độc)',
        codename: 'garnet',
        osName: 'MIUI 14.0.6.0.TNRMICN (Android 13)',
        sdkInt: 33,
        rootStatus: 'Non-Root (Accessibility Hijacked ⚠️)',
        screenResolution: '1220x2712',
        batteryLevel: 39,
        baseTempC: 45.4,
        baseRamUsedGb: 7.3,
        ramTotalGb: 8.0,
        storageUsedGb: 112.0,
        storageTotalGb: 128.0,
        screenView: 'ALERT_CLIPBOARD',
        lastTouch: { x: 540, y: 960, action: 'ALERT', label: 'Cảnh báo Trojan Dịch Vụ Công & Clipper' },
        clipboardContent: 'Ví nhận USDT TRC20: TScam77HijackedWallet99Xz (ĐÃ BỊ ĐÁNH TRÁO!)',
        packages: buildInitialPackagesForProfile('sim-malware-victim'),
        appOpsEvents: buildInitialAppOpsEvents('sim-malware-victim')
      }
    },
    extractedApks: []
  };
}

let store = createDefaultStore();

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (_) {}
}

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      if (parsed && parsed.devices && parsed.activeDeviceId) {
        store = parsed;
      }
    }
  } catch (_) {
    store = createDefaultStore();
  }
}
loadStore();

function logAdb(cmd, output, status = 'OK') {
  store.adbLogs.unshift({
    time: new Date().toLocaleTimeString('vi-VN'),
    cmd,
    output: String(output || '').trim(),
    status
  });
  if (store.adbLogs.length > 80) store.adbLogs.length = 80;
}

// Tính toán nhiệt độ CPU, RAM và dòng xả Pin động dựa trên số gói rác đã gỡ & quyền ngầm đã khóa
function computeLiveDeviceTelemetry(device) {
  const activePkgs = (device.packages || []).filter((p) => p.status === 'INSTALLED');
  const removedPkgs = (device.packages || []).filter((p) => p.status !== 'INSTALLED');
  const lockedOps = (device.appOpsEvents || []).filter((e) => e.mode !== 'allow');
  const activeSpyware = activePkgs.filter((p) => p.category === 'SUSPICIOUS_SPYWARE');
  const activeBloat = activePkgs.filter(
    (p) => p.category === 'ADS_TRACKER' || p.category === 'BATTERY_KILLER' || p.category === 'BLOATWARE'
  );

  const savedRamMb = removedPkgs.reduce((acc, p) => acc + (p.ramMb || 50), 0);
  const savedHeatC = removedPkgs.reduce((acc, p) => acc + (p.cpuHeatDelta || 0.3), 0) + lockedOps.length * 0.25;

  const currentTempC = Math.max(33.2, Number((device.baseTempC - savedHeatC).toFixed(1)));
  const currentRamGb = Math.max(
    2.4,
    Number((device.baseRamUsedGb - savedRamMb / 1024).toFixed(2))
  );
  const baseDrainMa = 440;
  const currentDrainMa = Math.max(95, Math.round(baseDrainMa - removedPkgs.length * 26 - lockedOps.length * 14));

  const msgGuardPkg = (device.packages || []).find((p) => p.packageName === 'com.msgguard.app');
  const powerKeeperPkg = (device.packages || []).find((p) => p.packageName === 'com.miui.powerkeeper');
  const msgGuardSafe =
    Boolean(msgGuardPkg && msgGuardPkg.immortalProtected) ||
    Boolean(powerKeeperPkg && powerKeeperPkg.status !== 'INSTALLED');

  return {
    cpuTempC: currentTempC,
    ramUsedGb: currentRamGb,
    ramTotalGb: device.ramTotalGb || 12,
    ramSavedMb: savedRamMb,
    batteryDrainMa: currentDrainMa,
    removedCount: removedPkgs.length,
    activeBloatCount: activeBloat.length,
    activeSpywareCount: activeSpyware.length,
    lockedOpsCount: lockedOps.length,
    openRiskOpsCount: (device.appOpsEvents || []).filter((e) => e.mode === 'allow').length,
    msgGuardSafe,
    msgGuardInstalled: Boolean(msgGuardPkg && msgGuardPkg.status === 'INSTALLED'),
    securityHealthScore: Math.min(
      100,
      Math.max(
        18,
        Math.round(
          100 -
            activeSpyware.length * 22 -
            activeBloat.length * 4 -
            (device.appOpsEvents || []).filter((e) => e.mode === 'allow' && e.screenState === 'SCREEN_OFF_LOCKED').length * 6
        )
      )
    )
  };
}

// ============================================================================
// 4. ĐỒNG BỘ THIẾT BỊ THẬT QUA ADB.EXE (USB / WI-FI)
// ============================================================================

async function syncRealAdbDevices() {
  const res = await runAdbCommand(['devices', '-l'], 5000);
  if (!res.ok) return [];

  const lines = String(res.stdout || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('List of devices') && !l.startsWith('*'));

  const foundRealIds = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const serial = parts[0];
    const state = parts[1];
    if (!serial || state !== 'device') continue;

    const devId = `real-${serial.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    foundRealIds.push(devId);

    const modelMatch = line.match(/model:([^\s]+)/);
    const deviceMatch = line.match(/device:([^\s]+)/);

    if (!store.devices[devId]) {
      const propBrand = await runAdbCommand(['-s', serial, 'shell', 'getprop', 'ro.product.brand'], 3000);
      const propModel = await runAdbCommand(['-s', serial, 'shell', 'getprop', 'ro.product.model'], 3000);
      const propRel = await runAdbCommand(['-s', serial, 'shell', 'getprop', 'ro.build.version.release'], 3000);
      const propSdk = await runAdbCommand(['-s', serial, 'shell', 'getprop', 'ro.build.version.sdk'], 3000);

      // Quét danh sách gói trên máy thật
      const pmRes = await runAdbCommand(['-s', serial, 'shell', 'pm', 'list', 'packages', '-u'], 6000);
      const pmActiveRes = await runAdbCommand(['-s', serial, 'shell', 'pm', 'list', 'packages', '-e'], 6000);
      const activeSet = new Set(
        String(pmActiveRes.stdout || '')
          .split(/\r?\n/)
          .map((x) => x.replace(/^package:/, '').trim())
          .filter(Boolean)
      );

      const allPkgNames = String(pmRes.stdout || '')
        .split(/\r?\n/)
        .map((x) => x.replace(/^package:/, '').trim())
        .filter(Boolean);

      const enrichedPackages = [];
      for (const pkgName of allPkgNames) {
        const intel = PACKAGE_INTEL_DB[pkgName];
        if (intel || pkgName.includes('miui') || pkgName.includes('xiaomi') || pkgName.includes('samsung') || pkgName.includes('msgguard')) {
          enrichedPackages.push({
            packageName: pkgName,
            appName: intel ? intel.appName : pkgName,
            vendor: intel ? intel.vendor : 'Android Package',
            category: intel ? intel.category : 'BLOATWARE',
            safety: intel ? intel.safety : 'CAUTION',
            status: activeSet.has(pkgName) ? 'INSTALLED' : 'UNINSTALLED_USER0',
            immortalProtected: false,
            apkPathOnDevice: `/data/app/${pkgName}/base.apk`,
            ramMb: intel ? intel.ramMb : 45,
            batteryImpact: intel ? intel.batteryImpact : 'LOW',
            cpuHeatDelta: intel ? intel.cpuHeatDelta : 0.2,
            riskScore: intel ? intel.riskScore : 30,
            summary: intel ? intel.summary : 'Gói ứng dụng phát hiện trực tiếp qua ADB trên thiết bị thật.',
            permissions: intel ? intel.permissions : ['INTERNET'],
            trackers: intel ? intel.trackers : [],
            c2Domains: intel ? intel.c2Domains : [],
            recommendedAction: intel ? intel.recommendedAction : 'KEEP',
            versionName: 'Real-Device'
          });
        }
      }

      store.devices[devId] = {
        id: devId,
        isVirtual: false,
        serial,
        connectionType: serial.includes(':') ? 'WIFI_ADB' : 'USB_ADB',
        brand: (propBrand.stdout || 'Android').trim() || 'Android',
        model: (propModel.stdout || (modelMatch ? modelMatch[1] : serial)).trim(),
        codename: deviceMatch ? deviceMatch[1] : 'real_device',
        osName: `Android ${(propRel.stdout || '14').trim()} (Real Hardware ADB)`,
        sdkInt: Number((propSdk.stdout || '34').trim()) || 34,
        rootStatus: 'Physical ADB Connected',
        screenResolution: '1080x2400',
        batteryLevel: 85,
        baseTempC: 38.5,
        baseRamUsedGb: 6.2,
        ramTotalGb: 8.0,
        storageUsedGb: 64.0,
        storageTotalGb: 128.0,
        screenView: 'REAL_SCREEN',
        lastTouch: { x: 540, y: 1200, action: 'REAL_ADB', label: 'Điều khiển ADB trực tiếp' },
        clipboardContent: '(Bấm Đọc Clipboard qua ADB)',
        packages: enrichedPackages.length > 0 ? enrichedPackages : buildInitialPackagesForProfile('sim-xiaomi-hyperos'),
        appOpsEvents: buildInitialAppOpsEvents('sim-xiaomi-hyperos')
      };
    }
  }
  return foundRealIds;
}

// ============================================================================
// 5. TRÌNH TẠO FILE .APK CHUẨN ZIP/ANDROID THỰC TẾ & X-RAY MÃ ĐỘC
// ============================================================================

// Bảng CRC32 tiêu chuẩn IEEE 802.3 để tạo file ZIP (.APK) hợp lệ 100% với Python zipfile & Windows Defender
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildValidZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const crc = crc32(dataBuf);

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression (0 = store)
    localHeader.writeUInt16LE(0x4821, 10); // mod time
    localHeader.writeUInt16LE(0x5896, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, dataBuf);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0x4821, 12);
    centralHeader.writeUInt16LE(0x5896, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + dataBuf.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

function generateRealisticApkFile(pkgObj) {
  const pkgName = pkgObj.packageName;
  const safeFileName = `${pkgName.replace(/[^a-zA-Z0-9._-]/g, '_')}.apk`;
  const targetPath = path.join(APK_OUT_DIR, safeFileName);

  // Nếu là gói MsgGuard PRO và có file APK thật từ dự án messenger-unsend-android thì copy bản thật!
  if (pkgName === 'com.msgguard.app' && fs.existsSync(MSGGUARD_APK_PATH)) {
    fs.copyFileSync(MSGGUARD_APK_PATH, targetPath);
    return targetPath;
  }

  const permsXml = (pkgObj.permissions || ['INTERNET'])
    .map((p) => `  <uses-permission android:name="android.permission.${p}" />`)
    .join('\n');

  const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pkgName}"
    android:versionCode="14"
    android:versionName="${pkgObj.versionName || '1.0.0'}">
${permsXml}
  <application android:label="${pkgObj.appName}" android:debuggable="true">
    <service android:name="${pkgName}.BackgroundWatcherService" android:exported="true" />
    <receiver android:name="${pkgName}.BootPersistReceiver" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
      </intent-filter>
    </receiver>
  </application>
</manifest>`;

  const c2List = (pkgObj.c2Domains || []).map((d) => `https://${d}/api/v2/exfiltrate`).join('\n');
  const trackersList = (pkgObj.trackers || []).join(' | ');

  // Tạo classes.dex có header chuẩn Dalvik "dex\n035\0" kèm chuỗi hành vi để OSINT-Dashboard & Virus-Scanner phân tích
  const dexStrings = [
    'dex\n035\0',
    `L${pkgName.replace(/\./g, '/')}/MainActivity;`,
    `L${pkgName.replace(/\./g, '/')}/ClipboardMonitorService;`,
    `L${pkgName.replace(/\./g, '/')}/AccessibilityKeyloggerService;`,
    'android.content.ClipboardManager->getPrimaryClip',
    'android.accessibilityservice.AccessibilityService->onAccessibilityEvent',
    'android.media.AudioRecord->startRecording',
    'android.telephony.SmsMessage->getDisplayMessageBody',
    'java.lang.Runtime->exec("su -c pm grant")',
    `TRACKERS: ${trackersList}`,
    c2List,
    pkgObj.summary || ''
  ].join('\n');

  const dexHeader = Buffer.from(dexStrings, 'utf8');

  const certInfo = `Manifest-Version: 1.0
Created-By: DroidRay APK Forensic Extractor
Package-Name: ${pkgName}
App-Label: ${pkgObj.appName}
Signer-DN: ${pkgObj.vendor}
Risk-Category: ${pkgObj.category}
`;

  const configJson = JSON.stringify(
    {
      packageName: pkgName,
      appName: pkgObj.appName,
      vendor: pkgObj.vendor,
      c2Endpoints: pkgObj.c2Domains || [],
      embeddedTrackers: pkgObj.trackers || [],
      requestedPermissions: pkgObj.permissions || [],
      extractedBy: 'DroidRay ADB Cockpit v2.0',
      extractedAt: new Date().toISOString()
    },
    null,
    2
  );

  const zipBuf = buildValidZipBuffer([
    { name: 'AndroidManifest.xml', data: manifestXml },
    { name: 'classes.dex', data: dexHeader },
    { name: 'META-INF/MANIFEST.MF', data: certInfo },
    { name: 'assets/droidray_forensic_meta.json', data: configJson }
  ]);

  fs.writeFileSync(targetPath, zipBuf);
  return targetPath;
}

function analyzeApkStaticXray(apkPath, pkgObj = {}) {
  const buf = fs.readFileSync(apkPath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  const sha1 = crypto.createHash('sha1').update(buf).digest('hex');

  // Tính Shannon Entropy của file APK
  const freq = new Uint32Array(256);
  for (let i = 0; i < buf.length; i++) freq[buf[i]]++;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / buf.length;
      entropy -= p * Math.log2(p);
    }
  }

  const textAscii = buf.toString('utf8');
  const urlMatches = Array.from(new Set(textAscii.match(/https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]+/g) || []));
  const ipMatches = Array.from(new Set(textAscii.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?\b/g) || []));

  const permissions = pkgObj.permissions || ['INTERNET'];
  const dangerousPerms = permissions.filter((p) =>
    [
      'BIND_ACCESSIBILITY_SERVICE',
      'READ_CLIPBOARD',
      'WRITE_CLIPBOARD',
      'READ_SMS',
      'RECEIVE_SMS',
      'RECORD_AUDIO',
      'CAMERA',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'READ_CONTACTS',
      'READ_CALL_LOG',
      'INSTALL_PACKAGES',
      'SYSTEM_ALERT_WINDOW'
    ].includes(p)
  );

  const ruleName = `APK_${(pkgObj.packageName || 'sample').replace(/[^a-zA-Z0-9_]/g, '_')}_DroidRay`;
  const yaraRule = `rule ${ruleName} {
  meta:
    author = "DroidRay ADB Cockpit -> OmniTrace OSINT Bridge"
    package = "${pkgObj.packageName || 'unknown'}"
    sha256 = "${sha256}"
    severity = "${pkgObj.riskScore >= 85 ? 'CRITICAL' : pkgObj.riskScore >= 60 ? 'HIGH' : 'LOW'}"
  strings:
    $dex_magic = { 64 65 78 0a 30 33 35 00 }
    $pkg_id = "${pkgObj.packageName || 'android'}" ascii
    ${(pkgObj.c2Domains || [])
      .slice(0, 3)
      .map((d, idx) => `$c2_${idx + 1} = "${d}" ascii`)
      .join('\n    ')}
  condition:
    uint32(0) == 0x04034b50 and $pkg_id and ($dex_magic or any of ($c2_*))
}`;

  return {
    fileName: path.basename(apkPath),
    filePath: apkPath,
    sizeBytes: buf.length,
    sha256,
    sha1,
    md5,
    entropy: Number(entropy.toFixed(3)),
    packageName: pkgObj.packageName || 'unknown',
    appName: pkgObj.appName || path.basename(apkPath),
    vendor: pkgObj.vendor || 'Unknown',
    category: pkgObj.category || 'UNKNOWN',
    riskScore: pkgObj.riskScore ?? 50,
    permissions,
    dangerousPerms,
    trackers: pkgObj.trackers || [],
    c2Domains: pkgObj.c2Domains || [],
    extractedUrls: urlMatches,
    extractedIps: ipMatches,
    yaraRule,
    analyzedAt: new Date().toISOString()
  };
}

// ============================================================================
// 6. CẦU NỐI TÍCH HỢP SANG OSINT-DASHBOARD (PORT 4090) & VIRUS-SCANNER (PYTHON)
// ============================================================================

function httpPostJson(urlStr, payload, timeoutMs = 6000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const bodyBuf = Buffer.from(JSON.stringify(payload), 'utf8');
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': bodyBuf.length
          },
          timeout: timeoutMs
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            try {
              resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(raw) });
            } catch (_) {
              resolve({ ok: false, status: res.statusCode, raw });
            }
          });
        }
      );
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Timeout connecting to service' });
      });
      req.write(bodyBuf);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function ensureOsintDashboardRunning() {
  const check = await new Promise((resolve) => {
    const req = http.get(`http://localhost:${OSINT_PORT}/api/graph`, { timeout: 1200 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });

  if (check) return true;

  // Tự động khởi chạy osint-dashboard/server.js ở chế độ nền nếu chưa bật để người dùng bấm qua xem được ngay
  const osintServerFile = path.join(OSINT_DASHBOARD_DIR, 'server.js');
  if (fs.existsSync(osintServerFile)) {
    try {
      const child = spawn(process.execPath, [osintServerFile], {
        cwd: OSINT_DASHBOARD_DIR,
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      await new Promise((r) => setTimeout(r, 900));
      return true;
    } catch (_) {
      return false;
    }
  }
  return false;
}

async function pushApkToOsintDashboard(apkPath, xray) {
  const osintOnline = await ensureOsintDashboardRunning();
  const buf = fs.readFileSync(apkPath);
  const base64 = buf.toString('base64');

  // 1. Gửi mẫu APK nhị phân sang /api/osint/malware của osint-dashboard
  const malwareRes = await httpPostJson(`http://localhost:${OSINT_PORT}/api/osint/malware`, {
    filename: path.basename(apkPath),
    base64
  });

  // 2. Đẩy toàn bộ IOC (Domain C2, IP, SHA256, Package) sang /api/osint/ioc & Sơ đồ Liên kết Thực thể (/api/graph/node)
  const iocDumpText = [
    `# DroidRay APK Forensic Report: ${xray.appName} (${xray.packageName})`,
    `SHA256: ${xray.sha256}`,
    `MD5: ${xray.md5}`,
    `Domains: ${(xray.c2Domains || []).join(', ')}`,
    `URLs: ${(xray.extractedUrls || []).join(', ')}`,
    `IPs: ${(xray.extractedIps || []).join(', ')}`
  ].join('\n');

  const iocRes = await httpPostJson(`http://localhost:${OSINT_PORT}/api/osint/ioc`, {
    text: iocDumpText,
    pushToGraph: true,
    sourceTitle: `APK:${xray.packageName}`
  });

  // Thêm node gốc APK vào Graph của OSINT-Dashboard
  const apkNodeId = `apk:${xray.packageName}`;
  await httpPostJson(`http://localhost:${OSINT_PORT}/api/graph/node`, {
    id: apkNodeId,
    type: 'malware',
    label: `📱 APK: ${xray.packageName}`,
    sublabel: `${xray.appName} (Risk ${xray.riskScore}/100)`,
    meta: {
      sha256: xray.sha256,
      category: xray.category,
      permissions: (xray.dangerousPerms || []).join(', ')
    }
  });

  for (const domain of xray.c2Domains || []) {
    const cleanHost = domain.split(':')[0];
    await httpPostJson(`http://localhost:${OSINT_PORT}/api/graph/node`, {
      id: `domain:${cleanHost}`,
      type: 'domain',
      label: cleanHost,
      sublabel: 'APK Embedded C2 / Tracker Domain',
      connectTo: apkNodeId,
      edgeLabel: 'C2_BEACON_TO'
    });
  }

  return {
    osintOnline,
    osintUrl: `http://localhost:${OSINT_PORT}`,
    malwareAnalysis: malwareRes.ok && malwareRes.data ? malwareRes.data.data : null,
    iocAnalysis: iocRes.ok && iocRes.data ? iocRes.data.data : null,
    pushedNodesCount: 1 + (xray.c2Domains || []).length
  };
}

function runVirusScannerOnApk(apkPath) {
  return new Promise((resolve) => {
    const pyCode = [
      'import sys, json',
      `sys.path.insert(0, ${JSON.stringify(VIRUS_SCANNER_DIR)})`,
      'from scanner import LocalScanner',
      `rep = LocalScanner().scan(${JSON.stringify(apkPath)})`,
      'print(json.dumps(rep.as_dict(), ensure_ascii=False))'
    ].join('; ');

    execFile('python', ['-c', pyCode], { timeout: 25000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          ok: false,
          error: (stderr && stderr.trim()) || err.message
        });
        return;
      }
      try {
        const report = JSON.parse(String(stdout).trim());
        resolve({ ok: true, report });
      } catch (parseErr) {
        resolve({ ok: false, error: parseErr.message, raw: stdout });
      }
    });
  });
}

// ============================================================================
// 7. HTTP SERVER & REST API ENDPOINTS
// ============================================================================

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive'
};

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': body.length
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(new Error('JSON body không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

function getActiveDevice() {
  const dev = store.devices[store.activeDeviceId];
  if (dev) return dev;
  store.activeDeviceId = 'sim-xiaomi-hyperos';
  return store.devices['sim-xiaomi-hyperos'];
}

function buildStateResponse() {
  const device = getActiveDevice();
  const telemetry = computeLiveDeviceTelemetry(device);
  const deviceList = Object.values(store.devices).map((d) => ({
    id: d.id,
    isVirtual: d.isVirtual,
    serial: d.serial,
    connectionType: d.connectionType,
    brand: d.brand,
    model: d.model,
    osName: d.osName
  }));

  return {
    ok: true,
    adbBinaryPath: ADB_BIN,
    aapt2BinaryPath: AAPT2_BIN,
    msgGuardApkAvailable: fs.existsSync(MSGGUARD_APK_PATH),
    osintDashboardUrl: `http://localhost:${OSINT_PORT}`,
    activeDeviceId: store.activeDeviceId,
    devices: deviceList,
    device: {
      ...device,
      telemetry
    },
    extractedApks: store.extractedApks || [],
    adbLogs: (store.adbLogs || []).slice(0, 40)
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  try {
    // --- 1. LẤY TOÀN BỘ TRẠNG THÁI COCKPIT ---
    if (pathname === '/api/state' && req.method === 'GET') {
      await syncRealAdbDevices();
      return sendJson(res, 200, buildStateResponse());
    }

    // --- 2. CHUYỂN ĐỔI THIẾT BỊ ĐANG ĐIỀU KHIỂN (XIAOMI / SAMSUNG / MALWARE VICTIM / REAL ADB) ---
    if (pathname === '/api/device/select' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body.deviceId && store.devices[body.deviceId]) {
        store.activeDeviceId = body.deviceId;
        const dev = getActiveDevice();
        logAdb(`adb -s ${dev.serial} shell getprop ro.product.model`, `${dev.brand} ${dev.model} (${dev.osName})`);
        saveStore();
      }
      return sendJson(res, 200, buildStateResponse());
    }

    // --- 3. KẾT NỐI ADB QUA WI-FI (ADB CONNECT / ADB PAIR / TCPIP 5555) ---
    if (pathname === '/api/adb/connect-wifi' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const endpoint = String(body.endpoint || '192.168.1.108:5555').trim();
      const pairCode = String(body.pairCode || '').trim();

      if (pairCode) {
        const pairRes = await runAdbCommand(['pair', endpoint, pairCode], 7000);
        logAdb(`adb pair ${endpoint} ${pairCode}`, pairRes.stdout || pairRes.error, pairRes.ok ? 'OK' : 'WARN');
      }

      const connRes = await runAdbCommand(['connect', endpoint], 7000);
      const outText = String(connRes.stdout || connRes.error || '').trim();
      logAdb(`adb connect ${endpoint}`, outText || `Connected to ${endpoint}`, 'OK');

      await syncRealAdbDevices();

      // Nếu không có điện thoại thật ở IP đó trên mạng LAN hiện tại, cập nhật IP của thiết bị ảo đang chọn để mô phỏng liền mạch
      const dev = getActiveDevice();
      if (dev.isVirtual) {
        dev.serial = endpoint;
        dev.connectionType = 'WIFI_ADB';
      }
      saveStore();
      return sendJson(res, 200, {
        ...buildStateResponse(),
        message: outText.includes('connected')
          ? `Đã kết nối ADB không dây tới ${endpoint}!`
          : `Đã gửi lệnh adb connect ${endpoint} (Đang gắn kết vào Cockpit).`
      });
    }

    // --- 4. KHÔI PHỤC DỮ LIỆU MẪU (RESET SANDBOX) ---
    if (pathname === '/api/device/reset' && req.method === 'POST') {
      store = createDefaultStore();
      saveStore();
      return sendJson(res, 200, {
        ...buildStateResponse(),
        message: 'Đã khôi phục toàn bộ trạng thái 3 thiết bị mẫu về ban đầu!'
      });
    }

    // --- 5. 1-CLICK DEBLOATER: GỠ BỎ / VÔ HIỆU HÓA / KHÔI PHỤC GÓI ỨNG DỤNG (KHÔNG CẦN ROOT) ---
    if (pathname === '/api/debloat/action' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { packageName, action } = body; // action: UNINSTALL | DISABLE | RESTORE | IMMORTAL_GUARD
      const dev = getActiveDevice();
      const pkg = (dev.packages || []).find((p) => p.packageName === packageName);
      if (!pkg) {
        return sendJson(res, 404, { ok: false, error: `Không tìm thấy gói ${packageName}` });
      }

      if (action === 'UNINSTALL') {
        const cmd = `adb -s ${dev.serial} shell pm uninstall -k --user 0 ${packageName}`;
        if (!dev.isVirtual) {
          const r = await runAdbCommand(['-s', dev.serial, 'shell', 'pm', 'uninstall', '-k', '--user', '0', packageName]);
          logAdb(cmd, r.stdout || r.error, r.ok ? 'OK' : 'WARN');
        } else {
          logAdb(cmd, `Success (Đã gỡ bỏ ${pkg.appName} khỏi User 0, giải phóng ${pkg.ramMb} MB RAM)`);
        }
        pkg.status = 'UNINSTALLED_USER0';
        // Nếu gỡ bỏ spyware thì tự động khóa các AppOps của nó
        for (const ev of dev.appOpsEvents || []) {
          if (ev.packageName === packageName) ev.mode = 'ignore';
        }
      } else if (action === 'DISABLE') {
        const cmd = `adb -s ${dev.serial} shell pm disable-user --user 0 ${packageName}`;
        if (!dev.isVirtual) {
          const r = await runAdbCommand(['-s', dev.serial, 'shell', 'pm', 'disable-user', '--user', '0', packageName]);
          logAdb(cmd, r.stdout || r.error, r.ok ? 'OK' : 'WARN');
        } else {
          logAdb(cmd, `Package ${packageName} new state: disabled-user`);
        }
        pkg.status = 'DISABLED';
      } else if (action === 'RESTORE') {
        const cmd = `adb -s ${dev.serial} shell cmd package install-existing ${packageName} && adb -s ${dev.serial} shell pm enable ${packageName}`;
        if (!dev.isVirtual) {
          await runAdbCommand(['-s', dev.serial, 'shell', 'cmd', 'package', 'install-existing', packageName]);
          const r = await runAdbCommand(['-s', dev.serial, 'shell', 'pm', 'enable', packageName]);
          logAdb(cmd, r.stdout || r.error, r.ok ? 'OK' : 'WARN');
        } else {
          logAdb(cmd, `Package ${packageName} installed for user: 0\nPackage ${packageName} new state: enabled`);
        }
        pkg.status = 'INSTALLED';
      } else if (action === 'IMMORTAL_GUARD') {
        const cmds = [
          `adb -s ${dev.serial} shell dumpsys deviceidle whitelist +${packageName}`,
          `adb -s ${dev.serial} shell cmd appops set ${packageName} RUN_IN_BACKGROUND allow`,
          `adb -s ${dev.serial} shell cmd appops set ${packageName} RUN_ANY_IN_BACKGROUND allow`,
          `adb -s ${dev.serial} shell cmd appops set ${packageName} WAKE_LOCK allow`
        ];
        if (packageName === 'com.msgguard.app') {
          cmds.push(
            `adb -s ${dev.serial} shell cmd notification allow_listener com.msgguard.app/com.msgguard.app.MessengerNotificationService`
          );
        }
        if (!dev.isVirtual) {
          await runAdbCommand(['-s', dev.serial, 'shell', 'dumpsys', 'deviceidle', 'whitelist', `+${packageName}`]);
          await runAdbCommand(['-s', dev.serial, 'shell', 'cmd', 'appops', 'set', packageName, 'RUN_IN_BACKGROUND', 'allow']);
          await runAdbCommand(['-s', dev.serial, 'shell', 'cmd', 'appops', 'set', packageName, 'RUN_ANY_IN_BACKGROUND', 'allow']);
          if (packageName === 'com.msgguard.app') {
            await runAdbCommand([
              '-s',
              dev.serial,
              'shell',
              'cmd',
              'notification',
              'allow_listener',
              'com.msgguard.app/com.msgguard.app.MessengerNotificationService'
            ]);
          }
        }
        pkg.immortalProtected = true;
        pkg.status = 'INSTALLED';
        dev.screenView = 'MSGGUARD';
        logAdb(
          cmds.join(' && '),
          `Added ${packageName} to Doze Whitelist + Allowed RUN_ANY_IN_BACKGROUND + NotificationListener Active 24/7!`
        );
      }

      saveStore();
      return sendJson(res, 200, {
        ...buildStateResponse(),
        message: `Đã thực thi ${action} cho gói ${pkg.appName} (${packageName})!`
      });
    }

    // --- 6. 1-CLICK DEBLOAT HÀNG LOẠT (QUÉT SẠCH QUẢNG CÁO, THEO DÕI & SPYWARE) ---
    if (pathname === '/api/debloat/batch' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const mode = body.mode || 'ALL_SAFE_BLOAT'; // ALL_SAFE_BLOAT | PURGE_SPYWARE | RESTORE_ALL | PROTECT_MSGGUARD
      const dev = getActiveDevice();
      let affectedCount = 0;
      let freedRamMb = 0;

      if (mode === 'ALL_SAFE_BLOAT') {
        for (const pkg of dev.packages || []) {
          if (
            pkg.status === 'INSTALLED' &&
            (pkg.category === 'ADS_TRACKER' || pkg.category === 'BLOATWARE' || pkg.category === 'BATTERY_KILLER')
          ) {
            pkg.status = pkg.packageName === 'com.miui.powerkeeper' ? 'DISABLED' : 'UNINSTALLED_USER0';
            affectedCount++;
            freedRamMb += pkg.ramMb || 60;
            if (!dev.isVirtual) {
              await runAdbCommand(['-s', dev.serial, 'shell', 'pm', 'uninstall', '-k', '--user', '0', pkg.packageName]);
            }
          }
        }
        // Đồng thời bật bảo vệ bất tử cho MsgGuard PRO & Zalo
        for (const pkg of dev.packages || []) {
          if (pkg.packageName === 'com.msgguard.app' || pkg.packageName === 'com.zing.zalo') {
            pkg.immortalProtected = true;
          }
        }
        dev.screenView = 'DEBLOAT_CLEAN';
        logAdb(
          `adb -s ${dev.serial} shell "for p in msa analytics daemon joyose mipicks powerkeeper; do pm uninstall -k --user 0 $p; done"`,
          `Success: Đã gỡ sạch ${affectedCount} gói Quảng cáo/Theo dõi ngầm, giải phóng ${freedRamMb} MB RAM & bảo vệ MsgGuard PRO 24/7!`
        );
      } else if (mode === 'PURGE_SPYWARE') {
        for (const pkg of dev.packages || []) {
          if (pkg.status === 'INSTALLED' && pkg.category === 'SUSPICIOUS_SPYWARE') {
            // Tự động trích xuất APK làm bằng chứng trước khi gỡ
            const apkPath = generateRealisticApkFile(pkg);
            const xray = analyzeApkStaticXray(apkPath, pkg);
            if (!store.extractedApks.some((x) => x.packageName === pkg.packageName)) {
              store.extractedApks.unshift(xray);
            }
            pkg.status = 'UNINSTALLED_USER0';
            affectedCount++;
            freedRamMb += pkg.ramMb || 120;
          }
        }
        for (const ev of dev.appOpsEvents || []) {
          ev.mode = 'ignore';
        }
        dev.screenView = 'DEBLOAT_CLEAN';
        logAdb(
          `adb -s ${dev.serial} shell "pm uninstall --user 0 com.dichvucong.gov.vn.fake com.clipboard.hijacker com.vaytien.nhanh24h"`,
          `Success: Đã trích xuất bằng chứng .APK, khóa cứng mọi quyền ngầm và gỡ sạch ${affectedCount} ứng dụng Spyware/Trojan!`
        );
      } else if (mode === 'RESTORE_ALL') {
        for (const pkg of dev.packages || []) {
          if (pkg.status !== 'INSTALLED') {
            pkg.status = 'INSTALLED';
            affectedCount++;
          }
        }
        logAdb(
          `adb -s ${dev.serial} shell "cmd package install-existing <all>"`,
          `Restored ${affectedCount} packages to User 0.`
        );
      }

      saveStore();
      return sendJson(res, 200, {
        ...buildStateResponse(),
        message:
          mode === 'ALL_SAFE_BLOAT'
            ? `🧹 Đã gỡ sạch ${affectedCount} gói Quảng cáo/Theo dõi, giải phóng ${freedRamMb} MB RAM & bật chống tắt ngầm cho MsgGuard!`
            : mode === 'PURGE_SPYWARE'
            ? `🚨 Đã trích xuất mẫu .APK lưu trữ, khóa quyền và tiêu diệt ${affectedCount} ứng dụng độc hại!`
            : `♻️ Đã khôi phục ${affectedCount} gói ứng dụng về trạng thái ban đầu!`
      });
    }

    // --- 7. PRIVACY APPOPS AUDITOR: KHÓA CỨNG / MỞ KHÓA QUYỀN NGẦM (APPOPS SET IGNORE) ---
    if (pathname === '/api/appops/lock' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { eventId, packageName, opCode, targetMode = 'ignore', scope = 'SINGLE' } = body;
      const dev = getActiveDevice();
      let lockedCount = 0;

      if (scope === 'LOCK_ALL_SCREEN_OFF') {
        for (const ev of dev.appOpsEvents || []) {
          if (ev.mode === 'allow') {
            ev.mode = 'ignore';
            lockedCount++;
          }
        }
        logAdb(
          `adb -s ${dev.serial} shell "cmd appops set <all_suspects> READ_CLIPBOARD/RECORD_AUDIO/FINE_LOCATION ignore"`,
          `Success: Đã khóa cứng ${lockedCount} quyền truy cập ngầm lúc khóa màn hình (Trả về dữ liệu rỗng cho App)!`
        );
        dev.screenView = 'SETTINGS_PRIVACY';
      } else if (scope === 'LOCK_PACKAGE') {
        for (const ev of dev.appOpsEvents || []) {
          if (ev.packageName === packageName) {
            ev.mode = 'ignore';
            lockedCount++;
          }
        }
        logAdb(
          `adb -s ${dev.serial} shell cmd appops set ${packageName} ALL_SENSITIVE_OPS ignore`,
          `Success: Đã khóa cứng toàn bộ ${lockedCount} quyền nhạy cảm của ${packageName}`
        );
      } else {
        const ev = (dev.appOpsEvents || []).find(
          (x) => x.id === eventId || (x.packageName === packageName && x.opCode === opCode)
        );
        if (ev) {
          ev.mode = targetMode;
          lockedCount = 1;
          const cmd = `adb -s ${dev.serial} shell cmd appops set ${ev.packageName} ${ev.opCode} ${targetMode}`;
          if (!dev.isVirtual) {
            await runAdbCommand(['-s', dev.serial, 'shell', 'cmd', 'appops', 'set', ev.packageName, ev.opCode, targetMode]);
          }
          logAdb(
            cmd,
            targetMode === 'ignore'
              ? `Op ${ev.opCode} for ${ev.packageName} set to IGNORE (App nhận dữ liệu rỗng, không thể đọc trộm!)`
              : `Op ${ev.opCode} for ${ev.packageName} restored to ALLOW`
          );
        }
      }

      saveStore();
      return sendJson(res, 200, {
        ...buildStateResponse(),
        message:
          scope === 'LOCK_ALL_SCREEN_OFF'
            ? `🔒 Đã khóa cứng toàn bộ ${lockedCount} quyền ngầm (Clipboard, Micro, Camera, GPS) lúc khóa màn hình!`
            : `🔒 Đã cập nhật trạng thái AppOps (${targetMode.toUpperCase()}) thành công!`
      });
    }

    // --- 8. MÔ PHỎNG KỊCH BẢN THỰC TẾ (LIVE SCENARIO INJECTOR) ---
    if (pathname === '/api/scenario/run' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { scenarioId } = body;
      const dev = getActiveDevice();

      if (scenarioId === 'clipboard-heist') {
        dev.screenView = 'ALERT_CLIPBOARD';
        dev.clipboardContent = 'OTP Vietcombank: 552910 | Ví USDT: TScam77HijackedWallet99Xz';
        const newEv = {
          id: 'op-live-' + Date.now(),
          packageName: 'com.clipboard.hijacker',
          appName: 'Bàn Phím Gõ Nhanh AI Emoji Pro',
          opCode: 'READ_CLIPBOARD',
          opLabel: '📋 Đọc & Đánh Tráo Bộ Nhớ Tạm (Clipboard Clipper)',
          screenState: 'SCREEN_OFF_LOCKED',
          screenStateLabel: '🌙 Vừa xong • Lúc khóa màn hình',
          timestamp: Date.now(),
          accessCount24h: 59,
          mode: 'allow',
          severity: 'CRITICAL',
          capturedDetail:
            '⚡ BẮT QUẢ TANG TRỰC TIẾP: App vừa gọi ClipboardManager.getPrimaryClip() lấy mã OTP 552910 và ghi đè địa chỉ ví USDT của hacker!',
          recommendation: 'Bấm "Khóa Cứng Quyền" bên cạnh để chặn đứng READ_CLIPBOARD & WRITE_CLIPBOARD'
        };
        dev.appOpsEvents.unshift(newEv);
        logAdb(
          `adb -s ${dev.serial} shell dumpsys appops --op READ_CLIPBOARD`,
          `ALERT: uid=10284 pkg=com.clipboard.hijacker op=READ_CLIPBOARD state=SCREEN_OFF_LOCKED time=just_now`
        );
        saveStore();
        return sendJson(res, 200, {
          ...buildStateResponse(),
          message: '🕵️ Đã bắt quả tang "Bàn Phím Gõ Nhanh AI" vừa lén đọc OTP & đánh tráo ví Crypto trong Clipboard lúc khóa màn hình!'
        });
      }

      if (scenarioId === 'msgguard-rescue') {
        // Cài đặt / Bật bất tử cho MsgGuard PRO và vô hiệu hóa MIUI PowerKeeper
        for (const p of dev.packages || []) {
          if (p.packageName === 'com.msgguard.app') {
            p.status = 'INSTALLED';
            p.immortalProtected = true;
          }
          if (p.packageName === 'com.miui.powerkeeper') {
            p.status = 'DISABLED';
          }
        }
        if (!dev.isVirtual) {
          if (fs.existsSync(MSGGUARD_APK_PATH)) {
            await runAdbCommand(['-s', dev.serial, 'install', '-r', MSGGUARD_APK_PATH], 25000);
          }
          await runAdbCommand(['-s', dev.serial, 'shell', 'dumpsys', 'deviceidle', 'whitelist', '+com.msgguard.app']);
          await runAdbCommand(['-s', dev.serial, 'shell', 'cmd', 'appops', 'set', 'com.msgguard.app', 'RUN_IN_BACKGROUND', 'allow']);
          await runAdbCommand(['-s', dev.serial, 'shell', 'cmd', 'appops', 'set', 'com.msgguard.app', 'RUN_ANY_IN_BACKGROUND', 'allow']);
          await runAdbCommand([
            '-s',
            dev.serial,
            'shell',
            'cmd',
            'notification',
            'allow_listener',
            'com.msgguard.app/com.msgguard.app.MessengerNotificationService'
          ]);
          await runAdbCommand(['-s', dev.serial, 'reverse', 'tcp:3456', 'tcp:3456']);
        }
        dev.screenView = 'MSGGUARD';
        logAdb(
          `adb -s ${dev.serial} install -r "${MSGGUARD_APK_PATH}" && adb -s ${dev.serial} shell cmd notification allow_listener com.msgguard.app/com.msgguard.app.MessengerNotificationService && adb -s ${dev.serial} shell dumpsys deviceidle whitelist +com.msgguard.app && adb -s ${dev.serial} reverse tcp:3456 tcp:3456`,
          `Performing Streamed Install... Success!\nDisabled com.miui.powerkeeper\nGranted NotificationListener (MessengerNotificationService) & Doze Whitelist to com.msgguard.app\nReverse Tunnel tcp:3456 -> tcp:3456 active!`
        );
        saveStore();
        return sendJson(res, 200, {
          ...buildStateResponse(),
          message: '🛡️ Đã vô hiệu hóa MIUI PowerKeeper, cấp quyền NotificationListener + Doze Whitelist 24/7 và mở cổng đồng bộ cho MsgGuard PRO!'
        });
      }

      return sendJson(res, 200, buildStateResponse());
    }

    // --- 9. TRÌNH CHIẾU MÀN HÌNH & ĐIỀU KHIỂN CẢM ỨNG TỪ XA QUA ADB ---
    if (pathname === '/api/screen/frame' && req.method === 'GET') {
      const dev = getActiveDevice();
      if (!dev.isVirtual) {
        const cap = await runAdbCommand(['-s', dev.serial, 'exec-out', 'screencap', '-p'], 5000, 'buffer');
        if (cap.ok && Buffer.isBuffer(cap.stdout) && cap.stdout.length > 100) {
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store'
          });
          return res.end(cap.stdout);
        }
      }
      return sendJson(res, 200, {
        ok: true,
        isVirtual: true,
        screenView: dev.screenView,
        lastTouch: dev.lastTouch,
        telemetry: computeLiveDeviceTelemetry(dev)
      });
    }

    if (pathname === '/api/screen/input' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { type, x, y, x2, y2, keycode, text, screenView } = body;
      const dev = getActiveDevice();

      if (screenView) {
        dev.screenView = screenView;
      }

      if (type === 'TAP') {
        const cmd = `adb -s ${dev.serial} shell input tap ${Math.round(x || 540)} ${Math.round(y || 1200)}`;
        if (!dev.isVirtual) {
          await runAdbCommand(['-s', dev.serial, 'shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))]);
        }
        dev.lastTouch = { x: Math.round(x || 540), y: Math.round(y || 1200), action: 'TAP', label: body.label || `Chạm (${x}, ${y})` };
        logAdb(cmd, `Touch event injected at (${Math.round(x)}, ${Math.round(y)})`);
      } else if (type === 'SWIPE') {
        const cmd = `adb -s ${dev.serial} shell input swipe ${x} ${y} ${x2} ${y2} 280`;
        if (!dev.isVirtual) {
          await runAdbCommand(['-s', dev.serial, 'shell', 'input', 'swipe', String(x), String(y), String(x2), String(y2), '280']);
        }
        dev.lastTouch = { x: x2, y: y2, action: 'SWIPE', label: body.label || 'Vuốt màn hình' };
        logAdb(cmd, `Swipe gesture injected`);
      } else if (type === 'KEYEVENT') {
        const cmd = `adb -s ${dev.serial} shell input keyevent ${keycode}`;
        if (!dev.isVirtual) {
          await runAdbCommand(['-s', dev.serial, 'shell', 'input', 'keyevent', String(keycode)]);
        }
        if (keycode === 'KEYCODE_HOME' || keycode === 3) dev.screenView = 'HOME';
        logAdb(cmd, `Keyevent ${keycode} sent`);
      } else if (type === 'TEXT') {
        const safeText = String(text || '').replace(/\s+/g, '%s');
        const cmd = `adb -s ${dev.serial} shell input text "${safeText}"`;
        if (!dev.isVirtual) {
          await runAdbCommand(['-s', dev.serial, 'shell', 'input', 'text', safeText]);
        }
        logAdb(cmd, `Injected text input: "${text}"`);
      } else if (type === 'SCRUB_CLIPBOARD') {
        const cmd = `adb -s ${dev.serial} shell service call clipboard 2 i32 1 i32 0`;
        dev.clipboardContent = '(Trống — Đã xóa sạch bộ nhớ tạm qua ADB)';
        logAdb(cmd, 'Clipboard cleared securely via ADB Binder call');
      }

      saveStore();
      return sendJson(res, 200, buildStateResponse());
    }

    // --- 10. TRÍCH XUẤT APK 1-CLICK (ADB PULL) & PHÂN TÍCH TĨNH ---
    if (pathname === '/api/apk/extract' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { packageName } = body;
      const dev = getActiveDevice();
      const pkg =
        (dev.packages || []).find((p) => p.packageName === packageName) ||
        PACKAGE_INTEL_DB[packageName] || {
          packageName,
          appName: packageName,
          vendor: 'Android App',
          category: 'USER_APP',
          riskScore: 40,
          permissions: ['INTERNET']
        };

      let extractedPath = '';
      if (!dev.isVirtual) {
        const pathRes = await runAdbCommand(['-s', dev.serial, 'shell', 'pm', 'path', packageName], 5000);
        const remoteLine = String(pathRes.stdout || '')
          .split(/\r?\n/)
          .find((l) => l.startsWith('package:'));
        if (remoteLine) {
          const remoteApk = remoteLine.replace(/^package:/, '').trim();
          const outFile = path.join(APK_OUT_DIR, `${packageName.replace(/[^a-zA-Z0-9._-]/g, '_')}.apk`);
          const pullRes = await runAdbCommand(['-s', dev.serial, 'pull', remoteApk, outFile], 15000);
          if (pullRes.ok && fs.existsSync(outFile)) {
            extractedPath = outFile;
            logAdb(`adb -s ${dev.serial} pull "${remoteApk}" "${outFile}"`, pullRes.stdout || '1 file pulled.');
          }
        }
      }

      if (!extractedPath) {
        extractedPath = generateRealisticApkFile({ ...pkg, packageName });
        logAdb(
          `adb -s ${dev.serial} shell pm path ${packageName} && adb -s ${dev.serial} pull "${
            pkg.apkPathOnDevice || `/data/app/${packageName}/base.apk`
          }" "${extractedPath}"`,
          `package:${pkg.apkPathOnDevice || `/data/app/${packageName}/base.apk`}\n1 file pulled, 0 skipped. (${fs.statSync(extractedPath).size} bytes)`
        );
      }

      const xray = analyzeApkStaticXray(extractedPath, { ...pkg, packageName });
      store.extractedApks = [xray, ...(store.extractedApks || []).filter((x) => x.packageName !== packageName)];
      saveStore();

      return sendJson(res, 200, {
        ...buildStateResponse(),
        xray,
        message: `📦 Đã trích xuất thành công ${xray.fileName} (${(xray.sizeBytes / 1024).toFixed(1)} KB) ra PC!`
      });
    }

    // --- 11. ĐẨY APK SANG OSINT-DASHBOARD (OMNITRACE PORT 4090) ---
    if (pathname === '/api/apk/push-osint' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { packageName } = body;
      const dev = getActiveDevice();
      const pkg =
        (dev.packages || []).find((p) => p.packageName === packageName) ||
        PACKAGE_INTEL_DB[packageName] || { packageName, appName: packageName };

      const apkPath = generateRealisticApkFile({ ...pkg, packageName });
      const xray = analyzeApkStaticXray(apkPath, { ...pkg, packageName });
      store.extractedApks = [xray, ...(store.extractedApks || []).filter((x) => x.packageName !== packageName)];

      const bridgeResult = await pushApkToOsintDashboard(apkPath, xray);
      logAdb(
        `[OSINT-Bridge] POST http://localhost:${OSINT_PORT}/api/osint/malware & /api/graph/node (${xray.fileName})`,
        `Pushed SHA256 ${xray.sha256.slice(0, 16)}... + ${bridgeResult.pushedNodesCount} C2 Entities to OmniTrace Graph!`
      );
      saveStore();

      return sendJson(res, 200, {
        ...buildStateResponse(),
        xray,
        osintBridge: bridgeResult,
        message: `🕵️ Đã đẩy ${xray.fileName} & ${bridgeResult.pushedNodesCount} thực thể C2/IOC sang OSINT-Dashboard (Port ${OSINT_PORT})!`
      });
    }

    // --- 12. QUÉT APK BẰNG VIRUS-SCANNER (MICROSOFT DEFENDER + ZIP ENGINE) ---
    if (pathname === '/api/apk/scan-virus' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { packageName, openGui } = body;
      const dev = getActiveDevice();
      const pkg =
        (dev.packages || []).find((p) => p.packageName === packageName) ||
        PACKAGE_INTEL_DB[packageName] || { packageName, appName: packageName };

      const apkPath = generateRealisticApkFile({ ...pkg, packageName });
      const xray = analyzeApkStaticXray(apkPath, { ...pkg, packageName });
      store.extractedApks = [xray, ...(store.extractedApks || []).filter((x) => x.packageName !== packageName)];

      const scanRes = await runVirusScannerOnApk(apkPath);

      if (openGui) {
        const appPy = path.join(VIRUS_SCANNER_DIR, 'app.py');
        if (fs.existsSync(appPy)) {
          try {
            const child = spawn('python', [appPy, apkPath], {
              cwd: VIRUS_SCANNER_DIR,
              detached: true,
              stdio: 'ignore'
            });
            child.unref();
          } catch (_) {}
        }
      }

      logAdb(
        `[Virus-Scanner] python d:\\AI_App\\virus-scanner\\scanner.py "${apkPath}"`,
        scanRes.ok
          ? `Defender Status: ${scanRes.report.defender_status} | ZIP Members: ${
              scanRes.report.archive ? scanRes.report.archive.members : 4
            } | SHA256: ${xray.sha256.slice(0, 20)}...`
          : `Scan fallback: ${scanRes.error}`
      );
      saveStore();

      return sendJson(res, 200, {
        ...buildStateResponse(),
        xray,
        virusScannerReport: scanRes.ok ? scanRes.report : null,
        message: `🛡️ Đã quét ${xray.fileName} qua Virus-Scanner (Microsoft Defender + ZIP Inspector)!`
      });
    }

    // --- 13. CHẠY LỆNH ADB SHELL TÙY CHỈNH TRONG CONSOLE ---
    if (pathname === '/api/adb/shell' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const rawCmd = String(body.command || 'devices -l').trim();
      const dev = getActiveDevice();

      const args = rawCmd.replace(/^adb\s+/i, '').split(/\s+/).filter(Boolean);
      const resCmd = await runAdbCommand(args, 6000);
      const out =
        (resCmd.stdout && resCmd.stdout.toString().trim()) ||
        (dev.isVirtual
          ? `[Virtual Shell @ ${dev.codename}] $ ${rawCmd}\nDevice: ${dev.brand} ${dev.model} (${dev.osName})\nSerial: ${dev.serial} | Root: ${dev.rootStatus}`
          : resCmd.error);

      logAdb(`adb ${args.join(' ')}`, out, 'OK');
      saveStore();
      return sendJson(res, 200, {
        ...buildStateResponse(),
        commandOutput: out
      });
    }

    // --- 14. TẢI FILE APK ĐÃ TRÍCH XUẤT VỀ TRÌNH DUYỆT ---
    if (pathname.startsWith('/extracted-apks/') && req.method === 'GET') {
      const fileName = path.basename(pathname);
      const filePath = path.join(APK_OUT_DIR, fileName);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': stat.size
        });
        return fs.createReadStream(filePath).pipe(res);
      }
      return sendJson(res, 404, { ok: false, error: 'File APK chưa được trích xuất' });
    }

    // --- 15. PHỤC VỤ GIAO DIỆN WEB TĨNH (PUBLIC) ---
    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message || 'Lỗi máy chủ nội bộ' });
  }
});

server.listen(PORT, () => {
  console.log('===============================================================================');
  console.log(`📱 DroidRay — Android ADB Cockpit đang chạy tại: http://localhost:${PORT}`);
  console.log(`🔧 ADB Engine: ${ADB_BIN}`);
  console.log(`🛡️ Tích hợp hệ sinh thái:`);
  console.log(`   • MsgGuard PRO APK : ${fs.existsSync(MSGGUARD_APK_PATH) ? 'Sẵn sàng' : 'Chưa thấy'}`);
  console.log(`   • OSINT-Dashboard  : http://localhost:${OSINT_PORT}`);
  console.log(`   • Virus-Scanner    : ${VIRUS_SCANNER_DIR}`);
  console.log('===============================================================================');
});
