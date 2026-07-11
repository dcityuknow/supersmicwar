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
// Mỗi nhân vật là 1 BLOCK RIÊNG BIỆT bên dưới, khai báo ĐẦY ĐỦ cả 4 thông số
// (không gộp chung / không ẩn giá trị mặc định), để sau này muốn chỉnh hoặc thêm
// nhân vật mới chỉ cần sửa đúng block của nhân vật đó, không phải dò lại toàn bộ file:
//   hpMult     : nhân máu tối đa (PLAYER_MAX_HP)      — 1 = giữ nguyên gốc
//   sizeMult   : nhân kích thước (cả hitbox lẫn hình vẽ, vì hình vẽ luôn tỉ lệ theo hitbox) — 1 = giữ nguyên gốc
//   speedMult  : nhân tốc độ di chuyển                — 1 = giữ nguyên gốc
//   damageMult : nhân sát thương gây ra khi sút (Z) / xoạc (X) — 1 = giữ nguyên gốc
const CHARACTERS = [

  // ----- Spider: nhanh nhẹn, đánh mạnh -----
  {
    id: 'spider',
    name: 'Spider',
    hpMult: 1,
    sizeMult: 1,
    speedMult: 2,   // tốc độ di chuyển x2
    damageMult: 2,  // sát thương x2
  },

  // ----- Noxx: chỉ số gốc, không chỉnh gì -----
  {
    id: 'noxx',
    name: 'Noxx',
    hpMult: 1,
    sizeMult: 1,
    speedMult: 1,
    damageMult: 1,
  },

  // ----- Keng: chỉ số gốc, không chỉnh gì -----
  {
    id: 'keng',
    name: 'Keng',
    hpMult: 1,
    sizeMult: 1.5,
    speedMult: 1,
    damageMult: 1,
  },

  // ----- Xealist: chỉ số gốc, không chỉnh gì -----
  {
    id: 'xealist',
    name: 'Xealist',
    hpMult: 1,
    sizeMult: 1,
    speedMult: 1,
    damageMult: 1,
  },

  // ----- Rocky: tanker - máu trâu x2, kích thước giữ nguyên -----
  {
    id: 'rocky',
    name: 'Rocky',
    hpMult: 2,      // máu tối đa x2
    sizeMult: 1,
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