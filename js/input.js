// ============================================================
// input.js — Bắt sự kiện bàn phím (di chuyển, nhảy, sút, xoạc)
// ============================================================

const keys = {};
let jumpBuffered = false; // bắt đúng lúc vừa nhấn phím nhảy (không lặp lại khi giữ phím)
document.addEventListener('keydown', e => {
  if ((e.code === 'Space' || e.code === 'ArrowUp') && !keys[e.code]) {
    jumpBuffered = true;
  }
  keys[e.code] = true;
  if (['Space','ArrowUp','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => keys[e.code] = false);

