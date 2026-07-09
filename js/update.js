// ============================================================
// update.js — Vòng lặp cập nhật logic mỗi frame: di chuyển, va chạm,
// vật lý, hành động tấn công, va chạm với quái/gai/đạn...
//
// NHIỀU NGƯỜI CHƠI:
//  - Máy Host (hoặc Solo) chạy `runAuthoritativeUpdate()`: tính vật lý,
//    va chạm, sát thương... cho TẤT CẢ người chơi trong `players`, y hệt
//    logic bản gốc nhưng lặp qua nhiều người thay vì 1 biến `player` duy nhất.
//  - Máy Client KHÔNG tự tính vật lý (để tránh lệch trạng thái giữa các máy).
//    Client chỉ gửi phím đang bấm lên Host và tự vẽ lại theo state nhận được.
// ============================================================

function update() {
  if (!started || gameOver || !level || !players) return;
  gameFrame++;

  if (NET.mode === 'client') {
    updateClientLocal();
    return;
  }

  runAuthoritativeUpdate();

  if (NET.mode === 'host') NET.tickBroadcast();
}

// ----- Client: không tính vật lý, chỉ cập nhật camera theo người chơi của mình
// và tiến hoá các hiệu ứng hình ảnh cục bộ (số "-xx" nổi lên...) -----
function updateClientLocal() {
  const me = players[myId];
  if (me) {
    camX = me.x - W / 2 + me.w / 2;
    if (camX < 0) camX = 0;
    if (camX > levelWidth - W) camX = levelWidth - W;
  }
  updateEffects();
  NET.sendInputTick(keys, jumpBuffered);
  jumpBuffered = false;
}

// ----- Vật lý + input cho 1 người chơi (dùng chung cho local lẫn remote) -----
function stepPlayerInput(p, k, jumpPulse) {
  if (p.shootCooldown > 0) p.shootCooldown--;
  if (p.xoacCooldown > 0) p.xoacCooldown--;

  if (p.xoacTimer <= 0 && k['KeyZ'] && p.shootTimer <= 0 && p.shootCooldown <= 0) {
    p.shootTimer = SHOOT_DURATION;
    p.shootCooldown = SHOOT_COOLDOWN;
    SFX.kick();
  }
  if (p.shootTimer <= 0 && k['KeyX'] && p.xoacTimer <= 0 && p.xoacCooldown <= 0) {
    p.xoacTimer = XOAC_DURATION;
    p.xoacCooldown = XOAC_COOLDOWN;
    p.invincible = Math.max(p.invincible, XOAC_DURATION);
    SFX.slash();
  }

  const isActing = p.shootTimer > 0 || p.xoacTimer > 0;
  if (p.xoacTimer > 0) {
    p.vx = p.facing * p.speed * XOAC_SPEED_MULT;
  } else if (!isActing) {
    if (k['ArrowLeft']) { p.vx -= 3.8; p.facing = -1; }
    if (k['ArrowRight']) { p.vx += 3.8; p.facing = 1; }
  }
  p.vx *= FRICTION;
  const maxSpeed = p.speed * (p.xoacTimer > 0 ? XOAC_SPEED_MULT : 1);
  if (Math.abs(p.vx) > maxSpeed) p.vx = maxSpeed * Math.sign(p.vx);
  if (Math.abs(p.vx) < 0.05) p.vx = 0;

  if (jumpPulse && !isActing) {
    if (p.onGround) {
      p.vy = -p.jumpPower;
      p.onGround = false;
      p.jumpsUsed = 1;
    } else if (p.jumpsUsed < 2) {
      p.vy = -p.jumpPower * 0.9;
      p.jumpsUsed = 2;
    }
  }
}

function stepPlayerPhysics(p) {
  p.vy += GRAVITY;
  if (p.vy > 18) p.vy = 18;

  p.x += p.vx;
  if (p.x < 0) p.x = 0;
  if (p.x + p.w > levelWidth) p.x = levelWidth - p.w;

  for (const pf of level.platforms) {
    if (rectsOverlap(p, pf)) {
      if (p.vx > 0) p.x = pf.x - p.w;
      else if (p.vx < 0) p.x = pf.x + pf.w;
      p.vx = 0;
    }
  }

  p.y += p.vy;
  p.onGround = false;
  for (const pf of level.platforms) {
    if (rectsOverlap(p, pf)) {
      if (p.vy > 0) {
        p.y = pf.y - p.h;
        p.vy = 0;
        p.onGround = true;
        p.jumpsUsed = 0;
      } else if (p.vy < 0) {
        p.y = pf.y + pf.h;
        p.vy = 0;
      }
    }
  }

  if (p.y > H + 200) loseLife(p);
  if (p.invincible > 0) p.invincible--;
}

