/**
 * DroidRay — Android ADB Cockpit Frontend Controller
 */

let cockpitState = null;
let currentPkgFilter = 'ALL';
let currentPkgSearch = '';
let currentOpsFilter = 'ALL';
let currentXrayResult = null;
let currentOsintBridge = null;
let currentVirusReport = null;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const banner = document.getElementById('toast-banner');
  if (!banner) return;
  banner.innerHTML = `<span>${escapeHtml(msg)}</span><button class="btn-xs" onclick="document.getElementById('toast-banner').classList.add('hidden')">✕</button>`;
  banner.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    banner.classList.add('hidden');
  }, 6000);
}

async function apiCall(url, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach((sec) => {
    sec.classList.toggle('active', sec.id === tabId);
  });
}

// ============================================================================
// 1. RENDER CÁC CHỈ SỐ TELEMETRY & HEADER
// ============================================================================

function renderHeaderAndTelemetry() {
  if (!cockpitState || !cockpitState.device) return;
  const dev = cockpitState.device;
  const tele = dev.telemetry || {};

  // Dropdown chọn thiết bị
  const selectEl = document.getElementById('device-select');
  selectEl.innerHTML = (cockpitState.devices || [])
    .map(
      (d) =>
        `<option value="${escapeHtml(d.id)}" ${d.id === cockpitState.activeDeviceId ? 'selected' : ''}>${
          d.isVirtual ? '📱' : '🔌 [MÁY THẬT]'
        } ${escapeHtml(d.brand)} ${escapeHtml(d.model)} (${escapeHtml(d.serial)})</option>`
    )
    .join('');

  // Connection pill
  const connPill = document.getElementById('header-conn-pill');
  connPill.textContent = `${dev.connectionType === 'WIFI_ADB' ? '📡 Wi-Fi ADB' : '🔌 USB ADB'}: ${dev.serial}`;

  // ADB binary path
  const adbLabel = document.getElementById('adb-bin-label');
  if (adbLabel && cockpitState.adbBinaryPath) {
    adbLabel.textContent = cockpitState.adbBinaryPath;
  }

  // Telemetry Cards
  const tempEl = document.getElementById('tele-temp');
  const tempSub = document.getElementById('tele-temp-sub');
  const cardTemp = document.getElementById('card-temp');
  tempEl.textContent = `${tele.cpuTempC}°C`;
  if (tele.cpuTempC >= 41) {
    cardTemp.className = 'tele-card bad';
    tempSub.textContent = `🔥 Nóng máy do ${tele.activeBloatCount + tele.activeSpywareCount} tiến trình ngầm`;
  } else if (tele.cpuTempC >= 37.5) {
    cardTemp.className = 'tele-card warn';
    tempSub.textContent = 'Ấm nhẹ • Có thể tối ưu thêm';
  } else {
    cardTemp.className = 'tele-card good';
    tempSub.textContent = '❄️ Mát mẻ • Đã dọn sạch rác ngầm';
  }

  const ramEl = document.getElementById('tele-ram');
  const ramSub = document.getElementById('tele-ram-sub');
  const cardRam = document.getElementById('card-ram');
  ramEl.textContent = `${tele.ramUsedGb} / ${tele.ramTotalGb} GB`;
  ramSub.textContent = `Đã giải phóng: +${tele.ramSavedMb} MB (${tele.removedCount} gói đã gỡ)`;
  cardRam.className = tele.ramSavedMb >= 400 ? 'tele-card good' : 'tele-card';

  const drainEl = document.getElementById('tele-drain');
  const drainSub = document.getElementById('tele-drain-sub');
  const cardBat = document.getElementById('card-battery');
  drainEl.textContent = `-${tele.batteryDrainMa} mA`;
  if (tele.batteryDrainMa >= 300) {
    cardBat.className = 'tele-card bad';
    drainSub.textContent = '⚠️ Hao pin ngầm lúc tắt màn hình';
  } else {
    cardBat.className = 'tele-card good';
    drainSub.textContent = '🔋 Tiết kiệm pin tối ưu (Deep Sleep)';
  }

  const msgEl = document.getElementById('tele-msgguard');
  const msgSub = document.getElementById('tele-msgguard-sub');
  const cardMsg = document.getElementById('card-msgguard');
  if (tele.msgGuardSafe) {
    msgEl.textContent = 'Bất tử 24/7 🛡️';
    msgSub.textContent = 'Doze Whitelist + Chặn PowerKeeper';
    cardMsg.className = 'tele-card good';
  } else {
    msgEl.textContent = 'Bị bóp ngầm ⚠️';
    msgSub.textContent = 'Nguy cơ bị MIUI PowerKeeper tự đóng!';
    cardMsg.className = 'tele-card bad';
  }

  const scoreEl = document.getElementById('tele-score');
  const scoreSub = document.getElementById('tele-score-sub');
  const cardScore = document.getElementById('card-score');
  scoreEl.textContent = `${tele.securityHealthScore} / 100`;
  if (tele.securityHealthScore >= 85) {
    cardScore.className = 'tele-card good';
    scoreSub.textContent = '✅ Thiết bị Sạch & Quyền riêng tư Khóa kín';
  } else if (tele.securityHealthScore >= 60) {
    cardScore.className = 'tele-card warn';
    scoreSub.textContent = `Còn ${tele.openRiskOpsCount} quyền ngầm & ${tele.activeBloatCount} gói rác`;
  } else {
    cardScore.className = 'tele-card bad';
    scoreSub.textContent = `🚨 Phát hiện ${tele.activeSpywareCount} Spyware & ${tele.openRiskOpsCount} quyền ngầm!`;
  }

  // Tab Badges
  document.getElementById('badge-bloat-count').textContent = tele.activeBloatCount + tele.activeSpywareCount;
  document.getElementById('badge-ops-count').textContent = tele.openRiskOpsCount;
  document.getElementById('badge-apk-count').textContent = (cockpitState.extractedApks || []).length;
}

