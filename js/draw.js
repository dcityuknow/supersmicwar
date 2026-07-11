// ============================================================
// draw.js — Hàm vẽ toàn bộ khung hình mỗi frame (draw) và vòng lặp
// chính của game (requestAnimationFrame loop)
// ============================================================

function draw() {
  if (!started || !level || !players) return;
  ctx.clearRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0, '#5c94fc');
  grad.addColorStop(1, '#a0d8ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,H);

  drawBackgroundLayer();

  ctx.save();
  ctx.translate(-camX, 0);

  for (const p of level.platforms) {
    drawTerrainTile(p.x, p.y, p.w, p.h);
  }

  // Spikes (gai)
  for (const s of level.spikes) {
    drawSpikes(s.x, s.y, s.w, s.h);
  }

  const coinImgReady = coinImg.complete && coinImg.naturalWidth > 0;
  for (const c of level.coins) {
    if (c.taken) continue;
    // Hiệu ứng nhấp nhô nhẹ theo thời gian + "xoay" giả bằng cách bóp chiều ngang,
    // mỗi xu lệch pha nhau (dựa vào x) để trông tự nhiên, không đồng loạt.
    const bob = Math.sin(gameFrame * 0.06 + c.x * 0.02) * 6;
    const squash = Math.cos(gameFrame * 0.08 + c.x * 0.02);
    const size = 72;
    const cx = c.x + size / 2;
    const cy = c.y + size / 2 + bob;

    if (coinImgReady) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.15, Math.abs(squash)), 1);
      ctx.drawImage(coinImg, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(6, 36 * Math.abs(squash)), 36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  for (const e of level.enemies) {
    if (!e.alive) continue;
    const eFlash = e.flashTimer > 0;
    drawMonster(e.x, e.y, e.w, e.h, eFlash, e.animSeed);

    // Thanh máu quái vật
    drawHealthBar(e.x + e.w/2, e.y - 20, e.hp, e.maxHp, 80);
  }

  // Flag (từ flag.png)
  if (flagImg.complete && flagImg.naturalWidth > 0) {
    ctx.drawImage(flagImg, level.flag.x, level.flag.y, level.flag.w, level.flag.h);
  } else {
    ctx.fillStyle = '#888';
    ctx.fillRect(level.flag.x, level.flag.y, level.flag.w, level.flag.h);
  }

  // Boss Rồng canh giữ (vẽ sau cờ để trông như đang đứng chắn ngay trước cờ)
  drawBoss();

  // Quái đang bay (bị sút / xoạc trúng)
  for (const f of level.flyingEnemies) {
    ctx.save();
    ctx.translate(f.x + f.w/2, f.y + f.h/2);
    ctx.rotate(f.rot);
    ctx.fillStyle = '#8b4513';
    ctx.beginPath();
    ctx.ellipse(0, 0, f.w/2, f.h/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // Đạn quái vật bắn ra: quả cầu năng lượng đỏ phát sáng, xoay tròn theo thời gian
  for (const b of level.projectiles) {
    ctx.save();
    const pulse = 1 + Math.sin(gameFrame * 0.3 + b.x * 0.05) * 0.15;

    const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.4 * pulse);
    glow.addColorStop(0, 'rgba(255,90,40,0.65)');
    glow.addColorStop(1, 'rgba(255,90,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 2.4 * pulse, 0, Math.PI * 2);
    ctx.fill();

    const coreGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * pulse);
    coreGrad.addColorStop(0, '#fff2b0');
    coreGrad.addColorStop(0.5, '#ff5a28');
    coreGrad.addColorStop(1, '#7a1a00');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Lao đang bay (Keng ném ra khi bấm Z), vẽ bằng ảnh keng/weapons.png
  const kengWeaponImg = (getCharById('keng') || {}).weaponImg;
  const weaponImgReady = kengWeaponImg && kengWeaponImg.complete && kengWeaponImg.naturalWidth > 0;
  for (const s of (level.spears || [])) {
    ctx.save();
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    ctx.translate(cx, cy);
    if (s.dir < 0) ctx.scale(-1, 1); // lật ảnh theo hướng bay để mũi lao luôn hướng về phía trước
    if (weaponImgReady) {
      ctx.drawImage(kengWeaponImg, -s.w / 2, -s.h / 2, s.w, s.h);
    } else {
      // Ảnh chưa tải xong -> vẽ tạm 1 thanh lao đơn giản bằng code
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(-s.w / 2, -s.h * 0.16, s.w * 0.78, s.h * 0.32);
      ctx.fillStyle = '#eee';
      ctx.beginPath();
      ctx.moveTo(s.w * 0.28, -s.h / 2);
      ctx.lineTo(s.w / 2, 0);
      ctx.lineTo(s.w * 0.28, s.h / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ----- Tất cả người chơi (mỗi người ảnh nhân vật riêng theo lựa chọn của họ) -----
  for (const id in players) {
    const p = players[id];
    if (p.eliminated) continue;
    const charImg = getCurrentCharImageFor(p);
    const flashHidden = p.invincible > 0 && Math.floor(p.invincible/5)%2!==0 && p.animState !== 'xoac';
    // Hình vẽ to hơn hitbox CHAR_DRAW_SCALE lần, canh giữa theo chiều ngang,
    // canh đáy trùng đáy hitbox (+ offset nhỏ) để chân luôn chạm đất đúng chỗ va chạm thực tế.
    // Vẽ hình theo visualW (bề rộng THẬT theo sizeMult, không bị hitboxWidthTrim bóp) để
    // nhân vật không bị vẽ hẹp/gầy đi so với ảnh gốc; vẫn canh giữa hình theo đúng tâm
    // hitbox thật (p.w) để vị trí đứng nhìn tự nhiên, không lệch tâm.
    const visualW = p.visualW || p.w;
    const visualH = p.visualH || p.h;
    const drawW = visualW * CHAR_DRAW_SCALE;
    const drawH = visualH * CHAR_DRAW_SCALE;
    const drawX = p.x - (drawW - p.w) / 2;
    // Các offset (CHAR_VISUAL_Y_OFFSET, CHAR_Y_OFFSET_BY_ID) được tinh chỉnh để bù
    // khoảng trong suốt ở đáy ảnh PNG. Khoảng trống đó cũng phóng to/thu nhỏ theo
    // sizeMult của nhân vật (vì cả tấm ảnh được vẽ to/nhỏ theo), nên PHẢI nhân offset
    // theo sizeMult -- nếu không, nhân vật có sizeMult khác 1 sẽ bị nổi/lún so với đất.
    const sizeMult = getCharStatMult(p.charId, 'sizeMult');
    const perCharOffset = (CHAR_Y_OFFSET_BY_ID[p.charId] || 0) * sizeMult;
    const drawY = p.y + p.h - drawH + CHAR_VISUAL_Y_OFFSET * sizeMult + perCharOffset;
    if (!flashHidden) {
      ctx.save();
      const hasImg = charImg && charImg.complete && charImg.naturalWidth > 0;
      const spriteToDraw = (p.damageFlashTimer > 0 && hasImg)
        ? getTintedSprite(charImg, drawW, drawH, 'rgba(255,40,40,0.6)')
        : charImg;
      if (p.facing < 0 && hasImg) {
        ctx.translate(drawX + drawW, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(spriteToDraw, 0, 0, drawW, drawH);
      } else if (hasImg) {
        ctx.drawImage(spriteToDraw, drawX, drawY, drawW, drawH);
      } else {
        // Ảnh chưa tải xong -> hình khối tạm
        ctx.fillStyle = p.damageFlashTimer > 0 ? '#ff2828' : '#e52521';
        ctx.fillRect(drawX, drawY, drawW, drawH);
      }
      ctx.restore();
    }

    // Thanh máu / tên / chat bubble được neo theo ĐỈNH KHUNG HÌNH ĐÃ PHÓNG TO (drawY),
    // cộng thêm CHAR_HEAD_MARGIN_FRAC * drawH để chừa đúng phần viền trong suốt nhỏ phía
    // trên tóc trong ảnh PNG. TRƯỚC ĐÂY neo theo p.y (đỉnh hitbox thật) nhưng hình vẽ được
    // phóng to gấp CHAR_DRAW_SCALE lần so với hitbox, nên đỉnh hitbox nằm sâu bên trong
    // thân hình (ngang ngực/vai) chứ không phải trên đầu -> khiến thanh máu bị "chìm"
    // xuống đè vào mặt/ngực nhân vật. Neo theo drawY (đỉnh hình thật) mới đúng vị trí đầu.
    const headY = drawY + drawH * CHAR_HEAD_MARGIN_FRAC;

    // Thanh máu người chơi - đặt ngay trên đầu
    drawHealthBar(drawX + drawW/2, headY - 14, p.hp, p.maxHp, 100);

    // Tên người chơi phía trên thanh máu, để phân biệt khi chơi nhiều người.
    // Người chơi của chính máy này được tô vàng + ghi "(bạn)" cho dễ nhận ra.
    ctx.save();
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.fillStyle = (id === myId) ? '#ffe066' : '#fff';
    const label = (p.isBot ? '🤖 ' : '') + (p.name || 'Player') + (id === myId ? ' (you)' : '');
    ctx.strokeText(label, drawX + drawW/2, headY - 22);
    ctx.fillText(label, drawX + drawW/2, headY - 22);
    ctx.restore();

    // Floating chat bubble: gold-bordered, glowing box shown just above the name
    // for a few seconds after the player sends a message.
    if (p.chatText && Date.now() < p.chatUntil) {
      drawChatBubble(drawX + drawW / 2, headY - 38, p.chatText);
    }
  }

  // Hiệu ứng nổi chữ "-xx" khi mất máu
  drawEffects();

  ctx.restore();
}

// Chọn đúng ảnh (idle / run frame / shoot / xoạc) theo trạng thái hiện tại của người chơi `p`
function getCurrentCharImageFor(p) {
  const c = getCharById(p.charId) || CHARACTERS[0];
  if (!c) return null;
  switch (p.animState) {
    case 'shoot': return c.shootImg;
    case 'xoac':  return c.xoacImg;
    case 'run':   return c.runImgs[p.animFrame];
    case 'jump':  return c.runImgs[1]; // dùng tạm 1 frame chạy cho lúc nhảy
    default:      return c.img; // idle
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}
loop();
