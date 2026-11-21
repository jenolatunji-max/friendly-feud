/* =========================================================
   Game state. The host window is the single source of truth.
   Every host action goes through act() so it can be undone.
   ========================================================= */
let G = null;        // live game state (plain JSON)
let HIST = [];       // undo stack of JSON snapshots

const DEFAULT_CFG = {
  teams: [{ name: 'Team 1', color: 'sunset' }, { name: 'Team 2', color: 'sky' }],
  packs: ['family-game-night'],
  rounds: 5,
  winScore: 300,
  doubleOn: true,
  doubleRound: 4,
  tripleOn: true,
  tripleRound: 5,
  screenMode: 'two',
};

function persistLive() {
  if (G) { Store.set('live', G); Store.set('liveHist', HIST.slice(-40)); } else { Store.del('live'); Store.del('liveHist'); }
}
function commit() {
  persistLive();
  Sync.push();
  if (typeof renderGame === 'function') renderGame();
}
/** Timer ticks: save and sync, but only redraw the numbers on the host desk. */
function commitTick() {
  persistLive();
  Sync.push();
  if (typeof renderTick === 'function') renderTick();
}
/** Run a host action. Return false from fn to cancel (nothing is recorded). */
function act(fn) {
  if (!G) return;
  const snap = JSON.stringify(G);
  const r = fn();
  if (r === false) return;
  HIST.push(snap);
  if (HIST.length > 200) HIST.shift();
  commit();
}
function undo() {
  if (!G) return;
  if (!HIST.length) { toast('Nothing to undo yet.'); return; }
  G = JSON.parse(HIST.pop());
  G.fx = { id: uid('fx'), type: 'undo' };
  if (G.lightning) G.lightning.running = false;
  Lightning.stopLoop();
  Clock.halt();
  G.clock = null;
  commit();
  toast('Undone.');
}
function fx(type, data) { G.fx = Object.assign({ id: uid('fx'), type }, data || {}); }
const other = (t) => 1 - t;
const teamName = (t) => (G && G.teams[t] ? G.teams[t].name : 'Team ' + (t + 1));

function multiplierFor(n, cfg) {
  if (cfg.tripleOn && n >= cfg.tripleRound) return 3;
  if (cfg.doubleOn && n >= cfg.doubleRound) return 2;
  return 1;
}
function buildQueue(packIds) {
  const q = [];
  packIds.forEach((id) => {
    const p = getPack(id);
    if (!p) return;
    (p.rounds || []).forEach((r, i) => { if (isPlayable(r)) q.push({ packId: id, i }); });
  });
  // Questions nobody has played yet come first, so repeat players get fresh boards.
  const played = new Set(playedList());
  const fresh = shuffle(q.filter((x) => !played.has(questionKey(x))));
  const seen = shuffle(q.filter((x) => played.has(questionKey(x))));
  return fresh.concat(seen);
}
function questionKey(ref) {
  const p = getPack(ref.packId);
  const r = p && p.rounds[ref.i];
  return ref.packId + '|' + normalizeAnswer(r ? r.q : ref.i);
}
function playedList() { const l = Store.get('played', []); return Array.isArray(l) ? l : []; }
function markPlayed(ref) {
  const k = questionKey(ref);
  const l = playedList();
  if (!l.includes(k)) { l.push(k); Store.set('played', l.slice(-3000)); }
}
function freshCount(packIds) {
  const played = new Set(playedList());
  let n = 0;
  packIds.forEach((id) => { const p = getPack(id); if (p) (p.rounds || []).forEach((r, i) => { if (isPlayable(r) && !played.has(questionKey({ packId: id, i }))) n++; }); });
  return n;
}

function newGame(cfg) {
  cfg = mergeDeep(DEFAULT_CFG, cfg);
  const queue = buildQueue(cfg.packs);
  if (!queue.length) { toast('Those packs have no playable questions. Pick another pack.', 'bad'); return false; }
  Lightning.stopLoop();
  G = {
    v: 1,
    id: uid('game'),
    phase: 'faceoff',
    cfg,
    teams: cfg.teams.map((t, i) => ({ name: String(t.name || 'Team ' + (i + 1)).slice(0, 24), color: t.color, score: 0 })),
    roundNo: 1,
    queue,
    qPtr: 0,
    round: null,
    fx: null,
    winner: null,
    lightning: null,
    tiebreak: false,
  };
  HIST = [];
  loadQuestion(false);
  fx('newround');
  Sound.play('intro');
  commit();
  return true;
}