// ============================================================================
// 2. RENDER MÀN HÌNH ĐIỆN THOẠI TRỰC TIẾP (LIVE SCREEN MIRROR)
// ============================================================================

function renderPhoneMirror() {
  if (!cockpitState || !cockpitState.device) return;
  const dev = cockpitState.device;
  const tele = dev.telemetry || {};

  document.getElementById('mirror-device-title').textContent = `${dev.model} • ${dev.osName}`;
  document.getElementById('phone-battery-pill').textContent = `🔋 ${dev.batteryLevel}%`;
  document.getElementById('live-clipboard-text').textContent = dev.clipboardContent || '(Trống)';

  document.querySelectorAll('.mirror-mode-switch .btn-mini').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === dev.screenView);
  });

  const viewport = document.getElementById('phone-viewport');

  // Nếu là máy thật kết nối qua ADB thì tải ảnh chụp màn hình trực tiếp từ /api/screen/frame
  if (!dev.isVirtual) {
    viewport.innerHTML = `
      <div class="phone-widget-card" style="text-align:center;">
        <div style="font-size:12px;font-weight:700;color:#38bdf8;margin-bottom:6px;">📡 Màn hình thật qua ADB Screencap</div>
        <img src="/api/screen/frame?t=${Date.now()}" alt="Real ADB Screen" style="width:100%;border-radius:10px;border:1px solid rgba(255,255,255,0.15);" onerror="this.style.display='none'" />
        <p style="font-size:11px;color:#94a3b8;margin-top:6px;">Click vào bất kỳ vị trí nào để gửi lệnh <code>adb shell input tap X Y</code></p>
      </div>
    `;
    return;
  }

  // Màn hình cảnh báo đánh tráo Clipboard (Clipper Hijack)
  if (dev.screenView === 'ALERT_CLIPBOARD') {
    const clipOp = (dev.appOpsEvents || []).find((e) => e.opCode === 'READ_CLIPBOARD');
    const isLocked = clipOp && clipOp.mode !== 'allow';
    viewport.innerHTML = `
      <div class="phone-widget-card" style="border-color:${isLocked ? '#10b981' : '#ef4444'};background:${
      isLocked ? 'rgba(6,78,59,0.55)' : 'rgba(127,29,29,0.55)'
    }">
        <div style="font-size:12px;font-weight:800;color:${isLocked ? '#34d399' : '#fca5a5'}">
          ${isLocked ? '🔒 ĐÃ CHẶN ĐỨNG CLIPBOARD HIJACKER!' : '🚨 PHÁT HIỆN ĐÁNH TRÁO CLIPBOARD NGẦM!'}
        </div>
        <p style="font-size:11px;color:#e2e8f0;margin-top:4px;">
          Gói <code>com.clipboard.hijacker</code> (Bàn Phím Gõ Nhanh AI) tự kích hoạt lúc <strong>02:34 sáng (Khóa màn hình)</strong>.
        </p>
      </div>

      <div class="phone-widget-card">
        <div style="font-size:11px;color:#94a3b8;">1️⃣ Nội dung gốc bạn đã Copy:</div>
        <div style="font-family:Consolas,monospace;font-size:11.5px;color:#34d399;margin:4px 0 8px;">
          OTP BIDV: 849201<br/>USDT: TJk9xV89mP2qL5nZ8aPq
        </div>
        <div style="font-size:11px;color:#94a3b8;">2️⃣ Hành vi của App lạ trong nền:</div>
        <div style="font-family:Consolas,monospace;font-size:11.5px;color:${isLocked ? '#38bdf8' : '#f87171'};margin-top:4px;">
          ${
            isLocked
              ? '🛡️ AppOps = IGNORE ➔ Trả về Clipboard RỖNG! Ví tiền & OTP an toàn 100%!'
              : '⚠️ Đã đọc lén OTP & ghi đè ví Hacker: TScam77HijackedWallet99Xz'
          }
        </div>
      </div>

      <div class="phone-widget-card" style="display:flex;flex-direction:column;gap:6px;">
        <button class="btn btn-sm ${isLocked ? 'btn-emerald' : 'btn-danger'}" onclick="lockSingleOp('${
      clipOp ? clipOp.id : 'op-1'
    }', 'com.clipboard.hijacker', 'READ_CLIPBOARD', 'ignore')">
          ${isLocked ? '✅ Đã Khóa Cứng READ_CLIPBOARD' : '🔒 Khóa Cứng READ_CLIPBOARD Ngay'}
        </button>
        <button class="btn btn-sm btn-primary" onclick="extractAndInspectApk('com.clipboard.hijacker')">
          📦 Trích Xuất APK Bàn Phím Lạ Ra PC
        </button>
      </div>
    `;
    return;
  }

  // Màn hình bảo vệ bất tử MsgGuard PRO 24/7
  if (dev.screenView === 'MSGGUARD') {
    viewport.innerHTML = `
      <div class="phone-widget-card" style="background:linear-gradient(135deg,rgba(16,185,129,0.28),rgba(15,23,42,0.9));border-color:#10b981;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:13px;color:#34d399;">🛡️ MsgGuard PRO v3.0</strong>
          <span class="badge safe">${tele.msgGuardSafe ? 'BẤT TỬ 24/7' : 'BỊ BÓP NGẦM'}</span>
        </div>
        <p style="font-size:11px;color:#cbd5e1;margin-top:4px;">
          Dịch vụ bắt tin nhắn &amp; ảnh thu hồi Messenger/Zalo theo thời gian thực.
        </p>
      </div>

      <div class="phone-widget-card" style="font-size:11.5px;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;justify-content:space-between;">
          <span>Doze Mode Whitelist:</span>
          <strong style="color:${tele.msgGuardSafe ? '#34d399' : '#f87171'}">${
      tele.msgGuardSafe ? '✅ Đã miễn trừ' : '❌ Chưa bật'
    }</strong>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>MIUI PowerKeeper Killer:</span>
          <strong style="color:${tele.msgGuardSafe ? '#34d399' : '#f87171'}">${
      tele.msgGuardSafe ? '❄️ Đã vô hiệu hóa' : '⚠️ Đang rình tắt App'
    }</strong>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>RUN_ANY_IN_BACKGROUND:</span>
          <strong style="color:${tele.msgGuardSafe ? '#34d399' : '#fbbf24'}">${
      tele.msgGuardSafe ? 'ALLOW (Cứng)' : 'DEFAULT'
    }</strong>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>NotificationListener:</span>
          <strong style="color:#34d399;">ACTIVE (ADB Granted)</strong>
        </div>
      </div>

      <div class="phone-widget-card" style="display:flex;flex-direction:column;gap:6px;">
        <button class="btn btn-sm btn-emerald" onclick="runDebloatAction('com.msgguard.app', 'IMMORTAL_GUARD')">
          ⚡ Cấp Quyền Bất Tử 24/7 Qua ADB
        </button>
        <button class="btn btn-sm btn-accent" onclick="extractAndInspectApk('com.msgguard.app')">
          📦 Trích Xuất MsgGuard-Pro.apk
        </button>
      </div>
    `;
    return;
  }

  // Mặc định: Màn hình chính (HOME / DEBLOAT_CLEAN / SETTINGS_PRIVACY)
  const activePkgs = (dev.packages || []).filter((p) => p.status === 'INSTALLED');
  const iconMap = {
    'com.msgguard.app': '🛡️',
    'com.facebook.orca': '💬',
    'com.zing.zalo': '🟦',
    'com.vnpay.bidv': '🏦',
    'com.dichvucong.gov.vn.fake': '🚨',
    'com.clipboard.hijacker': '⌨️',
    'com.vaytien.nhanh24h': '💸',
    'com.stalker.findmyex': '🕵️',
    'com.miui.msa.global': '📢',
    'com.miui.analytics': '📊',
    'com.miui.daemon': '👁️',
    'com.miui.powerkeeper': '🔋',
    'com.xiaomi.joyose': '🔥',
    'com.xiaomi.mipicks': '🛍️',
    'com.samsung.android.game.gos': '🎮',
    'com.samsung.android.rubin.app': '📍',
    'com.aura.oobe.samsung': '☁️'
  };

  viewport.innerHTML = `
    <div class="phone-widget-card" style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:11px;color:#94a3b8;">${escapeHtml(dev.brand)} System Monitor</div>
        <div style="font-size:14px;font-weight:800;color:${tele.cpuTempC >= 41 ? '#f87171' : '#34d399'}">
          CPU ${tele.cpuTempC}°C • RAM ${tele.ramUsedGb}GB
        </div>
      </div>
      <span class="badge ${tele.securityHealthScore >= 80 ? 'safe' : 'spy'}">
        An toàn: ${tele.securityHealthScore}/100
      </span>
    </div>

    <div style="font-size:10.5px;color:#94a3b8;padding:0 2px;">
      👇 Bấm vào icon ứng dụng trên màn hình để kiểm tra / trích xuất APK:
    </div>

    <div class="phone-app-grid">
      ${activePkgs
        .slice(0, 12)
        .map((p) => {
          const cls =
            p.category === 'SUSPICIOUS_SPYWARE'
              ? 'spyware'
              : p.category === 'USER_ESSENTIAL'
              ? 'protected'
              : 'bloat';
          const tagText =
            p.category === 'SUSPICIOUS_SPYWARE'
              ? 'ĐỘC HẠI'
              : p.category === 'USER_ESSENTIAL'
              ? p.immortalProtected
                ? 'BẤT TỬ'
                : 'GIỮ'
              : `-${p.ramMb}MB`;
          return `
            <div class="phone-app-icon ${cls}" onclick="onPhoneAppClick('${escapeHtml(p.packageName)}', event)" title="${escapeHtml(
            p.appName
          )} (${escapeHtml(p.packageName)})">
              <span class="app-emoji">${iconMap[p.packageName] || '📦'}</span>
              <span class="app-title-mini">${escapeHtml(p.appName)}</span>
              <span class="app-tag-mini" style="background:rgba(0,0,0,0.45);color:#e2e8f0;">${escapeHtml(tagText)}</span>
            </div>
          `;
        })
        .join('')}
    </div>

    <div class="phone-widget-card" style="margin-top:auto;font-size:11px;color:#cbd5e1;">
      🎯 Lệnh chạm cuối: <code>${escapeHtml(dev.lastTouch ? dev.lastTouch.label : 'Sẵn sàng')}</code>
    </div>
  `;
}

