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
const CHARACTERS = [
  { id: 'spider',   name: 'Spider'   },
  { id: 'noxx',     name: 'Noxx'     },
  { id: 'keng',     name: 'Keng'     },
  { id: 'xealist',  name: 'Xealist'  },
  { id: 'rocky',    name: 'Rocky'    },
];

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
    if (typeof refreshLobbyUI === 'function') refreshLobbyUI(NET.getRoster());
  });
  charGrid.appendChild(card);
});

// Nút "Bắt Đầu" được xử lý trong lobby.js (vì hành vi khác nhau tuỳ Solo/Host/Client)

