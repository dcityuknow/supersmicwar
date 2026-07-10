// ============================================================
// game-state.js — Trạng thái tổng của ván chơi: khởi tạo/reset,
// chuyển màn, bắt đầu/chơi lại, mất mạng, kết thúc game.
//
// NHIỀU NGƯỜI CHƠI: thay vì 1 biến `player` duy nhất, giờ dùng object
// `players` (key = id của từng người, chính là peerId từ PeerJS, hoặc
// 'solo' khi chơi 1 mình). `myId` là id của người đang ngồi trước máy này.
// Máy làm Host (hoặc Solo) chạy toàn bộ logic game (xem update.js) và
// coi mọi người chơi (kể cả chính mình) như nhau trong vòng lặp game.
// Máy Client không tự tính vật lý — chỉ nhận `players` từ Host để vẽ lại
// (xem applyStateSnapshot bên dưới, được net.js gọi khi có state mới).
// ============================================================

let level, players, myId, score, coinsCollected, camX, gameOver, win, started, currentLevel;

const PLAYER_MAX_LIVES = 3; // mỗi người chơi (kể cả từng Bot) có riêng số mạng này, KHÔNG dùng chung

// Tạo 1 đối tượng người chơi mới (áp dụng công thức/hằng số gốc, có nhân thêm hệ số
// riêng của từng nhân vật - xem CHARACTERS trong characters.js: ví dụ Rocky máu trâu +
// to gấp đôi vì là tanker, Spider nhanh gấp đôi + đánh mạnh gấp đôi)
function makePlayer(id, name, charId, groundY, isBot) {
  const sizeMult = getCharStatMult(charId, 'sizeMult');
  const speedMult = getCharStatMult(charId, 'speedMult');
  const hpMult = getCharStatMult(charId, 'hpMult');
  const damageMult = getCharStatMult(charId, 'damageMult');
  const baseW = 160, baseH = 200;
  const maxHp = Math.round(PLAYER_MAX_HP * hpMult);
  // Bot đồng đội: lệch nhẹ tốc độ (~90%-110%) theo từng bot (ổn định theo id, không đổi
  // theo frame) để chúng không chạy đều tăm tắp y hệt nhau như 1 đàn rô-bốt.
  const botJitter = isBot ? (0.9 + (hashId(id) % 21) / 100) : 1;
  return {
    id: id, name: name || 'Player', charId: charId,
    isBot: !!isBot,
    x: 120, y: groundY - 720,
    w: baseW * sizeMult, h: baseH * sizeMult,
    vx: 0, vy: 0,
    speed: 13.5 * speedMult * botJitter,
    // Gia tốc di chuyển mỗi frame khi bấm trái/phải, cũng nhân theo speedMult - nếu chỉ
    // nhân "speed" (tốc độ tối đa) mà giữ nguyên gia tốc, nhân vật sẽ KHÔNG chạy nhanh
    // hơn thực tế vì tốc độ chạy thường vốn đã đạt trạng thái cân bằng (do ma sát) thấp
    // hơn mức tối đa mặc định rồi, nên cái "tối đa" cao hơn không bao giờ được chạm tới.
    moveAccel: 3.8 * speedMult * botJitter,
    jumpPower: 42,
    onGround: false,
    jumpsUsed: 0,
    facing: 1,
    invincible: 0,
    maxHp: maxHp,
    hp: maxHp,
    lives: PLAYER_MAX_LIVES,  // mạng RIÊNG của người này, không chia sẻ với đồng đội
    eliminated: false,        // hết mạng -> ra khỏi trận, không hồi sinh nữa cho tới ván mới
    damageFlashTimer: 0,
    spikeTickTimer: 0,
    chatText: null,   // last chat message text, shown as a glowing bubble above the head
    chatUntil: 0,     // Date.now() timestamp after which the chat bubble stops showing
    animState: 'idle',
    animFrame: 0,
    animTimer: 0,
    shootTimer: 0,
    shootCooldown: 0,
    xoacTimer: 0,
    xoacCooldown: 0,
    // Sát thương gây ra khi sút (Z) / xoạc (X), đã nhân theo hệ số riêng của nhân vật
    // (ví dụ Spider đánh mạnh gấp đôi). Dùng thay cho hằng số KICK_DAMAGE/XOAC_DAMAGE
    // ở những nơi tính sát thương do CHÍNH người chơi này gây ra.
    kickDamage: Math.round(KICK_DAMAGE * damageMult),
    xoacDamage: Math.round(XOAC_DAMAGE * damageMult),
    // ----- chỉ dùng trên Host, cho các người chơi KHÁC không phải mình -----
    remoteKeys: {},        // trạng thái phím mới nhất nhận được từ client này
    remoteJumpPulse: false // tín hiệu "vừa nhấn nhảy" (1 lần) từ client này
  };
}

