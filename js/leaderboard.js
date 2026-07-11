// ============================================================
// leaderboard.js — Bảng xếp hạng Top 10 dựa trên TỪNG LẦN PASS MỘT MÀN
// (không chỉ lúc pass hết game). Mỗi lần cả team (hoặc 1 mình, tuỳ chế độ
// Solo/Team-Bot/Host-nhiều-người) chạm cờ qua màn N nào đó, sẽ tạo ra 1 "hạng"
// (entry) mới gồm: màn vừa pass, thời gian đã dùng (tính từ lúc bắt đầu ván),
// và TÊN CỦA TẤT CẢ người chơi thật (không tính Bot) đang còn sống lúc đó -
// nếu chơi Host nhiều người, tất cả các tên đó xuất hiện chung trong CÙNG 1 hạng
// vì họ qua màn cùng lúc.
//
// Thứ tự xếp hạng: MÀN CAO HƠN LUÔN ĐƯỢC ƯU TIÊN XẾP CAO HƠN trước, chỉ khi
// cùng màn mới so sánh tiếp theo thời gian (thời gian càng ngắn càng cao).
//
// Vì game chạy hoàn toàn P2P (không server trung tâm), bảng xếp hạng vẫn lưu
// bằng localStorage NGAY TRÊN TRÌNH DUYỆT đang chơi — xem thêm ghi chú ở cuối
// game-state.js (hàm recordLevelClear / applyLevelClearFromHost) về việc Host
// tính giờ + gửi đúng 1 bộ tên cho mọi Client để không bị lệch dữ liệu.
// ============================================================

// Đổi key sang v2 vì đổi cấu trúc dữ liệu (thêm "level", "names" thay cho "name"
// đơn lẻ) — tránh đọc nhầm dữ liệu cũ (định dạng khác) từ bản trước gây lỗi hiển thị.
const LEADERBOARD_STORAGE_KEY = 'platformerLeaderboardV2';
const LEADERBOARD_MAX_ENTRIES = 10;

// Đọc bảng xếp hạng đã lưu; trả về mảng rỗng nếu chưa có / lỗi đọc (vd trình
// duyệt chặn localStorage ở chế độ ẩn danh).
function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveLeaderboard(list) {
  try {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    // localStorage không khả dụng (vd chế độ ẩn danh chặn) -> bỏ qua, không crash game
  }
}

// So sánh thứ hạng giữa 2 entry: màn (level) cao hơn LUÔN thắng trước tiên;
// chỉ khi bằng màn mới xét tiếp thời gian (ngắn hơn = tốt hơn).
function compareLeaderboardEntries(a, b) {
  if (b.level !== a.level) return b.level - a.level;
  return a.timeMs - b.timeMs;
}

// Thêm 1 hoặc nhiều "hạng" mới (mỗi hạng = 1 lần cả team pass xong 1 màn nào đó),
// sắp lại toàn bộ danh sách theo compareLeaderboardEntries, rồi chỉ giữ Top 10.
// Lưu lại và vẽ lại UI ngay (phòng khi màn hình lobby vẫn đang hiện).
function addLeaderboardEntries(newEntries) {
  if (!newEntries || newEntries.length === 0) return;
  const list = loadLeaderboard().concat(newEntries);
  list.sort(compareLeaderboardEntries);
  const trimmed = list.slice(0, LEADERBOARD_MAX_ENTRIES);
  saveLeaderboard(trimmed);
  renderLeaderboard();
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

// Vẽ lại danh sách Top 10 vào #leaderboardList (nằm trong modeScreen)
function renderLeaderboard() {
  const el = document.getElementById('leaderboardList');
  if (!el) return;
  const list = loadLeaderboard();
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

// Vẽ bảng xếp hạng ngay khi trang tải xong (dùng dữ liệu đã lưu từ những lần chơi trước)
renderLeaderboard();
