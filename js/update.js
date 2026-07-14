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

  // Riêng Keng: KHÔNG dùng cooldown đếm theo thời gian (shootCooldown) để cho phép ném
  // lao mới, mà chờ đúng lúc lao vừa rồi biến mất (trúng gì đó / hết tầm bay) — xem cờ
  // p.spearActive, được updateSpears() đặt lại false khi lao đó bị xoá khỏi màn.
  const isKeng = p.charId === 'keng';
  // Riêng Lyron: bấm Z bắn ra 1 loạt 5 viên đạn cùng lúc thay vì đá tay không, hồi
  // chiêu riêng LYRON_SHOOT_COOLDOWN (10 giây) dài hơn hẳn SHOOT_COOLDOWN mặc định.
  const isLyron = p.charId === 'lyron';
  const attackReady = isKeng ? !p.spearActive : p.shootCooldown <= 0;

  if (p.xoacTimer <= 0 && k['KeyZ'] && p.shootTimer <= 0 && attackReady) {
    p.shootTimer = SHOOT_DURATION;
    SFX.kick();
    if (isKeng) {
      spawnSpear(p);
      p.spearActive = true;
    } else if (isLyron) {
      spawnLyronBullets(p);
      p.shootCooldown = LYRON_SHOOT_COOLDOWN;
    } else {
      p.shootCooldown = SHOOT_COOLDOWN;
    }
  }
  if (p.shootTimer <= 0 && k['KeyX'] && p.xoacTimer <= 0 && p.xoacCooldown <= 0) {
    p.xoacTimer = XOAC_DURATION;
    p.xoacCooldown = XOAC_COOLDOWN;
    p.invincible = Math.max(p.invincible, XOAC_DURATION);
    // Riêng Lyron: xoạc không phải đòn cận chiến mà thả xuống 1 hộp máu cứu sinh (rơi tự
    // do theo trọng lực), tối đa LYRON_MAX_CRATES_PER_LEVEL lần MỖI MÀN (dùng chung cho cả
    // team, không tính riêng từng người) — không có hồi chiêu riêng nào khác, chỉ bị giới
    // hạn bởi đúng thời gian giữ tư thế xoạc (XOAC_DURATION/XOAC_COOLDOWN) như các nhân vật
    // khác, và bởi số lượt thả còn lại trong màn.
    if (isLyron) {
      if (level.lyronCratesUsed === undefined) level.lyronCratesUsed = 0;
      if (level.lyronCratesUsed < LYRON_MAX_CRATES_PER_LEVEL) {
        spawnLyronCrate(p);
        level.lyronCratesUsed++;
      }
    }
    SFX.slash();
  }

  const isActing = p.shootTimer > 0 || p.xoacTimer > 0;
  if (p.xoacTimer > 0) {
    p.vx = p.facing * p.speed * XOAC_SPEED_MULT;
  } else if (!isActing) {
    if (k['ArrowLeft']) { p.vx -= (p.moveAccel || 3.8); p.facing = -1; }
    if (k['ArrowRight']) { p.vx += (p.moveAccel || 3.8); p.facing = 1; }
  }
  p.vx *= FRICTION;
  const maxSpeed = p.speed * (p.xoacTimer > 0 ? XOAC_SPEED_MULT : 1);
  if (Math.abs(p.vx) > maxSpeed) p.vx = maxSpeed * Math.sign(p.vx);
  if (Math.abs(p.vx) < 0.05) p.vx = 0;

  if (isLyron) {
    // Trực thăng bay tự do trên trời: KHÔNG nhảy như các nhân vật khác, mà điều khiển
    // lên/xuống liên tục bằng ArrowUp (hoặc Space) để bay lên, ArrowDown để hạ xuống.
    // Không có trọng lực (xem stepPlayerPhysics) nên khi buông phím sẽ tự lơ lửng đứng yên.
    if (!isActing) {
      if (k['ArrowUp'] || k['Space']) p.vy -= LYRON_FLY_ACCEL;
      if (k['ArrowDown']) p.vy += LYRON_FLY_ACCEL;
    }
    p.vy *= FRICTION;
    if (Math.abs(p.vy) > LYRON_FLY_MAX_SPEED) p.vy = LYRON_FLY_MAX_SPEED * Math.sign(p.vy);
    if (Math.abs(p.vy) < 0.05) p.vy = 0;
    p.onGround = false;
    p.jumpsUsed = 0;
  } else if (jumpPulse && !isActing) {
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
  const isFlyer = isFlyerChar(p.charId);

  // Nhân vật BAY (Lyron): không trọng lực, không va chạm địa hình (bay tự do trên
  // không, lướt qua mọi bệ/hố), chỉ cần giữ trong phạm vi chiều ngang của màn chơi và
  // chiều dọc của màn hình (không bay khuất phía trên, không chìm xuống dưới mặt đất).
  if (isFlyer) {
    p.x += p.vx;
    if (p.x < 0) p.x = 0;
    if (p.x + p.w > levelWidth) p.x = levelWidth - p.w;

    p.y += p.vy;
    if (p.y < 0) { p.y = 0; p.vy = 0; }
    const maxFlyY = level.groundY - p.h;
    if (p.y > maxFlyY) { p.y = maxFlyY; p.vy = 0; }

    p.onGround = false;
    p.jumpsUsed = 0;
    if (p.invincible > 0) p.invincible--;
    return;
  }

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

// ----- Lao của Keng (ném khi bấm Z, thay cho đòn đá tay không) -----

// Tạo 1 thanh lao mới, bay thẳng từ vị trí người ném theo đúng hướng đang quay mặt.
// Sát thương dùng đúng p.kickDamage (đã nhân damageMult riêng của nhân vật/độ khó màn),
// y hệt công thức đòn đá thường, chỉ khác ở chỗ bay xa thay vì chỉ có hitbox sát người.
function spawnSpear(p) {
  if (!level) return;
  if (!level.spears) level.spears = [];
  const dir = p.facing;
  const y = p.y + p.h * 0.32;
  const x = dir > 0 ? p.x + p.w * 0.55 : p.x + p.w * 0.45 - SPEAR_W;
  level.spears.push({
    x: x, y: y, w: SPEAR_W, h: SPEAR_H,
    vx: dir * SPEAR_SPEED,
    dir: dir,
    ownerId: p.id,
    damage: p.kickDamage,
    life: SPEAR_LIFE
  });
}

// Cập nhật vị trí + va chạm của mọi thanh lao đang bay mỗi frame: bay thẳng theo vx,
// gây sát thương 1 LẦN cho quái thường/rồng đầu tiên trúng phải rồi biến mất ngay
// (không xuyên qua tiếp); tự biến mất nếu bay hết "tầm sống" (life) mà không trúng gì
// hoặc bay ra khỏi biên màn chơi.
function updateSpears() {
  if (!level.spears) level.spears = [];
  for (let i = level.spears.length - 1; i >= 0; i--) {
    const s = level.spears[i];
    s.x += s.vx;
    s.life--;

    let hit = false;

    // Va vào quái thường
    for (const e of level.enemies) {
      if (!e.alive || e.hitCooldown > 0) continue;
      if (rectsOverlap(s, e)) {
        const dead = damageEnemy(e, s.damage);
        SFX.hitEnemy();
        e.hitCooldown = ENEMY_HIT_COOLDOWN;
        if (dead) {
          e.alive = false;
          score += 100;
          spawnFlyingEnemy(e, s.dir);
        }
        hit = true;
        break;
      }
    }

    // Va vào Rồng canh giữ
    if (!hit && level.boss && level.boss.alive && level.boss.hitCooldown <= 0 && rectsOverlap(s, level.boss)) {
      const boss = level.boss;
      const dead = damageEnemy(boss, s.damage);
      SFX.hitEnemy();
      boss.hitCooldown = BOSS_HIT_COOLDOWN;
      if (dead) {
        boss.alive = false;
        score += 1000;
        showLevelBanner('GUARDIAN DRAGON DEFEATED!');
      }
      hit = true;
    }

    if (hit || s.life <= 0 || s.x < -200 || s.x > levelWidth + 200) {
      level.spears.splice(i, 1);
      // Lao đã biến mất -> cho phép người ném (nếu vẫn còn trong trận) ném lao mới
      const owner = players[s.ownerId];
      if (owner) owner.spearActive = false;
    }
  }
}

// ----- Đạn của Lyron (bắn khi bấm Z, thay cho đòn đá tay không - xem LYRON_* trong config.js) -----

// Bắn ra 1 loạt LYRON_BULLET_COUNT viên đạn cùng lúc, xếp lệch nhau theo chiều dọc (kiểu
// súng máy trực thăng bắn "chùm"), bay thẳng theo đúng hướng đang quay mặt. Sát thương mỗi
// viên dùng LYRON_BULLET_DAMAGE (hằng số riêng, không nhân theo damageMult như đòn thường,
// vì đây vốn đã là 1 loạt 5 viên bù lại cho thời gian hồi chiêu dài).
function spawnLyronBullets(p) {
  if (!level) return;
  if (!level.lyronBullets) level.lyronBullets = [];
  const dir = p.facing;
  const baseX = dir > 0 ? p.x + p.w * 0.7 : p.x + p.w * 0.3;
  const baseY = p.y + p.h * 0.45;
  const spreadY = 18; // mỗi viên lệch dọc 1 chút để trông như 1 loạt đạn, không chồng khít lên nhau
  for (let i = 0; i < LYRON_BULLET_COUNT; i++) {
    const offset = (i - (LYRON_BULLET_COUNT - 1) / 2) * spreadY;
    level.lyronBullets.push({
      x: baseX, y: baseY + offset,
      vx: dir * LYRON_BULLET_SPEED, vy: 0,
      r: LYRON_BULLET_RADIUS,
      dir: dir,
      ownerId: p.id,
      damage: LYRON_BULLET_DAMAGE,
      life: LYRON_BULLET_LIFE
    });
  }
}

// Cập nhật vị trí + va chạm của các viên đạn Lyron mỗi frame: bay thẳng theo vx, gây sát
// thương 1 LẦN cho quái thường/rồng đầu tiên trúng phải rồi biến mất ngay (không xuyên
// qua tiếp); tự biến mất nếu hết "tầm sống" hoặc bay ra khỏi biên màn chơi.
function updateLyronBullets() {
  if (!level.lyronBullets) level.lyronBullets = [];
  for (let i = level.lyronBullets.length - 1; i >= 0; i--) {
    const b = level.lyronBullets[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    let hit = false;
    const bulletBox = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };

    // Va vào quái thường - CỐ Ý bỏ qua e.hitCooldown (khác với lao Keng/đòn thường), để
    // nếu cả 5 viên trong 1 loạt cùng trúng 1 con quái thì DỒN đủ cả 5 lần sát thương (mỗi
    // viên trúng 1 lần độc lập rồi tự biến mất), thay vì bị chặn chỉ tính 1 viên như các
    // đòn tấn công khác. hitCooldown vẫn được set lại sau mỗi lần trúng để không ảnh hưởng
    // tới các đòn tấn công cận chiến khác của người chơi trong khoảng thời gian đó.
    for (const e of level.enemies) {
      if (!e.alive) continue;
      if (rectsOverlap(bulletBox, e)) {
        const dead = damageEnemy(e, b.damage);
        SFX.hitEnemy();
        e.hitCooldown = ENEMY_HIT_COOLDOWN;
        if (dead) {
          e.alive = false;
          score += 100;
          spawnFlyingEnemy(e, b.dir);
        }
        hit = true;
        break;
      }
    }

    // Va vào Rồng canh giữ - cũng CỐ Ý bỏ qua boss.hitCooldown cùng lý do như trên.
    if (!hit && level.boss && level.boss.alive && rectsOverlap(bulletBox, level.boss)) {
      const boss = level.boss;
      const dead = damageEnemy(boss, b.damage);
      SFX.hitEnemy();
      boss.hitCooldown = BOSS_HIT_COOLDOWN;
      if (dead) {
        boss.alive = false;
        score += 1000;
        showLevelBanner('GUARDIAN DRAGON DEFEATED!');
      }
      hit = true;
    }

    if (hit || b.life <= 0 || b.x < -200 || b.x > levelWidth + 200) {
      level.lyronBullets.splice(i, 1);
    }
  }
}

// ----- Hộp máu cứu sinh của Lyron (thả khi bấm X, thay cho đòn xoạc cận chiến - xem
// LYRON_MAX_CRATES_PER_LEVEL/LYRON_CRATE_SIZE trong config.js) -----

// Thả 1 hộp máu ngay BÊN DƯỚI CHÂN Lyron (nằm ngoài hitbox của chính người thả, không
// spawn đè lên người - nếu không hộp sẽ bị "nhặt" ngay lập tức trong cùng 1 frame vừa thả
// ra, khiến người chơi chỉ thấy chữ "FULL HP!" mà chưa kịp thấy hộp rơi). Rơi CHẬM RÃI
// thẳng xuống (tốc độ đều, không tăng tốc theo trọng lực) cho tới khi chạm 1 bệ (platform)
// nào đó thì dừng lại nằm yên trên đó, chờ người chơi tới nhặt.
function spawnLyronCrate(p) {
  if (!level) return;
  if (!level.lyronCrates) level.lyronCrates = [];
  const size = LYRON_CRATE_SIZE;
  level.lyronCrates.push({
    x: p.x + p.w / 2 - size / 2,
    y: p.y + p.h + 6, // ngay dưới chân, không chồng lên hitbox người thả
    w: size, h: size,
    landed: false,
    // Vài frame đầu KHÔNG cho nhặt (kể cả người vừa thả), để hộp luôn kịp hiện ra và rơi
    // ít nhất một đoạn ngắn trước khi có thể biến mất - tránh bug "vừa thả đã biến mất".
    spawnGrace: 20
  });
}

// Cập nhật vật lý rơi + việc nhặt hộp máu mỗi frame. Hộp rơi CHẬM, ĐỀU TỐC ĐỘ (không
// dùng GRAVITY/tăng tốc như các vật thể rơi khác trong game) cho tới khi chạm bệ thì nằm
// yên; BẤT KỲ người chơi nào (kể cả người vừa thả, sau khi hết spawnGrace) chạm vào hộp -
// dù đang rơi hay đã nằm yên - đều được hồi ĐẦY máu ngay lập tức rồi hộp biến mất.
function updateLyronCrates() {
  if (!level.lyronCrates) level.lyronCrates = [];
  for (let i = level.lyronCrates.length - 1; i >= 0; i--) {
    const c = level.lyronCrates[i];
    if (c.spawnGrace > 0) c.spawnGrace--;
    if (!c.landed) {
      c.y += LYRON_CRATE_FALL_SPEED;
      for (const pf of level.platforms) {
        if (rectsOverlap(c, pf)) {
          c.y = pf.y - c.h;
          c.landed = true;
          break;
        }
      }
      // Rơi lọt hố sâu không đáy mà không trúng bệ nào -> tự biến mất, không chờ mãi
      if (c.y > H + 400) { level.lyronCrates.splice(i, 1); continue; }
    }
    if (c.spawnGrace > 0) continue; // vẫn trong thời gian "chưa cho nhặt" -> bỏ qua kiểm tra va chạm

    let taken = false;
    for (const id in players) {
      const pl = players[id];
      if (pl.eliminated) continue;
      if (rectsOverlap(pl, c)) {
        pl.hp = pl.maxHp;
        SFX.heal();
        spawnHealEffect(pl.x + pl.w / 2, pl.y - 10);
        taken = true;
        break;
      }
    }
    if (taken) level.lyronCrates.splice(i, 1);
  }
}

// ----- AI cho Bot đồng đội (chế độ "Team với Bot") -----
// Bot tự quyết định phím bấm mỗi frame, y hệt như input của người chơi thật, rồi
// được đưa qua đúng stepPlayerInput/stepPlayerPhysics dùng chung với người chơi.

// Kiểm tra có nền (platform) ngay dưới 1 điểm cách xa `p` một khoảng `aheadDist`
// hay không - dùng để bot né rơi xuống hố phía trước.
function isGroundAhead(p, aheadDist) {
  const testX = p.x + p.w / 2 + aheadDist;
  const testY = p.y + p.h + 24;
  for (const pf of level.platforms) {
    if (testX >= pf.x && testX <= pf.x + pf.w && testY >= pf.y && testY <= pf.y + pf.h + 40) return true;
  }
  return false;
}

// Băm chuỗi id thành số nguyên ổn định, dùng làm "hạt giống" riêng cho từng Bot để mỗi
// Bot có một chút cá tính khác nhau, thay vì hành xử y hệt bản sao của nhau.
function hashId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Trong số TẤT CẢ người chơi (kể cả người thật) đang trong tầm `maxRange` của `target`,
// tìm người đứng gần nó nhất - đó sẽ là người "có trách nhiệm" xử lý mục tiêu này.
// Dùng để tránh việc cả team dồn hết vào đánh chung 1 con quái vặt.
function findClosestDefender(target, maxRange) {
  let best = null, bestDist = Infinity;
  for (const id in players) {
    const p = players[id];
    if (p.eliminated) continue;
    const d = Math.abs((target.x + target.w / 2) - (p.x + p.w / 2));
    if (d < maxRange && d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function computeBotInput(p) {
  const k = { ArrowLeft: false, ArrowRight: false, KeyZ: false, KeyX: false };
  let jump = false;

  // ----- Cá tính riêng của từng Bot, gán 1 LẦN DUY NHẤT khi gặp bot này lần đầu, dựa
  // trên id (ổn định suốt trận, không đổi theo frame) - để bot không hành xử như bản
  // sao rập khuôn của nhau, mà mỗi con có "kiểu" riêng, y như người chơi thật khác nhau:
  //   'kicker'  : điềm tĩnh, đứng chờ 1 chút lúc đầu trận rồi mới di chuyển, thích đá (Z)
  //   'slasher' : máu chiến, xoạc (X) thử vài phát ngay lúc đầu trận, thích xoạc khi đánh
  //   'stomper' : hiếu động, nhảy lung tung lúc đầu trận, thích nhảy lên đầu quái thay vì đá/xoạc
  //   'avoider' : nóng vội, không chờ gì cả mà chạy thẳng luôn, phần lớn né đánh nhau, tập trung tiến lên
  if (p._botSeed === undefined) {
    p._botSeed = hashId(p.id);
    const styles = ['kicker', 'slasher', 'stomper', 'avoider'];
    p._botStyle = styles[p._botSeed % styles.length];
    // Độ trễ khởi động lúc đầu trận (đơn vị: frame, ~20-110 frame tức 0.3-1.8 giây ở 60fps),
    // lệch nhau theo từng bot để không đứa nào bắt đầu chạy/nhảy/tấn công cùng lúc.
    p._botStartDelay = 20 + (p._botSeed % 90);
    p._botFlavorFrame = Math.floor(p._botStartDelay * (0.3 + (p._botSeed % 40) / 100));
  }
  const seed = p._botSeed;
  const style = p._botStyle;
  const aggroJitter = 0.85 + (seed % 30) / 100; // ~0.85 - 1.14, mỗi bot vào tầm giao tranh hơi khác nhau 1 chút

  // ----- Giai đoạn "mới vào trận": mỗi bot phản ứng khác nhau tuỳ cá tính, để không
  // đứa nào giống đứa nào ngay từ giây đầu tiên (thay vì cả bầy cùng chạy/nhảy/đánh) -----
  if (gameFrame < p._botStartDelay) {
    const k0 = { ArrowLeft: false, ArrowRight: false, KeyZ: false, KeyX: false };
    let jump0 = false;
    if (style === 'kicker') {
      // đứng yên chờ, thử đá 1 phát cho có khí thế rồi lại đứng im
      if (gameFrame === p._botFlavorFrame) k0.KeyZ = true;
    } else if (style === 'slasher') {
      if (gameFrame === p._botFlavorFrame) k0.KeyX = true;
    } else if (style === 'stomper') {
      if (gameFrame === p._botFlavorFrame) jump0 = true;
    } else {
      // avoider: không chờ đợi gì cả, chạy thẳng luôn ngay từ giây đầu
      k0.ArrowRight = true;
    }
    return { keys: k0, jump: jump0 };
  }

  const ATTACK_RANGE = 220;
  const DEAD_ZONE = 50;

  // ----- Ưu tiên số 1: Rồng canh giữ (mục tiêu chính) - hễ vào tầm là dồn sức đánh,
  // không cần xét "ai gần nhất" như quái thường, vì hạ được boss mới là mục tiêu chính -----
  const BOSS_PRIORITY_RANGE = 1400;
  let target = null, targetDist = Infinity;
  const isBossTarget = !!(level.boss && level.boss.alive &&
    Math.abs((level.boss.x + level.boss.w / 2) - (p.x + p.w / 2)) < BOSS_PRIORITY_RANGE);
  if (isBossTarget) {
    target = level.boss;
    targetDist = Math.abs((level.boss.x + level.boss.w / 2) - (p.x + p.w / 2));
  }

  // ----- Chưa tới lúc lo boss -> tìm quái thường ĐÁNG đánh (engageWorth) gần nhất, và
  // CHỈ nhận đánh nếu chính mình là người gần nó nhất trong cả team. Nếu có đồng đội khác
  // (bot hoặc người thật) gần hơn thì coi như "đã có người lo", mình cứ tiếp tục tiến lên.
  // Riêng bot kiểu 'avoider' thường sẽ né hẳn, không thèm đánh dù có là người gần nhất. -----
  if (!target) {
    let bestEnemy = null, bestDist = Infinity;
    for (const e of level.enemies) {
      if (!e.alive || e.engageWorth === false) continue;
      const d = Math.abs((e.x + e.w / 2) - (p.x + p.w / 2));
      if (d < bestDist) { bestDist = d; bestEnemy = e; }
    }
    if (bestEnemy) {
      const AGGRO_RANGE = 1000 * aggroJitter;
      if (bestDist < AGGRO_RANGE) {
        const defender = findClosestDefender(bestEnemy, AGGRO_RANGE);
        if (!defender || defender.id === p.id) {
          let takeIt = true;
          if (style === 'avoider') {
            // Quyết định né hay không CHỈ 1 LẦN cho mỗi cặp (quái này, bot này), tránh
            // đổi ý liên tục mỗi frame trông sẽ rất giả/máy móc.
            if (!bestEnemy._avoiderSkip) bestEnemy._avoiderSkip = {};
            if (bestEnemy._avoiderSkip[p.id] === undefined) {
              bestEnemy._avoiderSkip[p.id] = Math.random() < 0.6;
            }
            takeIt = !bestEnemy._avoiderSkip[p.id];
          }
          if (takeIt) { target = bestEnemy; targetDist = bestDist; }
        }
      }
    }
  }

  // Mặc định LUÔN tự tiến về phía cờ đích (bên phải), hoàn toàn không cần chờ
  // hay bám theo người chơi chính — bot có thể tự đi trước, tự khám phá màn chơi.
  let dir = 1;
  let wantAttack = false;
  let wantStompJump = false;

  if (target) {
    if (isBossTarget && target.phase === 'fire' && targetDist < target.w * 1.3) {
      // Boss đang khạc lửa và mình đang trong tầm -> lùi ra xa thay vì lao vào chịu trận
      dir = (p.x < target.x) ? -1 : 1;
    } else {
      const dx = (target.x + target.w / 2) - (p.x + p.w / 2);
      dir = Math.abs(dx) > DEAD_ZONE ? (dx > 0 ? 1 : -1) : 0;
      if (targetDist < ATTACK_RANGE) {
        // Với boss thì luôn đá/xoạc như cũ (boss bay, không "dẫm đầu" được). Với quái
        // thường, mỗi kiểu bot chọn cách khác nhau: kicker thích đá, slasher thích xoạc,
        // stomper thử nhảy lên đầu quái, avoider (lỡ vào thế phải đánh) thì đá đại cho xong.
        if (!isBossTarget && style === 'stomper') wantStompJump = true;
        else wantAttack = true;
      }
      // Đang xả loạt đạn -> thỉnh thoảng nhảy né ngẫu nhiên
      if (isBossTarget && target.phase === 'barrage' && Math.random() < 0.035) jump = true;
    }
  }

  if (dir > 0) k.ArrowRight = true;
  else if (dir < 0) k.ArrowLeft = true;
  if (wantAttack) {
    if (style === 'kicker') k.KeyZ = true;
    else if (style === 'slasher') k.KeyX = true;
    else if (Math.random() < 0.5) k.KeyZ = true; else k.KeyX = true;
  }
  if (wantStompJump) jump = true; // thử nhảy lên đầu quái thay vì đá/xoạc


  // Né chướng ngại vật khi đang đứng đất và đang thực sự di chuyển theo 1 hướng
  if (p.onGround && dir !== 0) {
    const lookAheadX = p.x + p.w / 2 + dir * 140;
    for (const s of level.spikes) {
      if (lookAheadX > s.x && lookAheadX < s.x + s.w) { jump = true; break; }
    }
    // Không phải đang lao tới để đánh (không có mục tiêu, hoặc mục tiêu là con khác) mà
    // phía trước có quái chắn đường -> nhảy qua luôn thay vì đứng lại choảng nhau, để
    // dành việc đánh cho đồng đội đang "có trách nhiệm" với con đó (hoặc bỏ qua hẳn).
    if (!jump && !wantAttack) {
      for (const e of level.enemies) {
        if (!e.alive || e === target) continue;
        if (lookAheadX > e.x - 20 && lookAheadX < e.x + e.w + 20) { jump = true; break; }
      }
    }
    if (!jump && !isGroundAhead(p, dir * 130)) jump = true; // hố phía trước -> nhảy qua
    if (!jump) {
      if (Math.abs(p.vx) < 0.4) {
        p._botStuckTimer = (p._botStuckTimer || 0) + 1;
        if (p._botStuckTimer > 6) { jump = true; p._botStuckTimer = 0; } // bị kẹt -> nhảy thử thoát kẹt
      } else {
        p._botStuckTimer = 0;
      }
    }
  } else if (dir === 0) {
    p._botStuckTimer = 0;
  }

  // Đang ở giữa không trung, đang rơi, và phía trước vẫn là hố rộng -> tự bấm nhảy đôi
  // để vượt qua thay vì rơi xuống chết oan (chỉ dùng khi còn lượt nhảy thứ 2).
  if (!p.onGround && p.vy > 0 && dir !== 0 && p.jumpsUsed < 2 && !isGroundAhead(p, dir * 170)) {
    jump = true;
  }

  // Bot điều khiển Lyron (nhân vật bay): không nhảy/né hố như trên, mà tự điều chỉnh độ
  // cao bay - hạ xuống ngang tầm mục tiêu đang giao tranh (quái/boss) để bắn trúng, còn
  // lại thì lượn ở độ cao vừa phải phía trên mặt đất khi không có mục tiêu nào gần.
  if (isFlyerChar(p.charId)) {
    const desiredY = target ? (target.y + target.h / 2 - p.h / 2) : (level.groundY - p.h - 260);
    if (p.y < desiredY - 20) k.ArrowDown = true;
    else if (p.y > desiredY + 20) k.ArrowUp = true;
  }

  return { keys: k, jump: jump };
}

// ----- Bot chat: bots occasionally say something contextual (about the boss fight,
// low HP, coins, spikes, general encouragement...) so the team chat doesn't feel empty
// when playing with Bot teammates. Purely local — no network relay needed, since Bot
// mode never has other real machines connected. -----
const BOT_CHAT_LINES = {
  bossNear: [
    "Get the dragon!", "Focus fire on the dragon!", "Watch out, it's about to attack!",
    "Dodge the fire breath!", "We're almost there, keep hitting it!", "Incoming barrage, watch out!"
  ],
  bossDown: [
    "We beat the Guardian Dragon!", "Dragon down! Let's move on!", "GG on that dragon!"
  ],
  lowHp: [
    "I'm low on HP!", "Ouch, that hurt!", "Need to be careful here...", "I could use a coin or two right now!"
  ],
  spikesAhead: [
    "Watch out for the spikes!", "Careful, spikes ahead!", "Jump, spikes!"
  ],
  general: [
    "Let's keep moving!", "This way!", "Nice one!", "Almost to the flag!",
    "Grab those coins!", "Follow me!", "Looking good, team!", "Watch your step here."
  ]
};

function pickBotLine(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function maybeBotChat(p) {
  if (typeof receiveChatMessage !== 'function') return;

  if (p.botChatCooldown === undefined) {
    // Stagger each bot's first line so they don't all talk at once when a level starts
    p.botChatCooldown = 90 + Math.floor(Math.random() * 240);
  }
  if (p.botChatCooldown > 0) { p.botChatCooldown--; return; }

  // Reset cooldown for next time regardless of whether we actually say something,
  // so a bot that stays quiet this round doesn't spam-check every single frame.
  p.botChatCooldown = 360 + Math.floor(Math.random() * 220); // ~6-13s between lines

  const boss = level.boss;
  const nearBoss = boss && boss.alive &&
    Math.abs((boss.x + boss.w / 2) - (p.x + p.w / 2)) < 900;

  let pool;
  if (boss && !boss.alive && p._botSawBossAlive) {
    pool = BOT_CHAT_LINES.bossDown;
    p._botSawBossAlive = false;
  } else if (nearBoss) {
    p._botSawBossAlive = true;
    pool = BOT_CHAT_LINES.bossNear;
  } else if (p.hp < p.maxHp * 0.35) {
    pool = BOT_CHAT_LINES.lowHp;
  } else {
    // small chance to comment on spikes just ahead, otherwise general chatter
    const lookAheadX = p.x + p.w / 2 + p.facing * 160;
    const spikeAhead = level.spikes.some(s => lookAheadX > s.x && lookAheadX < s.x + s.w);
    pool = spikeAhead ? BOT_CHAT_LINES.spikesAhead : BOT_CHAT_LINES.general;
  }

  // Don't say something every single time the cooldown fires — keeps chat from
  // feeling too chatty/robotic.
  if (Math.random() < 0.7) {
    receiveChatMessage(p.id, pickBotLine(pool));
  }
}


function runAuthoritativeUpdate() {
  for (const id in players) {
    const p = players[id];
    if (p.eliminated) continue; // đã hết mạng -> ra khỏi trận, không còn được điều khiển/mô phỏng nữa
    let inputKeys, inputJump;
    if (id === myId) {
      inputKeys = keys;
      inputJump = jumpBuffered;
    } else if (p.isBot) {
      const botInput = computeBotInput(p);
      inputKeys = botInput.keys;
      inputJump = botInput.jump;
      maybeBotChat(p);
    } else {
      inputKeys = p.remoteKeys || {};
      inputJump = !!p.remoteJumpPulse;
    }
    stepPlayerInput(p, inputKeys, inputJump);
    stepPlayerPhysics(p);
    if (id !== myId) p.remoteJumpPulse = false;
  }
  if (players[myId]) jumpBuffered = false;

  // Hitbox cú sút của từng người chơi trong frame này
  const shootBoxes = {};
  for (const id in players) {
    const p = players[id];
    if (p.eliminated) continue;
    // Keng không dùng hitbox đá tay không nữa — đòn Z của Keng là thanh lao ném ra
    // (xem spawnSpear/updateSpears). Lyron cũng vậy — đòn Z của Lyron là loạt đạn bắn ra
    // (xem spawnLyronBullets/updateLyronBullets), nên cả 2 đều không tạo shootBox melee ở đây.
    if (p.shootTimer > 0 && p.charId !== 'keng' && p.charId !== 'lyron') {
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
      if (p.eliminated) continue;
      const hitByXoac = p.xoacTimer > 0 && rectsOverlap(p, e);
      const hitByShoot = shootBoxes[id] && rectsOverlap(shootBoxes[id], e);

      if ((hitByXoac || hitByShoot) && e.hitCooldown <= 0) {
        const dmg = hitByXoac ? (p.xoacDamage || XOAC_DAMAGE) : (p.kickDamage || KICK_DAMAGE);
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

  // Các thanh lao đang bay (Keng ném ra khi bấm Z)
  updateSpears();

  // Các viên đạn đang bay (Lyron bắn ra khi bấm Z)
  updateLyronBullets();

  // Các hộp máu cứu sinh đang rơi/chờ nhặt (Lyron thả ra khi bấm X)
  updateLyronCrates();

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
      if (p.eliminated) continue;
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
    if (p.eliminated) continue;
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
      if (players[id].eliminated) continue;
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
    if (players[id].eliminated) continue;
    if (rectsOverlap(players[id], level.flag)) { anyOnFlag = true; break; }
  }
  if (anyOnFlag) {
    if (level.boss && level.boss.alive) {
      if (level.flagWarnCooldown <= 0) {
        showLevelBanner('Defeat the Guardian Dragon first!');
        level.flagWarnCooldown = 100;
      }
    } else {
      score += 500;
      // Ghi lại vào bảng xếp hạng NGAY lúc pass xong màn hiện tại (currentLevel),
      // bất kể đây là màn giữa hay màn cuối cùng — xem recordLevelClear() trong
      // game-state.js. Phải đọc currentLevel TRƯỚC khi advanceLevel() tăng nó lên,
      // để ghi đúng số màn vừa pass (không phải màn sắp tới).
      recordLevelClear(currentLevel, Date.now() - gameStartTime);
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
    // Nhân vật bay (Lyron) không bao giờ "onGround" (không đứng đất), nên bỏ qua điều
    // kiện onGround cho riêng nhân vật này - nếu không sẽ bị kẹt mãi ở tư thế 'jump'.
    else if (!p.onGround && !isFlyerChar(p.charId)) p.animState = 'jump';
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