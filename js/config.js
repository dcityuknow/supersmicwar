// ============================================================
// config.js — Toàn bộ hằng số cấu hình game: vật lý, máu (HP),
// sát thương, đạn quái vật, độ khó theo từng màn chơi
// ============================================================

const GRAVITY = 2.1;
const FRICTION = 0.8;

// Bộ đếm frame toàn cục, dùng để tạo hiệu ứng rung rinh/chuyển động cho quái vật
let gameFrame = 0;

// ----- Hệ thống máu (HP) -----
const PLAYER_MAX_HP = 100;
const ENEMY_MAX_HP = 60;

const ENEMY_TOUCH_DAMAGE = 25;   // máu mất khi va chạm trực tiếp với quái
const SPIKE_DAMAGE = 12;         // máu mất mỗi lần "dính" gai
const SPIKE_TICK_INTERVAL = 25;  // số frame giữa các lần mất máu liên tục khi đứng trên gai

const KICK_DAMAGE = 25;          // máu quái mất khi bị sút (Z)
const XOAC_DAMAGE = 35;          // máu quái mất khi bị xoạc trúng (X)
const ENEMY_HIT_COOLDOWN = 20;   // số frame miễn nhiễm của quái sau khi vừa bị đánh trúng

// ----- Đạn quái vật bắn ra -----
const PROJECTILE_DAMAGE = 15;        // máu mất khi trúng đạn quái
const PROJECTILE_SPEED_MIN = 6;
const PROJECTILE_SPEED_MAX = 11;
const PROJECTILE_RADIUS = 16;
const PROJECTILE_LIFE = 150;         // số frame trước khi đạn tự biến mất
const ENEMY_SHOOT_COOLDOWN_MIN = 70; // khoảng cách tối thiểu (frame) giữa 2 lần bắn của 1 quái
const ENEMY_SHOOT_COOLDOWN_MAX = 140;

// ----- Hệ thống nhiều màn chơi (Level 1/2/3), độ khó tăng dần -----
const TOTAL_LEVELS = 3;
// Cấu hình độ khó theo từng màn:
//  - spikeMult / enemyMult: nhân số lượng gai / quái so với màn 1 (bản gốc)
//  - shootCooldownMin/Max: quái bắn đạn nhanh hơn khi số này nhỏ hơn
//  - bulletsPerShot: số viên đạn bắn ra cùng lúc mỗi lần quái bắn
function getLevelDifficulty(levelNum) {
  switch (levelNum) {
    case 1:
      return { spikeMult: 1, enemyMult: 1, shootCooldownMin: ENEMY_SHOOT_COOLDOWN_MIN, shootCooldownMax: ENEMY_SHOOT_COOLDOWN_MAX, bulletsPerShot: 1 };
    case 2:
      return { spikeMult: 2, enemyMult: 2, shootCooldownMin: ENEMY_SHOOT_COOLDOWN_MIN, shootCooldownMax: ENEMY_SHOOT_COOLDOWN_MAX, bulletsPerShot: 1 };
    case 3:
    default:
      return { spikeMult: 3, enemyMult: 3, shootCooldownMin: Math.round(ENEMY_SHOOT_COOLDOWN_MIN * 0.5), shootCooldownMax: Math.round(ENEMY_SHOOT_COOLDOWN_MAX * 0.5), bulletsPerShot: 3 };
  }
}

// ----- Boss Rồng canh giữ cuối mỗi màn -----
const BOSS_BASE_HP = 500;               // máu gốc của rồng ở màn 1, các màn sau nhân theo hpMult
const BOSS_CONTACT_DAMAGE = 30;         // máu người chơi mất khi chạm thẳng vào thân rồng
const BOSS_FIRE_DAMAGE = 18;            // máu mất mỗi nhịp khi đứng trong luồng lửa
const BOSS_FIRE_TICK_INTERVAL = 14;     // số frame giữa các lần gây sát thương liên tục của luồng lửa
const BOSS_PROJECTILE_DAMAGE = 20;      // máu mất khi trúng đạn từ đòn vỗ cánh
const BOSS_PROJECTILE_RADIUS = 20;
const BOSS_PROJECTILE_SPEED = 12;
const BOSS_PROJECTILE_LIFE = 170;
const BOSS_HIT_COOLDOWN = 16;           // số frame miễn nhiễm của rồng sau khi vừa bị đánh trúng
const BOSS_WINDUP_TIME = 28;            // thời gian "lấy đà" trước khi tung đòn (để người chơi kịp thấy mà né)
const BOSS_BARRAGE_DURATION = 40;       // tổng thời gian của 1 đợt vỗ cánh xả đạn
const BOSS_FIRE_DURATION = 75;          // tổng thời gian của 1 lần khạc lửa
const BOSS_COOLDOWN_AFTER_ATTACK = 70;  // thời gian nghỉ ngắn ngay sau khi ra đòn, trước khi tuần tra lại

// Độ khó của boss theo từng màn: màn sau rồng to hơn (sizeMult), nhiều máu hơn (hpMult),
// và tấn công dồn dập hơn (attackWait ngắn hơn = tuần tra ít hơn giữa 2 đòn, bulletsPerBarrage
// nhiều hơn = mỗi lần vỗ cánh xả nhiều đạn hơn, barrageShotGap nhỏ hơn = xả đạn nhanh hơn).
function getBossDifficulty(levelNum) {
  switch (levelNum) {
    case 1:
      return { sizeMult: 1,    hpMult: 1,   attackWaitMin: 230, attackWaitMax: 320, bulletsPerBarrage: 8,  barrageShotGap: 11 };
    case 2:
      return { sizeMult: 1.3,  hpMult: 1.8, attackWaitMin: 170, attackWaitMax: 240, bulletsPerBarrage: 13, barrageShotGap: 8  };
    case 3:
    default:
      return { sizeMult: 1.7,  hpMult: 2.6, attackWaitMin: 110, attackWaitMax: 170, bulletsPerBarrage: 19, barrageShotGap: 5  };
  }
}

