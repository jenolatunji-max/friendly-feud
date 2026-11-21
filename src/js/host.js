/* =========================================================
   Host screen: the control desk.
   ========================================================= */
let singleBoard = null;
let drawerHeld = false;
let drawerSticky = false;

const ICON = {
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  tv: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 21h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><rect x="7" y="14" width="10" height="7" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function mountGame() {
  const g = $('#game');
  g.innerHTML = `
  <div id="single-board" hidden></div>
  <button type="button" id="drawer-tab" class="btn btn-gold btn-sm" hidden>Host panel (hold H)</button>
  <div class="desk" id="desk">
    <header class="desk-top">
      <button type="button" class="btn btn-ghost btn-icon" data-act="home" title="Home" aria-label="Home">${ICON.home}</button>
      <div class="desk-brand">${esc(BRAND_NAME)}</div>
      <div id="d-round" class="d-round"></div>
      <div id="d-conn" class="d-conn"></div>
      <div class="desk-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="d-mute" data-act="mute" title="Sound on or off (M)" aria-pressed="false"></button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="undo" title="Undo (U)">${ICON.undo}<span>Undo</span></button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="print" title="Print host cards">${ICON.print}<span>Host cards</span></button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="settings" title="Settings">${ICON.gear}<span>Settings</span></button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="end">End game</button>
      </div>
    </header>
    <div id="d-tip" class="d-tip" hidden></div>
    <div class="desk-main" id="desk-main">
      <section class="desk-left" aria-label="Answers">
        <div id="d-question" class="d-question"></div>
        <div id="d-answers" class="d-answers"></div>
        <div class="guess">
          <label for="d-guess">Check a guess</label>
          <input id="d-guess" type="text" autocomplete="off" placeholder="Type what they said to find the match">
          <div id="d-guess-out" class="guess-out" aria-live="polite"></div>
        </div>
      </section>
      <section class="desk-right" aria-label="Controls">
        <div id="d-phase" class="card d-phase"></div>
        <div id="d-teams" class="d-teams"></div>
        <div id="d-tools" class="d-tools"></div>
      </section>
    </div>
    <div class="desk-main lr-desk" id="lr-desk" hidden>
      <section class="desk-left">
        <div id="l-head" class="d-question"></div>
        <div id="l-qs" class="l-qs"></div>
        <div id="l-cur" class="l-cur"></div>
        <form id="l-form" class="guess l-form" autocomplete="off">
          <label for="l-input">Type the answer</label>
          <div class="l-row">
            <input id="l-input" type="text" placeholder="What did they say?">
            <button type="submit" class="btn btn-gold">Enter</button>
            <button type="button" class="btn btn-ghost" data-act="l-nomatch">No match</button>
            <button type="button" class="btn btn-ghost" data-act="l-pass">Pass</button>
          </div>
          <div id="l-guess-out" class="guess-out" aria-live="polite"></div>
        </form>
      </section>
      <section class="desk-right">
        <div id="l-phase" class="card d-phase"></div>
      </section>
    </div>
  </div>`;

  g.addEventListener('click', onDeskClick);
  $('#d-guess').addEventListener('input', renderGuess);
  $('#d-guess').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const i = matchGuess(e.target.value, (G && G.round && G.round.answers) || []);
      if (i >= 0) { Actions.reveal(i); e.target.value = ''; renderGuess(); }
    }
    if (e.key === 'Escape') e.target.blur();
  });
  $('#l-input').addEventListener('input', renderLGuess);
  $('#l-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#l-input');
    if (!inp.value.trim()) { toast('Type an answer, or use No match.'); return; }
    const r = Lightning.enter(inp.value);
    if (r === 'ok') { inp.value = ''; renderLGuess(); }
    if (r === 'dup') inp.select();
  });
  $('#drawer-tab').addEventListener('click', () => { drawerSticky = !drawerSticky; updateDrawer(); });
  singleBoard = createBoard($('#single-board'), { standalone: false });
}

function deskMode() { return (G && G.cfg && G.cfg.screenMode) || settings.screenMode; }
function updateDrawer() {
  const single = deskMode() === 'single';
  const desk = $('#desk');
  desk.classList.toggle('drawer', single);
  desk.classList.toggle('open', single && (drawerHeld || drawerSticky));
  $('#single-board').hidden = !single;
  $('#drawer-tab').hidden = !single;
  $('#drawer-tab').textContent = drawerSticky ? 'Hide host panel' : 'Host panel (hold H)';
}

