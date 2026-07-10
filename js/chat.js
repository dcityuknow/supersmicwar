// ============================================================
// chat.js — In-game chat: press Enter to open a chat box, type a message,
// press Enter again to send it. The message appears as a glowing gold
// speech bubble above the sender's head (next to their name) for a few
// seconds, then the chat box itself hides again until Enter is pressed.
// ============================================================

const CHAT_DISPLAY_MS = 4500; // how long a sent message stays floating above the player's head

const chatBoxEl = document.getElementById('chatBox');
const chatInputEl = document.getElementById('chatInput');

let chatOpen = false;

function openChatBox() {
  if (!chatBoxEl || !chatInputEl) return;
  chatOpen = true;
  chatBoxEl.classList.remove('hidden');
  chatInputEl.value = '';
  chatInputEl.focus();
}

function closeChatBox() {
  if (!chatBoxEl || !chatInputEl) return;
  chatOpen = false;
  chatBoxEl.classList.add('hidden');
  chatInputEl.blur();
}

function submitChatBox() {
  const text = (chatInputEl ? chatInputEl.value : '').trim();
  closeChatBox();
  if (text) sendChatMessage(text);
}

// Send a chat message: show it above our own head immediately, and relay it
// to every other player over the network (no-op in Solo/Bot-team mode).
function sendChatMessage(text) {
  const id = (typeof myId !== 'undefined' && myId) ? myId : (typeof NET !== 'undefined' ? NET.myId : null);
  if (id) receiveChatMessage(id, text);
  if (typeof NET !== 'undefined' && NET.sendChat) NET.sendChat(text);
}

// Called locally whenever a chat message (ours or a remote player's) should be
// displayed. Uses a wall-clock timestamp so timing stays correct regardless of
// which machine (Host/Client) originated the message.
function receiveChatMessage(id, text) {
  if (typeof players === 'undefined' || !players || !players[id]) return;
  players[id].chatText = text;
  players[id].chatUntil = Date.now() + CHAT_DISPLAY_MS;
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!chatOpen) {
    // Only allow opening the chat box during active gameplay
    if (typeof started === 'undefined' || !started || (typeof gameOver !== 'undefined' && gameOver)) return;
    e.preventDefault();
    openChatBox();
  } else {
    e.preventDefault();
    submitChatBox();
  }
});

document.addEventListener('keydown', e => {
  if (chatOpen && e.key === 'Escape') {
    e.preventDefault();
    closeChatBox();
  }
});
