/* =========================================================
   TV board renderer. Used by the board window and by
   one-screen mode inside the host window.
   ========================================================= */
const X_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M20,6 L50,36 L80,6 L94,20 L64,50 L94,80 L80,94 L50,64 L20,94 L6,80 L36,50 L6,20 Z" fill="#E63946" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round"/></svg>';

function fitText(n) {
  n.style.fontSize = '';
  if (!n.clientWidth) return;
  let fs = parseFloat(getComputedStyle(n).fontSize);
  const min = fs * 0.5;
  while (n.scrollWidth > n.clientWidth + 1 && fs > min) { fs -= 1; n.style.fontSize = fs + 'px'; }
}

function createBoard(el, opts) {
  opts = opts || {};
  el.innerHTML = `
  <div class="bd" aria-live="polite">
    <div class="bd-team bd-t0"><div class="bd-tname"></div><div class="bd-tscore">0</div><div class="bd-ctl"></div></div>
    <div class="bd-center">
      <div class="bd-top">
        <div class="bd-round"></div>
        <div class="bd-pot"><span>Round pot</span><b>0</b></div>
        <div class="bd-mult"></div>
      </div>
      <div class="bd-q"></div>
      <div class="bd-frame"><div class="bulbs"></div><div class="bd-grid"></div></div>
      <div class="bd-foot"><div class="bd-clock" aria-hidden="true"><b></b></div><div class="bd-banner"></div><div class="bd-sx">${'<i>' + X_SVG + '</i>'}${'<i>' + X_SVG + '</i>'}${'<i>' + X_SVG + '</i>'}</div></div>
    </div>
    <div class="bd-team bd-t1"><div class="bd-tname"></div><div class="bd-tscore">0</div><div class="bd-ctl"></div></div>
    <div class="bd-strikes" aria-hidden="true"></div>
    <div class="bd-over bd-idle">
      <div class="bd-idle-logo">${logoSVG(BRAND_NAME)}</div>
      <div class="bd-idle-t">Get ready for game night!</div>
      <div class="bd-idle-h">${opts.standalone ? 'Drag this window onto your TV, then click it and press F for full screen.' : 'Waiting for the host to start a game.'}</div>
    </div>
    <div class="bd-over bd-win">
      <div class="bd-win-k">Winner</div>
      <div class="bd-win-n"></div>
      <div class="bd-win-s"></div>
    </div>
    <div class="bd-over bd-lr"></div>
    <div class="bd-hint"></div>
  </div>`;
  const q = (s) => el.querySelector(s);
  const bulbs = q('.bulbs');
  // Marquee bulbs around the board frame
  const top = 22;
  const side = 8;
  const pos = [];
  for (let i = 0; i <= top; i++) pos.push([i / top, 0]);
  for (let i = 1; i <= side; i++) pos.push([1, i / (side + 1)]);
  for (let i = top; i >= 0; i--) pos.push([i / top, 1]);
  for (let i = side; i >= 1; i--) pos.push([0, i / (side + 1)]);
  bulbs.innerHTML = pos.map(([x, y]) => `<i class="bulb" style="left:calc(var(--u)*1.1 + (100% - var(--u)*2.2)*${x.toFixed(4)});top:calc(var(--u)*1.1 + (100% - var(--u)*2.2)*${y.toFixed(4)})"></i>`).join('');

  let roundKey = null;
  let lastFx = null;
  let first = true;
  let winShownFor = null;
  let lrKey = null;
  let bannerText = '';

  function setText(sel, txt) { const n = q(sel); if (n.textContent !== String(txt)) n.textContent = txt; }

  function buildTiles(r) {
    const grid = q('.bd-grid');
    let html = '';
    for (let i = 0; i < 8; i++) {
      const a = r.answers[i];
      if (!a) { html += '<div class="tile empty"></div>'; continue; }
      const len = a.text.length;
      const sz = len > 18 ? 'xs' : len > 14 ? 'sm' : '';
      html += `<div class="tile instant ${r.revealed[i] ? 'revealed' : ''}" data-i="${i}">
        <div class="tile-in">
          <div class="tile-front"><span class="num">${i + 1}</span></div>
          <div class="tile-back"><span class="ans ${sz}">${esc(a.text)}</span><span class="pts">${a.points}</span></div>
        </div></div>`;
    }
    grid.innerHTML = html;
    fitAll();
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.tile.instant', grid).forEach((t) => t.classList.remove('instant'))));
  }

  function fitAll() { $$('.tile-back .ans, .lr-a', el).forEach(fitText); }
  window.addEventListener('resize', debounce(fitAll, 150));

  function showStrikes(n, reduced) {
    const s = q('.bd-strikes');
    s.innerHTML = Array.from({ length: n }, () => `<div class="xmark">${X_SVG}</div>`).join('');
    s.classList.remove('show');
    void s.offsetWidth;
    s.classList.add('show');
    clearTimeout(showStrikes.t);
    showStrikes.t = setTimeout(() => s.classList.remove('show'), reduced ? 1500 : 1400);
  }
  function pulse(sel) {
    const n = q(sel);
    if (!n) return;
    n.classList.remove('pulse');
    void n.offsetWidth;
    n.classList.add('pulse');
  }
  function banner(text) {
    const b = q('.bd-banner');
    if (text === bannerText) return;
    bannerText = text;
    b.textContent = text;
    fitText(b);
    b.classList.remove('pop');
    void b.offsetWidth;
    if (text) b.classList.add('pop');
  }

  function phaseBanner(S) {
    const r = S.round;
    const tn = (t) => (S.teams[t] ? S.teams[t].name : '');
    switch (S.phase) {
      case 'faceoff': {
        const fo = r.fo;
        if (fo.step === 'buzz') return S.tiebreak ? 'Tiebreaker face-off!' : 'Face-off!';
        if (fo.step === 'first') return tn(fo.first) + ' buzzed in!';
        if (fo.step === 'second') return tn(other(fo.first)) + ', can you beat it?';
        if (fo.step === 'hostpick') return 'Nobody found it!';
        if (fo.step === 'playpass') return tn(fo.winner) + ' wins the face-off! Play or pass?';
        return '';
      }
      case 'play': return tn(r.control) + ' is playing';
      case 'steal': return tn(r.stealer) + ' can steal!';
      case 'roundEnd':
        if (!r.awarded) return '';
        return tn(r.awarded.team) + (r.awarded.why === 'steal' ? ' steals ' : ' takes ') + r.awarded.pts + ' points!';
      default: return '';
    }
  }

  function renderLightning(S, disp) {
    const l = S.lightning;
    const over = q('.bd-lr');
    const key = S.id + '|' + l.setName;
    if (lrKey !== key) {
      lrKey = key;
      over.innerHTML = `
        <div class="lr-head"><div class="lr-logo">${logoSVG(BRAND_NAME, { title: false })}</div><div class="lr-title">Lightning Round</div></div>
        <div class="lr-timer"><span></span></div>
        <div class="lr-q"></div>
        <div class="lr-cols">${[0, 1].map((p) => `<div class="lr-col" data-p="${p}"><div class="lr-who"></div>${[0, 1, 2, 3, 4].map((i) => `<div class="lr-row" data-i="${i}"><span class="lr-a"></span><span class="lr-p"></span></div>`).join('')}</div>`).join('')}</div>
        <div class="lr-total"><span>Total</span><b>0</b><em></em></div>
        <div class="lr-result"></div>`;
    }
    const playing = l.stage === 'ready' || l.stage === 'playing';
    over.querySelector('.lr-timer span').textContent = l.timeLeft;
    over.querySelector('.lr-timer').classList.toggle('hide', !playing);
    over.querySelector('.lr-timer').classList.toggle('low', playing && l.running && l.timeLeft <= 5);
    over.querySelector('.lr-q').textContent = disp.showQuestion && l.stage === 'playing' && l.qs[l.qi] ? l.qs[l.qi].q : '';
    [0, 1].forEach((p) => {
      const col = over.querySelector(`.lr-col[data-p="${p}"]`);
      col.querySelector('.lr-who').textContent = 'Player ' + (p + 1);
      const hidden = p === 0 && l.player === 1 && (l.stage === 'ready' || l.stage === 'playing');
      col.classList.toggle('masked', hidden);
      col.classList.toggle('active', l.player === p && l.stage !== 'done');
      for (let i = 0; i < 5; i++) {
        const row = col.querySelector(`.lr-row[data-i="${i}"]`);
        const a = l.ans[p][i];
        const showA = !hidden && l.shown[p] >= i * 2 + 1;
        const showP = !hidden && l.shown[p] >= i * 2 + 2;
        const at = showA ? (a ? a.text : '-') : '';
        const pt = showP ? (a ? String(a.points) : '0') : '';
        const ae = row.querySelector('.lr-a');
        const pe = row.querySelector('.lr-p');
        if (ae.textContent !== at) { ae.textContent = at; fitText(ae); if (at) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); } }
        if (pe.textContent !== pt) pe.textContent = pt;
        row.classList.toggle('on', !!at);
        row.classList.toggle('pon', !!pt);
      }
    });
    over.querySelector('.lr-total b').textContent = Lightning.total(l);
    over.querySelector('.lr-total em').textContent = 'Goal ' + l.target;
    const res = over.querySelector('.lr-result');
    if (l.stage === 'done') {
      const won = Lightning.total(l) >= l.target;
      res.textContent = won ? 'You did it!' : 'So close!';
      res.className = 'lr-result show ' + (won ? 'won' : 'lost');
    } else { res.className = 'lr-result'; res.textContent = ''; }
  }

  function render(S, disp) {
    disp = disp || displaySettings();
    const reduced = prefersReducedMotion(disp);
    const root = q('.bd');
    root.classList.toggle('noq', !disp.showQuestion);
    const idle = q('.bd-idle');
    if (!S || !S.round) {
      idle.classList.add('show');
      q('.bd-win').classList.remove('show');
      q('.bd-lr').classList.remove('show');
      return;
    }
    idle.classList.remove('show');
    const r = S.round;

    // Teams
    [0, 1].forEach((t) => {
      const panel = q('.bd-t' + t);
      const team = S.teams[t];
      panel.style.setProperty('--tc', colorHex(team.color));
      panel.querySelector('.bd-tname').textContent = team.name;
      const sc = panel.querySelector('.bd-tscore');
      if (sc.textContent !== String(team.score)) { sc.textContent = team.score; if (!first) pulse('.bd-t' + t + ' .bd-tscore'); }
      const ctl = (S.phase === 'play' && r.control === t) || (S.phase === 'steal' && r.stealer === t) || (S.phase === 'faceoff' && r.fo.step === 'first' && r.fo.first === t);
      panel.classList.toggle('ctl', !!ctl);
      panel.querySelector('.bd-ctl').textContent = S.phase === 'steal' && r.stealer === t ? 'Steal!' : S.phase === 'play' && r.control === t ? 'Playing' : (S.phase === 'faceoff' && r.fo.step === 'first' && r.fo.first === t ? 'Buzzed in' : '');
    });

    // Header
    setText('.bd-round', S.tiebreak && S.phase !== 'gameOver' ? 'Tiebreaker' : 'Round ' + S.roundNo);
    const potEl = q('.bd-pot b');
    const potVal = S.phase === 'roundEnd' && r.awarded ? r.awarded.pts : r.pot;
    if (potEl.textContent !== String(potVal)) { potEl.textContent = potVal; if (!first) pulse('.bd-pot'); }
    setText('.bd-mult', r.mult === 3 ? 'Triple points!' : r.mult === 2 ? 'Double points!' : '');
    q('.bd-mult').classList.toggle('on', r.mult > 1);
    setText('.bd-q', r.q);

    // Tiles
    if (r.key !== roundKey) { roundKey = r.key; buildTiles(r); } else {
      if (!fitAll.done && el.clientWidth) { fitAll.done = true; fitAll(); }
      $$('.tile[data-i]', q('.bd-grid')).forEach((tile) => {
        const i = +tile.dataset.i;
        tile.classList.toggle('revealed', !!r.revealed[i]);
        tile.classList.toggle('free', !!r.free[i]);
      });
    }
    banner(phaseBanner(S));
    const ck = q('.bd-clock');
    const c = S.clock;
    ck.classList.toggle('on', !!c && S.phase !== 'gameOver' && S.phase !== 'lightning');
    if (c) { setText('.bd-clock b', c.left); ck.classList.toggle('low', c.left <= 3); ck.style.setProperty('--pct', (c.total ? c.left / c.total : 0) * 100 + '%'); }

    // Strikes indicator (persistent small X's under the board while playing)
    root.dataset.strikes = S.phase === 'play' || S.phase === 'steal' ? r.strikes : 0;

    // Effects (skip on first render so a reconnect does not replay them)
    if (S.fx && S.fx.id !== lastFx) {
      lastFx = S.fx.id;
      if (!first) {
        if (S.fx.type === 'strike') showStrikes(S.fx.count || 1, reduced);
        if (S.fx.type === 'buzz') pulse('.bd-t' + S.fx.team);
        if (S.fx.type === 'dup') pulse('.bd-lr .lr-timer');
      }
    }

    // Winner overlay
    const win = q('.bd-win');
    if (S.phase === 'gameOver') {
      win.classList.add('show');
      const w = S.winner;
      const n = q('.bd-win-n');
      if (w >= 0) {
        n.textContent = S.teams[w].name + ' wins!';
        n.style.color = colorHex(S.teams[w].color);
        q('.bd-win-s').textContent = S.teams[w].score + ' points';
        setText('.bd-win-k', 'Winner');
      } else {
        n.textContent = "It's a tie!";
        n.style.color = '';
        q('.bd-win-s').textContent = S.teams[0].score + ' to ' + S.teams[1].score;
        setText('.bd-win-k', 'What a game');
      }
      if (winShownFor !== S.id && !first) { winShownFor = S.id; Confetti.burst(reduced); }
      winShownFor = S.id;
    } else win.classList.remove('show');

    // Lightning overlay
    const lr = q('.bd-lr');
    if (S.phase === 'lightning' && S.lightning) {
      lr.classList.add('show');
      renderLightning(S, disp);
      if (S.fx && S.fx.type === 'lwin' && S.fx.id !== render.lastLwin) { render.lastLwin = S.fx.id; if (!first) Confetti.burst(reduced); }
    } else lr.classList.remove('show');

    first = false;
  }
  function hint(text, ms) {
    const h = q('.bd-hint');
    h.textContent = text;
    h.classList.toggle('show', !!text);
    clearTimeout(hint.t);
    if (text && ms) hint.t = setTimeout(() => h.classList.remove('show'), ms);
  }
  return { render, hint };
}