async function onDeskClick(e) {
  const b = e.target.closest('[data-act], [data-rev], [data-lans]');
  if (!b || b.disabled) return;
  if (b.dataset.rev != null) { Actions.reveal(+b.dataset.rev); return; }
  if (b.dataset.lans != null) { const l = G.lightning; const a = l.qs[l.qi].answers[+b.dataset.lans]; Lightning.enter(a.text, +b.dataset.lans); return; }
  const a = b.dataset.act;
  const t = b.dataset.team != null ? +b.dataset.team : null;
  switch (a) {
    case 'home': go('home'); break;
    case 'undo': undo(); break;
    case 'mute': toggleMute(); break;
    case 'print': printCards(upcomingRounds(), 'Host cards for this game'); break;
    case 'settings': go('settings'); break;
    case 'end':
      if (G.phase === 'gameOver') { go('home'); break; }
      if (await confirmBox('End the game now?', 'The team with the most points wins. You can undo this.', 'End game')) Actions.endGame();
      break;
    case 'buzz': Actions.buzz(t); break;
    case 'miss': Actions.miss(); break;
    case 'fowin': Actions.foWinner(t); break;
    case 'foagain': Actions.faceoffAgain(); break;
    case 'play': Actions.choose(true); break;
    case 'pass': Actions.choose(false); break;
    case 'switch': Actions.switchControl(); break;
    case 'awardnow':
      if (await confirmBox('Give the pot now?', `Give ${G.round.pot * G.round.mult} points to ${esc(teamName(t))} and end the round.`, 'Give points')) Actions.awardNow(t);
      break;
    case 'rest': Actions.showRest(); break;
    case 'next': Actions.next(); break;
    case 'skip': Actions.skip(false); break;
    case 'swap': Actions.skip(true); break;
    case 'adj': Actions.adjust(t, +b.dataset.d); break;
    case 'adjc': adjustDialog(t); break;
    case 'openboard': Sync.open(); break;
    case 'clock': Clock.start(+b.dataset.s); break;
    case 'clockstop': Clock.stop(); break;
    case 'toggleq': settings.showQuestion = !settings.showQuestion; saveSettings(); renderGame(); break;
    case 'lightning': Lightning.start(G.winner >= 0 ? G.winner : 0); break;
    case 'rematch': rematch(); break;
    case 'newgame': go('setup'); break;
    case 'tipclose': Store.set('tipSeen', true); $('#d-tip').hidden = true; break;
    case 'l-start': Lightning.startTimer(); setTimeout(() => $('#l-input') && $('#l-input').focus(), 50); break;
    case 'l-pause': Lightning.pause(); break;
    case 'l-done': Lightning.done(); break;
    case 'l-nomatch': { const v = $('#l-input').value; if (Lightning.enter(v, -1) === 'ok') { $('#l-input').value = ''; renderLGuess(); } break; }
    case 'l-pass': Lightning.pass(); break;
    case 'l-sel': Lightning.select(+b.dataset.q); break;
    case 'l-reveal': Lightning.revealNext(); break;
    case 'l-revealall': Lightning.revealAll(); break;
    case 'l-p2': Lightning.nextPlayer(); break;
    case 'l-times': Lightning.setTimes($('#l-t1').value, $('#l-t2').value, $('#l-tg').value); toast('Saved.'); break;
    case 'l-exit': act(() => { G.phase = 'gameOver'; Lightning.stopLoop(); G.fx = null; }); break;
    default: break;
  }
}

