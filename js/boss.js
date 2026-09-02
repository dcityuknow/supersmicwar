// ============================================================
// boss.js — Boss Rồng canh giữ ngay trước cờ đích của mỗi màn.
// Dynamic Walk Cycle (Di chuyển 2 chân linh hoạt).
// ============================================================

// ----- 6 ảnh bộ phận của rồng -----
const bossHeadImg  = new Image(); bossHeadImg.src  = 'boss/head.png';
const bossHead2Img = new Image(); bossHead2Img.src = 'boss/head2.png';
const bossNgucImg  = new Image(); bossNgucImg.src  = 'boss/nguc.png';
const bossTay1Img  = new Image(); bossTay1Img.src  = 'boss/baptay1.png';
const bossTay2Img  = new Image(); bossTay2Img.src  = 'boss/baptay2.png';
const bossVuot1Img = new Image(); bossVuot1Img.src = 'boss/mongvuot1.png';
const bossVuot2Img = new Image(); bossVuot2Img.src = 'boss/mongvuot2.png';

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

// Hàm vẽ bộ phận có tích hợp offset động từ walk cycle
function drawBossPart(img, w, h, dxFrac, dyFrac, wFrac, hFrac, seed, wobbleAmpPx, rotAmpRad, extraDx, extraDy, extraRot) {
  if (!(img.complete && img.naturalWidth > 0)) return;
  const t = gameFrame * 0.045 + seed;
  const wobbleX = Math.sin(t) * wobbleAmpPx + (extraDx || 0);
  const wobbleY = Math.cos(t * 1.3) * wobbleAmpPx * 0.6 + (extraDy || 0);
  const rot = Math.sin(t * 0.8) * rotAmpRad + (extraRot || 0);

  const boxW = w * wFrac, boxH = h * hFrac;
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = boxW / boxH;
  let pw, ph;
  if (imgRatio > boxRatio) {
    pw = boxW;
    ph = boxW / imgRatio;
  } else {
    ph = boxH;
    pw = boxH * imgRatio;
  }

  const px = w * dxFrac + wobbleX, py = h * dyFrac + wobbleY;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(rot);
  ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
  ctx.restore();
}

function getBossMouthPos(boss) {
  const headL = BOSS_PART_LAYOUT.head;
  const mouthOff = BOSS_PART_LAYOUT.mouthOffset;
  const headCenterX = boss.x + boss.w / 2 + boss.facing * boss.w * headL.dx;
  const headCenterY = boss.y + boss.h / 2 + boss.h * headL.dy;
  const headPixelW = boss.w * headL.w;
  const headPixelH = boss.h * headL.h;
  return {
    x: headCenterX + boss.facing * headPixelW * mouthOff.dx,
    y: headCenterY + headPixelH * mouthOff.dy
  };
}

function createBoss(lvl, levelNum) {
  const diff = getBossDifficulty(levelNum);
  const flag = lvl.flag;
  const baseW = 510, baseH = 390;
  const w = baseW * diff.sizeMult;
  const h = baseH * diff.sizeMult;

  const SAFE_GAP_BEFORE_FLAG = 300;
  const ARENA_WIDTH = 1700;
  const maxX = flag.x - SAFE_GAP_BEFORE_FLAG - w;
  const minX = maxX - ARENA_WIDTH;

  const groundStandY = lvl.groundY - h;

  return {
    x: maxX, y: groundStandY,
    w: w, h: h,
    minX: minX, maxX: maxX,
    groundY: groundStandY,
    levelNum: levelNum,
    diff: diff,

    hp: Math.round(BOSS_BASE_HP * diff.hpMult),
    maxHp: Math.round(BOSS_BASE_HP * diff.hpMult),
    alive: true,

    dir: -1,
    facing: -1,
    hitCooldown: 0,
    flashTimer: 0,
    animSeed: Math.random() * 100,

    speedMult: 1,
    speedTargetMult: 1,
    speedChangeTimer: 60 + Math.random() * 60,

    // Walk Cycle variables
    walkCycle: 0, // Pha bước đi (0 đến Math.PI * 2)

    phase: 'patrol',
    timer: 120 + Math.random() * 60,
    attackChoice: null,
    barrageShotTimer: 0,
    fireTickTimer: 0
  };
}

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

