// ============================================================
// effects.js — Hiệu ứng nổi chữ '-xx' khi mất máu, thanh máu (health bar),
// tô màu đỏ sprite khi bị đánh trúng, và các hàm trừ máu player/quái
// ============================================================

// Canvas tạm dùng để tô đỏ đúng hình dạng (alpha) của nhân vật/quái khi bị mất máu,
// thay vì tô đỏ cả khối hình chữ nhật bao quanh.
const tintCanvas = document.createElement('canvas');
const tintCtx = tintCanvas.getContext('2d');
function getTintedSprite(img, w, h, color) {
  tintCanvas.width = w;
  tintCanvas.height = h;
  tintCtx.clearRect(0, 0, w, h);
  tintCtx.globalCompositeOperation = 'source-over';
  tintCtx.drawImage(img, 0, 0, w, h);
  tintCtx.globalCompositeOperation = 'source-atop';
  tintCtx.fillStyle = color;
  tintCtx.fillRect(0, 0, w, h);
  tintCtx.globalCompositeOperation = 'source-over';
  return tintCanvas;
}

let effects = [];
function spawnDamageEffect(x, y, amount, color) {
  effects.push({ x, y, amount, color, life: 40, maxLife: 40, vy: -1.4 });
}
function updateEffects() {
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.y += fx.vy;
    fx.vy += 0.03;
    fx.life--;
    if (fx.life <= 0) effects.splice(i, 1);
  }
}
function drawEffects() {
  ctx.save();
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  for (const fx of effects) {
    const alpha = Math.max(0, fx.life / fx.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fx.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText('-' + fx.amount, fx.x, fx.y);
    ctx.fillText('-' + fx.amount, fx.x, fx.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// Vẽ thanh máu phía trên đầu nhân vật / quái vật
function drawHealthBar(centerX, topY, hp, maxHp, barW) {
  const w = barW || 90;
  const h = 12;
  const x = centerX - w / 2;
  const pct = Math.max(0, Math.min(1, hp / maxHp));
  // nền
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 2, topY - 2, w + 4, h + 4);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x, topY, w, h);
  // màu máu: xanh -> vàng -> đỏ theo tỉ lệ
  let fillColor;
  if (pct > 0.5) fillColor = '#3fcf3f';
  else if (pct > 0.25) fillColor = '#e8c02a';
  else fillColor = '#e5342a';
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, topY, w * pct, h);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, topY, w, h);
}

// Draw a glowing gold-bordered chat bubble centered at (centerX, bottomY), with its
// bottom edge at bottomY (so it sits just above whatever is passed in, e.g. the player's
// name tag). Box width auto-fits the text.
function drawChatBubble(centerX, bottomY, text) {
  ctx.save();
  ctx.font = 'bold 28px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const paddingX = 24, paddingY = 14;
  const textW = ctx.measureText(text).width;
  const boxW = textW + paddingX * 2;
  const boxH = 44 + paddingY;
  const x = centerX - boxW / 2;
  const y = bottomY - boxH;
  const r = 16;

  // Glow
  ctx.shadowColor = 'rgba(255,215,0,0.9)';
  ctx.shadowBlur = 22;

  // Bubble background
  ctx.fillStyle = 'rgba(20,14,0,0.82)';
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
  ctx.arcTo(x, y + boxH, x, y, r);
  ctx.arcTo(x, y, x + boxW, y, r);
  ctx.closePath();
  ctx.fill();

  // Gold border
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Small pointer tail toward the name tag below
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.moveTo(centerX - 12, y + boxH);
  ctx.lineTo(centerX + 12, y + boxH);
  ctx.lineTo(centerX, y + boxH + 14);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.fillStyle = '#fff8e0';
  ctx.fillText(text, centerX, y + boxH / 2);

  ctx.restore();
}

// Trừ máu người chơi `p`, kèm hiệu ứng (nhiều người chơi -> luôn truyền rõ ai bị trừ máu)
function damagePlayer(p, amount) {
  if (p.eliminated) return;
  if (p.hp <= 0) return;
  p.hp -= amount;
  if (p.hp < 0) p.hp = 0;
  p.damageFlashTimer = 12;
  SFX.hurt();
  spawnDamageEffect(p.x + p.w / 2, p.y - 10, amount, '#ff5555');
  if (p.hp <= 0) {
    loseLife(p);
  }
}

// Trừ máu quái vật, kèm hiệu ứng; trả về true nếu quái chết
function damageEnemy(e, amount) {
  e.hp -= amount;
  e.flashTimer = 10;
  spawnDamageEffect(e.x + e.w / 2, e.y - 10, amount, '#ffb340');
  if (e.hp <= 0) {
    e.hp = 0;
    return true;
  }
  return false;
}