async function adjustDialog(t) {
  const v = await modal({
    title: 'Adjust ' + teamName(t) + "'s score",
    body: `<label class="fld">New score<input id="adj-v" type="number" min="0" step="1" value="${G.teams[t].score}" autofocus></label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Save score', primary: true, value: 'save', validate: (w) => { adjustDialog.v = w.querySelector('#adj-v').value; return true; } }],
    onOpen: (w, close) => { const i = w.querySelector('#adj-v'); i.select(); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { adjustDialog.v = i.value; close('save'); } }); },
  });
  if (v !== 'save') return;
  const n = Math.max(0, Math.round(+adjustDialog.v || 0));
  Actions.adjust(t, n - G.teams[t].score);
}
function rematch() {
  const cfg = deepCopy(G.cfg);
  if (newGame(cfg)) { go('game'); toast('New game, same teams. Good luck!'); }
}
function upcomingRounds() {
  if (!G) return [];
  const out = [];
  if (G.round) out.push({ q: G.round.q, answers: G.round.answers });
  const left = Math.max(0, G.cfg.rounds - G.roundNo) + 4;
  for (let k = 0; k < left && G.qPtr + k < G.queue.length; k++) {
    const ref = G.queue[G.qPtr + k];
    const p = getPack(ref.packId);
    if (p && p.rounds[ref.i]) out.push(p.rounds[ref.i]);
  }
  return out;
}

/* ---------- One-click mute ---------- */
const ICON_SOUND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
function toggleMute() {
  settings.sound.muted = !settings.sound.muted;
  saveSettings();
  Sound.setVolume();
  renderMute();
  toast(settings.sound.muted ? 'All sounds off. Press M to turn them back on.' : 'Sounds on.');
}
function renderMute() {
  const b = $('#d-mute');
  if (!b) return;
  const m = settings.sound.muted;
  b.innerHTML = (m ? ICON_MUTE : ICON_SOUND) + '<span>' + (m ? 'Muted' : 'Sound on') + '</span>';
  b.setAttribute('aria-pressed', String(m));
  b.classList.toggle('btn-gold', m);
}

/* ---------- Rendering ---------- */
function renderConn() {
  const el = $('#d-conn');
  if (!el || !G) return;
  let html;
  if (deskMode() === 'single') html = '<span class="dot ok"></span>One screen. Hold H for this panel.';
  else if (Sync.isOpen()) html = '<span class="dot ok"></span>TV board connected';
  else html = '<span class="dot bad"></span>TV board disconnected: <button type="button" class="btn btn-gold btn-sm" data-act="openboard">Reopen</button>';
  if (el.innerHTML !== html) {
    el.innerHTML = html;
    // Connection changed: refresh the tools row so "Open TV board" shows only when needed.
    const tb = $('#d-tools [data-act="openboard"]');
    if ((!!tb) === Sync.isOpen() && SCREEN === 'game' && G.phase !== 'lightning') renderGame();
  }
}

function teamBtn(t, act, label) {
  return `<button type="button" class="btn btn-team" data-act="${act}" data-team="${t}" style="--tc:${colorHex(G.teams[t].color)}">${label}</button>`;
}

function say(text) { return settings.hostScript === false ? '' : `<p class="say"><span>Say</span>"${text}"</p>`; }

function phaseHTML() {
  const r = G.round;
  const tn = (t) => esc(teamName(t));
  const strikes = `<div class="strikes" aria-label="${r.strikes} of 3 strikes">${[0, 1, 2].map((i) => `<span class="sx ${i < r.strikes ? 'on' : ''}">X</span>`).join('')}</div>`;
  const pot = `<div class="potline"><span>Round pot</span><b>${r.pot}</b>${r.mult > 1 ? `<em>x${r.mult} = ${r.pot * r.mult}</em>` : ''}</div>`;
  switch (G.phase) {
    case 'faceoff': {
      const fo = r.fo;
      if (fo.step === 'buzz') {
        return `<h3>Face-off!</h3>${say('Hands on your buzzers. Here is the question: ' + esc(r.q))}<p>One player from each team steps up. Who buzzed in first?</p>
          <div class="btn-row">${teamBtn(0, 'buzz', tn(0) + ' buzzed')}${teamBtn(1, 'buzz', tn(1) + ' buzzed')}</div>
          <p class="hint">Buzzer keys: ${esc(keyLabel(settings.keys.team1))} for ${tn(0)}, ${esc(keyLabel(settings.keys.team2))} for ${tn(1)}.</p>`;
      }
      if (fo.step === 'first' || fo.step === 'second') {
        const who = fo.step === 'first' ? fo.first : other(fo.first);
        const prev = fo.step === 'second' ? (fo.firstRank >= 0 ? `<p class="hint">${tn(fo.first)} found answer #${fo.firstRank + 1}. To win, ${tn(who)} must name a higher answer.</p>` : `<p class="hint">${tn(fo.first)} missed. Any answer on the board wins it for ${tn(who)}.</p>`) : '';
        return `<h3>Answering: ${tn(who)}</h3>${say(fo.step === 'first' ? 'What do you say? ... Let\'s see the board!' : 'Can you beat it? Let\'s see the board!')}<p>Click their answer on the left. Not there?</p>
          <div class="btn-row"><button type="button" class="btn btn-red btn-big" data-act="miss">Not on the board <kbd>X</kbd></button></div>${prev}${pot}`;
      }
      if (fo.step === 'hostpick') {
        return `<h3>Nobody found it</h3><p>Neither answer is on the board. Try again, or you pick who plays.</p>
          <div class="btn-row"><button type="button" class="btn btn-gold" data-act="foagain">Face-off again</button></div>
          <div class="btn-row">${teamBtn(0, 'fowin', tn(0) + ' plays')}${teamBtn(1, 'fowin', tn(1) + ' plays')}</div>`;
      }
      if (fo.step === 'playpass') {
        return `<h3>Face-off winner: ${tn(fo.winner)}</h3>${say(tn(fo.winner) + ', do you want to play or pass?')}<p>Did they choose to play or pass?</p>
          <div class="btn-row"><button type="button" class="btn btn-gold btn-big" data-act="play">Play</button><button type="button" class="btn btn-big" data-act="pass">Pass to ${tn(other(fo.winner))}</button></div>${pot}`;
      }
      return '';
    }
    case 'play':
      return `<h3>Playing: ${tn(r.control)}</h3>${say(r.strikes === 2 ? 'Careful, one more strike and they can steal!' : 'Next player, give me an answer!')}<p>Click each right answer. Wrong answer? Strike it.</p>
        <div class="btn-row"><button type="button" class="btn btn-red btn-big" data-act="miss">Strike <kbd>X</kbd></button></div>
        ${strikes}${pot}
        <div class="btn-row small"><button type="button" class="btn btn-ghost btn-sm" data-act="switch">Switch team</button><button type="button" class="btn btn-ghost btn-sm" data-act="awardnow" data-team="${r.control}">Give pot to ${tn(r.control)} now</button></div>`;
    case 'steal':
      return `<h3>Three strikes!</h3>${say(tn(r.stealer) + ', huddle up. One answer to steal it all.')}<p>Chance to steal for ${tn(r.stealer)}: one guess takes the whole pot. Talk it over, then click their answer if it's on the board.</p>
        <div class="btn-row"><button type="button" class="btn btn-red btn-big" data-act="miss">Steal failed <kbd>X</kbd></button></div>${strikes}${pot}`;
    case 'roundEnd': {
      const aw = r.awarded;
      const left = r.revealed.some((x) => !x);
      const ends = gameWillEnd();
      return `<h3>${aw.why === 'steal' ? 'Stolen! ' : ''}${aw.pts} points to ${tn(aw.team)}</h3>${say(left ? 'Let\'s see the rest of the top answers!' : 'Give it up for ' + tn(aw.team) + '!')}
        <p>${aw.why === 'cleared' ? 'They cleared the board.' : aw.why === 'stealfail' ? 'The steal missed, so the pot stays.' : r.mult > 1 ? `Pot of ${r.pot} times ${r.mult}.` : 'Nice round.'}</p>
        <div class="btn-row">${left ? '<button type="button" class="btn btn-ghost btn-big" data-act="rest">Show the rest</button>' : ''}<button type="button" class="btn btn-gold btn-big" data-act="next">${ends ? 'See the winner' : 'Next round'} <kbd>N</kbd></button></div>`;
    }
    case 'gameOver': {
      const w = G.winner;
      return `<h3>${w >= 0 ? 'Winner: ' + tn(w) : "It's a tie!"}</h3>${say(w >= 0 ? 'Congratulations, ' + tn(w) + '! Who is ready for the Lightning Round?' : 'What a game!')}
        <p>${tn(0)} ${G.teams[0].score}, ${tn(1)} ${G.teams[1].score}.</p>
        <div class="btn-row"><button type="button" class="btn btn-gold btn-big" data-act="lightning">Play the Lightning Round${w >= 0 ? ' for ' + tn(w) : ''}</button></div>
        <div class="btn-row"><button type="button" class="btn" data-act="rematch">Rematch</button><button type="button" class="btn btn-ghost" data-act="newgame">New game</button><button type="button" class="btn btn-ghost" data-act="home">Home</button></div>`;
    }
    default: return '';
  }
}

