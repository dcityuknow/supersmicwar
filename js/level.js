// ============================================================
// level.js — Sinh dữ liệu màn chơi: địa hình, gai, quái vật, xu,
// cờ đích, và cấu hình độ khó tăng dần theo từng màn
// ============================================================

// ---------- Level data ----------
const BASE_GROUND_OFFSET = 216; // khoảng cách từ đáy màn hình tới mặt đất
const CHAR_DRAW_SCALE = 2;   // vẽ nhân vật to hơn hitbox bao nhiêu lần (hitbox giữ nguyên để va chạm/rơi hố vẫn chuẩn)
const CHAR_VISUAL_Y_OFFSET = 10; // chỉnh nhân vật "thụt" xuống thêm chút cho chạm đất (tăng nếu còn hở, giảm nếu bị lún đất)

// Vị trí thanh máu/tên/chat bubble phía trên đầu: tính bằng % chiều cao khung hình ĐÃ
// PHÓNG TO (drawH) tính từ ĐỈNH khung hình đó xuống, KHÔNG dùng số px cố định — vì khung
// hình phóng to theo cả CHAR_DRAW_SCALE lẫn sizeMult riêng từng nhân vật, dùng % thì luôn
// tự co giãn đúng theo, không cần chỉnh lại mỗi khi đổi sizeMult.
// 0 = ngay sát đỉnh khung hình (thường cao hơn đầu thật 1 chút vì ảnh PNG có thể có viền
// trong suốt phía trên tóc). Tăng số này nếu tên/thanh máu vẫn còn CAO hơn đầu (lơ lửng),
// giảm nếu vẫn còn THẤP hơn đầu (đè vào mặt/ngực) như trong ảnh chụp màn hình gốc.
const CHAR_HEAD_MARGIN_FRAC = 0.05;

// Override RIÊNG cho từng nhân vật, đè lên CHAR_HEAD_MARGIN_FRAC ở trên. Cần vì ảnh của
// mỗi nhân vật có tỉ lệ "khoảng trống phía trên đầu" khác nhau (khác người vẽ, khác
// sizeMult...) nên 1 con số % dùng chung cho tất cả không khớp hết. Nhân vật nào chưa
// khai báo ở đây thì tự dùng CHAR_HEAD_MARGIN_FRAC mặc định.
// Keng to hơn hẳn (sizeMult 1.5) nên ảnh phóng to cao hơn nhiều -> cần % lớn hơn hẳn mặc
// định để tên/thanh máu không bị trôi lên quá cao phía trên đầu như trước. Đây là số ước
// lượng ban đầu — chỉnh tăng nếu vẫn còn cao hơn đầu, giảm nếu bị thấp xuống dưới đầu.
const CHAR_HEAD_MARGIN_BY_ID = {
  keng: 0.3,
};
function getCharHeadMarginFrac(charId) {
  return (charId && CHAR_HEAD_MARGIN_BY_ID[charId] !== undefined) ? CHAR_HEAD_MARGIN_BY_ID[charId] : CHAR_HEAD_MARGIN_FRAC;
}

// Offset riêng CHO TỪNG NHÂN VẬT, cộng thêm vào CHAR_VISUAL_Y_OFFSET ở trên.
// Vì ảnh của mỗi nhân vật có thể có khoảng trong suốt phía dưới chân khác nhau
// (do người vẽ khác nhau), nên cần chỉnh riêng để chân luôn chạm đất chính xác.
// Số dương = đẩy nhân vật xuống thêm (dùng khi đang bị "lơ lửng" phía trên mặt đất).
// Số âm = kéo nhân vật lên (dùng khi bị lún xuống dưới mặt đất).
// Chỉnh từng số cho tới khi chân của mỗi nhân vật chạm đất vừa đẹp.
const CHAR_Y_OFFSET_BY_ID = {
  spider:  40,   // spider đang lơ lửng -> đẩy xuống thêm. Tăng số này nếu vẫn còn hở, giảm nếu bị lún đất.
  noxx:    0,
  keng:    18,   // keng đang lơ lửng nhẹ -> đẩy xuống thêm. Tăng số này nếu vẫn còn hở, giảm nếu bị lún đất.
  xealist: 0,
  rocky:   20,
};
const levelWidth = 18936;