// ----- Mô phỏng đầy đủ 1 frame cho toàn bộ thế giới (chỉ Host/Solo gọi) -----
function runAuthoritativeUpdate() {
  for (const id in players) {
    const p = players[id];
    const inputKeys = (id === myId) ? keys : (p.remoteKeys || {});
    const inputJump = (id === myId) ? jumpBuffered : !!p.remoteJumpPulse;
    stepPlayerInput(p, inputKeys, inputJump);
    stepPlayerPhysics(p);
    if (id !== myId) p.remoteJumpPulse = false;
  }
  if (players[myId]) jumpBuffered = false;

  // Hitbox cú sút của từng người chơi trong frame này
  const shootBoxes = {};
  for (const id in players) {
    const p = players[id];
    if (p.shootTimer > 0) {
      const boxW = 130;
      shootBoxes[id] = {
        x: p.facing > 0 ? p.x + p.w * 0.5 : p.x + p.w * 0.5 - boxW,
        y: p.y, w: boxW, h: p.h
      };
    }
  }

  const diff = level.difficulty || getLevelDifficulty(1);

  for (const e of level.enemies) {
    if (!e.alive) continue;
    e.vy = (e.vy || 0) + GRAVITY;
    e.x += e.dir * 5.8;
    e.y += e.vy;

    for (const p of level.platforms) {
      if (rectsOverlap(e, p) && e.vy >= 0) {
        e.y = p.y - e.h;
        e.vy = 0;
      }
    }

    if (e.x < e.minX || e.x + e.w > e.maxX) e.dir *= -1;

    if (e.hitCooldown > 0) e.hitCooldown--;
    if (e.flashTimer > 0) e.flashTimer--;

    e.shootCooldown--;
    if (e.shootCooldown <= 0) {
      const baseAngle = Math.random() * Math.PI * 2;
      const bulletCount = diff.bulletsPerShot || 1;
      const spread = 0.34;
      for (let bIdx = 0; bIdx < bulletCount; bIdx++) {
        const angleOffset = bulletCount > 1 ? (bIdx - (bulletCount - 1) / 2) * spread : 0;
        const angle = baseAngle + angleOffset;
        const speed = PROJECTILE_SPEED_MIN + Math.random() * (PROJECTILE_SPEED_MAX - PROJECTILE_SPEED_MIN);
        level.projectiles.push({
          x: e.x + e.w / 2, y: e.y + e.h / 2,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          r: PROJECTILE_RADIUS, life: PROJECTILE_LIFE
        });
      }
      e.shootCooldown = diff.shootCooldownMin + Math.random() * (diff.shootCooldownMax - diff.shootCooldownMin);
    }

    for (const id in players) {
      const p = players[id];
      const hitByXoac = p.xoacTimer > 0 && rectsOverlap(p, e);
      const hitByShoot = shootBoxes[id] && rectsOverlap(shootBoxes[id], e);

      if ((hitByXoac || hitByShoot) && e.hitCooldown <= 0) {
        const dmg = hitByXoac ? XOAC_DAMAGE : KICK_DAMAGE;
        const dead = damageEnemy(e, dmg);
        SFX.hitEnemy();
        e.hitCooldown = ENEMY_HIT_COOLDOWN;
        if (dead) {
          e.alive = false;
          score += 100;
          spawnFlyingEnemy(e, p.facing);
        }
        break;
      } else if (p.invincible <= 0 && rectsOverlap(p, e)) {
        const pBottom = p.y + p.h;
        const stompMargin = 14;
        if (p.vy > 0 && pBottom - e.y < stompMargin + e.h / 2) {
          e.alive = false;
          p.vy = -10;
          score += 100;
        } else {
          damagePlayer(p, ENEMY_TOUCH_DAMAGE);
          p.invincible = 90;
        }
        break;
      }
    }
  }

  // Boss rồng canh giữ: kiểm tra va chạm/tấn công với TẤT CẢ người chơi
  updateBoss(shootBoxes);

  // Quái đang bay (bị sút / xoạc trúng) — chỉ hiệu ứng hình ảnh, không cần đồng bộ tinh vi
  for (let i = level.flyingEnemies.length - 1; i >= 0; i--) {
    const f = level.flyingEnemies[i];
    f.vy += GRAVITY;
    f.x += f.vx;
    f.y += f.vy;
    f.rot += f.vrot;
    f.timer--;
    if (f.timer <= 0 || f.y > H + 400) level.flyingEnemies.splice(i, 1);
  }

  // Đạn quái vật: kiểm tra va chạm với TẤT CẢ người chơi
  for (let i = level.projectiles.length - 1; i >= 0; i--) {
    const b = level.projectiles[i];
    b.x += b.vx; b.y += b.vy; b.life--;

    let hit = false;
    for (const id in players) {
      const p = players[id];
      if (p.invincible > 0) continue;
      const hitPlayerBox = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
      if (rectsOverlap(hitPlayerBox, p)) {
        damagePlayer(p, b.damage || PROJECTILE_DAMAGE);
        p.invincible = 60;
        hit = true;
        break;
      }
    }
    if (hit) { level.projectiles.splice(i, 1); continue; }
    if (b.life <= 0) level.projectiles.splice(i, 1);
  }

  // Giảm dần thời gian pose sút/xoạc + kiểm tra gai, cho từng người chơi
  for (const id in players) {
    const p = players[id];
    if (p.shootTimer > 0) p.shootTimer--;
    if (p.xoacTimer > 0) p.xoacTimer--;

    let onSpike = false;
    for (const s of level.spikes) {
      if (rectsOverlap(p, s)) { onSpike = true; break; }
    }
    if (onSpike) {
      if (p.spikeTickTimer <= 0) {
        damagePlayer(p, SPIKE_DAMAGE);
        p.spikeTickTimer = SPIKE_TICK_INTERVAL;
      } else {
        p.spikeTickTimer--;
      }
    } else {
      p.spikeTickTimer = 0;
    }

    if (p.damageFlashTimer > 0) p.damageFlashTimer--;
  }

  updateEffects();

  // Xu: bất kỳ người chơi nào chạm cũng được tính chung cho cả team
  for (const c of level.coins) {
    if (c.taken) continue;
    const coinRect = { x: c.x, y: c.y, w: 72, h: 72 };
    for (const id in players) {
      if (rectsOverlap(players[id], coinRect)) {
        c.taken = true;
        coinsCollected++;
        score += 50;
        SFX.coin();
        pulseCoinBox();
        document.getElementById('coins').textContent = coinsCollected;
        break;
      }
    }
  }

  // Cờ đích: bất kỳ ai chạm cờ (khi rồng đã chết) cũng qua màn cho cả team
  if (level.flagWarnCooldown > 0) level.flagWarnCooldown--;
  let anyOnFlag = false;
  for (const id in players) {
    if (rectsOverlap(players[id], level.flag)) { anyOnFlag = true; break; }
  }
  if (anyOnFlag) {
    if (level.boss && level.boss.alive) {
      if (level.flagWarnCooldown <= 0) {
        showLevelBanner('Hạ Rồng canh giữ trước đã!');
        level.flagWarnCooldown = 100;
      }
    } else {
      score += 500;
      if (currentLevel < TOTAL_LEVELS) {
        advanceLevel();
      } else {
        endGame(true);
      }
    }
  }

  // Camera của MÁY NÀY luôn bám theo người chơi của chính mình (myId)
  const me = players[myId];
  if (me) {
    camX = me.x - W / 2 + me.w / 2;
    if (camX < 0) camX = 0;
    if (camX > levelWidth - W) camX = levelWidth - W;
  }

  // ----- Xác định trạng thái hoạt ảnh cho từng người chơi -----
  for (const id in players) {
    const p = players[id];
    if (p.shootTimer > 0) p.animState = 'shoot';
    else if (p.xoacTimer > 0) p.animState = 'xoac';
    else if (!p.onGround) p.animState = 'jump';
    else if (Math.abs(p.vx) > 0.6) p.animState = 'run';
    else p.animState = 'idle';

    if (p.animState === 'run') {
      p.animTimer++;
      if (p.animTimer >= 5) {
        p.animTimer = 0;
        p.animFrame = (p.animFrame + 1) % 4;
      }
    } else {
      p.animTimer = 0;
      p.animFrame = 0;
    }
  }
}
