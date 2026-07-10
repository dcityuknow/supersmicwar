// ============================================================
// net.js — Kết nối nhiều người chơi qua PeerJS (WebRTC, P2P).
// Mô hình: 1 người làm HOST (chạy toàn bộ logic game, giống bản gốc),
// các CLIENT chỉ gửi input (phím đang bấm) lên Host và nhận lại toàn bộ
// trạng thái thế giới (vị trí quái/boss/đạn/người chơi...) để vẽ lại.
// Không cần server riêng: PeerJS dùng server "signaling" công cộng miễn phí
// chỉ để 2 máy bắt tay ban đầu, sau đó dữ liệu đi thẳng máy-tới-máy.
// ============================================================

const NET = (() => {
  let peer = null;
  let mode = 'solo';        // 'solo' | 'host' | 'client'
  let myPeerId = null;
  let hostConn = null;      // (chỉ client dùng) kết nối tới Host
  const clientConns = {};   // (chỉ host dùng) peerId -> DataConnection

  // Danh sách người trong phòng, dùng cho cả Host lẫn Client để hiển thị UI lobby
  // { peerId: { id, name, charId, isHost } }
  let roster = {};

  let onLobbyUpdate = null;   // callback(list) mỗi khi danh sách phòng đổi
  let onStartReceived = null; // callback() khi client nhận tín hiệu bắt đầu từ Host
  let onConnError = null;     // callback(message)

  let broadcastCounter = 0;
  const BROADCAST_EVERY = 2; // gửi state ~30 lần/giây (game chạy ~60fps)

  // Thời gian tối đa (ms) Client chờ Host phản hồi trước khi báo lỗi,
  // thay vì treo mãi ở "Đang kết nối..." khi 2 máy không thể bắt tay P2P được.
  const CONNECT_TIMEOUT_MS = 15000;

  // Cấu hình ICE server: chỉ dùng STUN mặc định KHÔNG đủ khi 2 máy ở 2 mạng
  // khác nhau có NAT/firewall chặt (mạng công ty, 4G, VPN...) — lúc đó WebRTC
  // không tìm được đường đi trực tiếp và kết nối treo lơ lửng mãi, không báo lỗi.
  // Cần thêm TURN server để "tiếp sức" trong các trường hợp đó.
  //
  // ĐÃ ĐỔI sang lấy credential TURN ĐỘNG từ Metered (gọi API mỗi lần cần kết nối,
  // credential tự hết hạn sau một thời gian) thay vì hard-code username/password
  // cố định trong code — an toàn hơn vì không lộ credential vĩnh viễn.
  const METERED_TURN_API = 'https://smicwar.metered.live/api/v1/turn/credentials?apiKey=2136e6df075ffcbe78022a69b9707669b541';

  // Danh sách STUN dự phòng, dùng khi không gọi được API Metered (mất mạng tới
  // Metered, key hết hạn...) - vẫn còn STUN nên mạng "dễ tính" vẫn kết nối được,
  // chỉ mất khả năng vượt NAT/firewall chặt.
  const FALLBACK_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Gọi API lấy bộ iceServers mới nhất từ Metered. Cache lại trong ít phút để
  // không gọi API liên tục nếu người dùng bấm Host/Join nhiều lần liên tiếp.
  let cachedIceServers = null;
  let cachedAt = 0;
  const ICE_CACHE_MS = 3 * 60 * 1000; // credential Metered thường sống vài giờ, cache 3 phút cho an toàn

  async function fetchIceServers() {
    const now = Date.now();
    if (cachedIceServers && (now - cachedAt) < ICE_CACHE_MS) return cachedIceServers;
    try {
      const res = await fetch(METERED_TURN_API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const servers = await res.json();
      if (!Array.isArray(servers) || servers.length === 0) throw new Error('empty response');
      cachedIceServers = servers;
      cachedAt = now;
      return servers;
    } catch (e) {
      console.warn('[NET] Không lấy được TURN credential từ Metered, dùng STUN dự phòng:', e);
      return FALLBACK_ICE_SERVERS;
    }
  }

  function shortRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (0/O, 1/I)
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  async function makePeer(customId) {
    const iceServers = await fetchIceServers();
    const opts = { config: { iceServers } };
    // Peer() không truyền id -> PeerJS tự cấp id ngẫu nhiên (dùng cho client)
    return customId ? new Peer(customId, opts) : new Peer(opts);
  }

  // ---------- Khởi tạo theo từng chế độ ----------
  function initSolo() {
    mode = 'solo';
    myPeerId = 'solo';
    roster = { solo: { id: 'solo', name: 'Bạn', charId: null, isHost: true } };
  }

  async function initHost(name, cb) {
    mode = 'host';
    const id = 'RM' + shortRoomCode();
    peer = await makePeer(id);
    peer.on('open', pid => {
      myPeerId = pid;
      roster = {};
      roster[pid] = { id: pid, name: name || 'Host', charId: null, isHost: true };
      cb(null, pid);
      broadcastLobby();
    });
    peer.on('connection', conn => {
      clientConns[conn.peer] = conn;
      conn.on('open', () => {
        if (!roster[conn.peer]) roster[conn.peer] = { id: conn.peer, name: 'Người chơi', charId: null, isHost: false };
        broadcastLobby();
      });
      conn.on('data', data => handleHostData(conn.peer, data));
      conn.on('close', () => {
        delete clientConns[conn.peer];
        delete roster[conn.peer];
        if (typeof players !== 'undefined' && players && players[conn.peer]) delete players[conn.peer];
        broadcastLobby();
      });
    });
    peer.on('error', err => {
      if (onConnError) onConnError((err && err.type) || String(err));
      cb(err, null);
    });
  }

  function friendlyPeerErrorMessage(err) {
    const type = err && err.type;
    if (type === 'peer-unavailable') {
      return 'Không tìm thấy phòng với mã này. Kiểm tra lại: Host còn đang mở trang (chưa tắt/reload) và mã phòng gõ đúng (không dư khoảng trắng).';
    }
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
      return 'Không kết nối được tới máy chủ ghép nối. Kiểm tra lại mạng, hoặc adblock/firewall có thể đang chặn PeerJS.';
    }
    if (type === 'browser-incompatible') {
      return 'Trình duyệt này không hỗ trợ WebRTC. Thử trình duyệt khác (Chrome, Edge, Firefox bản mới).';
    }
    return 'Không kết nối được tới phòng (' + (type || String(err)) + ').';
  }

  async function initClient(hostId, name, cb) {
    mode = 'client';
    peer = await makePeer(null);
    let settled = false; // đã có kết quả (thành công/thất bại) hay chưa, tránh gọi cb/onConnError nhiều lần
    peer.on('open', pid => {
      myPeerId = pid;
      const conn = peer.connect(hostId, { reliable: true });
      hostConn = conn;

      // Nếu sau CONNECT_TIMEOUT_MS vẫn chưa "open" được (thường do 2 máy không
      // bắt tay P2P được và không có TURN server phù hợp) -> báo lỗi rõ ràng
      // thay vì treo mãi ở "Đang kết nối..."
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (onConnError) onConnError('Không kết nối được tới phòng (quá thời gian chờ). Kiểm tra lại mã phòng, hoặc thử đổi mạng (một số mạng công ty/wifi công cộng chặn kết nối P2P).');
        cb(new Error('connect-timeout'), null);
        try { conn.close(); } catch (e) {}
      }, CONNECT_TIMEOUT_MS);

      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        conn.send({ t: 'join', name: name || 'Người chơi' });
        cb(null, pid);
      });
      conn.on('data', data => handleClientData(data));
      conn.on('close', () => { if (onConnError) onConnError('Mất kết nối tới phòng.'); });
      conn.on('error', err => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (onConnError) onConnError(friendlyPeerErrorMessage(err));
        cb(err, null);
      });
    });
    peer.on('error', err => {
      if (settled) return;
      settled = true;
      if (onConnError) onConnError(friendlyPeerErrorMessage(err));
      cb(err, null);
    });
  }

  // ---------- Phía HOST ----------
  function handleHostData(fromId, data) {
    if (!data || !data.t) return;
    if (data.t === 'join') {
      roster[fromId] = roster[fromId] || { id: fromId, isHost: false };
      roster[fromId].name = data.name || 'Người chơi';
      broadcastLobby();
      // Nếu ván chơi đã bắt đầu, cho người mới vào thẳng game giữa chừng,
      // spawn ngay tại vị trí hiện tại của Host thay vì bắt chờ ở lobby.
      if (typeof started !== 'undefined' && started && typeof players !== 'undefined' && players && typeof level !== 'undefined' && level) {
        const hostP = players[myPeerId];
        const np = makePlayer(fromId, roster[fromId].name, roster[fromId].charId || null, level.groundY);
        if (hostP) { np.x = hostP.x; np.y = hostP.y; }
        players[fromId] = np;
        const conn = clientConns[fromId];
        if (conn && conn.open) {
          conn.send({ t: 'start', roster: Object.values(roster) });
          conn.send({
            t: 'levelInit', levelNum: level.levelNum, groundY: level.groundY,
            platforms: level.platforms, spikes: level.spikes, flag: level.flag,
            coinsXY: level.coins.map(c => ({ x: c.x, y: c.y })), difficulty: level.difficulty
          });
        }
      }
    } else if (data.t === 'char') {
      if (roster[fromId]) roster[fromId].charId = data.charId;
      if (typeof players !== 'undefined' && players && players[fromId]) players[fromId].charId = data.charId;
      broadcastLobby();
    } else if (data.t === 'input') {
      const p = typeof players !== 'undefined' && players ? players[fromId] : null;
      if (p) {
        p.remoteKeys = data.keys || {};
        if (data.jump) p.remoteJumpPulse = true;
      }
    }
  }

  function broadcastLobby() {
    const list = Object.values(roster);
    if (onLobbyUpdate) onLobbyUpdate(list);
    sendToAllClients({ t: 'lobby', roster: list, hostId: myPeerId });
  }

  function sendToAllClients(msg) {
    for (const id in clientConns) {
      const c = clientConns[id];
      if (c && c.open) c.send(msg);
    }
  }

  function startGameSignal() {
    sendToAllClients({ t: 'start', roster: Object.values(roster) });
  }

  function broadcastLevelInit(lvl) {
    sendToAllClients({
      t: 'levelInit',
      levelNum: lvl.levelNum,
      groundY: lvl.groundY,
      platforms: lvl.platforms,
      spikes: lvl.spikes,
      flag: lvl.flag,
      coinsXY: lvl.coins.map(c => ({ x: c.x, y: c.y })),
      difficulty: lvl.difficulty
    });
  }

  function tickBroadcast() {
    broadcastCounter++;
    if (broadcastCounter % BROADCAST_EVERY !== 0) return;
    if (typeof level === 'undefined' || !level || typeof players === 'undefined' || !players) return;
    const msg = {
      t: 'state',
      score: score, lives: lives, coinsCollected: coinsCollected, currentLevel: currentLevel,
      players: {},
      enemies: level.enemies.map(e => ({ x: e.x, y: e.y, w: e.w, h: e.h, hp: e.hp, maxHp: e.maxHp, alive: e.alive, flashTimer: e.flashTimer, animSeed: e.animSeed })),
      coinsTaken: level.coins.map(c => c.taken),
      boss: level.boss ? {
        x: level.boss.x, y: level.boss.y, w: level.boss.w, h: level.boss.h,
        hp: level.boss.hp, maxHp: level.boss.maxHp, alive: level.boss.alive,
        facing: level.boss.facing, phase: level.boss.phase, timer: level.boss.timer,
        attackChoice: level.boss.attackChoice, flashTimer: level.boss.flashTimer,
        animSeed: level.boss.animSeed, diff: level.boss.diff
      } : null,
      projectiles: level.projectiles,
      flyingEnemies: level.flyingEnemies
    };
    for (const id in players) {
      const p = players[id];
      msg.players[id] = {
        x: p.x, y: p.y, facing: p.facing, animState: p.animState, animFrame: p.animFrame,
        hp: p.hp, maxHp: p.maxHp, charId: p.charId, name: p.name, invincible: p.invincible,
        damageFlashTimer: p.damageFlashTimer
      };
    }
    sendToAllClients(msg);
  }

  // ---------- Phía CLIENT ----------
  function handleClientData(data) {
    if (!data || !data.t) return;
    if (data.t === 'lobby') {
      roster = {};
      data.roster.forEach(r => roster[r.id] = r);
      if (onLobbyUpdate) onLobbyUpdate(Object.values(roster));
    } else if (data.t === 'start') {
      data.roster.forEach(r => roster[r.id] = r);
      if (onStartReceived) onStartReceived();
    } else if (data.t === 'levelInit') {
      if (typeof applyLevelInit === 'function') applyLevelInit(data);
    } else if (data.t === 'state') {
      if (typeof applyStateSnapshot === 'function') applyStateSnapshot(data);
    } else if (data.t === 'banner') {
      if (typeof showLevelBannerLocal === 'function') showLevelBannerLocal(data.text);
    } else if (data.t === 'gameOver') {
      if (typeof endGameClient === 'function') endGameClient(data.win);
    }
  }

  function sendInputTick(keysObj, jumpPulse) {
    if (mode !== 'client' || !hostConn || !hostConn.open) return;
    const slim = {
      ArrowLeft: !!keysObj['ArrowLeft'], ArrowRight: !!keysObj['ArrowRight'],
      KeyZ: !!keysObj['KeyZ'], KeyX: !!keysObj['KeyX']
    };
    hostConn.send({ t: 'input', keys: slim, jump: !!jumpPulse });
  }

  function sendMyChar(charId) {
    if (mode === 'client') {
      if (hostConn && hostConn.open) hostConn.send({ t: 'char', charId });
    } else if (mode === 'host') {
      if (roster[myPeerId]) roster[myPeerId].charId = charId;
      broadcastLobby();
    } else if (mode === 'solo') {
      if (roster.solo) roster.solo.charId = charId;
    }
  }

  function getRoster() {
    return Object.values(roster);
  }

  return {
    initSolo, initHost, initClient,
    startGameSignal, broadcastLevelInit, tickBroadcast, sendToAllClients,
    sendInputTick, sendMyChar, getRoster,
    get mode() { return mode; },
    get myId() { return myPeerId; },
    set onLobbyUpdate(fn) { onLobbyUpdate = fn; },
    set onStartReceived(fn) { onStartReceived = fn; },
    set onConnError(fn) { onConnError = fn; }
  };
})();