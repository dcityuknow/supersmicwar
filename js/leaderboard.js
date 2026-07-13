// ============================================================
// leaderboard.js — Bảng xếp hạng Top 10 CHUNG CHO MỌI NGƯỜI CHƠI (không còn
// riêng từng trình duyệt như bản cũ), dựa trên TỪNG LẦN PASS MỘT MÀN. Mỗi lần
// cả team (hoặc 1 mình, tuỳ chế độ Solo/Team-Bot/Host-nhiều-người) chạm cờ qua
// màn N nào đó, sẽ tạo ra 1 "hạng" (entry) mới gồm: màn vừa pass, thời gian đã
// dùng (tính từ lúc bắt đầu ván), và TÊN CỦA TẤT CẢ người chơi thật (không tính
// Bot) đang còn sống lúc đó.
//
// Thứ tự xếp hạng: MÀN CAO HƠN LUÔN ĐƯỢC ƯU TIÊN XẾP CAO HƠN trước, chỉ khi
// cùng màn mới so sánh tiếp theo thời gian (thời gian càng ngắn càng cao).
//
// ----- LƯU TRỮ: Firebase Realtime Database (dùng chung cho MỌI người chơi) -----
// Trước đây bảng này lưu bằng localStorage NGAY TRÊN TRÌNH DUYỆT đang chơi, nên
// mỗi máy chỉ thấy dữ liệu của chính máy đó. Giờ chuyển sang Firebase Realtime
// Database để TẤT CẢ người chơi, trên MỌI trình duyệt/máy, đều đọc/ghi chung 1
// bảng, và tự động cập nhật ngay khi có người mới lập kỷ lục (không cần load lại
// trang) nhờ listener onValue() bên dưới.
//
// Cấu hình Firebase (apiKey, databaseURL...) nằm ở file RIÊNG js/firebase-config.js
// (xem file đó + hướng dẫn đi kèm) — tách riêng để không phải sửa vào logic game
// mỗi khi đổi project Firebase.
//
// LƯU Ý: vì đây là client-side (không có server xác thực), 1 người chơi có thể
// sửa code trên máy họ để gửi điểm giả. Rule ở Firebase Console (xem hướng dẫn
// đi kèm) chỉ chặn được các entry SAI ĐỊNH DẠNG (level không phải 1-3, thời gian
// âm...), không chặn được người cố tình gian lận giá trị hợp lệ. Với 1 game
// hobby/bạn bè chơi thì mức bảo vệ này là đủ dùng.
// ============================================================

const LEADERBOARD_MAX_ENTRIES = 10;
// Chỉ dọn bớt các hạng thấp (ngoài Top 10) khỏi Database khi số lượng entry đang
// lưu vượt quá ngưỡng này, để đỡ phải ghi/xoá Database liên tục mỗi lần có 1 pass mới.
const LEADERBOARD_TRIM_THRESHOLD = 30;

// Bản sao gần nhất của Top 10 (đã sắp xếp) nhận được từ Firebase — dùng để vẽ UI
// ngay lập tức mỗi khi có thay đổi, không cần đọc lại Database mỗi lần render.
let currentLeaderboardList = [];

// So sánh thứ hạng giữa 2 entry: màn (level) cao hơn LUÔN thắng trước tiên;
// chỉ khi bằng màn mới xét tiếp thời gian (ngắn hơn = tốt hơn).
function compareLeaderboardEntries(a, b) {
  if (b.level !== a.level) return b.level - a.level;
  return a.timeMs - b.timeMs;
}

function getLeaderboardRef() {
  if (typeof leaderboardDB === 'undefined' || !leaderboardDB) return null;
  return leaderboardDB.ref('leaderboard');
}

// Thêm 1 hoặc nhiều "hạng" mới (mỗi hạng = 1 lần cả team pass xong 1 màn nào đó)
// lên Firebase. MỌI người chơi khác đang mở game sẽ tự thấy ngay lập tức nhờ
// listener onValue() ở dưới (không cần load lại trang).
function addLeaderboardEntries(newEntries) {
  if (!newEntries || newEntries.length === 0) return;
  const ref = getLeaderboardRef();
  if (!ref) {
    console.warn('[leaderboard] Firebase chưa được cấu hình đúng — xem js/firebase-config.js. Kỷ lục này sẽ KHÔNG được lưu.');
    return;
  }
  newEntries.forEach(entry => {
    ref.push(entry)
      .then(() => trimLeaderboardIfNeeded())
      .catch(err => console.warn('[leaderboard] Không ghi được lên Firebase:', err));
  });
}

