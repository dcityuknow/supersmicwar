// ============================================================
// render.js — Các hàm vẽ chi tiết: địa hình, gai, nền lặp lại (parallax),
// và hình vẽ thủ công của quái vật (monster)
// ============================================================

function pseudoRand(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const TILE = 116;

// Vẽ địa hình cũ bằng code (dùng làm phương án dự phòng khi ảnh khoida.png chưa tải xong)
function drawTerrainTileFallback(px, py, pw, ph) {
  const dirtDark = '#6b3d1a';
  const dirtMid = '#8b5423';
  const dirtLight = '#a3672c';
  const grassDark = '#2f8f2a';
  const grassLight = '#4fc23f';

  const cols = Math.ceil(pw / TILE);
  const rows = Math.ceil(ph / TILE);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tx = px + c * TILE;
      const ty = py + r * TILE;
      const seed = (tx * 7 + ty * 13);

      // base dirt color with slight variation per tile
      const v = pseudoRand(seed);
      ctx.fillStyle = v < 0.15 ? dirtDark : (v < 0.75 ? dirtMid : dirtLight);
      ctx.fillRect(tx, ty, TILE, TILE);

      // small speckles/pebbles
      for (let k = 0; k < 3; k++) {
        const sv = pseudoRand(seed + k * 3.7);
        const sx = tx + 4 + sv * (TILE - 8);
        const sy = ty + 4 + pseudoRand(seed + k * 5.1) * (TILE - 8);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(sx, sy, 3, 3);
      }

      // brick-ish grid lines
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + 0.5, ty + 0.5, TILE, TILE);
    }
  }

  // grass cap on the very top row only
  ctx.fillStyle = grassDark;
  ctx.fillRect(px, py, pw, 10);
  ctx.fillStyle = grassLight;
  ctx.fillRect(px, py, pw, 5);

  // jagged grass tufts along the top edge
  ctx.fillStyle = grassDark;
  const tuftW = 10;
  for (let tx = px; tx < px + pw; tx += tuftW) {
    const tv = pseudoRand(tx * 3.3);
    const h = 4 + tv * 6;
    ctx.beginPath();
    ctx.moveTo(tx, py);
    ctx.lineTo(tx + tuftW/2, py - h);
    ctx.lineTo(tx + tuftW, py);
    ctx.closePath();
    ctx.fill();
  }
}

// Vẽ địa hình bằng ảnh khoida.png.
// Ảnh khoida.png là 1 khối chữ nhật đại diện cho 1 đoạn địa hình đầy đủ chiều cao.
// Chỉ nối các khối này theo CHIỀU NGANG (dọc theo chiều dài platform), KHÔNG lặp
// theo chiều dọc - ảnh được co giãn vừa đúng 1 lớp bằng chiều cao platform (ph).
// Các khối liền kề được lật ngang (flip) xen kẽ để đường nối không bị lộ.
function drawTerrainTile(px, py, pw, ph) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();

  if (terrainImg.complete && terrainImg.naturalWidth > 0) {
    const aspect = terrainImg.naturalWidth / terrainImg.naturalHeight;
    const tileH = ph;            // chỉ 1 lớp, cao đúng bằng platform
    const tileW = tileH * aspect;
    const cols = Math.ceil(pw / tileW) + 1;

    for (let c = 0; c < cols; c++) {
      const tx = px + c * tileW;
      const ty = py;
      const flip = (c % 2 === 1); // lật xen kẽ mỗi ô thứ 2 để nối liền mạch

      if (flip) {
        ctx.save();
        ctx.translate(tx + tileW, ty);
        ctx.scale(-1, 1);
        ctx.drawImage(terrainImg, 0, 0, tileW, tileH);
        ctx.restore();
      } else {
        ctx.drawImage(terrainImg, tx, ty, tileW, tileH);
      }
    }
  } else {
    // Ảnh chưa tải xong -> tạm dùng địa hình vẽ bằng code như trước
    drawTerrainTileFallback(px, py, pw, ph);
  }

  ctx.restore();
}