/* ---------- Board window bootstrap ---------- */
function startBoardWindow() {
  document.title = BRAND_NAME + ' - TV board';
  document.body.classList.add('board-mode');
  const root = document.createElement('div');
  root.id = 'board-root';
  document.body.appendChild(root);
  const board = createBoard(root, { standalone: true });
  let lastState = null;
  let lastDisp = displaySettings();
  applyDisplay(lastDisp);
  board.render(null, lastDisp);
  board.hint('Drag this window onto your TV, then click it and press F for full screen.', 12000);
  BoardLink.init((state, disp) => {
    lastState = state;
    lastDisp = disp || lastDisp;
    applyDisplay(lastDisp);
    board.render(state, lastDisp);
  });
  const status = () => BoardLink.send({ type: 'status', fullscreen: isFullscreen(), w: window.innerWidth, h: window.innerHeight });
  document.addEventListener('fullscreenchange', () => { status(); if (isFullscreen()) board.hint('', 0); });
  document.addEventListener('webkitfullscreenchange', status);
  window.addEventListener('resize', debounce(status, 200));
  setTimeout(status, 500);
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyF') { toggleFullscreen(); return; }
    if (e.code === 'Escape') return;
    // Forward everything else (USB buzzers send keystrokes to the focused window)
    if (/^Shift|^Digit|^Numpad|^Key|^Space|^Enter|^Arrow|^Control|^Alt/.test(e.code)) {
      e.preventDefault();
      BoardLink.send({ type: 'key', code: e.code, key: e.key });
    }
  });
  document.addEventListener('dblclick', toggleFullscreen);
  window.__ffBoard = { get state() { return lastState; } };
}
