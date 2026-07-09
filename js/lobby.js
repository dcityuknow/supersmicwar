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

const myDisplayName = 'Người chơi ' + Math.floor(Math.random() * 900 + 100);

function goToCharSelect() {
  modeScreen.style.display = 'none';
  selectScreen.style.display = 'flex';
}

function refreshLobbyUI(rosterList) {
  if (!lobbyPlayerList) return;
  lobbyPlayerList.innerHTML = rosterList.map(r => {
    const charName = r.charId ? ((getCharById(r.charId) || {}).name || '?') : '(chưa chọn)';
    const youTag = r.id === NET.myId ? ' (bạn)' : '';
    return `<div class="lobbyRow">${r.isHost ? '👑 ' : '• '}${r.name || 'Người chơi'}${youTag} — ${charName}</div>`;
  }).join('');
}

// ---------- Chọn chế độ ----------
document.getElementById('modeSoloBtn').addEventListener('click', () => {
  SFX.unlock();
  NET.initSolo();
  lobbyBar.classList.add('hidden');
  joinRow.classList.add('hidden');
  startBtn.textContent = 'Bắt Đầu';
  waitingText.classList.add('hidden');
  goToCharSelect();
});

document.getElementById('modeHostBtn').addEventListener('click', () => {
  SFX.unlock();
  NET.onLobbyUpdate = refreshLobbyUI;
  NET.onConnError = msg => { lobbyStatus.textContent = 'Lỗi: ' + msg; };
  lobbyStatus.textContent = 'Đang tạo phòng...';
  NET.initHost(myDisplayName, (err, id) => {
    if (err) { lobbyStatus.textContent = 'Không tạo được phòng — kiểm tra kết nối mạng rồi thử lại.'; return; }
    roomCodeBox.classList.remove('hidden');
    roomCodeText.textContent = id;
    lobbyStatus.textContent = 'Gửi mã phòng này cho bạn bè để họ vào chung (tối đa 5 người).';
  });
  lobbyBar.classList.remove('hidden');
  joinRow.classList.add('hidden');
  startBtn.textContent = 'Bắt Đầu (cho cả phòng)';
  waitingText.classList.add('hidden');
  goToCharSelect();
});

document.getElementById('modeClientBtn').addEventListener('click', () => {
  SFX.unlock();
  joinRow.classList.remove('hidden');
  joinCodeInput.focus();
});

joinConfirmBtn.addEventListener('click', () => {
  const code = (joinCodeInput.value || '').trim().toUpperCase();
  if (!code) { joinError.textContent = 'Nhập mã phòng trước đã.'; return; }
  joinError.textContent = 'Đang kết nối...';
  joinConfirmBtn.disabled = true;

  NET.onLobbyUpdate = refreshLobbyUI;
  NET.onStartReceived = () => {
    document.getElementById('selectScreen').style.display = 'none';
    document.getElementById('ui').classList.remove('hidden');
    document.getElementById('info').classList.remove('hidden');
    startGame();
  };
  NET.onConnError = msg => { joinError.textContent = msg; joinConfirmBtn.disabled = false; };

  NET.initClient(code, myDisplayName, (err) => {
    joinConfirmBtn.disabled = false;
    if (err) { joinError.textContent = 'Không vào được phòng — kiểm tra lại mã phòng.'; return; }
    joinError.textContent = '';
    lobbyBar.classList.remove('hidden');
    roomCodeBox.classList.add('hidden');
    lobbyStatus.textContent = 'Đã vào phòng ' + code + '.';
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