function drawSpikes(x, y, w, h) {
  const zoneBottom = y + h;
  const zoneCenterX = x + w / 2;

  if (spikeImg.complete && spikeImg.naturalWidth > 0) {
    const aspect = spikeImg.naturalWidth / spikeImg.naturalHeight;

    // Cụm 3 gai: 1 cái to ở giữa, 2 cái nhỏ 2 bên
    const bigH = h;
    const bigW = bigH * aspect;
    const smallH = h * 0.62;
    const smallW = smallH * aspect;
    const overlap = 0.32; // gai chồng nhẹ lên nhau để cụm liền khối, không rời rạc

    const bigX = zoneCenterX - bigW / 2;
    const leftX = bigX - smallW * (1 - overlap);
    const rightX = bigX + bigW * (1 - overlap);

    // vẽ 2 gai nhỏ trước (ở dưới), gai to đè lên sau (ở trên) để trông tự nhiên hơn
    ctx.drawImage(spikeImg, leftX, zoneBottom - smallH, smallW, smallH);
    ctx.drawImage(spikeImg, rightX, zoneBottom - smallH, smallW, smallH);
    ctx.drawImage(spikeImg, bigX, zoneBottom - bigH, bigW, bigH);
    return;
  }

  // Ảnh chưa tải xong -> vẽ tạm hình gai vector, cùng bố cục 3 cái (to giữa, nhỏ 2 bên)
  const bigH = h, bigW = h * 0.55;
  const smallH = h * 0.62, smallW = smallH * 0.55;
  const overlap = 0.32;
  const bigX = zoneCenterX - bigW / 2;
  const leftX = bigX - smallW * (1 - overlap);
  const rightX = bigX + bigW * (1 - overlap);

  function tri(sx, sw, sh) {
    ctx.beginPath();
    ctx.moveTo(sx, zoneBottom);
    ctx.lineTo(sx + sw / 2, zoneBottom - sh);
    ctx.lineTo(sx + sw, zoneBottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6b6b75';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = '#c0c0c8';
  tri(leftX, smallW, smallH);
  tri(rightX, smallW, smallH);
  tri(bigX, bigW, bigH);
}

// Vẽ nền bằng ảnh background.png, nối dài vô tận theo chiều ngang bằng cách lặp lại
// và LẬT (flip) xen kẽ mỗi tấm để đường nối liền mạch, không bị lặp y hệt lộ mí.
// Có hiệu ứng parallax (di chuyển chậm hơn tiền cảnh) để tạo chiều sâu.
function drawBackgroundLayer() {
  if (!(backgroundImg.complete && backgroundImg.naturalWidth > 0)) return;

  const parallax = 0.45;
  const aspect = backgroundImg.naturalWidth / backgroundImg.naturalHeight;
  const tileH = H;
  const tileW = tileH * aspect;
  const offset = camX * parallax;

  const startIndex = Math.floor(offset / tileW) - 1;
  const endIndex = Math.ceil((offset + W) / tileW) + 1;

  ctx.save();
  for (let i = startIndex; i <= endIndex; i++) {
    const screenX = i * tileW - offset;
    const flip = (((i % 2) + 2) % 2) === 1; // chuẩn hóa để cả i âm cũng lật đúng xen kẽ

    if (flip) {
      ctx.save();
      ctx.translate(screenX + tileW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(backgroundImg, 0, 0, tileW, tileH);
      ctx.restore();
    } else {
      ctx.drawImage(backgroundImg, screenX, 0, tileW, tileH);
    }
  }
  ctx.restore();
}

// Vẽ quái vật chi tiết hơn: nhiều mắt đỏ phát sáng, xúc tu/gai xung quanh đầu,
// hàm răng nhọn hoắt, da gồ ghề nứt nẻ. Lấy cảm hứng từ ảnh quái vật tham khảo.
function drawMonster(x, y, w, h, flash, animSeed) {
  animSeed = animSeed || 0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const t = gameFrame * 0.06 + animSeed;

  ctx.save();

  // --- Xúc tu/gai quanh đầu (vẽ trước để nằm phía sau thân) - lắc lư sống động ---
  const tentacleCount = 8;
  for (let i = 0; i < tentacleCount; i++) {
    const seedA = i * 3.17;
    const wobble = Math.sin(t * 1.6 + i * 1.1) * 0.35; // lắc lư qua lại
    const angle = (Math.PI * 2 * i) / tentacleCount - Math.PI / 2 + (pseudoRand(seedA) - 0.5) * 0.7 + wobble;
    const lenPulse = 0.85 + Math.sin(t * 1.9 + i * 0.6) * 0.15; // co giãn dài/ngắn
    const len = (w * 0.32 + pseudoRand(i * 7.71) * w * 0.28) * lenPulse;
    const baseR = w * 0.30;
    const baseX = cx + Math.cos(angle) * baseR;
    const baseY = cy + Math.sin(angle) * baseR * (h / w);
    const tipX = cx + Math.cos(angle) * (baseR + len);
    const tipY = cy + Math.sin(angle) * (baseR + len) * (h / w);
    const curveAngle = angle + Math.PI / 2;
    const curveAmount = 0.25 + Math.sin(t * 2.1 + i) * 0.12;
    const midX = (baseX + tipX) / 2 + Math.cos(curveAngle) * len * curveAmount;
    const midY = (baseY + tipY) / 2 + Math.sin(curveAngle) * len * curveAmount;

    ctx.strokeStyle = flash ? '#ff9999' : '#3d271a';
    ctx.lineWidth = Math.max(2, w * 0.045);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();

    // đầu nhọn của xúc tu (gai màu ngà)
    ctx.fillStyle = flash ? '#ffcccc' : '#d9cba3';
    const perpX = Math.cos(curveAngle) * w * 0.025;
    const perpY = Math.sin(curveAngle) * w * 0.025;
    ctx.beginPath();
    ctx.moveTo(tipX + Math.cos(angle) * w * 0.05, tipY + Math.sin(angle) * w * 0.05);
    ctx.lineTo(tipX + perpX, tipY + perpY);
    ctx.lineTo(tipX - perpX, tipY - perpY);
    ctx.closePath();
    ctx.fill();
  }

  // --- Thân quái vật: khối hữu cơ, gồ ghề, phập phồng nhẹ như đang thở ---
  const breathe = 1 + Math.sin(t * 1.3) * 0.035;
  const bodyGrad = ctx.createRadialGradient(cx - w * 0.12, cy - h * 0.18, w * 0.05, cx, cy, w * 0.6);
  if (flash) {
    bodyGrad.addColorStop(0, '#ffb3b3');
    bodyGrad.addColorStop(1, '#a83333');
  } else {
    bodyGrad.addColorStop(0, '#7d5c44');
    bodyGrad.addColorStop(0.55, '#4a3223');
    bodyGrad.addColorStop(1, '#241611');
  }
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  const bumps = 12;
  for (let i = 0; i <= bumps; i++) {
    const a = (Math.PI * 2 * i) / bumps;
    const rx = (w / 2) * (0.92 + pseudoRand(i * 2.31) * 0.14) * breathe;
    const ry = (h / 2) * (0.92 + pseudoRand(i * 3.73) * 0.14) * breathe;
    const px = cx + Math.cos(a) * rx;
    const py = cy + Math.sin(a) * ry;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // vết nứt/vân tối trên da
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const sx = cx + (pseudoRand(i * 5.55) - 0.5) * w * 0.55;
    const sy = cy + (pseudoRand(i * 6.66) - 0.5) * h * 0.25 - h * 0.05;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (pseudoRand(i * 8.88) - 0.5) * w * 0.25, sy + h * 0.22);
    ctx.stroke();
  }

  // --- Miệng lớn với răng nhọn hoắt ---
  const mouthW = w * 0.6;
  const mouthOpen = 0.85 + Math.sin(t * 2.4) * 0.15; // miệng khép mở nhẹ như đang gầm gừ
  const mouthH = h * 0.34 * mouthOpen;
  const mouthY = cy + h * 0.14;
  ctx.fillStyle = flash ? '#7a0000' : '#170808';
  ctx.beginPath();
  ctx.ellipse(cx, mouthY, mouthW / 2, mouthH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  const toothCount = 6;
  ctx.fillStyle = '#ece0c4';
  for (let i = 0; i < toothCount; i++) {
    const tx = cx - mouthW / 2 + (mouthW / (toothCount - 1)) * i;
    const th = mouthH * 0.42 + pseudoRand(i * 4.41) * mouthH * 0.22;
    ctx.beginPath();
    ctx.moveTo(tx - mouthW * 0.045, mouthY - mouthH * 0.48);
    ctx.lineTo(tx + mouthW * 0.045, mouthY - mouthH * 0.48);
    ctx.lineTo(tx, mouthY - mouthH * 0.48 + th);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < toothCount; i++) {
    const tx = cx - mouthW / 2 + (mouthW / (toothCount - 1)) * i + mouthW / (toothCount * 2);
    const th = mouthH * 0.36 + pseudoRand(i * 9.92) * mouthH * 0.18;
    ctx.beginPath();
    ctx.moveTo(tx - mouthW * 0.04, mouthY + mouthH * 0.48);
    ctx.lineTo(tx + mouthW * 0.04, mouthY + mouthH * 0.48);
    ctx.lineTo(tx, mouthY + mouthH * 0.48 - th);
    ctx.closePath();
    ctx.fill();
  }

  // --- Nhiều mắt đỏ phát sáng ---
  const eyePositions = [
    { dx: -0.26, dy: -0.30, r: 0.10 },
    { dx: 0.0,   dy: -0.38, r: 0.13 },
    { dx: 0.26,  dy: -0.30, r: 0.10 },
    { dx: -0.13, dy: -0.12, r: 0.075 },
    { dx: 0.13,  dy: -0.12, r: 0.075 },
    { dx: -0.35, dy: -0.02, r: 0.06 },
    { dx: 0.35,  dy: -0.02, r: 0.06 },
  ];
  for (const ep of eyePositions) {
    const ex = cx + ep.dx * w;
    const ey = cy + ep.dy * h;
    const er = ep.r * w;

    const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, er * 2.2);
    glow.addColorStop(0, 'rgba(255,50,50,0.55)');
    glow.addColorStop(1, 'rgba(255,50,50,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ex, ey, er * 2.2, 0, Math.PI * 2);
    ctx.fill();

    const eyeGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
    eyeGrad.addColorStop(0, '#ffdc73');
    eyeGrad.addColorStop(0.5, '#ff3b3b');
    eyeGrad.addColorStop(1, '#7a0000');
    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(ex, ey, er * 0.18, er * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
