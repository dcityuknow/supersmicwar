// ============================================================
// canvas.js — Thiết lập canvas chính, kích thước màn hình, hiệu ứng
// nhấp nháy khung 'coinBox' khi ăn xu
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W, H;

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