// Ô "Lives" ở góc trên hiển thị số mạng CỦA RIÊNG người đang ngồi trước máy này.
// Bảng nhỏ teamLivesBox bên phải hiển thị mạng riêng của TỪNG thành viên (kể cả Bot).
function updateHudTotals() {
  const me = players ? players[myId] : null;
  document.getElementById('lives').textContent = me ? me.lives : PLAYER_MAX_LIVES;
  document.getElementById('coins').textContent = coinsCollected;
  document.getElementById('totalCoins').textContent = level.coins.length;
  document.getElementById('levelNum').textContent = currentLevel;
  updateTeamLivesPanel();
}

// Dựng lại bảng mạng riêng của từng người chơi trong đội (ẩn nếu chơi solo 1 mình)
function updateTeamLivesPanel() {
  const box = document.getElementById('teamLivesBox');
  if (!box || !players) return;
  const ids = Object.keys(players);
  if (ids.length <= 1) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = ids.map(id => {
    const p = players[id];
    const icon = p.isBot ? '🤖' : (id === myId ? '🧍' : '👤');
    const hearts = p.eliminated ? '💀' : '❤'.repeat(Math.max(0, p.lives));
    const nameTag = p.name + (id === myId ? ' (you)' : '');
    return `<div class="teamLivesRow">${icon} ${nameTag}: ${hearts}</div>`;
  }).join('');
}

// Khởi tạo ván chơi mới (chỉ Host/Solo gọi hàm này — Client nhận state từ Host)
function resetState() {
  const groundY = H - BASE_GROUND_OFFSET;
  currentLevel = 1;
  level = createLevel(groundY, currentLevel);

  myId = NET.myId;
  players = {};
  const roster = NET.getRoster();
  if (roster.length === 0) {
    const fallbackId = myId || 'solo';
    players[fallbackId] = makePlayer(fallbackId, 'You', selectedChar ? selectedChar.id : CHARACTERS[0].id, groundY);
  } else {
    roster.forEach(r => {
      players[r.id] = makePlayer(r.id, r.name, r.charId || CHARACTERS[0].id, groundY, r.isBot);
    });
  }

  score = 0; coinsCollected = 0; camX = 0;
  gameOver = false; win = false;
  effects = [];

  updateHudTotals();
  document.getElementById('overlay').style.display = 'none';
  const banner = document.getElementById('levelBanner');
  if (banner) banner.classList.remove('show');
}

// Hiện banner to giữa màn hình báo tên màn chơi mới, tự ẩn sau một lúc (không dừng game).
// Nếu đang là Host, đồng thời gửi banner này cho mọi Client để họ cũng thấy.
let levelBannerTimer = null;
function showLevelBanner(text) {
  showLevelBannerLocal(text);
  if (NET.mode === 'host') NET.sendToAllClients({ t: 'banner', text: text });
}
function showLevelBannerLocal(text) {
  const banner = document.getElementById('levelBanner');
  if (!banner) return;
  banner.textContent = text;
  banner.classList.add('show');
  if (levelBannerTimer) clearTimeout(levelBannerTimer);
  levelBannerTimer = setTimeout(() => banner.classList.remove('show'), 1800);
}

