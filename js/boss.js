// ============================================================
// boss.js — Boss Rồng canh giữ ngay trước cờ đích của mỗi màn.
//
// Cơ chế:
//  - Rồng bay tuần tra qua lại trong 1 khu vực ngay trước cờ, không cho
//    người chơi chạm cờ khi nó còn sống (chạm cờ lúc rồng còn sống chỉ
//    hiện dòng chữ nhắc, không qua màn được).
//  - Cứ sau một khoảng thời gian tuần tra, rồng chọn ngẫu nhiên 1 trong 2
//    đòn tấn công:
//      (1) "barrage": vỗ cánh mạnh, xoè ra một loạt đạn tỏa hướng về
//          phía người chơi.
//      (2) "fire": há miệng khạc ra một luồng lửa dài liên tục gây sát
//          thương nếu người chơi đứng trong tầm.
//  - Người chơi đánh trúng rồng bằng cú sút (Z) / xoạc (X) giống hệt cách
//    đánh quái thường (dùng lại damageEnemy).
//  - Màn sau rồng to hơn, nhiều máu hơn, và tấn công dồn dập hơn (đọc
//    thêm ở getBossDifficulty trong config.js).
// ============================================================

// ----- Ảnh rồng: 2 khung hình vỗ cánh (dragon.png = cánh khép, dragon2.png = cánh xoè) -----
// Boss sẽ luân phiên vẽ 2 ảnh này để tạo cảm giác đang vỗ cánh, thay cho hình vẽ vector cũ.
// Nếu ảnh của bạn không nằm cùng thư mục với index.html, sửa lại đường dẫn bên dưới
// (ví dụ 'images/dragon.png') cho khớp.
const dragonImg1 = new Image();
dragonImg1.src = 'dragon.png';
const dragonImg2 = new Image();
dragonImg2.src = 'dragon2.png';

// Bảng màu riêng cho rồng ở từng màn, càng về sau càng "dữ" hơn
// (không còn dùng để vẽ thân rồng nữa vì đã thay bằng ảnh, nhưng vẫn giữ lại
// phòng khi cần tinting/hiệu ứng theo màn sau này)
function getBossPalette(levelNum) {
  switch (levelNum) {
    case 1:
      return { bodyA:'#5fd16b', bodyB:'#1f6b2c', bodyC:'#0e3814', wing:'rgba(40,120,50,0.55)',
                eyeCore:'#baffb0', eyeMid:'#3bff5a', eyeGlow:'rgba(80,255,90,0.55)' };
    case 2:
      return { bodyA:'#9f7ef0', bodyB:'#4a2f9e', bodyC:'#221452', wing:'rgba(100,60,190,0.55)',
                eyeCore:'#e6d8ff', eyeMid:'#b46bff', eyeGlow:'rgba(160,90,255,0.55)' };
    case 3:
    default:
      return { bodyA:'#ff8a63', bodyB:'#a3121a', bodyC:'#3d0508', wing:'rgba(200,40,20,0.55)',
                eyeCore:'#fff2b0', eyeMid:'#ff5a28', eyeGlow:'rgba(255,90,40,0.6)' };
  }
}

// Vị trí "miệng" rồng trong toạ độ thế giới (dùng chung cho cả bắn đạn,
// khạc lửa và vẽ hiệu ứng, để mọi thứ luôn khớp nhau)
function getBossMouthPos(boss) {
  return {
    x: boss.x + boss.w / 2 + boss.facing * boss.w * 0.42,
    y: boss.y + boss.h * 0.36
  };
}