// Sinh thêm xu tự động dọc theo từng bệ (platform) để tăng tổng số lượng xu trong màn chơi.
// Xu được rải đều theo khoảng cách SPACING, chừa lề 2 đầu bệ, và tự bỏ qua nếu quá gần
// một xu đã đặt sẵn (tránh chồng lấp với các xu đặt thủ công phía trên).
function generateExtraCoins(platforms, manualCoins) {
  const extra = [];
  const SPACING = 108;       // khoảng cách giữa 2 xu liên tiếp trên cùng 1 bệ
  const MARGIN = 90;         // chừa lề 2 đầu bệ, tránh xu nằm sát mép/rơi
  const HEIGHT_ABOVE = 190;  // xu nổi cao hơn mặt bệ bao nhiêu để không lẫn vào gai
  for (const p of platforms) {
    const y = p.y - HEIGHT_ABOVE;
    const startX = p.x + MARGIN;
    const endX = p.x + p.w - MARGIN;
    if (endX <= startX) continue;
    for (let x = startX; x <= endX; x += SPACING) {
      const tooClose =
        manualCoins.some(c => Math.abs(c.x - x) < 90 && Math.abs(c.y - y) < 220) ||
        extra.some(c => Math.abs(c.x - x) < 90 && Math.abs(c.y - y) < 220);
      if (!tooClose) extra.push({ x, y, taken: false });
    }
  }
  return extra;
}

// Nhân số lượng gai lên theo multiplier (màn 2 = x2, màn 3 = x3).
// Mỗi bản sao thêm được đặt lệch nhẹ sang 2 bên vị trí gốc để không chồng khít lên nhau.
function scaleSpikesForLevel(baseSpikes, multiplier) {
  if (multiplier <= 1) return baseSpikes.map(s => ({ ...s }));
  const result = [];
  const OFFSETS = [0, 150, -150, 300, -300];
  for (const s of baseSpikes) {
    for (let i = 0; i < multiplier; i++) {
      const offset = OFFSETS[i] || (i * 150);
      result.push({ x: s.x + offset, y: s.y, w: s.w, h: s.h });
    }
  }
  return result;
}

// Nhân số lượng quái vật lên theo multiplier (màn 2 = x2, màn 3 = x3).
// Mỗi bản sao thêm được đặt rải đều trong đúng phạm vi tuần tra (minX-maxX) của quái gốc,
// và được cấp tốc độ bắn / lượng đạn theo độ khó của màn hiện tại.
function scaleEnemiesForLevel(baseEnemies, multiplier, difficulty) {
  const result = [];
  baseEnemies.forEach(e => {
    const rangeW = Math.max(0, e.maxX - e.minX - e.w);
    for (let i = 0; i < multiplier; i++) {
      const frac = multiplier === 1 ? 0 : i / multiplier;
      const x = e.minX + rangeW * frac;
      const shootCooldown = difficulty.shootCooldownMin + Math.random() * (difficulty.shootCooldownMax - difficulty.shootCooldownMin);
      result.push({
        x, y: e.y, w: e.w, h: e.h,
        dir: i % 2 === 0 ? 1 : -1,
        minX: e.minX, maxX: e.maxX,
        alive: true, vy: 0,
        hp: ENEMY_MAX_HP, maxHp: ENEMY_MAX_HP,
        hitCooldown: 0, flashTimer: 0,
        shootCooldown,
        animSeed: Math.random() * 100,
        // Quyết định một lần duy nhất khi sinh ra: con quái này có "đáng" để Bot dừng lại
        // đánh hay không (~70% có, 30% không). Cố định ngay từ đầu (không đổi theo frame)
        // để Bot không nhấp nháy đổi ý - những con "không đáng" sẽ bị cả team lờ đi luôn,
        // chỉ tránh né/nhảy qua chứ không dừng lại đánh, giữ đúng trọng tâm là tiến về
        // phía Rồng canh giữ.
        engageWorth: Math.random() < 0.7
      });
    }
  });
  return result;
}

