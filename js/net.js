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
      console.warn('[NET] Could not get TURN credentials from Metered, falling back to STUN:', e);
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
  function initSolo(name) {
    mode = 'solo';
    myPeerId = 'solo';
    roster = { solo: { id: 'solo', name: name || 'You', charId: null, isHost: true } };
  }

  // Chế độ chơi cùng đồng đội máy (Bot). Vẫn chạy hoàn toàn cục bộ (không qua mạng),
  // chỉ khác Solo ở chỗ có thêm 1-3 người chơi "ảo" do máy điều khiển trong `players`.
  function initBotTeam(name, botCount) {
    mode = 'bot';
    myPeerId = 'solo';
    const n = Math.max(1, Math.min(3, botCount || 1));
    roster = { solo: { id: 'solo', name: name || 'You', charId: null, isHost: true, isBot: false } };
    for (let i = 1; i <= n; i++) {
      const bid = 'bot' + i;
      roster[bid] = { id: bid, name: 'Bot ' + i, charId: null, isHost: false, isBot: true };
    }
  }

  // Gán ngẫu nhiên cho mỗi Bot 1 nhân vật KHÁC nhân vật người chơi và KHÁC nhau
  // giữa các Bot. Gọi lại mỗi khi người chơi đổi nhân vật để luôn đảm bảo không trùng.
  function assignBotCharacters(characterList) {
    if (mode !== 'bot') return;
    const humanCharId = roster[myPeerId] ? roster[myPeerId].charId : null;
    const pool = characterList.map(c => c.id).filter(id => id !== humanCharId);
    // xáo trộn ngẫu nhiên (Fisher-Yates)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    let idx = 0;
    for (const id in roster) {
      if (roster[id].isBot) {
        roster[id].charId = pool.length ? pool[idx % pool.length] : characterList[0].id;
        idx++;
      }
    }
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
        if (!roster[conn.peer]) roster[conn.peer] = { id: conn.peer, name: 'Player', charId: null, isHost: false };
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
      return "Room not found with this code. Check that the Host still has the page open (not closed/reloaded) and that the room code is typed correctly (no extra spaces).";
    }
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
      return "Couldn't connect to the matchmaking server. Check your network, or an ad blocker/firewall might be blocking PeerJS.";
    }
    if (type === 'browser-incompatible') {
      return "This browser doesn't support WebRTC. Try another browser (Chrome, Edge, or a recent Firefox).";
    }
    return "Couldn't connect to the room (" + (type || String(err)) + ").";
  }

  async function initClient(hostId, name, cb) {
    mode = 'client';
    peer = await makePeer(null);
    let settled = false; // đã có kết quả (thành công/thất bại) hay chưa, tránh gọi cb/onConnError nhiều lần
    peer.on('open', pid => {
      myPeerId = pid;
      // QUAN TRỌNG: KHÔNG đặt reliable:true ở đây. Theo tài liệu PeerJS, reliable:true
      // ép dùng một lớp giả lập (shim) chỉ để hỗ trợ trình duyệt rất cũ (Chrome <=30),
      // và lớp này "có thể không đạt hiệu năng đầy đủ" - trên thực tế nó gây trễ dồn
      // dần theo thời gian khi gửi dữ liệu liên tục nhiều lần/giây (đúng như trường hợp
      // gửi input 60 lần/giây của game này). Không đặt cờ này, trình duyệt hiện đại sẽ
      // tự dùng kênh dữ liệu gốc (native), vẫn đảm bảo tin cậy + đúng thứ tự, nhưng
      // không qua lớp giả lập chậm chạp đó.
      const conn = peer.connect(hostId);
      hostConn = conn;

      // Nếu sau CONNECT_TIMEOUT_MS vẫn chưa "open" được (thường do 2 máy không
      // bắt tay P2P được và không có TURN server phù hợp) -> báo lỗi rõ ràng
      // thay vì treo mãi ở "Đang kết nối..."
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (onConnError) onConnError("Couldn't connect to the room (timed out). Check the room code, or try a different network (some corporate/public wifi networks block P2P connections).");
        cb(new Error('connect-timeout'), null);
        try { conn.close(); } catch (e) {}
      }, CONNECT_TIMEOUT_MS);

      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        conn.send({ t: 'join', name: name || 'Player' });
        cb(null, pid);
      });
      conn.on('data', data => handleClientData(data));
      conn.on('close', () => { if (onConnError) onConnError('Lost connection to the room.'); });
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
      roster[fromId].name = data.name || 'Player';
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
    } else if (data.t === 'chat') {
      // Show it locally on the Host's own screen, then relay to every OTHER client
      // (the sender already shows their own message locally the instant they hit Enter).
      if (typeof receiveChatMessage === 'function') receiveChatMessage(fromId, data.text);
      sendToAllClients({ t: 'chat', id: fromId, text: data.text }, fromId);
    }
  }

  function broadcastLobby() {
    const list = Object.values(roster);
    if (onLobbyUpdate) onLobbyUpdate(list);
    sendToAllClients({ t: 'lobby', roster: list, hostId: myPeerId });
  }

  function sendToAllClients(msg, excludeId) {
    for (const id in clientConns) {
      if (excludeId && id === excludeId) continue;
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
      score: score, coinsCollected: coinsCollected, currentLevel: currentLevel,
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
      flyingEnemies: level.flyingEnemies,
      spears: level.spears || [],
      lyronBullets: level.lyronBullets || [],
      lyronCrates: level.lyronCrates || []
    };
    for (const id in players) {
      const p = players[id];
      msg.players[id] = {
        x: p.x, y: p.y, facing: p.facing, animState: p.animState, animFrame: p.animFrame,
        hp: p.hp, maxHp: p.maxHp, charId: p.charId, name: p.name, invincible: p.invincible,
        damageFlashTimer: p.damageFlashTimer, lives: p.lives, eliminated: p.eliminated, isBot: p.isBot
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
    } else if (data.t === 'levelClear') {
      if (typeof applyLevelClearFromHost === 'function') applyLevelClearFromHost(data);
    } else if (data.t === 'chat') {
      if (typeof receiveChatMessage === 'function') receiveChatMessage(data.id, data.text);
    }
  }

  // Send a chat message we typed to everyone else. Solo/Bot-team mode has no
  // network peers, so there's nothing to relay (the local echo already shows it).
  function sendChat(text) {
    if (mode === 'client') {
      if (hostConn && hostConn.open) hostConn.send({ t: 'chat', text });
    } else if (mode === 'host') {
      sendToAllClients({ t: 'chat', id: myPeerId, text });
    }
  }

  function sendInputTick(keysObj, jumpPulse) {
    if (mode !== 'client' || !hostConn || !hostConn.open) return;
    const slim = {
      ArrowLeft: !!keysObj['ArrowLeft'], ArrowRight: !!keysObj['ArrowRight'],
      // ArrowUp/ArrowDown/Space: dùng cho điều khiển bay lên/xuống của nhân vật bay
      // (Lyron - xem isFlyer trong characters.js). Các nhân vật khác bỏ qua các phím này
      // (trừ jump pulse riêng, gửi ở trường `jump` bên dưới).
      ArrowUp: !!keysObj['ArrowUp'], ArrowDown: !!keysObj['ArrowDown'], Space: !!keysObj['Space'],
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
    } else if (mode === 'solo' || mode === 'bot') {
      if (roster[myPeerId]) roster[myPeerId].charId = charId;
    }
  }

  function getRoster() {
    return Object.values(roster);
  }

  // Rời phòng mạng hiện tại (nếu có) và đưa NET về đúng trạng thái ban đầu như
  // lúc mới mở trang, để người chơi có thể chọn lại BẤT KỲ chế độ nào (kể cả
  // Host phòng mới / Join phòng khác) từ đầu. Gọi khi ván chơi kết thúc và tự
  // động quay về lobby chính (xem returnToMainMenu trong game-state.js).
  function resetToMenu() {
    if (peer) {
      try { peer.destroy(); } catch (e) { /* peer đã đóng sẵn rồi -> bỏ qua */ }
    }
    peer = null;
    hostConn = null;
    for (const id in clientConns) delete clientConns[id];
    roster = {};
    mode = 'solo';
    myPeerId = null;
    onLobbyUpdate = null;
    onStartReceived = null;
    onConnError = null;
    broadcastCounter = 0;
  }

  return {
    initSolo, initHost, initClient, initBotTeam, assignBotCharacters,
    startGameSignal, broadcastLevelInit, tickBroadcast, sendToAllClients,
    sendInputTick, sendMyChar, sendChat, getRoster, resetToMenu,
    get mode() { return mode; },
    get myId() { return myPeerId; },
    set onLobbyUpdate(fn) { onLobbyUpdate = fn; },
    set onStartReceived(fn) { onStartReceived = fn; },
    set onConnError(fn) { onConnError = fn; }
  };
})();