// Tạo boss rồng canh giữ ngay trước cờ đích của màn `lvl`
function createBoss(lvl, levelNum) {
  const diff = getBossDifficulty(levelNum);
  const flag = lvl.flag;
  const baseW = 510, baseH = 390; // kích thước gốc của rồng ở màn 1 (đã tăng 1.5x so với trước: 340x260 -> 510x390)
  const w = baseW * diff.sizeMult;
  const h = baseH * diff.sizeMult;

  const SAFE_GAP_BEFORE_FLAG = 300; // luôn chừa khoảng trống này trước cờ, dù rồng to cỡ nào
  const ARENA_WIDTH = 1700;         // bề rộng khu vực rồng bay qua lại tuần tra
  const maxX = flag.x - SAFE_GAP_BEFORE_FLAG - w;
  const minX = maxX - ARENA_WIDTH;

  return {
    // Tăng offset độ cao bay (620 -> 750) tương ứng với việc thân rồng cao hơn (baseH tăng
    // 260 -> 390), để giữ nguyên khoảng hở phía dưới thân rồng so với mặt đất như trước.
    x: maxX, y: lvl.groundY - 750 * diff.sizeMult,
    w: w, h: h,
    minX: minX, maxX: maxX,
    baseFlyY: lvl.groundY - 750 * diff.sizeMult,
    levelNum: levelNum,
    diff: diff,

    hp: Math.round(BOSS_BASE_HP * diff.hpMult),
    maxHp: Math.round(BOSS_BASE_HP * diff.hpMult),
    alive: true,

    dir: -1,        // hướng bay tuần tra (trái/phải)
    facing: -1,      // hướng đang "nhìn"/nhắm tấn công
    hitCooldown: 0,
    flashTimer: 0,
    animSeed: Math.random() * 100,

    phase: 'patrol', // 'patrol' | 'windup' | 'barrage' | 'fire' | 'cooldown'
    timer: 120 + Math.random() * 60, // tuần tra 1 lúc trước khi ra đòn đầu tiên cho người chơi kịp thở
    attackChoice: null,
    barrageShotTimer: 0,
    fireTickTimer: 0
  };
}