function fireBossBarrage(boss) {
  const target = getNearestPlayer(boss) || { x: boss.x, y: boss.y, w: 0, h: 0 };
  const mouth = getBossMouthPos(boss);
  const targetAngle = Math.atan2(
    (target.y + target.h / 2) - mouth.y,
    (target.x + target.w / 2) - mouth.x
  );
  const count = boss.diff.bulletsPerBarrage;
  const spread = Math.PI * 0.85;
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

function updateBoss(shootBoxes) {
  const boss = level.boss;
  if (!boss || !boss.alive) return;

  if (boss.flashTimer > 0) boss.flashTimer--;
  if (boss.hitCooldown > 0) boss.hitCooldown--;

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
      damagePlayer(p, BOSS_CONTACT_DAMAGE);
      p.invincible = 90;
    }
  }

  const target = getNearestPlayer(boss);
  if ((boss.phase === 'patrol' || boss.phase === 'cooldown') && target) {
    boss.facing = (target.x + target.w / 2 < boss.x + boss.w / 2) ? -1 : 1;
  }

  boss.speedChangeTimer--;
  if (boss.speedChangeTimer <= 0) {
    boss.speedTargetMult = 0.45 + Math.random() * 1.35;
    boss.speedChangeTimer = 50 + Math.random() * 90;
  }
  boss.speedMult += (boss.speedTargetMult - boss.speedMult) * 0.025;

  // Cập nhật vị trí và Walk Cycle nhịp chân
  if (boss.phase === 'patrol') {
    const moveSpeed = 4.2 * boss.speedMult;
    boss.x += boss.dir * moveSpeed;
    // Walk cycle tiến tới nhanh hay chậm tùy theo tốc độ bò
    boss.walkCycle += 0.08 * boss.speedMult;
  } else {
    // Khi đứng yên chuẩn bị đánh/xả đòn, walk cycle trả về vị trí cân bằng mượt mà
    boss.walkCycle += (0 - boss.walkCycle % (Math.PI * 2)) * 0.1;
  }

  if (boss.x < boss.minX) { boss.x = boss.minX; boss.dir = 1; }
  if (boss.x > boss.maxX) { boss.x = boss.maxX; boss.dir = -1; }

  boss.y = boss.groundY;

  boss.timer--;
  switch (boss.phase) {
    case 'patrol':
      if (boss.timer <= 0) {
        boss.phase = 'windup';
        boss.attackChoice = Math.random() < 0.5 ? 'barrage' : 'fire';
        boss.timer = BOSS_WINDUP_TIME;
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

const BOSS_PART_LAYOUT = {
  chest: { dx: -0.18, dy: -0.06, w: 0.85, h: 0.85 },
  arm1:  { dx: -0.50, dy:  0.14, w: 0.46, h: 0.62 },
  claw1: { dx: -0.42, dy:  0.40, w: 0.36, h: 0.36 },
  head:  { dx: -0.16, dy: -0.38, w: 0.58, h: 0.58 },
  arm2:  { dx:  0.20, dy:  0.12, w: 0.50, h: 0.66 },
  claw2: { dx:  0.26, dy:  0.40, w: 0.40, h: 0.40 },

  mouthOffset: { dx: 0.15, dy: 0.20 },
};

function drawBoss() {
  const boss = level.boss;
  if (!boss || !boss.alive) return;

  const w = boss.w, h = boss.h;
  const facing = boss.facing;
  const flash = boss.flashTimer > 0;
  const L = BOSS_PART_LAYOUT;

  // Tính toán chuyển động Walk Cycle (2 chân cất bước)
  const wc = boss.walkCycle || 0;
  
  // Chân 1 & Chân 2 bước ngược pha nhau (Math.sin & Math.cos/negate)
  const leg1StepX = Math.sin(wc) * w * 0.08;
  const leg1StepY = -Math.max(0, Math.cos(wc)) * h * 0.05; // nhấc chân lên khỏi mặt đất khi bước
  const leg1Rot   = Math.sin(wc) * 0.25;

  const leg2StepX = -Math.sin(wc) * w * 0.08;
  const leg2StepY = -Math.max(0, -Math.cos(wc)) * h * 0.05; // nhấc chân đối diện
  const leg2Rot   = -Math.sin(wc) * 0.25;

  // Thân nhún nhường nhịp nhàng theo bước chân (nhún 2 lần mỗi chu kỳ walk)
  const bodyBobY = Math.abs(Math.sin(wc)) * h * 0.03;
  const headBobY = Math.sin(wc * 2) * h * 0.02;

  const cx = boss.x + w / 2;
  const cy = boss.y + h / 2 + bodyBobY; // Thân nhún xuống theo bước đi

  const flapSpeed = boss.phase === 'barrage' ? 0.9 : 0.12;
  const flapWave = Math.sin(gameFrame * flapSpeed + boss.animSeed);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(facing, 1);

  if (flash) {
    ctx.filter = 'brightness(1.7) saturate(3) hue-rotate(-30deg)';
  }

  const windupProgress = (boss.phase === 'windup') ? (1 - boss.timer / BOSS_WINDUP_TIME) : 0;
  const strikeOut = (boss.phase === 'barrage') ? 1 : 0;
  const headLean = (boss.phase === 'fire') ? 1 : 0;
  const flapAmp = 0.5 + Math.abs(flapWave) * 0.6;

  // 1. Ngực (Thân chính)
  drawBossPart(bossNgucImg, w, h, L.chest.dx, L.chest.dy, L.chest.w, L.chest.h, boss.animSeed, w * 0.006, 0.03);

  // 2. Chân/Tay + Móng PHÍA SAU (Leg 1 - Bước ngược hướng facing)
  drawBossPart(bossTay1Img, w, h, L.arm1.dx, L.arm1.dy, L.arm1.w, L.arm1.h, boss.animSeed + 11,
    w * 0.010 * flapAmp, (0.10 + windupProgress * 0.25) * flapAmp,
    -strikeOut * w * 0.05 + leg1StepX, strikeOut * h * 0.03 + leg1StepY, -strikeOut * 0.18 + leg1Rot);

  drawBossPart(bossVuot1Img, w, h, L.claw1.dx, L.claw1.dy, L.claw1.w, L.claw1.h, boss.animSeed + 22,
    w * 0.014 * flapAmp, (0.14 + windupProgress * 0.3) * flapAmp,
    -strikeOut * w * 0.10 + leg1StepX * 1.2, strikeOut * h * 0.05 + leg1StepY, -strikeOut * 0.28 + leg1Rot * 1.2);

  // 3. Đầu (Gật gù theo bước nhún)
  const isAttacking = boss.phase === 'fire' || boss.phase === 'barrage';
  const head2Ready = bossHead2Img.complete && bossHead2Img.naturalWidth > 0;
  const headImgToUse = (isAttacking && head2Ready) ? bossHead2Img : bossHeadImg;
  drawBossPart(headImgToUse, w, h, L.head.dx, L.head.dy, L.head.w, L.head.h, boss.animSeed + 33,
    w * 0.006, 0.05, headLean * w * 0.05, -headLean * h * 0.02 + headBobY, 0);

  // 4. Chân/Tay + Móng PHÍA TRƯỚC (Leg 2 - Bước cùng hướng facing)
  drawBossPart(bossTay2Img, w, h, L.arm2.dx, L.arm2.dy, L.arm2.w, L.arm2.h, boss.animSeed + 44,
    w * 0.010 * flapAmp, (0.10 + windupProgress * 0.25) * flapAmp,
    strikeOut * w * 0.10 + leg2StepX, strikeOut * h * 0.03 + leg2StepY, strikeOut * 0.20 + leg2Rot);

  drawBossPart(bossVuot2Img, w, h, L.claw2.dx, L.claw2.dy, L.claw2.w, L.claw2.h, boss.animSeed + 55,
    w * 0.014 * flapAmp, (0.14 + windupProgress * 0.3) * flapAmp,
    strikeOut * w * 0.16 + leg2StepX * 1.2, strikeOut * h * 0.06 + leg2StepY, strikeOut * 0.32 + leg2Rot * 1.2);

  ctx.filter = 'none';
  ctx.restore();

  // Hiệu ứng "lấy đà"
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

  // Luồng lửa khạc ra
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

  // Thanh máu + tên boss
  drawHealthBar(boss.x + w / 2, boss.y - 34, boss.hp, boss.maxHp, Math.max(160, w * 0.55));
  ctx.save();
  ctx.font = 'bold 15px Courier New';
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.fillStyle = '#fff';
  ctx.strokeText('GUARDIAN DRAGON', boss.x + w / 2, boss.y - 46);
  ctx.fillText('GUARDIAN DRAGON', boss.x + w / 2, boss.y - 46);
  ctx.restore();
}