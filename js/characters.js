// ============================================================
// characters.js — Danh sách nhân vật, tải ảnh nhân vật, dựng màn hình
// chọn nhân vật (character select screen)
// ============================================================

// ---------- Characters ----------
// Mỗi nhân vật nằm trong 1 thư mục con RIÊNG, cùng tên với id, ví dụ:
//   rocky/rocky.png        -> đứng yên (idle)
//   rocky/rocky1.png       -> chạy frame 1
//   rocky/rocky2.png       -> chạy frame 2
//   rocky/rocky3.png       -> chạy frame 3
//   rocky/rocky4.png       -> chạy frame 4
//   rocky/rocky-shoot.png  -> sút
//   rocky/rocky-xoac.png   -> xoạc
// Tương tự cho spider/, noxx/, keng/, xealist/ ...
//
// ----- Chỉ số riêng (multiplier) của từng nhân vật -----
// Mỗi nhân vật là 1 BLOCK RIÊNG BIỆT bên dưới, khai báo ĐẦY ĐỦ các thông số
// (không gộp chung / không ẩn giá trị mặc định), để sau này muốn chỉnh hoặc thêm
// nhân vật mới chỉ cần sửa đúng block của nhân vật đó, không phải dò lại toàn bộ file:
//   hpMult          : nhân máu tối đa (PLAYER_MAX_HP)                       — 1 = giữ nguyên gốc
//   sizeMult        : nhân kích thước THẬT (cả hitbox lẫn hình vẽ đều to/nhỏ theo,
//                      vì hình luôn vẽ tỉ lệ đúng theo hitbox — không có "to ảo")  — 1 = giữ nguyên gốc
//   hitboxWidthTrim : số px bóp BỚT riêng chiều rộng hitbox (không đụng chiều cao,
//                      không đụng hình vẽ) sau khi đã nhân sizeMult. Dùng cho trường hợp
//                      nhân vật cầm vũ khí dài (vd giáo) khiến hitbox quá rộng, "bắc cầu"
//                      qua hố khiến không rơi xuống được — bóp bớt vài px cho khớp lại
//                      với cơ thể thật.                                              — 0 = không bóp
//   hitboxHeightTrim: số px bóp BỚT riêng chiều cao hitbox (không đụng chiều rộng,
//                      không đụng hình vẽ) sau khi đã nhân sizeMult. Dùng cho nhân vật
//                      to hơn 1 (sizeMult > 1): hình vẽ vẫn to như bình thường, nhưng
//                      hitbox va chạm được bóp thấp lại để lọt qua các khe/hầm hẹp mà
//                      nhân vật cỡ gốc vẫn đi qua được (nếu không bóp, nhân vật to hơn
//                      sẽ có hitbox cao hơn hẳn -> bị "mắc kẹt" ở những chỗ hẹp).  — 0 = không bóp
//   speedMult       : nhân tốc độ di chuyển                                 — 1 = giữ nguyên gốc
//   damageMult      : nhân sát thương gây ra khi sút (Z) / xoạc (X)         — 1 = giữ nguyên gốc
const CHARACTERS = [

  // ----- Spider: nhanh nhẹn, đánh mạnh -----
  {
    id: 'spider',
    name: 'Spider',
    hpMult: 1,
    sizeMult: 1,
    hitboxWidthTrim: 0,
    hitboxHeightTrim: 0,
    speedMult: 2,   // tốc độ di chuyển x2
    damageMult: 2,  // sát thương x2
  },

  // ----- Noxx: chỉ số gốc, không chỉnh gì -----
  {
    id: 'noxx',
    name: 'Noxx',
    hpMult: 1,
    sizeMult: 1,
    hitboxWidthTrim: 0,
    hitboxHeightTrim: 0,
    speedMult: 1,
    damageMult: 1,
  },

  // ----- Keng: hình vẽ vẫn to 1.5 lần như cũ, NHƯNG hitbox va chạm được bóp về sát
  // đúng kích thước gốc (160x200) ở CẢ 2 CHIỀU, để Keng lọt qua mọi khe/hầm hẹp mà
  // các nhân vật cỡ gốc đi qua được (trước đây chỉ bóp bề rộng vì cầm giáo dài, còn
  // chiều cao không hề bóp -> hitbox cao hơn hẳn nhân vật khác 100px, bị mắc kẹt ở
  // những đoạn hẹp). Chỉnh 2 số Trim này nếu vẫn chưa lọt được (tăng Trim = hitbox
  // nhỏ lại thêm; không được vượt quá sizeMult*baseSize vì hitbox tối thiểu là 1px). -----
  {
    id: 'keng',
    name: 'Keng',
    hpMult: 1,
    sizeMult: 1.5,
    hitboxWidthTrim: 80,   // 160*1.5 - 80 = 160  -> đúng bằng bề rộng hitbox gốc
    hitboxHeightTrim: 100, // 200*1.5 - 100 = 200 -> đúng bằng chiều cao hitbox gốc
    speedMult: 1,
    damageMult: 1,
  },

  // ----- Xealist: chỉ số gốc, không chỉnh gì -----
  {
    id: 'xealist',
    name: 'Xealist',
    hpMult: 1,
    sizeMult: 1,
    hitboxWidthTrim: 0,
    hitboxHeightTrim: 0,
    speedMult: 1,
    damageMult: 1,
  },

  // ----- Rocky: tanker - máu trâu x2, kích thước giữ nguyên -----
  {
    id: 'rocky',
    name: 'Rocky',
    hpMult: 2,      // máu tối đa x2
    sizeMult: 1,
    hitboxWidthTrim: 0,
    hitboxHeightTrim: 0,
    speedMult: 1,
    damageMult: 1,
  },

];