// Tìm người chơi gần rồng nhất, dùng để rồng biết "nhìn"/nhắm bắn về hướng nào
// khi có nhiều người chơi cùng lúc trong khu vực boss.
function getNearestPlayer(boss) {
  let best = null, bestDist = Infinity;
  for (const id in players) {
    const p = players[id];
    if (p.eliminated) continue;
    const d = Math.abs((p.x + p.w / 2) - (boss.x + boss.w / 2));
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

// Bắn 1 đợt đạn tỏa hình quạt nhắm chung về phía người chơi gần nhất (đòn "vỗ cánh xả đạn")
function fireBossBarrage(boss) {
  const target = getNearestPlayer(boss) || { x: boss.x, y: boss.y, w: 0, h: 0 };
  const mouth = getBossMouthPos(boss);
  const targetAngle = Math.atan2(
    (target.y + target.h / 2) - mouth.y,
    (target.x + target.w / 2) - mouth.x
  );
  const count = boss.diff.bulletsPerBarrage;
  const spread = Math.PI * 0.85; // toả rộng khoảng 153 độ quanh hướng nhắm
  for (let i = 0; i < count; i++) {
    const angleOffset = count > 1 ? (i - (count - 1) / 2) * (spread / (count - 1)) : 0;
    const angle = targetAngle + angleOffset;
    const speed = BOSS_PROJECTILE_SPEED * (0.85 + Math.random() * 0.3);
    level.projectiles.push({
      x: mouth.x, y: mouth.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: BOSS_PROJECTILE_RADIUS,
      life: BOSS_PROJECTILE_LIFE,
      damage: BOSS_PROJECTILE_DAMAGE
    });
  }
  SFX.dragonWing();
}

// Kiểm tra người chơi có đang đứng trong luồng lửa không, có thì trừ máu
function applyBossFireDamage(boss) {
  const mouth = getBossMouthPos(boss);
  const range = 620 * boss.diff.sizeMult;
  const fireBox = {
    x: boss.facing > 0 ? mouth.x : mouth.x - range,
    y: mouth.y - boss.h * 0.3,
    w: range,
    h: boss.h * 0.6
  };
  for (const id in players) {
    const p = players[id];
    if (p.eliminated) continue;
    if (rectsOverlap(p, fireBox)) damagePlayer(p, BOSS_FIRE_DAMAGE);
  }
}

// Cập nhật logic boss mỗi frame. `shootBoxes` là map {playerId: hitbox cú sút}
// của TẤT CẢ người chơi trong frame hiện tại (đã tính sẵn trong update.js), dùng để
// kiểm tra va chạm giống hệt cách quái thường bị đánh trúng, nhưng với nhiều người.
function updateBoss(shootBoxes) {
  const boss = level.boss;
  if (!boss || !boss.alive) return;

  if (boss.flashTimer > 0) boss.flashTimer--;
  if (boss.hitCooldown > 0) boss.hitCooldown--;

  // ----- Người chơi tấn công trúng rồng (sút / xoạc), y hệt cách đánh quái thường -----
  for (const id in players) {
    const p = players[id];
    if (p.eliminated) continue;
    const hitByXoac = p.xoacTimer > 0 && rectsOverlap(p, boss);
    const hitByShoot = shootBoxes[id] && rectsOverlap(shootBoxes[id], boss);
    if ((hitByXoac || hitByShoot) && boss.hitCooldown <= 0) {
      const dmg = hitByXoac ? (p.xoacDamage || XOAC_DAMAGE) : (p.kickDamage || KICK_DAMAGE);
      const dead = damageEnemy(boss, dmg);
      SFX.hitEnemy();
      boss.hitCooldown = BOSS_HIT_COOLDOWN;
      if (dead) {
        boss.alive = false;
        score += 1000;
        showLevelBanner('GUARDIAN DRAGON DEFEATED!');
        return;
      }
      break;
    } else if (p.invincible <= 0 && rectsOverlap(p, boss)) {
      // Va chạm trực tiếp vào thân rồng (không có kiểu "dẫm đầu" vì nó đang bay)
      damagePlayer(p, BOSS_CONTACT_DAMAGE);
      p.invincible = 90;
    }
  }

  // ----- Bay lượn tuần tra + luôn nhìn về phía người chơi gần nhất khi chưa khoá hướng tấn công -----
  const target = getNearestPlayer(boss);
  if ((boss.phase === 'patrol' || boss.phase === 'cooldown') && target) {
    boss.facing = (target.x + target.w / 2 < boss.x + boss.w / 2) ? -1 : 1;
  }
  if (boss.phase === 'patrol') {
    boss.x += boss.dir * 4.2;
    if (boss.x < boss.minX) { boss.x = boss.minX; boss.dir = 1; }
    if (boss.x > boss.maxX) { boss.x = boss.maxX; boss.dir = -1; }
  }
  const hover = Math.sin(gameFrame * 0.05 + boss.animSeed) * 40 * boss.diff.sizeMult;
  boss.y = boss.baseFlyY + hover;

  boss.timer--;
  switch (boss.phase) {
    case 'patrol':
      if (boss.timer <= 0) {
        boss.phase = 'windup';
        boss.attackChoice = Math.random() < 0.5 ? 'barrage' : 'fire';
        boss.timer = BOSS_WINDUP_TIME;
        // Khoá hướng nhắm ngay khi bắt đầu lấy đà, để đòn đánh ra đúng hướng đã telegraph
        const lockTarget = getNearestPlayer(boss);
        if (lockTarget) boss.facing = (lockTarget.x + lockTarget.w / 2 < boss.x + boss.w / 2) ? -1 : 1;
      }
      break;

    case 'windup':
      if (boss.timer <= 0) {
        if (boss.attackChoice === 'barrage') {
          boss.phase = 'barrage';
          boss.timer = BOSS_BARRAGE_DURATION;
          boss.barrageShotTimer = 0;
        } else {
          boss.phase = 'fire';
          boss.timer = BOSS_FIRE_DURATION;
          boss.fireTickTimer = 0;
          SFX.dragonFire();
        }
      }
      break;

    case 'barrage':
      boss.barrageShotTimer--;
      if (boss.barrageShotTimer <= 0) {
        fireBossBarrage(boss);
        boss.barrageShotTimer = boss.diff.barrageShotGap;
      }
      if (boss.timer <= 0) {
        boss.phase = 'cooldown';
        boss.timer = BOSS_COOLDOWN_AFTER_ATTACK;
      }
      break;

    case 'fire':
      boss.fireTickTimer--;
      if (boss.fireTickTimer <= 0) {
        applyBossFireDamage(boss);
        boss.fireTickTimer = BOSS_FIRE_TICK_INTERVAL;
      }
      if (boss.timer <= 0) {
        boss.phase = 'cooldown';
        boss.timer = BOSS_COOLDOWN_AFTER_ATTACK;
      }
      break;

    case 'cooldown':
      if (boss.timer <= 0) {
        boss.phase = 'patrol';
        boss.timer = boss.diff.attackWaitMin + Math.random() * (boss.diff.attackWaitMax - boss.diff.attackWaitMin);
      }
      break;
  }
}

// Vẽ boss rồng: dùng 2 ảnh dragon.png/dragon2.png luân phiên để mô phỏng vỗ cánh,
// cộng thêm hiệu ứng "lấy đà" khi windup và luồng lửa khi đang khạc lửa.
function drawBoss() {
  const boss = level.boss;
  if (!boss || !boss.alive) return;

  const x = boss.x, y = boss.y, w = boss.w, h = boss.h;
  const cx = x + w / 2, cy = y + h / 2;
  const facing = boss.facing;
  const flash = boss.flashTimer > 0;

  // Vỗ cánh chậm rãi lúc tuần tra, đập dồn dập khi đang xả loạt đạn
  const flapSpeed = boss.phase === 'barrage' ? 0.9 : 0.12;
  // Luân phiên giữa 2 ảnh (cánh khép / cánh xoè) theo nhịp sin ở trên để mô phỏng vỗ cánh
  const flapWave = Math.sin(gameFrame * flapSpeed + boss.animSeed);
  const dragonImg = flapWave >= 0 ? dragonImg1 : dragonImg2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(facing, 1); // từ đây mọi toạ độ coi như rồng đang quay đầu sang phải (+facing)

  // Nhấp nháy đỏ khi vừa bị đánh trúng (tint đè lên đúng phần ảnh không trong suốt)
  if (flash) {
    ctx.filter = 'brightness(1.7) saturate(3) hue-rotate(-30deg)';
  }

  if (dragonImg.complete && dragonImg.naturalWidth > 0) {
    ctx.drawImage(dragonImg, -w / 2, -h / 2, w, h);
  }

  ctx.filter = 'none';
  ctx.restore(); // hết phần vẽ theo hệ toạ độ mirror-theo-facing

  // ----- Hiệu ứng "lấy đà" trước khi ra đòn (quả cầu sáng dần ở miệng) -----
  if (boss.phase === 'windup') {
    const mouth = getBossMouthPos(boss);
    const prog = 1 - boss.timer / BOSS_WINDUP_TIME;
    const r = 14 + prog * 50;
    ctx.save();
    ctx.globalAlpha = 0.55 + Math.sin(gameFrame * 0.5) * 0.2;
    const glow = ctx.createRadialGradient(mouth.x, mouth.y, 0, mouth.x, mouth.y, r);
    glow.addColorStop(0, boss.attackChoice === 'fire' ? 'rgba(255,200,80,0.9)' : 'rgba(255,255,255,0.9)');
    glow.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(mouth.x, mouth.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ----- Luồng lửa khạc ra (chuỗi quầng lửa mờ dần theo khoảng cách) -----
  if (boss.phase === 'fire') {
    const mouth = getBossMouthPos(boss);
    const range = 620 * boss.diff.sizeMult;
    const dir = boss.facing;
    const flicker = 1 + Math.sin(gameFrame * 0.8) * 0.15;
    ctx.save();
    const segments = 14;
    for (let i = segments; i >= 0; i--) {
      const frac = i / segments;
      const dist = frac * range;
      const wobble = (pseudoRand(i * 3.1 + gameFrame * 0.05) - 0.5) * 40 * frac;
      const fx = mouth.x + dir * dist;
      const fy = mouth.y + wobble;
      const rad = (18 + frac * 46) * flicker;
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, rad);
      grad.addColorStop(0, 'rgba(255,242,176,0.9)');
      grad.addColorStop(0.5, 'rgba(255,120,40,0.65)');
      grad.addColorStop(1, 'rgba(180,20,10,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ----- Thanh máu + tên boss -----
  drawHealthBar(x + w / 2, y - 34, boss.hp, boss.maxHp, Math.max(160, w * 0.55));
  ctx.save();
  ctx.font = 'bold 15px Courier New';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.fillStyle = '#fff';
  ctx.strokeText('GUARDIAN DRAGON', x + w / 2, y - 46);
  ctx.fillText('GUARDIAN DRAGON', x + w / 2, y - 46);
  ctx.restore();
}