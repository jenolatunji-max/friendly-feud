/* =========================================================
   Sound: every effect is synthesized live with Web Audio.
   No recordings, no files, all original.
   ========================================================= */
const Sound = (() => {
  let ctx = null;
  let master = null;

  function ensure() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      master.gain.value = settings.sound.muted ? 0 : clamp(settings.sound.volume, 0, 1);
      return ctx;
    } catch (e) { return null; }
  }

  function env(g, t, attack, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function osc(type, f, t, dur, peak, f2, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, 0.008, peak, dur);
    o.connect(g);
    g.connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function noise(t, dur, peak, f1, f2, type) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(f1, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    f.Q.value = 1.4;
    const g = ctx.createGain();
    env(g, t, 0.01, peak, dur);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t);
  }
  function lowpass(freq) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.connect(master);
    return f;
  }

  const lib = {
    // Bright two-note chime
    reveal(t) {
      osc('sine', 784, t, 0.5, 0.32);
      osc('sine', 1175, t + 0.07, 0.75, 0.3);
      osc('triangle', 2350, t + 0.07, 0.35, 0.05);
    },
    // Low, wide buzzer
    strike(t) {
      const lp = lowpass(1400);
      osc('sawtooth', 92, t, 0.85, 0.36, null, lp);
      osc('square', 97, t, 0.85, 0.2, null, lp);
      osc('sawtooth', 138, t, 0.85, 0.14, null, lp);
    },
    buzz(t) {
      osc('square', 620, t, 0.11, 0.16);
      osc('square', 930, t + 0.1, 0.2, 0.16);
    },
    faceoff(t) {
      noise(t, 0.55, 0.35, 300, 3200);
      osc('triangle', 330, t + 0.3, 0.35, 0.12, 660);
    },
    award(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => osc('triangle', f, t + i * 0.085, 0.32, 0.26));
      osc('sine', 1046.5, t + 0.36, 0.9, 0.18);
      osc('sine', 1318.5, t + 0.36, 0.9, 0.14);
      osc('sine', 1568, t + 0.36, 0.9, 0.1);
    },
    tick(t) {
      osc('square', 1760, t, 0.035, 0.12);
      noise(t, 0.03, 0.1, 4000);
    },
    timeup(t) {
      const lp = lowpass(1200);
      osc('sawtooth', 220, t, 1.1, 0.3, 110, lp);
      osc('square', 224, t, 1.1, 0.14, 112, lp);
    },
    duplicate(t) {
      osc('square', 440, t, 0.14, 0.16);
      osc('square', 311, t + 0.17, 0.26, 0.16);
    },
    zero(t) {
      osc('sine', 150, t, 0.4, 0.4, 70);
      noise(t, 0.12, 0.15, 300, null, 'lowpass');
    },
    win(t) {
      const seq = [[392, 0, 0.14], [523.25, 0.14, 0.14], [659.25, 0.28, 0.14], [783.99, 0.42, 0.3], [659.25, 0.74, 0.12], [783.99, 0.88, 0.7]];
      seq.forEach(([f, d, l]) => { osc('triangle', f, t + d, l + 0.1, 0.24); osc('sine', f * 2, t + d, l, 0.06); });
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => osc('sine', f, t + 0.88, 1.3, 0.1));
    },
    intro(t) {
      const seq = [523.25, 659.25, 783.99, 659.25, 880, 783.99, 1046.5];
      seq.forEach((f, i) => osc('triangle', f, t + i * 0.1, 0.16, 0.2));
      osc('sine', 1046.5, t + 0.7, 0.6, 0.14);
    },
  };

  function play(name, force) {
    try {
      if (!force && (settings.sound.muted || settings.sound.on[name] === false)) return;
      const c = ensure();
      if (!c || !lib[name]) return;
      lib[name](c.currentTime + 0.02);
    } catch (e) { /* audio must never break the game */ }
  }
  function setVolume() { if (master) master.gain.value = settings.sound.muted ? 0 : clamp(settings.sound.volume, 0, 1); }

  return { play, ensure, setVolume };
})();
