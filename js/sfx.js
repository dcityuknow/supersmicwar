// ============================================================
// sfx.js — Toàn bộ hệ thống âm thanh (SFX), tạo bằng Web Audio API
// ============================================================

// ---------- Âm thanh (tự tạo bằng Web Audio API, không cần file mp3) ----------
const SFX = (() => {
  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Phát 1 nốt đơn giản (sóng vuông/sin/tam giác) với envelope tăng-giảm âm lượng
  function tone(freq, duration, { type = 'sine', startTime = 0, gain = 0.25, glideTo = null } = {}) {
    const ac = getCtx();
    const t0 = ac.currentTime + startTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // Nhiễu trắng ngắn (dùng cho tiếng "bị mất máu" thêm phần "thịch")
  function noiseHit(duration, { startTime = 0, gain = 0.22 } = {}) {
    const ac = getCtx();
    const t0 = ac.currentTime + startTime;
    const bufferSize = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ac.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  return {
    // Gọi 1 lần khi người dùng bấm nút "Bắt đầu chơi" để mở khóa AudioContext
    // (trình duyệt chặn phát âm thanh cho tới khi có tương tác từ người dùng)
    unlock() {
      const ac = getCtx();
      if (ac.state === 'suspended') ac.resume();
    },
    // 1. Tiếng "ting ting" khi ăn xu: 2 nốt cao vút lên, giòn tan
    coin() {
      tone(988, 0.09, { type: 'square', gain: 0.22 });          // B5
      tone(1568, 0.16, { startTime: 0.07, type: 'square', gain: 0.22 }); // G6
    },
    // 2. Tiếng bị mất máu: âm trầm xuống nhanh + tiếng "thịch" nhiễu
    hurt() {
      tone(220, 0.18, { type: 'sawtooth', gain: 0.22, glideTo: 90 });
      noiseHit(0.12, { gain: 0.18 });
    },
    // 3. Tiếng chiến thắng: chuỗi nốt đi lên vui tươi (fanfare ngắn)
    win() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
      notes.forEach((f, i) => tone(f, 0.22, { startTime: i * 0.12, type: 'triangle', gain: 0.24 }));
      tone(1567.98, 0.5, { startTime: notes.length * 0.12, type: 'triangle', gain: 0.26 }); // G6 giữ dài
    },
    // 4. Tiếng game over: chuỗi nốt đi xuống ảm đạm
    gameOver() {
      const notes = [392.0, 349.23, 293.66, 220.0]; // G4 F4 D4 A3
      notes.forEach((f, i) => tone(f, 0.32, { startTime: i * 0.22, type: 'sawtooth', gain: 0.22 }));
    },
    // 5. Tiếng "bụp" khi sút (Z): 1 tiếng thịch trầm, gọn
    kick() {
      tone(140, 0.1, { type: 'sine', gain: 0.28, glideTo: 60 });
      noiseHit(0.06, { gain: 0.15 });
    },
    // 6. Tiếng "xẹt xẹt" khi xoạc (X): tiếng rít nhiễu cao lướt qua nhanh
    slash() {
      const ac = getCtx();
      const t0 = ac.currentTime;
      const dur = 0.18;
      const bufferSize = Math.floor(ac.sampleRate * dur);
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(4200, t0);
      filter.frequency.exponentialRampToValueAtTime(1200, t0 + dur);
      filter.Q.value = 1.2;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(ac.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    },
    // 7. Tiếng "bụp xẹt xẹt" to khi sút/xoạc trúng quái: kết hợp thịch trầm + rít nhiễu mạnh hơn
    hitEnemy() {
      tone(160, 0.14, { type: 'square', gain: 0.32, glideTo: 55 });
      noiseHit(0.16, { gain: 0.26 });
      this.slash();
    },
    // 8. Tiếng "phạch phạch" khi boss rồng vỗ cánh xả loạt đạn
    dragonWing() {
      tone(300, 0.08, { type: 'square', gain: 0.2, glideTo: 180 });
      tone(500, 0.06, { startTime: 0.06, type: 'square', gain: 0.18, glideTo: 260 });
      noiseHit(0.1, { gain: 0.18 });
    },
    // 9. Tiếng gầm/rít khi boss rồng khạc lửa: âm trầm kéo dài + tiếng rít nhiễu
    dragonFire() {
      tone(140, 0.55, { type: 'sawtooth', gain: 0.24, glideTo: 55 });
      noiseHit(0.5, { gain: 0.24 });
    }
  };
})();
