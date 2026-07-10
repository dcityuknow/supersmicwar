// ============================================================
// canvas.js — Thiết lập canvas chính, kích thước màn hình, hiệu ứng
// nhấp nháy khung 'coinBox' khi ăn xu
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H;

// ============================================================
// Khoá zoom trình duyệt, để bản đồ LUÔN hiển thị đúng 100%, không cho người chơi
// vô tình phóng to/thu nhỏ (làm méo tỉ lệ canvas) qua các cách sau:
// ============================================================

// 1) Ctrl + cuộn chuột (cách phổ biến nhất để zoom trên desktop, kể cả không giữ Ctrl
//    thật mà trackpad gửi sự kiện wheel kèm ctrlKey=true khi pinch-zoom)
document.addEventListener('wheel', e => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

// 2) Phím tắt Ctrl/Cmd + '+' / '-' / '=' / '0'
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
    e.preventDefault();
  }
});

// 3) Pinch-zoom bằng 2 ngón tay trên màn hình cảm ứng (điện thoại/tablet)
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// 4) Double-tap-zoom trên di động (chạm nhanh 2 lần liên tiếp)
let lastTouchEndTime = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEndTime <= 300) e.preventDefault();
  lastTouchEndTime = now;
}, { passive: false });

// Kích hoạt hiệu ứng phình to rồi trở lại bình thường cho khung "Xu: x/y" mỗi khi ăn xu
const coinBoxEl = document.getElementById('coinBox');
function pulseCoinBox() {
  if (!coinBoxEl) return;
  coinBoxEl.classList.remove('pulse');
  // Buộc trình duyệt reflow để animation có thể chạy lại ngay cả khi ăn xu liên tục
  void coinBoxEl.offsetWidth;
  coinBoxEl.classList.add('pulse');
}

function resizeCanvas() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

