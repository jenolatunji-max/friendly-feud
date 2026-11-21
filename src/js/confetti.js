/* =========================================================
   Confetti (canvas). Skipped when reduced motion is on.
   ========================================================= */
const Confetti = {
  burst(reduced) {
    if (reduced) return;
    let c = $('#confetti');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'confetti';
      c.setAttribute('aria-hidden', 'true');
      document.body.appendChild(c);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (c.width = innerWidth * dpr);
    const H = (c.height = innerHeight * dpr);
    const colors = ['#F6B93B', '#FFF6E0', '#2F6BFF', '#E63946', '#56B4E9', '#009E73', '#CC79A7'];
    const parts = Array.from({ length: 220 }, () => ({
      x: W * (0.15 + Math.random() * 0.7),
      y: H * (0.25 + Math.random() * 0.1),
      vx: (Math.random() - 0.5) * 22 * dpr,
      vy: (-12 - Math.random() * 16) * dpr,
      s: (6 + Math.random() * 9) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    cancelAnimationFrame(Confetti.raf);
    const step = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      parts.forEach((p) => {
        p.vy += 0.42 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - t / 5200);
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (t < 5200) Confetti.raf = requestAnimationFrame(step); else ctx.clearRect(0, 0, W, H);
    };
    Confetti.raf = requestAnimationFrame(step);
  },
};