// Lấy chỉ số (hệ số riêng) theo charId, dùng giá trị mặc định 1 nếu nhân vật không
// khai báo hệ số đó (tức không đổi so với chỉ số gốc).
function getCharStatMult(charId, key) {
  const c = getCharById(charId);
  return (c && typeof c[key] === 'number') ? c[key] : 1;
}

const flagImg = new Image();
flagImg.src = 'flag.png';

const spikeImg = new Image();
spikeImg.src = 'gainhon.png';

// Ảnh địa hình (nền đất/platform) - đặt file khoida.png cùng thư mục với index.html
const terrainImg = new Image();
terrainImg.src = 'khoida.png';

// Ảnh nền (background.png) - đặt cùng thư mục với index.html.
// Ảnh sẽ được nối dài theo chiều ngang bằng cách lặp lại + lật (flip) xen kẽ.
const backgroundImg = new Image();
backgroundImg.src = 'background.png';

// Ảnh đồng xu (thebai.png) - đặt file này cùng thư mục với index.html
const coinImg = new Image();
coinImg.src = 'thebai.png';

let selectedChar = null;

// Tìm nhân vật theo id — dùng khi vẽ NGƯỜI CHƠI KHÁC (không phải mình), vì mỗi
// người trong phòng có thể chọn nhân vật khác nhau.
function getCharById(id) {
  return CHARACTERS.find(c => c.id === id) || null;
}

function loadImg(src) {
  const img = new Image();
  img.src = src;
  return img;
}

// Tải toàn bộ bộ ảnh (idle, run x4, shoot, xoạc) cho từng nhân vật
CHARACTERS.forEach(c => {
  const folder = c.id + '/';
  c.idleSrc = folder + c.id + '.png';
  c.img = loadImg(c.idleSrc); // ảnh đại diện ở màn chọn nhân vật + trạng thái đứng yên

  c.runImgs = [1, 2, 3, 4].map(n => loadImg(folder + c.id + n + '.png'));
  c.shootImg = loadImg(folder + c.id + '-shoot.png');
  c.xoacImg = loadImg(folder + c.id + '-xoac.png');
});

// Ảnh thanh lao riêng của Keng (keng/weapons.png) - dùng khi Keng bấm Z để ném lao bay ra
// thay cho đòn đá tay không thông thường của các nhân vật khác (xem spawnSpear trong
// update.js và phần vẽ lao trong draw.js).
const kengCharForWeapon = getCharById('keng');
if (kengCharForWeapon) kengCharForWeapon.weaponImg = loadImg('keng/weapons.png');

// Build select screen
const charGrid = document.getElementById('charGrid');
const startBtn = document.getElementById('startBtn');

CHARACTERS.forEach(c => {
  const card = document.createElement('div');
  card.className = 'charCard';
  card.dataset.id = c.id;
  card.innerHTML = `<img src="${c.idleSrc}" alt="${c.name}"><div class="name">${c.name}</div>`;
  card.addEventListener('click', () => {
    document.querySelectorAll('.charCard').forEach(el => el.classList.remove('selected'));
    card.classList.add('selected');
    selectedChar = c;
    startBtn.classList.add('ready');
    // Báo cho Host (hoặc chính mình nếu đang là Host/Solo) biết mình vừa chọn nhân vật gì,
    // để mọi người trong phòng thấy đúng lựa chọn của nhau.
    NET.sendMyChar(c.id);
    // Chế độ Team với Bot: mỗi khi mình đổi nhân vật, xếp lại nhân vật cho các Bot
    // để đảm bảo không có Bot nào trùng nhân vật với mình hoặc với nhau.
    if (NET.mode === 'bot') NET.assignBotCharacters(CHARACTERS);
    if (typeof refreshLobbyUI === 'function') refreshLobbyUI(NET.getRoster());
  });
  charGrid.appendChild(card);
});

// Nút "Bắt Đầu" được xử lý trong lobby.js (vì hành vi khác nhau tuỳ Solo/Host/Client)