/** Remember which control had keyboard focus so re-rendering does not drop it. */
function focusKey() {
  const a = document.activeElement;
  if (!a || a === document.body || !a.closest || !a.closest('#game')) return null;
  if (a.id) return '#' + a.id;
  const attrs = ['data-act', 'data-team', 'data-d', 'data-rev', 'data-lans', 'data-q', 'data-s'].filter((x) => a.hasAttribute(x));
  return attrs.length ? attrs.map((x) => '[' + x + '="' + a.getAttribute(x) + '"]').join('') : null;
}
function restoreFocus(sel) {
  if (!sel || (document.activeElement && document.activeElement !== document.body)) return;
  const n = document.querySelector('#game ' + sel);
  if (n && !n.disabled) { try { n.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
}
/** Light update for timer ticks: change the numbers only, keep every button in place. */
function renderTick() {
  if (SCREEN !== 'game' || !G) return;
  const l = G.lightning;
  if (G.phase === 'lightning' && l) {
    const t = $('#l-phase .l-timer');
    if (t) { t.firstChild.nodeValue = l.timeLeft; t.classList.toggle('low', l.running && l.timeLeft <= 5); }
  }
  const cs = $('#d-tools [data-act="clockstop"]');
  if (cs && G.clock) cs.textContent = 'Stop timer (' + G.clock.left + ')';
  if (singleBoard && deskMode() === 'single') singleBoard.render(G, displaySettings());
}

function renderGame() {
  const fk = focusKey();
  renderGameInner();
  restoreFocus(fk);
}
function renderGameInner() {
  renderMute();
  if (typeof SCREEN !== 'undefined' && SCREEN !== 'game') return;
  if (!G || !$('#desk')) return;
  updateDrawer();
  renderConn();
  const lr = G.phase === 'lightning' && G.lightning;
  $('#desk-main').hidden = !!lr;
  $('#lr-desk').hidden = !lr;
  const r = G.round;
  $('#d-round').innerHTML = lr
    ? '<b>Lightning Round</b>'
    : `<b>${G.tiebreak && G.phase !== 'gameOver' ? 'Tiebreaker' : 'Round ' + G.roundNo + ' of ' + G.cfg.rounds}</b>${r.mult > 1 ? `<span class="chip gold">${r.mult === 2 ? 'Double' : 'Triple'} points</span>` : ''}<span class="muted">First to ${G.cfg.winScore}</span>`;
  if (lr) { renderLightningDesk(); } else {
    $('#d-question').innerHTML = `<span class="q-k">Read this out loud</span><span class="q-t">${esc(r.q)}</span>`;
    $('#d-answers').innerHTML = r.answers.map((a, i) => `
      <button type="button" class="arow ${r.revealed[i] ? 'on' : ''} ${r.free[i] ? 'free' : ''}" data-rev="${i}" aria-pressed="${r.revealed[i]}" title="Press ${i + 1} to reveal">
        <span class="anum">${i + 1}</span>
        <span class="atext"><b>${esc(a.text)}</b>${a.accept && a.accept.length ? `<small>Also accept: ${esc(a.accept.join(', '))}</small>` : ''}</span>
        <span class="astate">${r.revealed[i] ? (r.free[i] ? 'Shown' : 'On board') : ''}</span>
        <span class="apts">${a.points}</span>
      </button>`).join('');
    $('#d-phase').innerHTML = phaseHTML();
    renderGuess();
  }
  $('#d-teams').innerHTML = G.teams.map((t, i) => `
    <div class="tcard" style="--tc:${colorHex(t.color)}">
      <div class="tname">${esc(t.name)}</div>
      <div class="tscore">${t.score}</div>
      <div class="tadj">
        <button type="button" class="btn btn-ghost btn-sm" data-act="adj" data-team="${i}" data-d="-10" aria-label="Take 10 points from ${esc(t.name)}">-10</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="adjc" data-team="${i}">Edit</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="adj" data-team="${i}" data-d="10" aria-label="Give 10 points to ${esc(t.name)}">+10</button>
      </div>
    </div>`).join('');
  const playing = ['faceoff', 'play', 'steal'].includes(G.phase);
  $('#d-tools').innerHTML = lr ? '' : `
    <button type="button" class="btn btn-ghost btn-sm" data-act="skip" ${playing ? '' : 'disabled'}>Skip question</button>
    <button type="button" class="btn btn-ghost btn-sm" data-act="swap" ${playing ? '' : 'disabled'}>Swap for a random one</button>
    <span class="clock-tools" role="group" aria-label="Answer timer">${G.clock ? `<button type="button" class="btn btn-gold btn-sm" data-act="clockstop">Stop timer (${G.clock.left})</button>` : `<span class="muted">Timer</span>${[5, 10, 20, 30].map((n) => `<button type="button" class="btn btn-ghost btn-sm" data-act="clock" data-s="${n}">${n}s</button>`).join('')}`}</span>
    <button type="button" class="btn btn-ghost btn-sm" data-act="toggleq" aria-pressed="${settings.showQuestion}">Question on TV: ${settings.showQuestion ? 'On' : 'Off'}</button>
    ${deskMode() === 'two' && !Sync.isOpen() ? '<button type="button" class="btn btn-gold btn-sm" data-act="openboard">Open TV board <kbd>B</kbd></button>' : ''}`;
  const tip = $('#d-tip');
  if (deskMode() === 'two' && !Store.get('tipSeen', false)) {
    tip.hidden = false;
    tip.innerHTML = `<span><b>Two screens:</b> this laptop is your host desk with the answers. The TV shows the board. Drag the TV board window onto your TV, click it, and press F for full screen.</span><button type="button" class="btn btn-ghost btn-sm" data-act="tipclose">Got it</button>`;
  } else tip.hidden = true;
  if (singleBoard && deskMode() === 'single') singleBoard.render(G, displaySettings());
}

function renderGuess() {
  const out = $('#d-guess-out');
  const inp = $('#d-guess');
  if (!out || !inp) return;
  const v = inp.value.trim();
  if (!v || !G || !G.round) { out.innerHTML = ''; return; }
  const i = matchGuess(v, G.round.answers);
  if (i < 0) out.innerHTML = '<span class="bad">No match. That one is a strike.</span>';
  else {
    const a = G.round.answers[i];
    out.innerHTML = G.round.revealed[i]
      ? `<span class="warn">Matches #${i + 1} ${esc(a.text)}, already on the board.</span>`
      : `<span class="ok">Matches #${i + 1} ${esc(a.text)} (${a.points}). Press Enter to reveal.</span>`;
  }
}
function renderLGuess() {
  const out = $('#l-guess-out');
  const l = G && G.lightning;
  if (!out || !l) return;
  const v = $('#l-input').value.trim();
  const q = l.qs[l.qi];
  if (!v || !q) { out.innerHTML = ''; return; }
  const i = matchGuess(v, q.answers);
  out.innerHTML = i >= 0 ? `<span class="ok">Matches ${esc(q.answers[i].text)} (${q.answers[i].points})</span>` : '<span class="bad">No match: 0 points</span>';
}

function renderLightningDesk() {
  const l = G.lightning;
  const p = l.player;
  const total = Lightning.total(l);
  $('#l-head').innerHTML = `<span class="q-k">Lightning Round for ${esc(teamName(l.team))}</span><span class="q-t">Player ${p + 1} ${l.stage === 'playing' ? 'is answering' : l.stage === 'reveal' ? 'reveal' : l.stage === 'done' ? 'finished' : 'gets ready'}</span>`;
  $('#l-qs').innerHTML = l.qs.map((q, i) => {
    const a1 = l.ans[0][i];
    const a2 = l.ans[1][i];
    return `<button type="button" class="lq ${l.stage === 'playing' && i === l.qi ? 'cur' : ''}" data-act="l-sel" data-q="${i}" ${l.stage === 'playing' ? '' : 'tabindex="-1"'}>
      <span class="lq-n">${i + 1}</span><span class="lq-t">${esc(q.q)}</span>
      <span class="lq-a">${a1 ? esc(a1.text) + ' <b>' + a1.points + '</b>' : '<i>-</i>'}</span>
      <span class="lq-a">${a2 ? esc(a2.text) + ' <b>' + a2.points + '</b>' : '<i>-</i>'}</span></button>`;
  }).join('') + '<div class="lq-head"><span></span><span></span><span>Player 1</span><span>Player 2</span></div>';
  const playing = l.stage === 'playing';
  const cur = l.qs[l.qi];
  $('#l-cur').innerHTML = playing && cur ? `<div class="lc-q">${l.qi + 1}. ${esc(cur.q)}</div>
      <div class="lc-ans">${cur.answers.map((a, i) => `<button type="button" class="btn lc-b ${p === 1 && l.ans[0][l.qi] && l.ans[0][l.qi].idx === i ? 'taken' : ''}" data-lans="${i}"><span>${esc(a.text)}</span><b>${a.points}</b></button>`).join('')}</div>
      ${p === 1 && l.ans[0][l.qi] ? `<p class="hint">Player 1 said: <b>${esc(l.ans[0][l.qi].text)}</b>. A repeat gets "Try again".</p>` : ''}`
    : '';
  $('#l-form').hidden = !playing;
  if (!playing && document.activeElement && $('#l-form').contains(document.activeElement)) document.activeElement.blur();
  let html = `<div class="l-timer ${l.running && l.timeLeft <= 5 ? 'low' : ''}">${l.timeLeft}<small>seconds</small></div>`;
  if (l.stage === 'ready') {
    html += `<h3>Player ${p + 1}, get ready</h3><p>${p === 0 ? 'Player 2 leaves the room or puts on headphones.' : "Player 1's answers are hidden on the TV."} Read each question, and they answer fast.</p>
      <div class="btn-row"><button type="button" class="btn btn-gold btn-big" data-act="l-start">Start ${l.timeLeft} second timer</button></div>
      <details class="l-set"><summary>Change times and goal</summary>
        <div class="l-grid"><label class="fld">Player 1 seconds<input id="l-t1" type="number" min="5" max="120" value="${l.times[0]}"></label>
        <label class="fld">Player 2 seconds<input id="l-t2" type="number" min="5" max="120" value="${l.times[1]}"></label>
        <label class="fld">Points to win<input id="l-tg" type="number" min="50" max="500" value="${l.target}"></label></div>
        <button type="button" class="btn btn-sm" data-act="l-times">Save</button></details>`;
  } else if (playing) {
    html += `<div class="btn-row">${l.running ? '<button type="button" class="btn btn-big" data-act="l-pause">Pause timer</button>' : '<button type="button" class="btn btn-gold btn-big" data-act="l-start">Resume timer</button>'}<button type="button" class="btn btn-ghost btn-big" data-act="l-done">Done</button></div>
      <p class="hint">Tap the matching answer, or type what they said and press Enter.</p>`;
  } else if (l.stage === 'reveal') {
    const n = l.shown[p];
    html += `<h3>Reveal time</h3><p>Show each answer, then its points. Build the drama!</p>
      <div class="btn-row"><button type="button" class="btn btn-gold btn-big" data-act="l-reveal">${n % 2 === 0 ? 'Show answer ' + (n / 2 + 1) : 'Show points'} <kbd>Space</kbd></button>
      <button type="button" class="btn btn-ghost" data-act="l-revealall">Show all</button></div>`;
  } else if (l.stage === 'between') {
    html += `<h3>Player 1 scored ${total}</h3><p>Bring in player 2. Player 1's answers will be hidden on the TV.</p>
      <div class="btn-row"><button type="button" class="btn btn-gold btn-big" data-act="l-p2">Player 2's turn</button></div>`;
  } else if (l.stage === 'done') {
    const won = total >= l.target;
    html += `<h3>${won ? 'They did it!' : 'So close!'}</h3><p>${total} points. The goal was ${l.target}.</p>
      <div class="btn-row"><button type="button" class="btn btn-gold" data-act="rematch">Rematch</button><button type="button" class="btn btn-ghost" data-act="newgame">New game</button><button type="button" class="btn btn-ghost" data-act="home">Home</button></div>`;
  }
  html += `<div class="potline"><span>Total</span><b>${total}</b><em>Goal ${l.target}</em></div>`;
  if (l.stage !== 'done') html += '<div class="btn-row small"><button type="button" class="btn btn-ghost btn-sm" data-act="l-exit">Leave the Lightning Round</button></div>';
  $('#l-phase').innerHTML = html;
  renderLGuess();
}

/* ---------- Keyboard ---------- */
const keyHooks = [];  // used by Setup Check and settings key capture
function handleKey(e) {
  for (const h of keyHooks.slice()) if (h(e) === true) return true;
  if (SCREEN !== 'game' || !G) return;
  const code = e.code;
  if (code === settings.keys.team1) { Actions.buzz(0); return; }
  if (code === settings.keys.team2) { Actions.buzz(1); return; }
  const dm = /^(Digit|Numpad)([1-8])$/.exec(code);
  if (G.phase === 'lightning') {
    const l = G.lightning;
    if (dm && l.stage === 'playing') { const i = +dm[2] - 1; const q = l.qs[l.qi]; if (q.answers[i]) Lightning.enter(q.answers[i].text, i); return; }
    if (code === 'Space' && l.stage === 'reveal') { e.preventDefault(); Lightning.revealNext(); return; }
    if (code === 'KeyU') { undo(); return; }
    if (code === 'KeyM') { toggleMute(); return; }
    if (code === 'KeyF') { toggleFullscreen(); return; }
    if (code === 'KeyB') { if (!e.fromBoard) Sync.open(); return; }
    return;
  }
  if (dm) { Actions.reveal(+dm[2] - 1); return; }
  switch (code) {
    case 'KeyX': Actions.miss(); break;
    case 'KeyM': toggleMute(); break;
    case 'KeyU': undo(); break;
    case 'KeyN': if (G.phase === 'roundEnd') Actions.next(); break;
    case 'KeyR': if (G.phase === 'roundEnd') Actions.showRest(); break;
    case 'KeyB': if (!e.fromBoard) Sync.open(); break;
    case 'KeyF': toggleFullscreen(); break;
    case 'KeyP': if (G.phase === 'faceoff' && G.round.fo.step === 'playpass') Actions.choose(true); break;
    default: break;
  }
}
document.addEventListener('keydown', (e) => {
  if (IS_BOARD) return;
  // Key capture (buzzer setup) sees every key, including Ctrl, Alt and Command.
  if (keyHooks.length && !modalOpen() && !e.repeat && !(e.target.matches && e.target.matches('input, textarea, select'))) {
    for (const h of keyHooks.slice()) if (h(e) === true) { e.preventDefault(); return; }
  }
  if (e.ctrlKey && e.code === 'KeyZ' && !e.target.matches('input, textarea') && SCREEN === 'game') { e.preventDefault(); undo(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (modalOpen()) return;
  if (e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) return;
  if (e.code === 'KeyH' && SCREEN === 'game' && deskMode() === 'single') {
    if (!drawerHeld) { drawerHeld = true; updateDrawer(); }
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (e.target.matches && e.target.matches('button, summary, a') && (e.code === 'Space' || e.code === 'Enter')) return;
  if (SCREEN === 'game' && (e.code === 'Space' || /^Shift/.test(e.code))) e.preventDefault();
  handleKey(e);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'KeyH' && drawerHeld) { drawerHeld = false; updateDrawer(); }
});
window.addEventListener('blur', () => { if (drawerHeld) { drawerHeld = false; updateDrawer(); } });

/* ---------- Printable rules card and score sheet ---------- */
function printExtras(teams, rounds) {
  const names = (teams && teams.length ? teams : [{ name: 'Team 1' }, { name: 'Team 2' }]).map((t) => esc(t.name));
  const n = clamp(rounds || 5, 1, 12);
  const pr = $('#print-root');
  pr.innerHTML = '<div class="p-head"><b>' + esc(BRAND_NAME) + '</b> <span>How to play</span></div>'
    + '<div class="p-rules"><ol>'
    + '<li><b>Face-off.</b> One player from each team. The host reads the question. First to buzz answers. The top answer wins right away. If not, the other player tries to beat it.</li>'
    + '<li><b>Play or pass.</b> The face-off winner chooses to play the board or pass it to the other team.</li>'
    + '<li><b>Guess.</b> The team in control takes turns guessing. Right answers flip over and their points go into the round pot. A wrong answer is a strike.</li>'
    + '<li><b>Three strikes.</b> The other team huddles and gets one guess to steal the whole pot. Wrong guess? The playing team keeps it.</li>'
    + '<li><b>Clear the board</b> to win the pot. Round 4 is double points and round 5 is triple.</li>'
    + '<li><b>Win.</b> First team to 300 points wins. Then two players from the winning team try the Lightning Round: five quick questions each, 200 points together to win.</li>'
    + '</ol><h2>House rules</h2><ol><li>The host\'s call is final.</li><li>No phones, no googling, no shouting answers for the other team.</li><li>Answer within 5 seconds or it\'s a strike.</li></ol></div>'
    + '<div class="p-break"></div>'
    + '<div class="p-head"><b>' + esc(BRAND_NAME) + '</b> <span>Score sheet</span></div>'
    + '<table class="p-score"><thead><tr><th>Round</th><th>' + names[0] + '</th><th>' + names[1] + '</th></tr></thead><tbody>'
    + Array.from({ length: n }, (_, i) => '<tr><td>Round ' + (i + 1) + (i + 1 >= 5 ? ' (x3)' : i + 1 === 4 ? ' (x2)' : '') + '</td><td></td><td></td></tr>').join('')
    + '<tr><td>Total</td><td></td><td></td></tr></tbody></table>'
    + '<table class="p-score"><thead><tr><th>Lightning Round</th><th>Player 1</th><th>Player 2</th></tr></thead><tbody>'
    + [1, 2, 3, 4, 5].map((i) => '<tr><td>Question ' + i + '</td><td></td><td></td></tr>').join('')
    + '<tr><td>Total (goal 200)</td><td colspan="2"></td></tr></tbody></table>';
  setTimeout(() => { try { window.print(); } catch (e) { toast('Printing is not available here.', 'warn'); } }, 60);
}

/* ---------- Print host cards ---------- */
function printCards(rounds, title) {
  if (!rounds || !rounds.length) { toast('No questions to print.'); return; }
  const pr = $('#print-root');
  pr.innerHTML = `<div class="p-head"><b>${esc(BRAND_NAME)}</b> <span>${esc(title || 'Host cards')}</span></div>` + rounds.map((r, n) => `
    <div class="pcard">
      <h3><span>${n + 1}.</span> ${esc(r.q)}</h3>
      <table><tbody>${r.answers.slice().sort((a, b) => b.points - a.points).slice(0, 8).map((a, i) => `
        <tr><td class="pn">${i + 1}</td><td><b>${esc(a.text)}</b>${a.accept && a.accept.length ? `<div class="acc">Also accept: ${esc(a.accept.join(', '))}</div>` : ''}</td><td class="pts">${a.points}</td></tr>`).join('')}
      </tbody></table>
    </div>`).join('');
  setTimeout(() => { try { window.print(); } catch (e) { toast('Printing is not available here.', 'warn'); } }, 60);
}