function takeQuestion(random) {
  if (G.qPtr >= G.queue.length) { G.queue = shuffle(G.queue); G.qPtr = 0; }
  if (random) {
    const j = G.qPtr + Math.floor(Math.random() * (G.queue.length - G.qPtr));
    [G.queue[G.qPtr], G.queue[j]] = [G.queue[j], G.queue[G.qPtr]];
  }
  return G.queue[G.qPtr++];
}
function loadQuestion(random) {
  let src = null;
  let pack = null;
  for (let tries = 0; tries < G.queue.length + 1 && !src; tries++) {
    const ref = takeQuestion(random);
    pack = getPack(ref.packId);
    src = pack && pack.rounds[ref.i];
    if (src && !isPlayable(src)) src = null;
  }
  if (!src) { toast('Ran out of questions.', 'bad'); return; }
  markPlayed(G.queue[G.qPtr - 1]);
  const answers = src.answers.filter((a) => String(a.text || '').trim()).sort((a, b) => b.points - a.points).slice(0, 8)
    .map((a) => ({ text: a.text, points: +a.points || 0, accept: a.accept || [] }));
  G.round = {
    key: uid('r'),
    q: src.q,
    packName: pack.name,
    answers,
    revealed: answers.map(() => false),
    free: answers.map(() => false),
    strikes: 0,
    pot: 0,
    control: null,
    fo: { step: 'buzz', first: null, firstRank: null, secondRank: null, winner: null },
    mult: multiplierFor(Math.min(G.roundNo, G.cfg.rounds), G.cfg),
    awarded: null,
    stealer: null,
  };
  G.phase = 'faceoff';
  if (G.clock) { Clock.halt(); G.clock = null; }
}

function strikeFx(n) { fx('strike', { count: n }); Sound.play('strike'); }
function foWin(team) {
  const fo = G.round.fo;
  fo.winner = team;
  fo.step = 'playpass';
  fx('fowin', { team });
}
function awardTo(team, why) {
  const r = G.round;
  const pts = r.pot * r.mult;
  G.teams[team].score += pts;
  r.awarded = { team, pts, why };
  G.phase = 'roundEnd';
  fx('award', { team, pts, why });
  setTimeout(() => Sound.play('award'), 550);
}
function gameWillEnd() {
  if (!G) return false;
  const reached = G.teams.some((t) => t.score >= G.cfg.winScore);
  const out = G.roundNo >= G.cfg.rounds;
  return (reached || out) && G.teams[0].score !== G.teams[1].score;
}
function finishGame() {
  const [a, b] = G.teams;
  G.winner = a.score === b.score ? -1 : (a.score > b.score ? 0 : 1);
  G.phase = 'gameOver';
  Lightning.stopLoop();
  fx('win', { team: G.winner });
  setTimeout(() => Sound.play('win'), 200);
}

