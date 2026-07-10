// ============================================================
// lobby.js — Màn hình chọn chế độ chơi (Solo / Tạo phòng / Vào phòng),
// hiển thị mã phòng, danh sách người trong phòng, và nút Bắt Đầu.
// Nối các nút bấm với net.js (kết nối) và game-state.js (bắt đầu ván chơi).
// ============================================================

const modeScreen = document.getElementById('modeScreen');
const selectScreen = document.getElementById('selectScreen');
const lobbyBar = document.getElementById('lobbyBar');
const roomCodeBox = document.getElementById('roomCodeBox');
const roomCodeText = document.getElementById('roomCodeText');
const lobbyStatus = document.getElementById('lobbyStatus');
const lobbyPlayerList = document.getElementById('lobbyPlayerList');
const joinRow = document.getElementById('joinRow');
const joinCodeInput = document.getElementById('joinCodeInput');
const joinConfirmBtn = document.getElementById('joinConfirmBtn');
const joinError = document.getElementById('joinError');
const waitingText = document.getElementById('waitingText');
const usernameInput = document.getElementById('usernameInput');
const botCountRow = document.getElementById('botCountRow');

const myDisplayName = 'Player ' + Math.floor(Math.random() * 900 + 100);

// Lấy tên người chơi đã nhập ở ô tên; nếu bỏ trống thì dùng tên ngẫu nhiên mặc định
function getUsername() {
  const val = (usernameInput ? usernameInput.value : '').trim();
  return val ? val.slice(0, 20) : myDisplayName;
}

function goToCharSelect() {
  modeScreen.style.display = 'none';
  selectScreen.style.display = 'flex';
}

function refreshLobbyUI(rosterList) {
  if (!lobbyPlayerList) return;
  lobbyPlayerList.innerHTML = rosterList.map(r => {
    const charName = r.charId ? ((getCharById(r.charId) || {}).name || '?') : '(not selected)';
    const youTag = r.id === NET.myId ? ' (you)' : '';
    const icon = r.isBot ? '🤖 ' : (r.isHost ? '👑 ' : '• ');
    return `<div class="lobbyRow">${icon}${r.name || 'Player'}${youTag} — ${charName}</div>`;
  }).join('');
}

// ---------- Chọn chế độ ----------
document.getElementById('modeSoloBtn').addEventListener('click', () => {
  SFX.unlock();
  NET.initSolo(getUsername());
  lobbyBar.classList.add('hidden');
  joinRow.classList.add('hidden');
  botCountRow.classList.add('hidden');
  startBtn.textContent = 'Start';
  waitingText.classList.add('hidden');
  goToCharSelect();
});

// ---------- Team with Bots ----------
document.getElementById('modeBotBtn').addEventListener('click', () => {
  SFX.unlock();
  joinRow.classList.add('hidden');
  botCountRow.classList.remove('hidden');
});

document.querySelectorAll('.botCountBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    const n = parseInt(btn.dataset.n, 10);
    NET.initBotTeam(getUsername(), n);
    botCountRow.classList.add('hidden');
    joinRow.classList.add('hidden');
    roomCodeBox.classList.add('hidden');
    waitingText.classList.add('hidden');
    lobbyBar.classList.remove('hidden');
    lobbyStatus.textContent = 'Your team (Bots will automatically pick different characters):';
    startBtn.textContent = 'Start';
    refreshLobbyUI(NET.getRoster());
    goToCharSelect();
  });
});

document.getElementById('modeHostBtn').addEventListener('click', () => {
  SFX.unlock();
  NET.onLobbyUpdate = refreshLobbyUI;
  NET.onConnError = msg => { lobbyStatus.textContent = 'Error: ' + msg; };
  lobbyStatus.textContent = 'Creating room...';
  NET.initHost(getUsername(), (err, id) => {
    if (err) { lobbyStatus.textContent = "Couldn't create the room — check your network connection and try again."; return; }
    roomCodeBox.classList.remove('hidden');
    roomCodeText.textContent = id;
    lobbyStatus.textContent = 'Share this room code with friends so they can join (up to 5 players).';
  });
  lobbyBar.classList.remove('hidden');
  joinRow.classList.add('hidden');
  botCountRow.classList.add('hidden');
  startBtn.textContent = 'Start (for the whole room)';
  waitingText.classList.add('hidden');
  goToCharSelect();
});

document.getElementById('modeClientBtn').addEventListener('click', () => {
  SFX.unlock();
  botCountRow.classList.add('hidden');
  joinRow.classList.remove('hidden');
  joinCodeInput.focus();
});

joinConfirmBtn.addEventListener('click', () => {
  const code = (joinCodeInput.value || '').trim().toUpperCase();
  if (!code) { joinError.textContent = 'Enter a room code first.'; return; }
  joinError.textContent = 'Connecting...';
  joinConfirmBtn.disabled = true;

  NET.onLobbyUpdate = refreshLobbyUI;
  NET.onStartReceived = () => {
    document.getElementById('selectScreen').style.display = 'none';
    document.getElementById('ui').classList.remove('hidden');
    document.getElementById('info').classList.remove('hidden');
    startGame();
  };
  NET.onConnError = msg => { joinError.textContent = msg; joinConfirmBtn.disabled = false; };

  NET.initClient(code, getUsername(), (err) => {
    joinConfirmBtn.disabled = false;
    if (err) {
      // Lý do cụ thể đã được NET.onConnError hiển thị ở trên rồi (peer-unavailable,
      // hết giờ chờ, lỗi mạng...). Chỉ đặt thông báo chung khi vì lý do nào đó
      // onConnError chưa kịp set (tránh mất thông tin chẩn đoán chi tiết).
      if (!joinError.textContent || joinError.textContent === 'Connecting...') {
        joinError.textContent = "Couldn't join the room — double-check the room code.";
      }
      return;
    }
    // QUAN TRỌNG: gán myId ngay khi kết nối thành công. Nếu thiếu bước này,
    // camera (camX) và các chỗ so sánh "đây có phải người chơi của mình không"
    // (id === myId) sẽ không hoạt động, vì myId vẫn giữ giá trị undefined
    // (chỉ Host/Solo mới đi qua resetState() để tự gán myId).
    myId = NET.myId;
    joinError.textContent = '';
    lobbyBar.classList.remove('hidden');
    roomCodeBox.classList.add('hidden');
    lobbyStatus.textContent = 'Joined room ' + code + '.';
    waitingText.classList.remove('hidden');
    startBtn.style.display = 'none';
    goToCharSelect();
  });
});

// Cho phép bấm Enter để kết nối nhanh
joinCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinConfirmBtn.click(); });

// ---------- Nút "Bắt Đầu" ----------
startBtn.addEventListener('click', () => {
  if (!selectedChar) return;
  if (NET.mode === 'client') return; // client không tự bắt đầu được, chỉ Host mới bấm được nút này
  document.getElementById('selectScreen').style.display = 'none';
  document.getElementById('ui').classList.remove('hidden');
  document.getElementById('info').classList.remove('hidden');
  if (NET.mode === 'host') NET.startGameSignal();
  startGame();
});