// Chuyển sang màn kế tiếp: giữ nguyên điểm số/mạng, tạo lại màn với độ khó cao hơn,
// đưa TẤT CẢ người chơi về vị trí xuất phát và hồi đầy máu. (Chỉ Host/Solo gọi)
function advanceLevel() {
  currentLevel++;
  const groundY = level.groundY;
  level = createLevel(groundY, currentLevel);
  for (const id in players) {
    const p = players[id];
    if (p.eliminated) continue; // đã hết mạng từ trước -> vẫn ngồi ngoài, không hồi sinh
    p.x = 120; p.y = groundY - 720;
    p.vx = 0; p.vy = 0; p.jumpsUsed = 0;
    p.hp = p.maxHp;
    p.invincible = 60;
    p.spikeTickTimer = 0;
  }
  coinsCollected = 0;
  effects = [];
  updateHudTotals();
  showLevelBanner('LEVEL ' + currentLevel + '!');
  if (NET.mode === 'host') NET.broadcastLevelInit(level);
}

// Bắt đầu ván chơi. Solo/Host: tự dựng màn chơi (authoritative).
// Client: chỉ đánh dấu started=true, chờ nhận levelInit/state từ Host.
function startGame() {
  if (NET.mode === 'client') {
    started = true;
    document.getElementById('overlay').style.display = 'none';
    return;
  }
  resetState();
  started = true;
  if (NET.mode === 'host') NET.broadcastLevelInit(level);
}