const Actions = {
  buzz(team) {
    if (!G || G.phase !== 'faceoff' || G.round.fo.step !== 'buzz') return;
    act(() => {
      G.round.fo.first = team;
      G.round.fo.step = 'first';
      fx('buzz', { team });
      Sound.play('buzz');
    });
  },
  reveal(i) {
    if (!G || !G.round || G.phase === 'lightning' || G.phase === 'gameOver') return;
    const r = G.round;
    if (i < 0 || i >= r.answers.length) return;
    if (r.revealed[i]) {
      toast('"' + r.answers[i].text + '" is already on the board.', 'warn');
      Sound.play('duplicate');
      return;
    }
    if (G.phase === 'faceoff') {
      if (r.fo.step === 'buzz') { toast('Who buzzed in first? Pick a team first.', 'warn'); return; }
      if (r.fo.step === 'playpass') { toast('Choose Play or Pass first.', 'warn'); return; }
      if (r.fo.step === 'hostpick') { toast('Pick which team wins the face-off first.', 'warn'); return; }
    }
    act(() => {
      r.revealed[i] = true;
      fx('reveal', { i });
      Sound.play('reveal');
      if (G.phase === 'roundEnd') { r.free[i] = true; return; }
      r.pot += r.answers[i].points;
      if (G.phase === 'faceoff') {
        const fo = r.fo;
        if (fo.step === 'first') {
          fo.firstRank = i;
          if (i === 0) foWin(fo.first); else fo.step = 'second';
        } else {
          fo.secondRank = i;
          const firstWins = fo.firstRank != null && fo.firstRank >= 0 && fo.firstRank < i;
          foWin(firstWins ? fo.first : other(fo.first));
        }
      } else if (G.phase === 'play') {
        if (r.revealed.every(Boolean)) awardTo(r.control, 'cleared');
      } else if (G.phase === 'steal') {
        awardTo(r.stealer, 'steal');
      }
    });
  },
  miss() {
    if (!G || !G.round) return;
    const r = G.round;
    if (G.phase === 'faceoff') {
      const fo = r.fo;
      if (fo.step === 'buzz') { toast('Pick who buzzed in first.', 'warn'); return; }
      if (fo.step === 'first') { act(() => { fo.firstRank = -1; fo.step = 'second'; strikeFx(1); }); return; }
      if (fo.step === 'second') {
        act(() => {
          fo.secondRank = -1;
          strikeFx(1);
          if (fo.firstRank >= 0) foWin(fo.first); else fo.step = 'hostpick';
        });
      }
      return;
    }
    if (G.phase === 'play') {
      act(() => {
        r.strikes = Math.min(3, r.strikes + 1);
        strikeFx(r.strikes);
        if (r.strikes >= 3) { G.phase = 'steal'; r.stealer = other(r.control); }
      });
      return;
    }
    if (G.phase === 'steal') act(() => { strikeFx(1); awardTo(r.control, 'stealfail'); });
  },
  faceoffAgain() {
    act(() => {
      if (G.phase !== 'faceoff') return false;
      G.round.fo = { step: 'buzz', first: null, firstRank: null, secondRank: null, winner: null };
      fx('faceoff');
      Sound.play('faceoff');
    });
  },
  foWinner(team) { act(() => { if (G.phase !== 'faceoff') return false; foWin(team); }); },
  choose(play) {
    act(() => {
      const r = G.round;
      if (G.phase !== 'faceoff' || r.fo.step !== 'playpass') return false;
      r.control = play ? r.fo.winner : other(r.fo.winner);
      G.phase = 'play';
      fx('control', { team: r.control });
      if (r.revealed.every(Boolean)) awardTo(r.control, 'cleared');
    });
  },
  switchControl() { act(() => { if (G.phase !== 'play') return false; G.round.control = other(G.round.control); fx('control', { team: G.round.control }); }); },
  awardNow(team) { act(() => { if (!['play', 'steal', 'faceoff'].includes(G.phase)) return false; awardTo(team, 'manual'); }); },
  showRest() {
    act(() => {
      const r = G.round;
      if (G.phase !== 'roundEnd') return false;
      let any = false;
      r.answers.forEach((a, i) => { if (!r.revealed[i]) { r.revealed[i] = true; r.free[i] = true; any = true; } });
      if (!any) return false;
      fx('rest');
      Sound.play('reveal');
    });
  },
  next() {
    act(() => {
      if (G.phase !== 'roundEnd') return false;
      const reached = G.teams.some((t) => t.score >= G.cfg.winScore);
      const out = G.roundNo >= G.cfg.rounds;
      if (reached || out) {
        if (G.teams[0].score === G.teams[1].score) {
          G.tiebreak = true;
          G.roundNo++;
          loadQuestion(false);
          fx('newround', { tiebreak: true });
          Sound.play('faceoff');
          return;
        }
        finishGame();
        return;
      }
      G.roundNo++;
      loadQuestion(false);
      fx('newround');
      Sound.play('faceoff');
    });
  },
  skip(random) {
    act(() => {
      if (!['faceoff', 'play', 'steal'].includes(G.phase)) return false;
      loadQuestion(!!random);
      fx('newround');
    });
  },
  adjust(team, delta) {
    act(() => {
      const t = G.teams[team];
      const n = Math.max(0, t.score + delta);
      if (n === t.score) return false;
      t.score = n;
      fx('score', { team });
    });
  },
  endGame() { act(() => { if (G.phase === 'gameOver') return false; finishGame(); }); },
};

/* =========================================================
   Lightning Round
   ========================================================= */