// Dọn bớt các hạng bị rớt ngoài Top 10 khỏi Database khi số lượng entry đang lưu
// đã vượt LEADERBOARD_TRIM_THRESHOLD, để Database không phình to vô hạn theo
// thời gian. Chạy "best-effort" trên máy của bất kỳ ai vừa ghi entry mới.
function trimLeaderboardIfNeeded() {
  const ref = getLeaderboardRef();
  if (!ref) return;
  ref.once('value').then(snapshot => {
    const raw = snapshot.val();
    if (!raw) return;
    const keys = Object.keys(raw);
    if (keys.length <= LEADERBOARD_TRIM_THRESHOLD) return;
    const list = keys.map(k => ({ key: k, ...raw[k] }));
    list.sort(compareLeaderboardEntries);
    const toDelete = list.slice(LEADERBOARD_MAX_ENTRIES);
    toDelete.forEach(entry => ref.child(entry.key).remove().catch(() => {}));
  }).catch(err => console.warn('[leaderboard] Không dọn được Database:', err));
}

// Định dạng mili-giây -> chuỗi "phút:giây.phần trăm giây" dễ đọc, vd 1:07.42 hoặc 42.05s
function formatClearTime(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const centis = Math.floor((totalMs % 1000) / 10);
  const secStr = String(seconds).padStart(2, '0');
  const centiStr = String(centis).padStart(2, '0');
  return minutes > 0 ? `${minutes}:${secStr}.${centiStr}` : `${seconds}.${centiStr}s`;
}

const RANK_ICONS = ['🥇', '🥈', '🥉'];

// Vẽ lại danh sách Top 10 vào #leaderboardList (nằm trong modeScreen), dựa trên
// currentLeaderboardList (bản sao mới nhất nhận từ Firebase).
function renderLeaderboard() {
  const el = document.getElementById('leaderboardList');
  if (!el) return;

  const ref = getLeaderboardRef();
  if (!ref) {
    el.innerHTML = '<div class="leaderboardEmpty">Chưa cấu hình Firebase — xem js/firebase-config.js</div>';
    return;
  }

  const list = currentLeaderboardList;
  if (list.length === 0) {
    el.innerHTML = '<div class="leaderboardEmpty">No records yet — clear a level to be the first!</div>';
    return;
  }
  el.innerHTML = list.map((entry, i) => {
    const icon = RANK_ICONS[i] || `#${i + 1}`;
    const names = Array.isArray(entry.names) ? entry.names : [entry.name].filter(Boolean);
    const namesText = names.length ? names.map(escapeHtml).join(', ') : 'Player';
    return `<div class="leaderboardRow${i < 3 ? ' top3' : ''}">
      <span class="lbRank">${icon}</span>
      <div class="lbMain">
        <div class="lbLevel">Level ${entry.level}</div>
        <div class="lbNames">${namesText}</div>
      </div>
      <span class="lbTime">${formatClearTime(entry.timeMs)}</span>
    </div>`;
  }).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// Lắng nghe Firebase real-time: bất cứ khi nào Database thay đổi (ai đó vừa pass
// màn, trên máy của HỌ, có thể đang ở nơi khác trên thế giới), toàn bộ danh sách
// được sắp xếp lại, cắt còn Top 10, và vẽ lại UI ngay lập tức — không cần load
// lại trang, không cần bấm nút refresh.
function initLeaderboardListener() {
  const ref = getLeaderboardRef();
  if (!ref) {
    renderLeaderboard();
    return;
  }
  const el = document.getElementById('leaderboardList');
  if (el) el.innerHTML = '<div class="leaderboardEmpty">Đang tải bảng xếp hạng...</div>';

  ref.on('value', snapshot => {
    const raw = snapshot.val();
    const list = raw ? Object.values(raw) : [];
    list.sort(compareLeaderboardEntries);
    currentLeaderboardList = list.slice(0, LEADERBOARD_MAX_ENTRIES);
    renderLeaderboard();
  }, err => {
    console.warn('[leaderboard] Mất kết nối tới Firebase:', err);
    if (el) el.innerHTML = '<div class="leaderboardEmpty">Không tải được bảng xếp hạng (lỗi kết nối)</div>';
  });
}

// Bắt đầu lắng nghe Database ngay khi trang tải xong.
initLeaderboardListener();