function restartGame() {
  if (NET.mode === 'client') return; // chỉ Host/Solo được chơi lại
  resetState();
  if (NET.mode === 'host') NET.broadcastLevelInit(level);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Người chơi `p` mất 1 mạng CỦA RIÊNG mình. Hết mạng riêng -> người đó bị loại khỏi
// trận (không hồi sinh nữa cho tới ván mới), nhưng đồng đội còn mạng vẫn chơi tiếp.
// Chỉ khi TẤT CẢ mọi người (bao gồm cả Bot) đều hết mạng thì cả team mới thua.
function loseLife(p) {
  if (p.eliminated) return;
  p.lives--;
  p.invincible = 90;
  if (p.lives <= 0) {
    p.lives = 0;
    p.hp = 0;
    p.eliminated = true;
  } else {
    p.x = 120; p.y = level.groundY - 720;
    p.vx = 0; p.vy = 0; p.jumpsUsed = 0;
    p.hp = p.maxHp;
    p.spikeTickTimer = 0;
  }
  updateHudTotals();
  checkTeamWipe();
}

// Kiểm tra nếu mọi người chơi (kể cả Bot) đều đã hết mạng -> cả đội thua chung
function checkTeamWipe() {
  if (gameOver || !players) return;
  const ids = Object.keys(players);
  if (ids.length === 0) return;
  const allEliminated = ids.every(id => players[id].eliminated);
  if (allEliminated) endGame(false);
}

function endGame(didWin) {
  gameOver = true;
  win = didWin;
  if (didWin) SFX.win(); else SFX.gameOver();
  showEndOverlay(didWin, NET.mode !== 'client');
  if (NET.mode === 'host') NET.sendToAllClients({ t: 'gameOver', win: didWin });
}

// Client nhận tín hiệu kết thúc ván từ Host
function endGameClient(didWin) {
  gameOver = true;
  win = didWin;
  if (didWin) SFX.win(); else SFX.gameOver();
  showEndOverlay(didWin, false);
}

function showEndOverlay(didWin, canRestart) {
  document.getElementById('overlay').style.display = 'flex';
  document.getElementById('overlayText').textContent = didWin ? '🏆 YOU WIN! 🏆' : '💀 GAME OVER 💀';
  const btn = document.getElementById('restartBtn');
  const waitTxt = document.getElementById('restartWaitText');
  if (btn) btn.style.display = canRestart ? 'inline-block' : 'none';
  if (waitTxt) waitTxt.style.display = canRestart ? 'none' : 'block';
}

// ---------- Nhận dữ liệu từ Host (chỉ chạy trên máy Client) ----------

// Host tạo màn chơi mới -> Client dựng lại `level` (không có quái/boss/đạn,
// những thứ đó sẽ được lấp đầy ngay khi state đầu tiên tới)
function applyLevelInit(data) {
  currentLevel = data.levelNum;
  const coins = data.coinsXY.map(c => ({ x: c.x, y: c.y, taken: false }));
  level = {
    groundY: data.groundY,
    levelNum: data.levelNum,
    difficulty: data.difficulty,
    platforms: data.platforms,
    coins: coins,
    enemies: [],
    spikes: data.spikes,
    flag: data.flag,
    flyingEnemies: [],
    projectiles: [],
    boss: null,
    flagWarnCooldown: 0
  };
  if (!players) players = {};
  // Khởi tạo camX=0 ngay từ đây (thay vì chờ tới lần đầu updateClientLocal() chạy
  // xong), để tránh camX ở trạng thái undefined -> NaN trong khoảnh khắc ngắn giữa
  // lúc levelInit tới và lúc state đầu tiên (có players) tới - camX=NaN sẽ khiến
  // ctx.translate() bị trình duyệt coi là lệnh không hợp lệ và bỏ qua hoàn toàn,
  // làm hỏng luôn việc vẽ background (vòng lặp tính theo camX cũng ra NaN).
  if (typeof camX !== 'number' || Number.isNaN(camX)) camX = 0;
  updateHudTotals();
  showLevelBannerLocal('LEVEL ' + currentLevel + '!');
}

// Host gửi state mỗi frame (đã throttle) -> Client cập nhật thế giới để vẽ,
// đồng thời tự phát hiện thay đổi (máu giảm, xu vừa ăn...) để phát âm thanh/hiệu ứng
// cho đồng bộ cảm giác, dù bản thân Client không tính toán va chạm.
function applyStateSnapshot(data) {
  if (!level) return;
  score = data.score; coinsCollected = data.coinsCollected;
  currentLevel = data.currentLevel;

  for (let i = 0; i < level.coins.length && i < data.coinsTaken.length; i++) {
    const wasTaken = level.coins[i].taken;
    const nowTaken = !!data.coinsTaken[i];
    if (!wasTaken && nowTaken) { SFX.coin(); pulseCoinBox(); }
    level.coins[i].taken = nowTaken;
  }

  document.getElementById('coins').textContent = coinsCollected;
  document.getElementById('levelNum').textContent = currentLevel;

  if (!level.enemies || level.enemies.length !== data.enemies.length) {
    level.enemies = data.enemies.map(e => Object.assign({}, e));
  } else {
    for (let i = 0; i < data.enemies.length; i++) {
      const old = level.enemies[i], ne = data.enemies[i];
      if (old.alive && old.hp > ne.hp) spawnDamageEffect(ne.x + ne.w / 2, ne.y - 10, old.hp - ne.hp, '#ffb340');
      level.enemies[i] = Object.assign({}, ne);
    }
  }

  if (data.boss) {
    const oldBoss = level.boss;
    if (oldBoss && oldBoss.alive && oldBoss.hp > data.boss.hp) {
      spawnDamageEffect(data.boss.x + data.boss.w / 2, data.boss.y - 10, oldBoss.hp - data.boss.hp, '#ffb340');
    }
    level.boss = Object.assign({}, oldBoss, data.boss);
  } else {
    level.boss = null;
  }

  level.projectiles = data.projectiles || [];
  level.flyingEnemies = data.flyingEnemies || [];

  if (!players) players = {};
  for (const id in data.players) {
    const np = data.players[id];
    let p = players[id];
    if (!p) {
      p = makePlayer(id, np.name, np.charId, level.groundY, np.isBot);
      players[id] = p;
    }
    if (p.hp > np.hp) SFX.hurt();
    p.x = np.x; p.y = np.y; p.facing = np.facing;
    p.animState = np.animState; p.animFrame = np.animFrame;
    p.hp = np.hp; p.maxHp = np.maxHp; p.charId = np.charId; p.name = np.name;
    p.invincible = np.invincible; p.damageFlashTimer = np.damageFlashTimer;
    p.lives = np.lives; p.eliminated = np.eliminated; p.isBot = np.isBot;
  }
  for (const id in players) {
    if (!data.players[id]) delete players[id];
  }

  updateHudTotals();
}

const SHOOT_DURATION = 16;   // số frame giữ pose sút
const SHOOT_COOLDOWN = 22;
const XOAC_DURATION = 26;    // số frame giữ pose xoạc
const XOAC_COOLDOWN = 34;
const XOAC_SPEED_MULT = 1.6; // xoạc lao nhanh hơn chạy thường
