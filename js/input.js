// ============================================================
// input.js — Bắt sự kiện bàn phím (di chuyển, nhảy, sút, xoạc)
// ============================================================

const keys = {};
let jumpBuffered = false; // catches the exact moment the jump key is pressed (no repeat while held)

// While the chat box input is focused, game control keys must be ignored so the
// player can type freely (e.g. Space in a message shouldn't trigger a jump).
function isChatInputFocused() {
  return document.activeElement && document.activeElement.id === 'chatInput';
}

document.addEventListener('keydown', e => {
  if (isChatInputFocused()) return;
  if ((e.code === 'Space' || e.code === 'ArrowUp') && !keys[e.code]) {
    jumpBuffered = true;
  }
  keys[e.code] = true;
  if (['Space','ArrowUp','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => {
  if (isChatInputFocused()) return;
  keys[e.code] = false;
});

