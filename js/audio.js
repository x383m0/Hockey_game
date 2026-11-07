// Tiny synthesized sound effects (no audio files needed).
(function (H) {
  'use strict';

  let ac = null;
  let master = null;
  let muted = false;
  const last = {};

  function ensure() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
    return ac;
  }

  function throttle(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return false;
    last[name] = now;
    return true;
  }

  function noiseBurst(dur, freq, q, vol) {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  function tone(type, freq, dur, vol, slideTo) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start();
    o.stop(ac.currentTime + dur);
  }

  H.Audio = {
    unlock: function () { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
    toggleMute: function () { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    isMuted: function () { return muted; },
    play: function (ev) {
      if (!ac || muted) return;
      const k = Math.min(1, (ev.strength || 0) / 1200);
      switch (ev.type) {
        case 'stick':
          if (throttle('stick', 50)) noiseBurst(0.06, 2200, 2, 0.15 + k * 0.6);
          break;
        case 'shot':
          if (throttle('stick', 50)) { noiseBurst(0.08, 1800, 1.5, 0.2 + k * 0.7); tone('triangle', 220, 0.06, 0.15 * k); }
          break;
        case 'pickup':
          if (throttle('pickup', 120)) noiseBurst(0.03, 3000, 3, 0.08);
          break;
        case 'boards':
          if (throttle('boards', 60)) noiseBurst(0.12, 300, 1, 0.2 + k * 0.6);
          break;
        case 'post':
          if (throttle('post', 120)) { tone('triangle', 1250, 0.5, 0.25); tone('sine', 2480, 0.35, 0.1); }
          break;
        case 'net':
          if (throttle('net', 100)) noiseBurst(0.15, 700, 0.7, 0.25);
          break;
        case 'check':
          if (throttle('check', 150)) { noiseBurst(0.18, 160, 0.8, 0.6); tone('sine', 90, 0.18, 0.3, 50); }
          break;
        case 'goal':
          tone('sawtooth', 185, 1.4, 0.18);
          tone('sawtooth', 233, 1.4, 0.12);
          tone('square', 92, 1.4, 0.08);
          break;
        case 'whistle':
          tone('sine', 2900, 0.35, 0.12, 2700);
          break;
        case 'beep':
          tone('sine', 660, 0.12, 0.15);
          break;
        case 'go':
          tone('sine', 990, 0.25, 0.18);
          break;
      }
    },
  };
})(window.H = window.H || {});