const Lightning = {
  timer: null,
  pickSet() {
    const sets = [];
    allPacks().forEach((p) => (p.lightning || []).forEach((s) => { if (s.questions && s.questions.length >= 5) sets.push(s); }));
    if (!sets.length) return null;
    const sig = (s) => s.name + '|' + s.questions[0].q;
    let used = Store.get('usedLightning', []);
    let pool = sets.filter((s) => !used.includes(sig(s)));
    if (!pool.length) { pool = sets; used = []; }
    const s = pool[Math.floor(Math.random() * pool.length)];
    Store.set('usedLightning', used.concat(sig(s)));
    return s;
  },
  start(team) {
    const s = Lightning.pickSet();
    if (!s) { toast('No Lightning Round questions found.', 'bad'); return; }
    act(() => {
      const times = [clamp(+settings.lightningTimes[0] || 20, 5, 120), clamp(+settings.lightningTimes[1] || 25, 5, 120)];
      G.lightning = {
        team: team >= 0 ? team : 0,
        setName: s.name,
        qs: s.questions.slice(0, 5).map((q) => ({ q: q.q, answers: q.answers.slice().sort((a, b) => b.points - a.points) })),
        times,
        target: clamp(+settings.lightningTarget || 200, 50, 500),
        player: 0,
        qi: 0,
        ans: [[null, null, null, null, null], [null, null, null, null, null]],
        stage: 'ready',
        timeLeft: times[0],
        running: false,
        shown: [0, 0],
      };
      G.phase = 'lightning';
      fx('lightning');
      Sound.play('intro');
    });
  },
  setTimes(t1, t2, target) {
    act(() => {
      const l = G.lightning;
      l.times = [clamp(+t1 || 20, 5, 120), clamp(+t2 || 25, 5, 120)];
      l.target = clamp(+target || 200, 50, 500);
      if (l.stage === 'ready') l.timeLeft = l.times[l.player];
    });
  },
  startTimer() {
    const l = G && G.lightning;
    if (!l || (l.stage !== 'ready' && l.stage !== 'playing')) return;
    act(() => {
      l.stage = 'playing';
      l.running = true;
      l.deadline = Date.now() + l.timeLeft * 1000;
      if (l.ans[l.player][l.qi]) l.qi = Lightning.nextEmpty(l, l.qi);
      fx('lstart');
    });
    Lightning.loop();
  },
  pause() {
    const l = G && G.lightning;
    if (!l || !l.running) return;
    act(() => { l.running = false; l.timeLeft = Math.max(0, Math.ceil(((l.deadline || Date.now()) - Date.now()) / 1000)); l.deadline = null; });
    Lightning.stopLoop();
  },
  loop() {
    Lightning.stopLoop();
    // Count down from a deadline so a slow or throttled window never drifts.
    Lightning.timer = setInterval(() => {
      const l = G && G.lightning;
      if (!l || !l.running) { Lightning.stopLoop(); return; }
      if (!l.deadline) l.deadline = Date.now() + l.timeLeft * 1000;
      const left = Math.max(0, Math.ceil((l.deadline - Date.now()) / 1000));
      if (left === l.timeLeft) return;
      l.timeLeft = left;
      if (left <= 5 && left > 0) Sound.play('tick');
      if (left <= 0) {
        l.running = false;
        l.deadline = null;
        Lightning.stopLoop();
        Sound.play('timeup');
        fx('timeup');
        l.stage = 'reveal';
        commit();
        return;
      }
      commitTick();
    }, 200);
  },
  stopLoop() { if (Lightning.timer) { clearInterval(Lightning.timer); Lightning.timer = null; } },
  nextEmpty(l, from) {
    const row = l.ans[l.player];
    for (let k = 1; k <= 5; k++) { const j = (from + k) % 5; if (!row[j]) return j; }
    return -1;
  },
  done() {
    const l = G && G.lightning;
    if (!l || (l.stage !== 'playing' && l.stage !== 'ready')) return;
    act(() => { l.running = false; l.stage = 'reveal'; });
    Lightning.stopLoop();
  },
  select(qi) { const l = G && G.lightning; if (!l || l.stage !== 'playing') return; act(() => { l.qi = clamp(qi, 0, 4); }); },
  /** Record an answer for the current player and question. matchIdx -1 forces "no match". */
  enter(text, matchIdx) {
    const l = G && G.lightning;
    if (!l || l.stage !== 'playing') { toast('Start the timer first.', 'warn'); return 'no'; }
    text = String(text || '').trim();
    const p = l.player;
    const qi = l.qi;
    const q = l.qs[qi];
    const idx = matchIdx != null ? matchIdx : matchGuess(text, q.answers);
    if (p === 1) {
      const prev = l.ans[0][qi];
      const sameText = text && prev && normalizeAnswer(prev.text) === normalizeAnswer(text);
      if (prev && ((idx >= 0 && prev.idx === idx) || sameText)) {
        Sound.play('duplicate');
        act(() => { fx('dup', { qi }); });
        toast('Duplicate answer. Try again!', 'warn');
        return 'dup';
      }
    }
    act(() => {
      const pts = idx >= 0 ? q.answers[idx].points : 0;
      l.ans[p][qi] = { text: text || (idx >= 0 ? q.answers[idx].text : 'No answer'), idx, points: pts };
      fx('lanswer');
      const n = Lightning.nextEmpty(l, qi);
      if (n < 0) { l.running = false; l.stage = 'reveal'; Lightning.stopLoop(); } else l.qi = n;
    });
    return 'ok';
  },
  pass() {
    const l = G && G.lightning;
    if (!l || l.stage !== 'playing') return;
    const n = Lightning.nextEmpty(l, l.qi);
    if (n < 0 || n === l.qi) { toast('That is the last open question.'); return; }
    act(() => { l.qi = n; });
  },
  revealNext() {
    const l = G && G.lightning;
    if (!l || l.stage !== 'reveal') return;
    const p = l.player;
    if (l.shown[p] >= 10) return;
    act(() => {
      l.shown[p]++;
      const k = l.shown[p];
      if (k % 2 === 0) {
        const a = l.ans[p][k / 2 - 1];
        Sound.play(a && a.points > 0 ? 'reveal' : 'zero');
      }
      fx('lreveal');
      if (l.shown[p] >= 10) Lightning.afterReveal(l);
    });
  },
  revealAll() {
    const l = G && G.lightning;
    if (!l || l.stage !== 'reveal') return;
    act(() => { l.shown[l.player] = 10; Sound.play('reveal'); fx('lreveal'); Lightning.afterReveal(l); });
  },
  afterReveal(l) {
    if (l.player === 0) { l.stage = 'between'; return; }
    l.stage = 'done';
    const total = Lightning.total(l);
    if (total >= l.target) { fx('lwin'); setTimeout(() => Sound.play('win'), 300); } else fx('llose');
  },
  nextPlayer() {
    const l = G && G.lightning;
    if (!l || l.stage !== 'between') return;
    act(() => { l.player = 1; l.qi = 0; l.stage = 'ready'; l.timeLeft = l.times[1]; fx('lp2'); });
  },
  total(l) {
    let t = 0;
    [0, 1].forEach((p) => {
      for (let i = 0; i < 5; i++) if (l.shown[p] >= (i + 1) * 2 && l.ans[p][i]) t += l.ans[p][i].points;
    });
    return t;
  },
};

/* =========================================================
   Answer timer (shot clock) for face-offs, steals or any guess.
   Not part of undo history; it is a stopwatch, not a game move.
   ========================================================= */
const Clock = {
  timer: null,
  start(sec) {
    if (!G) return;
    Clock.halt();
    G.clock = { left: sec, total: sec, running: true, id: uid('clk') };
    commit();
    Clock.timer = setInterval(() => {
      const c = G && G.clock;
      if (!c || !c.running) { Clock.halt(); return; }
      c.left = Math.max(0, c.left - 1);
      if (c.left > 0 && c.left <= 3) Sound.play('tick');
      if (c.left === 0) {
        c.running = false;
        Clock.halt();
        Sound.play('timeup');
        const id = c.id;
        setTimeout(() => { if (G && G.clock && G.clock.id === id) { G.clock = null; commit(); } }, 2500);
      }
      if (c.left === 0) commit(); else commitTick();
    }, 1000);
  },
  stop() { Clock.halt(); if (G && G.clock) { G.clock = null; commit(); } },
  halt() { if (Clock.timer) { clearInterval(Clock.timer); Clock.timer = null; } },
};