function createLevel(groundY, levelNum) {
  const platforms = [
      {x:0, y:groundY, w:2520, h:360},
      {x:2736, y:groundY, w:1080, h:360},
      {x:3240, y:groundY-360, w:432, h:72},
      {x:4032, y:groundY, w:1440, h:360},
      {x:4500, y:groundY-396, w:432, h:72},
      {x:5760, y:groundY, w:720, h:360},
      {x:5832, y:groundY-468, w:360, h:72},
      {x:6840, y:groundY, w:2520, h:360},
      {x:7380, y:groundY-324, w:432, h:72},
      // ----- Phần bản đồ mở rộng thêm -----
      {x:9648, y:groundY, w:1800, h:360},
      {x:10152, y:groundY-360, w:432, h:72},
      {x:11664, y:groundY, w:1080, h:360},
      {x:12096, y:groundY-432, w:360, h:72},
      {x:13032, y:groundY, w:2160, h:360},
      {x:13500, y:groundY-360, w:432, h:72},
      {x:14400, y:groundY-540, w:360, h:72},
      {x:15408, y:groundY, w:1440, h:360},
      {x:15840, y:groundY-396, w:432, h:72},
      {x:17136, y:groundY, w:1800, h:360},
      {x:17568, y:groundY-360, w:432, h:72},
  ];

  // Xu đặt thủ công tại các vị trí "đắt giá" (bệ cao, khó lấy) - giữ nguyên như bản gốc
  const manualCoins = [
      {x:1440, y:groundY-180, taken:false},
      {x:1620, y:groundY-180, taken:false},
      {x:3348, y:groundY-504, taken:false},
      {x:3456, y:groundY-504, taken:false},
      {x:4608, y:groundY-540, taken:false},
      {x:5940, y:groundY-612, taken:false},
      {x:6048, y:groundY-612, taken:false},
      {x:7488, y:groundY-468, taken:false},
      {x:7596, y:groundY-468, taken:false},
      // ----- Phần bản đồ mở rộng thêm -----
      {x:10260, y:groundY-504, taken:false},
      {x:10368, y:groundY-504, taken:false},
      {x:12204, y:groundY-576, taken:false},
      {x:13608, y:groundY-504, taken:false},
      {x:14508, y:groundY-684, taken:false},
      {x:15948, y:groundY-540, taken:false},
      {x:17676, y:groundY-504, taken:false},
      {x:17784, y:groundY-504, taken:false},
  ];

  // Tổng số xu = xu thủ công + xu tự sinh dọc theo tất cả các bệ -> nhiều xu hơn hẳn bản gốc
  const coins = manualCoins.concat(generateExtraCoins(platforms, manualCoins));

  // Danh sách quái vật / gai gốc (như màn 1). Ở màn 2 số lượng x2, màn 3 số lượng x3.
  const baseEnemies = [
      {x:2880, y:groundY-116, w:116, h:116, minX:2736, maxX:3744},
      {x:4320, y:groundY-116, w:116, h:116, minX:4032, maxX:5400},
      {x:7020, y:groundY-116, w:116, h:116, minX:6840, maxX:9288},
      // ----- Phần bản đồ mở rộng thêm -----
      {x:9948, y:groundY-116, w:116, h:116, minX:9648, maxX:11448},
      {x:13332, y:groundY-116, w:116, h:116, minX:13032, maxX:15192},
      {x:14232, y:groundY-116, w:116, h:116, minX:13032, maxX:15192},
      {x:17436, y:groundY-116, w:116, h:116, minX:17136, maxX:18936},
  ];
  const baseSpikes = [
      {x:3060, y:groundY-86, w:144, h:86},
      {x:6048, y:groundY-86, w:144, h:86},
      {x:7920, y:groundY-86, w:216, h:86},
      // ----- Phần bản đồ mở rộng thêm -----
      {x:2820, y:groundY-86, w:144, h:86},
      {x:4680, y:groundY-86, w:144, h:86},
      {x:9800, y:groundY-86, w:144, h:86},
      {x:11800, y:groundY-86, w:180, h:86},
      {x:13700, y:groundY-86, w:216, h:86},
      {x:15600, y:groundY-86, w:144, h:86},
      {x:17700, y:groundY-86, w:144, h:86},
  ];

  const difficulty = getLevelDifficulty(levelNum || 1);
  const flag = {x: 18648, y: groundY-792, w: 172, h: 792};

  const lvl = {
    groundY: groundY,
    levelNum: levelNum || 1,
    difficulty: difficulty,
    platforms: platforms,
    coins: coins,
    enemies: scaleEnemiesForLevel(baseEnemies, difficulty.enemyMult, difficulty),
    spikes: scaleSpikesForLevel(baseSpikes, difficulty.spikeMult),
    flag: flag,
    flyingEnemies: [],
    projectiles: [],
    spears: [], // các thanh lao đang bay do Keng ném ra (xem spawnSpear/updateSpears trong update.js)
    flagWarnCooldown: 0 // chống spam banner "phải hạ boss trước" mỗi khi chạm cờ lúc rồng còn sống
  };

  // Boss rồng canh giữ, đứng chắn ngay trước cờ đích - phải hạ được nó mới qua màn
  lvl.boss = createBoss(lvl, levelNum || 1);

  return lvl;
}

// Tạo hiệu ứng quái bị đá/xoạc bay lên và văng ra xa
function spawnFlyingEnemy(e, facingDir) {
  level.flyingEnemies.push({
    x: e.x, y: e.y, w: e.w, h: e.h,
    vx: facingDir * (10 + Math.random()*6),
    vy: -(14 + Math.random()*6),
    rot: 0,
    vrot: facingDir * 0.35,
    timer: 60
  });
}