// ============================================================================
// 3. RENDER TAB 1: XIAOMI / SAMSUNG 1-CLICK DEBLOATER
// ============================================================================

function renderDebloaterList() {
  if (!cockpitState || !cockpitState.device) return;
  const pkgs = cockpitState.device.packages || [];
  const container = document.getElementById('pkg-list-container');

  const filtered = pkgs.filter((p) => {
    if (currentPkgFilter !== 'ALL' && p.category !== currentPkgFilter) return false;
    if (currentPkgSearch) {
      const q = currentPkgSearch.toLowerCase();
      return (
        p.packageName.toLowerCase().includes(q) ||
        p.appName.toLowerCase().includes(q) ||
        (p.summary && p.summary.toLowerCase().includes(q))
      );
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="xray-empty-state">Không có gói ứng dụng nào khớp với bộ lọc hiện tại.</div>`;
    return;
  }

  const catLabels = {
    ADS_TRACKER: { text: '📢 Quảng cáo & Theo dõi ngầm', cls: 'ads' },
    BATTERY_KILLER: { text: '🔥 Gây nóng & Tự đóng App ngầm', cls: 'killer' },
    BLOATWARE: { text: '🗑️ App rác cài sẵn (Bloatware)', cls: 'ads' },
    SUSPICIOUS_SPYWARE: { text: '🚨 Nghi vấn Mã độc / Spyware', cls: 'spy' },
    USER_ESSENTIAL: { text: '🛡️ Ứng dụng Quan trọng (Cần bảo vệ)', cls: 'safe' }
  };

  container.innerHTML = filtered
    .map((p) => {
      const catInfo = catLabels[p.category] || { text: p.category, cls: 'ads' };
      const isInstalled = p.status === 'INSTALLED';
      const cardCls = !isInstalled
        ? 'pkg-card removed'
        : p.category === 'SUSPICIOUS_SPYWARE'
        ? 'pkg-card spyware-card'
        : p.category === 'USER_ESSENTIAL'
        ? 'pkg-card essential-card'
        : 'pkg-card';

      return `
        <div class="${cardCls}">
          <div class="pkg-main">
            <div class="pkg-title-line">
              <h4>${escapeHtml(p.appName)}</h4>
              <span class="pkg-id-code">${escapeHtml(p.packageName)}</span>
              <span class="badge ${catInfo.cls}">${catInfo.text}</span>
              ${
                !isInstalled
                  ? `<span class="badge removed-tag">✅ ĐÃ GỠ KHỎI USER 0 (${escapeHtml(p.status)})</span>`
                  : p.immortalProtected
                  ? `<span class="badge safe">🛡️ BẤT TỬ 24/7 (DOZE WHITELIST)</span>`
                  : ''
              }
            </div>
            <p class="pkg-desc">${escapeHtml(p.summary)}</p>
            <div class="pkg-meta-row">
              <span>🏢 Hãng: <strong>${escapeHtml(p.vendor)}</strong></span>
              <span>🧠 Ngốn RAM: <strong>${p.ramMb} MB</strong></span>
              <span>🌡️ Nhiệt CPU: <strong>+${p.cpuHeatDelta}°C</strong></span>
              ${
                p.c2Domains && p.c2Domains.length
                  ? `<span>🌐 Máy chủ kết nối: <code>${escapeHtml(p.c2Domains.join(', '))}</code></span>`
                  : ''
              }
            </div>
          </div>

          <div class="pkg-actions">
            ${
              p.category === 'USER_ESSENTIAL'
                ? `
                  <button class="btn btn-sm btn-emerald" onclick="runDebloatAction('${escapeHtml(p.packageName)}', 'IMMORTAL_GUARD')">
                    🛡️ ${p.immortalProtected ? 'Đã Bật Bất Tử 24/7' : 'Bật Chống Tắt Ngầm'}
                  </button>
                `
                : isInstalled
                ? `
                  <button class="btn btn-sm ${
                    p.category === 'SUSPICIOUS_SPYWARE' ? 'btn-danger' : 'btn-primary'
                  }" onclick="runDebloatAction('${escapeHtml(p.packageName)}', 'UNINSTALL')">
                    🗑️ Gỡ User 0 (Không Root)
                  </button>
                  <button class="btn btn-sm btn-ghost" onclick="runDebloatAction('${escapeHtml(p.packageName)}', 'DISABLE')">
                    ❄️ Đóng băng (Disable)
                  </button>
                `
                : `
                  <button class="btn btn-sm btn-emerald" onclick="runDebloatAction('${escapeHtml(p.packageName)}', 'RESTORE')">
                    ♻️ Khôi phục lại Gói
                  </button>
                `
            }
            <button class="btn btn-sm btn-accent" onclick="extractAndInspectApk('${escapeHtml(p.packageName)}')">
              📦 Trích xuất .APK ➔ Soi
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// ============================================================================
// 4. RENDER TAB 2: PRIVACY APPOPS AUDITOR
// ============================================================================

function renderAppOpsList() {
  if (!cockpitState || !cockpitState.device) return;
  const events = cockpitState.device.appOpsEvents || [];
  const container = document.getElementById('appops-list-container');

  const filtered = events.filter((ev) => {
    if (currentOpsFilter === 'ALL') return true;
    if (currentOpsFilter === 'SCREEN_OFF_LOCKED') return ev.screenState === 'SCREEN_OFF_LOCKED';
    if (currentOpsFilter === 'READ_CLIPBOARD') return ev.opCode.includes('CLIPBOARD');
    if (currentOpsFilter === 'AUDIO_CAMERA') return ev.opCode === 'RECORD_AUDIO' || ev.opCode === 'CAMERA';
    if (currentOpsFilter === 'LOCATION') return ev.opCode.includes('LOCATION');
    if (currentOpsFilter === 'SMS_ACCESSIBILITY') {
      return ev.opCode.includes('SMS') || ev.opCode.includes('ACCESSIBILITY') || ev.opCode.includes('CONTACTS');
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="xray-empty-state">Không có sự kiện AppOps nào trong bộ lọc này.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((ev) => {
      const isLocked = ev.mode !== 'allow';
      const cardCls = isLocked ? 'ops-card locked' : ev.severity === 'CRITICAL' ? 'ops-card critical' : 'ops-card';

      return `
        <div class="${cardCls}">
          <div class="pkg-main">
            <div class="pkg-title-line">
              <span class="badge ${isLocked ? 'safe' : 'spy'}">
                ${isLocked ? '🔒 ĐÃ KHÓA CỨNG (APPOPS IGNORE)' : '🚨 ĐANG MỞ (ALLOW)'}
              </span>
              <h4>${escapeHtml(ev.opLabel)}</h4>
              <span class="pkg-id-code">${escapeHtml(ev.opCode)}</span>
              <span class="badge ads">${escapeHtml(ev.screenStateLabel)}</span>
            </div>

            <div class="pkg-meta-row" style="margin-top:2px;">
              <span>📱 Ứng dụng thủ phạm: <strong style="color:#f8fafc">${escapeHtml(ev.appName)}</strong> (<code>${escapeHtml(
        ev.packageName
      )}</code>)</span>
              <span>🔁 Số lần gọi ngầm 24h qua: <strong>${ev.accessCount24h} lần</strong></span>
            </div>

            <div class="ops-evidence-box">
              <strong>🔍 Bằng chứng thu được:</strong> ${escapeHtml(ev.capturedDetail)}
            </div>
          </div>

          <div class="pkg-actions">
            ${
              !isLocked
                ? `
                  <button class="btn btn-sm btn-danger" onclick="lockSingleOp('${escapeHtml(ev.id)}', '${escapeHtml(
                    ev.packageName
                  )}', '${escapeHtml(ev.opCode)}', 'ignore')">
                    🔒 Khóa Cứng Quyền Này
                  </button>
                `
                : `
                  <button class="btn btn-sm btn-ghost" onclick="lockSingleOp('${escapeHtml(ev.id)}', '${escapeHtml(
                    ev.packageName
                  )}', '${escapeHtml(ev.opCode)}', 'allow')">
                    🔓 Mở Lại Quyền (Allow)
                  </button>
                `
            }
            <button class="btn btn-sm btn-accent" onclick="extractAndInspectApk('${escapeHtml(ev.packageName)}')">
              📦 Trích xuất .APK Điều Tra
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// ============================================================================
// 5. RENDER TAB 3: TRÍCH XUẤT APK & CẦU NỐI OSINT-DASHBOARD / VIRUS-SCANNER
// ============================================================================

function renderApkPickerAndWorkspace() {
  if (!cockpitState || !cockpitState.device) return;
  const pkgs = cockpitState.device.packages || [];
  const selectEl = document.getElementById('apk-extract-select');
  const prevVal = selectEl.value;

  selectEl.innerHTML = pkgs
    .map(
      (p) =>
        `<option value="${escapeHtml(p.packageName)}">${
          p.category === 'SUSPICIOUS_SPYWARE' ? '🚨 [ĐỘC HẠI] ' : p.category === 'USER_ESSENTIAL' ? '🛡️ ' : '📦 '
        }${escapeHtml(p.appName)} (${escapeHtml(p.packageName)})</option>`
    )
    .join('');

  if (prevVal && pkgs.some((p) => p.packageName === prevVal)) {
    selectEl.value = prevVal;
  }

  const workspace = document.getElementById('xray-workspace');
  const xray = currentXrayResult || (cockpitState.extractedApks && cockpitState.extractedApks[0]);
  if (!xray) return;

  const downloadUrl = `/extracted-apks/${encodeURIComponent(xray.fileName)}`;

  workspace.innerHTML = `
    <!-- THANH TỔNG QUAN FILE APK ĐÃ TRÍCH XUẤT -->
    <div class="pkg-card" style="border-left:4px solid #8b5cf6;">
      <div class="pkg-main">
        <div class="pkg-title-line">
          <h4>📦 ${escapeHtml(xray.appName)}</h4>
          <span class="pkg-id-code">${escapeHtml(xray.fileName)}</span>
          <span class="badge ${xray.riskScore >= 80 ? 'spy' : xray.riskScore >= 50 ? 'ads' : 'safe'}">
            Điểm rủi ro: ${xray.riskScore}/100
          </span>
          <span class="badge safe">Kích thước: ${(xray.sizeBytes / 1024).toFixed(1)} KB</span>
          <span class="badge ads">Entropy: ${xray.entropy} bits/byte</span>
        </div>
        <div class="pkg-meta-row" style="font-family:Consolas,monospace;margin-top:4px;">
          <span>🔑 SHA-256: <strong style="color:#38bdf8">${escapeHtml(xray.sha256)}</strong></span>
          <span>MD5: <strong>${escapeHtml(xray.md5)}</strong></span>
        </div>
        <div class="pkg-meta-row">
          <span>📂 Đường dẫn lưu trên PC: <code>${escapeHtml(xray.filePath)}</code></span>
        </div>
      </div>
      <div class="pkg-actions">
        <a href="${downloadUrl}" download="${escapeHtml(xray.fileName)}" class="btn btn-sm btn-primary" style="text-decoration:none;">
          💾 Tải File .APK Về Máy Tính
        </a>
        <button class="btn btn-sm btn-danger" onclick="pushApkToOsint('${escapeHtml(xray.packageName)}')">
          🚀 Đẩy Sang OSINT-Dashboard
        </button>
        <button class="btn btn-sm btn-emerald" onclick="scanApkWithVirusScanner('${escapeHtml(xray.packageName)}', false)">
          🛡️ Quét Với Virus-Scanner
        </button>
      </div>
    </div>

    <!-- 2 CỘT CẦU NỐI HỆ SINH THÁI: OSINT-DASHBOARD & VIRUS-SCANNER -->
    <div class="xray-grid-2">
      <!-- CỘT 1: KẾT QUẢ LIÊN THÔNG OSINT-DASHBOARD (PORT 4090) -->
      <div class="xray-box">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3>🕵️ Liên Thông OSINT-Dashboard (OmniTrace Port 4090)</h3>
          <a href="${escapeHtml(cockpitState.osintDashboardUrl || 'http://localhost:4090')}" target="_blank" class="btn-xs" style="background:#2563eb;color:#fff;text-decoration:none;">
            🌐 Mở OSINT-Dashboard ↗
          </a>
        </div>
        <p style="font-size:12px;color:#94a3b8;">
          Trích xuất tự động các tên miền C2, địa chỉ IP máy chủ thu thập dữ liệu, SDK theo dõi bên trong <code>classes.dex</code> và đẩy thẳng vào Sơ đồ Liên kết Thực thể (Link Graph).
        </p>
        <div style="font-size:12.5px;display:flex;flex-direction:column;gap:5px;">
          <div><strong>🌐 C2 Domains / Tracker Hosts:</strong> <code>${escapeHtml(
            (xray.c2Domains || []).join(', ') || 'Không phát hiện C2 lạ'
          )}</code></div>
          <div><strong>📡 SDK Theo dõi nhúng trong DEX:</strong> <code>${escapeHtml(
            (xray.trackers || []).join(', ') || 'Clean (Không có SDK quảng cáo)'
          )}</code></div>
          <div><strong>⚠️ Quyền nguy hiểm trong AndroidManifest.xml:</strong> <code>${escapeHtml(
            (xray.dangerousPerms || []).join(', ') || 'Không có'
          )}</code></div>
        </div>
        ${
          currentOsintBridge
            ? `
              <div class="ops-evidence-box" style="border-color:#38bdf8;color:#bae6fd;">
                ✅ <strong>Đã đồng bộ sang OSINT-Dashboard (http://localhost:4090):</strong><br/>
                • Đã thêm <strong>${currentOsintBridge.pushedNodesCount} thực thể</strong> (Node APK + C2 Domains) vào đồ thị điều tra.<br/>
                • Trạng thái máy chủ OmniTrace: <strong>${currentOsintBridge.osintOnline ? 'ONLINE (200 OK)' : 'Local Analysis'}</strong>
              </div>
            `
            : ''
        }
        <div style="margin-top:4px;">
          <strong style="font-size:12px;color:#cbd5e1;">📜 Quy tắc YARA tự động sinh cho mẫu APK:</strong>
          <pre class="code-pre">${escapeHtml(xray.yaraRule)}</pre>
        </div>
      </div>

      <!-- CỘT 2: KẾT QUẢ QUÉT VIRUS-SCANNER (MICROSOFT DEFENDER + ZIP INSPECTOR) -->
      <div class="xray-box">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3>🦠 Liên Thông Virus-Scanner (Microsoft Defender &amp; ZIP Engine)</h3>
          <button class="btn-xs" style="background:#059669;color:#fff;" onclick="scanApkWithVirusScanner('${escapeHtml(
            xray.packageName
          )}', true)">
            🖥️ Mở Cửa Sổ Virus-Scanner GUI
          </button>
        </div>
        <p style="font-size:12px;color:#94a3b8;">
          Gọi trực tiếp mô-đun <code>d:\\AI_App\\virus-scanner\\scanner.py</code> để quét mã độc bằng Microsoft Defender (<code>MpCmdRun.exe</code>) và kiểm tra an toàn cấu trúc nén ZIP/APK.
        </p>
        ${
          currentVirusReport
            ? `
              <div class="code-pre" style="color:#f8fafc;">
BÁO CÁO QUÉT TỪ VIRUS-SCANNER (DEFENDER ENGINE)
===============================================================
• Đối tượng APK  : ${escapeHtml(currentVirusReport.path)}
• Kích thước     : ${currentVirusReport.size_bytes} bytes
• SHA-256        : ${escapeHtml(currentVirusReport.sha256)}
• Kết luận       : ${escapeHtml(String(currentVirusReport.verdict || '').toUpperCase())}
• Defender Status: ${escapeHtml(currentVirusReport.defender_status)} (Exit code: ${currentVirusReport.defender_exit_code ?? 0})
• Cấu trúc APK   : ${currentVirusReport.archive ? currentVirusReport.archive.members : 4} tệp bên trong (${
                currentVirusReport.archive ? currentVirusReport.archive.uncompressed_bytes : xray.sizeBytes
              } bytes sau giải nén)
• Đường dẫn bẩn  : ${currentVirusReport.archive ? currentVirusReport.archive.unsafe_paths : 0} (An toàn chống Zip-Slip)
• Thời gian quét : ${currentVirusReport.elapsed_seconds} giây
              </div>
            `
            : `
              <div class="xray-empty-state" style="padding:18px;">
                Bấm nút <strong>"🛡️ Quét Với Virus-Scanner"</strong> để chạy Microsoft Defender &amp; phân tích cấu trúc nén ZIP của file <code>${escapeHtml(
                  xray.fileName
                )}</code> ngay tại đây!
              </div>
            `
        }
      </div>
    </div>
  `;
}

// ============================================================================
// 6. RENDER CONSOLE NHẬT KÝ LỆNH ADB TRỰC TIẾP
// ============================================================================

function renderAdbConsole() {
  if (!cockpitState) return;
  const box = document.getElementById('adb-log-box');
  const logs = cockpitState.adbLogs || [];
  box.innerHTML = logs
    .map(
      (l) => `
      <div class="log-entry">
        <div><span style="color:#64748b">[${escapeHtml(l.time)}]</span> <span class="log-cmd">$ ${escapeHtml(l.cmd)}</span></div>
        <div class="log-out">${escapeHtml(l.output)}</div>
      </div>
    `
    )
    .join('');
}

function renderAll() {
  renderHeaderAndTelemetry();
  renderPhoneMirror();
  renderDebloaterList();
  renderAppOpsList();
  renderApkPickerAndWorkspace();
  renderAdbConsole();
}

// ============================================================================
// 7. CÁC HÀM TƯƠNG TÁC & SỰ KIỆN NÚT BẤM
// ============================================================================

async function refreshState() {
  cockpitState = await apiCall('/api/state');
  renderAll();
}

async function runDebloatAction(packageName, action) {
  try {
    const res = await apiCall('/api/debloat/action', 'POST', { packageName, action });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  } catch (e) {
    showToast(`Lỗi: ${e.message}`);
  }
}

async function lockSingleOp(eventId, packageName, opCode, targetMode) {
  try {
    const res = await apiCall('/api/appops/lock', 'POST', {
      eventId,
      packageName,
      opCode,
      targetMode,
      scope: 'SINGLE'
    });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  } catch (e) {
    showToast(`Lỗi: ${e.message}`);
  }
}

async function extractAndInspectApk(packageName) {
  try {
    switchTab('tab-apk-xray');
    const res = await apiCall('/api/apk/extract', 'POST', { packageName });
    cockpitState = res;
    currentXrayResult = res.xray;
    currentOsintBridge = null;
    currentVirusReport = null;
    const selectEl = document.getElementById('apk-extract-select');
    if (selectEl) selectEl.value = packageName;
    renderAll();
    if (res.message) showToast(res.message);
  } catch (e) {
    showToast(`Lỗi trích xuất APK: ${e.message}`);
  }
}

async function pushApkToOsint(packageName) {
  try {
    switchTab('tab-apk-xray');
    showToast(`⏳ Đang trích xuất ${packageName} và đẩy IOC sang OSINT-Dashboard (Port 4090)...`);
    const res = await apiCall('/api/apk/push-osint', 'POST', { packageName });
    cockpitState = res;
    currentXrayResult = res.xray;
    currentOsintBridge = res.osintBridge;
    renderAll();
    if (res.message) showToast(res.message);
  } catch (e) {
    showToast(`Lỗi đẩy OSINT: ${e.message}`);
  }
}

async function scanApkWithVirusScanner(packageName, openGui = false) {
  try {
    switchTab('tab-apk-xray');
    showToast(`⏳ Đang quét ${packageName}.apk bằng Microsoft Defender (Virus-Scanner)...`);
    const res = await apiCall('/api/apk/scan-virus', 'POST', { packageName, openGui });
    cockpitState = res;
    currentXrayResult = res.xray;
    currentVirusReport = res.virusScannerReport;
    renderAll();
    if (res.message) showToast(res.message);
  } catch (e) {
    showToast(`Lỗi quét Virus-Scanner: ${e.message}`);
  }
}

async function onPhoneAppClick(packageName, event) {
  if (event) event.stopPropagation();
  if (packageName === 'com.msgguard.app') {
    const res = await apiCall('/api/screen/input', 'POST', {
      type: 'TAP',
      x: 320,
      y: 680,
      screenView: 'MSGGUARD',
      label: 'Mở ứng dụng MsgGuard PRO'
    });
    cockpitState = res;
    renderAll();
    return;
  }
  if (packageName === 'com.clipboard.hijacker') {
    const res = await apiCall('/api/screen/input', 'POST', {
      type: 'TAP',
      x: 540,
      y: 720,
      screenView: 'ALERT_CLIPBOARD',
      label: 'Kiểm tra hành vi đọc lén Clipboard'
    });
    cockpitState = res;
    renderAll();
    return;
  }
  await extractAndInspectApk(packageName);
}

// Khởi tạo toàn bộ sự kiện DOM
window.addEventListener('DOMContentLoaded', async () => {
  // Đồng bộ đồng hồ trên thanh trạng thái điện thoại
  const updateClock = () => {
    const now = new Date();
    const el = document.getElementById('phone-clock');
    if (el) el.textContent = now.toTimeString().slice(0, 5);
  };
  updateClock();
  setInterval(updateClock, 15000);

  // Chuyển Tab
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Chọn thiết bị
  document.getElementById('device-select').addEventListener('change', async (e) => {
    const res = await apiCall('/api/device/select', 'POST', { deviceId: e.target.value });
    cockpitState = res;
    renderAll();
    showToast(`🔌 Đã chuyển sang điều khiển thiết bị: ${res.device.brand} ${res.device.model}`);
  });

  // Kết nối Wi-Fi ADB
  document.getElementById('btn-connect-wifi').addEventListener('click', async () => {
    const endpoint = document.getElementById('inp-wifi-ip').value.trim();
    const res = await apiCall('/api/adb/connect-wifi', 'POST', { endpoint });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  });

  // Reset dữ liệu mẫu
  document.getElementById('btn-reset-demo').addEventListener('click', async () => {
    const res = await apiCall('/api/device/reset', 'POST');
    cockpitState = res;
    currentXrayResult = null;
    currentOsintBridge = null;
    currentVirusReport = null;
    renderAll();
    if (res.message) showToast(res.message);
  });

  // 3 Kịch bản 1-Click trên thanh Telemetry
  document.getElementById('btn-scen-debloat').addEventListener('click', async () => {
    switchTab('tab-debloater');
    const res = await apiCall('/api/debloat/batch', 'POST', { mode: 'ALL_SAFE_BLOAT' });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  });

  document.getElementById('btn-scen-clipboard').addEventListener('click', async () => {
    switchTab('tab-appops');
    const res = await apiCall('/api/scenario/run', 'POST', { scenarioId: 'clipboard-heist' });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  });

  document.getElementById('btn-scen-apk').addEventListener('click', async () => {
    switchTab('tab-apk-xray');
    await pushApkToOsint('com.dichvucong.gov.vn.fake');
    await scanApkWithVirusScanner('com.dichvucong.gov.vn.fake', false);
  });

  // Nút hành động hàng loạt trong Tab 1 (Debloater)
  document.getElementById('btn-debloat-all-safe').addEventListener('click', async () => {
    const res = await apiCall('/api/debloat/batch', 'POST', { mode: 'ALL_SAFE_BLOAT' });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  });

  document.getElementById('btn-purge-spyware').addEventListener('click', async () => {
    const res = await apiCall('/api/debloat/batch', 'POST', { mode: 'PURGE_SPYWARE' });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  });

  document.getElementById('btn-protect-msgguard').addEventListener('click', async () => {
    const res = await apiCall('/api/scenario/run', 'POST', { scenarioId: 'msgguard-rescue' });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  });

  document.getElementById('btn-restore-all-pkgs').addEventListener('click', async () => {
    const res = await apiCall('/api/debloat/batch', 'POST', { mode: 'RESTORE_ALL' });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  });

  // Bộ lọc gói trong Tab 1
  document.querySelectorAll('#pkg-filter-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#pkg-filter-pills .pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentPkgFilter = btn.dataset.cat;
      renderDebloaterList();
    });
  });

  document.getElementById('inp-pkg-search').addEventListener('input', (e) => {
    currentPkgSearch = e.target.value.trim();
    renderDebloaterList();
  });

  // Nút hành động trong Tab 2 (AppOps Auditor)
  document.getElementById('btn-lock-all-screenoff').addEventListener('click', async () => {
    const res = await apiCall('/api/appops/lock', 'POST', { scope: 'LOCK_ALL_SCREEN_OFF' });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  });

  document.getElementById('btn-simulate-clip-spy').addEventListener('click', async () => {
    const res = await apiCall('/api/scenario/run', 'POST', { scenarioId: 'clipboard-heist' });
    cockpitState = res;
    renderAll();
    if (res.message) showToast(res.message);
  });

  document.querySelectorAll('#ops-filter-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ops-filter-pills .pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentOpsFilter = btn.dataset.op;
      renderAppOpsList();
    });
  });

  // Nút hành động trong Tab 3 (APK Extractor)
  document.getElementById('btn-extract-selected-apk').addEventListener('click', async () => {
    const pkg = document.getElementById('apk-extract-select').value;
    await extractAndInspectApk(pkg);
  });

  document.getElementById('btn-push-selected-osint').addEventListener('click', async () => {
    const pkg = document.getElementById('apk-extract-select').value;
    await pushApkToOsint(pkg);
  });

  document.getElementById('btn-scan-selected-virus').addEventListener('click', async () => {
    const pkg = document.getElementById('apk-extract-select').value;
    await scanApkWithVirusScanner(pkg, false);
  });

  // Chuyển chế độ màn hình điện thoại bên trái
  document.querySelectorAll('.mirror-mode-switch .btn-mini').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await apiCall('/api/screen/input', 'POST', {
        type: 'SWITCH_VIEW',
        screenView: btn.dataset.screen
      });
      cockpitState = res;
      renderAll();
    });
  });

  // Click cảm ứng trên màn hình điện thoại
  const bezel = document.getElementById('phone-screen-touch-area');
  bezel.addEventListener('click', async (e) => {
    if (e.target.closest('button') || e.target.closest('.phone-app-icon')) return;
    const rect = bezel.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    const ripple = document.getElementById('touch-ripple');
    ripple.style.left = `${relX}px`;
    ripple.style.top = `${relY}px`;
    ripple.classList.remove('hidden');
    setTimeout(() => ripple.classList.add('hidden'), 450);

    const androidX = Math.round((relX / rect.width) * 1080);
    const androidY = Math.round((relY / rect.height) * 2400);
    const res = await apiCall('/api/screen/input', 'POST', {
      type: 'TAP',
      x: androidX,
      y: androidY,
      label: `input tap ${androidX} ${androidY}`
    });
    cockpitState = res;
    renderHeaderAndTelemetry();
    renderAdbConsole();
  });

  // Nút điều hướng Back / Home / Đa nhiệm
  document.querySelectorAll('.phone-navbar .nav-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await apiCall('/api/screen/input', 'POST', {
        type: 'KEYEVENT',
        keycode: btn.dataset.key
      });
      cockpitState = res;
      renderAll();
    });
  });

  // Xóa sạch Clipboard chống lộ OTP
  document.getElementById('btn-scrub-clipboard').addEventListener('click', async () => {
    const res = await apiCall('/api/screen/input', 'POST', { type: 'SCRUB_CLIPBOARD' });
    cockpitState = res;
    renderAll();
    showToast('🧹 Đã xóa sạch bộ nhớ tạm (Clipboard) trên điện thoại qua ADB!');
  });

  // Gửi chữ từ PC vào điện thoại
  document.getElementById('btn-send-text').addEventListener('click', async () => {
    const inp = document.getElementById('inp-remote-text');
    const text = inp.value.trim();
    if (!text) return;
    const res = await apiCall('/api/screen/input', 'POST', { type: 'TEXT', text });
    cockpitState = res;
    inp.value = '';
    renderAll();
    showToast(`⌨️ Đã gửi chuỗi "${text}" vào điện thoại qua ADB!`);
  });

  // Console ADB tùy chỉnh
  document.getElementById('form-adb-shell').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = document.getElementById('inp-adb-cmd');
    const command = inp.value.trim();
    if (!command) return;
    const res = await apiCall('/api/adb/shell', 'POST', { command });
    cockpitState = res;
    inp.value = '';
    renderAll();
  });

  await refreshState();
});
