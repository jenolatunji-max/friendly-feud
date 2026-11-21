/* =========================================================
   Screens: navigation, home, setup, settings, help, check
   ========================================================= */
let SCREEN = 'home';
const Screens = {};

function go(name, arg) {
  if (name === 'game' && !G) name = 'home';
  SCREEN = name;
  keyHooks.length = 0;
  const scr = $('#screen');
  const game = $('#game');
  document.body.dataset.screen = name;
  if (name === 'game') {
    scr.hidden = true;
    scr.innerHTML = '';
    game.hidden = false;
    renderGame();
  } else {
    game.hidden = true;
    scr.hidden = false;
    const s = Screens[name];
    scr.innerHTML = s.html(arg);
    if (s.bind) s.bind(scr, arg);
    window.scrollTo(0, 0);
    const h = scr.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
}
function pageTop(title, sub, back = 'home') {
  return `<div class="pagehead">
    <button type="button" class="btn btn-ghost btn-sm" data-go="${back}">${ICON.back}<span>${back === 'home' ? 'Home' : 'Back'}</span></button>
    <div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
  </div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b && !IS_BOARD) { e.preventDefault(); go(b.dataset.go); }
});

function seasonalPack() {
  const m = new Date().getMonth() + 1;
  if (m === 11) return 'thanksgiving';
  if (m === 12) return 'christmas';
  if (m === 1) return 'new-years-eve';
  return 'family-game-night';
}
function packChips(selected, multi, name) {
  return allPacks().filter((p) => playableRounds(p) > 0).map((p) => `
    <label class="pchip"><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${esc(p.id)}" ${selected.includes(p.id) ? 'checked' : ''}>
    <span><b>${esc(p.name)}</b><small>${plural(playableRounds(p), 'question')}${p.source === 'surveyed' ? ' &middot; your crowd' : ''}${!p.builtin && p.source !== 'surveyed' ? ' &middot; custom' : ''}</small></span></label>`).join('');
}

function startGameWith(cfg) {
  if (!newGame(cfg)) return;
  go('game');
  if (G.cfg.screenMode === 'two') Sync.open();
  else toast('One-screen mode. Hold H to see the host panel.');
}

/* ---------- Home ---------- */
Screens.home = {
  html() {
    return `<main class="home">
      <div class="home-logo">${logoSVG(BRAND_NAME)}</div>
      <p class="tagline">The survey game show for your living room. No PowerPoint. No macros. No sign up.</p>
      <button type="button" class="btn btn-gold btn-xl" id="qp">Quick Play</button>
      <p class="qp-sub">Ready in two clicks. Two teams, five rounds, first to 300. ${freshCount(allPacks().map((p) => p.id))} fresh questions waiting.</p>
      ${G && G.phase !== 'gameOver' ? '<button type="button" class="btn btn-sm resume-btn" data-go="game">Back to your game</button>' : ''}
      <nav class="home-grid" aria-label="Main menu">
        <button type="button" data-go="setup" id="m-setup"><b>Custom Game</b><small>Team names, colors, packs and rounds</small></button>
        <button type="button" data-go="crowd" id="m-crowd"><b>Your Crowd</b><small>Survey your own guests for the board</small></button>
        <button type="button" data-go="editor" id="m-editor"><b>Edit Questions</b><small>Write, change and print packs</small></button>
        <button type="button" data-go="check" id="m-check"><b>Setup Check</b><small>Test your TV, sound and buzzers</small></button>
        <button type="button" data-go="settings" id="m-settings"><b>Settings</b><small>Sound, text size, buzzer keys</small></button>
        <button type="button" data-go="help" id="m-help"><b>Help</b><small>How to play, tips and answers</small></button>
      </nav>
      ${Store.ok ? '' : '<p class="note warn">Your browser is blocking storage, so changes will not be saved after you close this page. Use Export in Settings to keep a copy.</p>'}
    </main>`;
  },
  bind(root) {
    $('#qp', root).addEventListener('click', quickPlay);
    if (!settings.toured) setTimeout(() => { if (SCREEN === 'home' && !modalOpen()) runTour(); }, 400);
  },
};

function quickPlay() {
  const def = seasonalPack();
  modal({
    title: 'Quick Play',
    wide: true,
    body: `<p>Pick a question pack. Everything else is ready to go.</p>
      <div class="pchips" id="qp-packs">${packChips([def], false, 'qp')}</div>
      <p class="hint">Two teams, 5 rounds, first to 300 wins. Double points in round 4, triple in round 5. ${settings.screenMode === 'two' ? 'The TV board opens in a new window.' : 'One-screen mode is on.'}</p>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Start game', primary: true, value: 'go', validate: (w) => { quickPlay.pack = (w.querySelector('input[name=qp]:checked') || {}).value; return true; } }],
  }).then((v) => {
    if (v !== 'go') return;
    const last = Store.get('lastSetup', null);
    const cfg = { packs: [quickPlay.pack || def], screenMode: settings.screenMode };
    if (last && last.teams) cfg.teams = last.teams;
    startGameWith(cfg);
  });
}

/** Coerce a saved game setup into safe, known values. */
function sanitizeSetup(s) {
  const c = mergeDeep(DEFAULT_CFG, isObj(s) ? s : {});
  const num = (v, def, a, b) => { const n = Math.round(+v); return Number.isFinite(n) ? clamp(n, a, b) : def; };
  const teams = Array.isArray(c.teams) ? c.teams : DEFAULT_CFG.teams;
  c.teams = [0, 1].map((i) => ({
    name: String((teams[i] && teams[i].name) || 'Team ' + (i + 1)).slice(0, 24),
    color: TEAM_COLORS.some((x) => x.id === (teams[i] && teams[i].color)) ? teams[i].color : TEAM_COLORS[i].id,
  }));
  c.packs = (Array.isArray(c.packs) ? c.packs : []).map(String).filter((id) => getPack(id));
  if (!c.packs.length) c.packs = ['family-game-night'];
  c.rounds = num(c.rounds, 5, 1, 20);
  c.winScore = num(c.winScore, 300, 50, 2000);
  c.doubleRound = num(c.doubleRound, 4, 1, 20);
  c.tripleRound = num(c.tripleRound, 5, 1, 20);
  c.doubleOn = !!c.doubleOn;
  c.tripleOn = !!c.tripleOn;
  c.screenMode = c.screenMode === 'single' ? 'single' : 'two';
  return c;
}

/* ---------- Custom game setup ---------- */
Screens.setup = {
  html(arg) {
    const c = sanitizeSetup(Store.get('lastSetup', {}));
    c.screenMode = settings.screenMode;
    if (arg && arg.pack) c.packs = [arg.pack];
    const teamField = (i) => `
      <fieldset class="card team-f">
        <legend>Team ${i + 1}</legend>
        <label class="fld">Team name<input id="s-tn${i}" type="text" maxlength="24" value="${esc(c.teams[i].name)}"></label>
        <div class="swatches" role="radiogroup" aria-label="Team ${i + 1} color">${TEAM_COLORS.map((col) => `
          <label class="sw" title="${col.name}"><input type="radio" name="s-tc${i}" value="${col.id}" ${c.teams[i].color === col.id ? 'checked' : ''}><span style="--c:${col.hex}"></span><em>${col.name}</em></label>`).join('')}</div>
      </fieldset>`;
    return `<main class="page">${pageTop('Custom Game', 'Set it up once. We remember it for next time.')}
      <div class="grid2">${teamField(0)}${teamField(1)}</div>
      <section class="card"><h2>Question packs</h2><p class="hint">Pick one or more. Questions are shuffled together.</p>
        <div class="pchips" id="s-packs">${packChips(c.packs, true, 'sp')}</div></section>
      <section class="card"><h2>Rules</h2>
        <div class="grid4">
          <label class="fld">Rounds<input id="s-rounds" type="number" min="1" max="20" value="${c.rounds}"></label>
          <label class="fld">Winning score<input id="s-win" type="number" min="50" max="2000" step="10" value="${c.winScore}"></label>
          <label class="fld"><span><input id="s-dbl" type="checkbox" ${c.doubleOn ? 'checked' : ''}> Double points from round</span><input id="s-dblr" type="number" min="1" max="20" value="${c.doubleRound}"></label>
          <label class="fld"><span><input id="s-tri" type="checkbox" ${c.tripleOn ? 'checked' : ''}> Triple points from round</span><input id="s-trir" type="number" min="1" max="20" value="${c.tripleRound}"></label>
        </div></section>
      <section class="card"><h2>Screen and text</h2>
        <div class="grid2">
          <div class="fld"><span>Screen mode</span>
            <label class="radio"><input type="radio" name="s-mode" value="two" ${c.screenMode === 'two' ? 'checked' : ''}> <b>Two screens</b>: laptop for the host, TV for the board (best)</label>
            <label class="radio"><input type="radio" name="s-mode" value="single" ${c.screenMode === 'single' ? 'checked' : ''}> <b>One screen</b>: board fills the screen, hold H for the host panel</label>
          </div>
          <div class="fld"><span>Text size</span>${['normal', 'large', 'xl'].map((t) => `<label class="radio"><input type="radio" name="s-text" value="${t}" ${settings.textSize === t ? 'checked' : ''}> ${t === 'xl' ? 'Extra large' : titleCase(t)}</label>`).join('')}</div>
        </div></section>
      <div class="actions-bar">
        <span class="btn-row" style="margin:0"><button type="button" class="btn btn-ghost" id="s-print">Print host cards</button><button type="button" class="btn btn-ghost" id="s-extras">Print rules and score sheet</button></span>
        <button type="button" class="btn btn-gold btn-big" id="s-start">Start game</button>
      </div>
    </main>`;
  },
  bind(root) {
    const read = () => {
      const packs = $$('input[name=sp]:checked', root).map((i) => i.value);
      return {
        teams: [0, 1].map((i) => ({ name: $('#s-tn' + i).value.trim() || 'Team ' + (i + 1), color: ($(`input[name=s-tc${i}]:checked`) || {}).value || TEAM_COLORS[i].id })),
        packs,
        rounds: clamp(+$('#s-rounds').value || 5, 1, 20),
        winScore: clamp(+$('#s-win').value || 300, 50, 2000),
        doubleOn: $('#s-dbl').checked,
        doubleRound: clamp(+$('#s-dblr').value || 4, 1, 20),
        tripleOn: $('#s-tri').checked,
        tripleRound: clamp(+$('#s-trir').value || 5, 1, 20),
        screenMode: ($('input[name=s-mode]:checked') || {}).value || 'two',
      };
    };
    $('#s-start', root).addEventListener('click', () => {
      const cfg = read();
      if (!cfg.packs.length) { toast('Pick at least one question pack.', 'warn'); return; }
      if (cfg.teams[0].color === cfg.teams[1].color) { toast('Give each team its own color.', 'warn'); return; }
      settings.screenMode = cfg.screenMode;
      settings.textSize = ($('input[name=s-text]:checked') || {}).value || settings.textSize;
      saveSettings();
      Store.set('lastSetup', cfg);
      startGameWith(cfg);
    });
    $('#s-print', root).addEventListener('click', () => {
      const ids = $$('input[name=sp]:checked', root).map((i) => i.value);
      const rounds = [];
      ids.forEach((id) => { const p = getPack(id); if (p) rounds.push(...p.rounds); });
      printCards(rounds, ids.map((id) => (getPack(id) || {}).name).join(', '));
    });
    $$('input[name=s-text]', root).forEach((i) => i.addEventListener('change', () => { settings.textSize = i.value; saveSettings(); }));
    $('#s-extras', root).addEventListener('click', () => { const c = read(); printExtras(c.teams, c.rounds); });
  },
};

/* ---------- Settings ---------- */
Screens.settings = {
  html() {
    const s = settings;
    return `<main class="page">${pageTop('Settings', 'Changes save right away.', G ? 'game' : 'home')}
      <section class="card" id="sound-panel"><h2>Sound</h2>
        <div class="grid2">
          <label class="fld">Master volume <input id="st-vol" type="range" min="0" max="1" step="0.05" value="${s.sound.volume}"></label>
          <label class="toggle"><input id="st-mute" type="checkbox" ${s.sound.muted ? 'checked' : ''}><span>Mute all sounds</span></label>
        </div>
        <p class="hint">Turn any sound on or off. Click Test to hear it.</p>
        <div class="sound-list">${SOUND_LIST.map(([k, label]) => `
          <div class="sound-row"><label class="toggle"><input type="checkbox" data-snd="${k}" ${s.sound.on[k] !== false ? 'checked' : ''}><span>${label}</span></label>
          <button type="button" class="btn btn-ghost btn-sm" data-test="${k}">Test</button></div>`).join('')}</div>
      </section>
      <section class="card"><h2>Display</h2>
        <div class="grid2">
          <div class="fld"><span>Text size</span>${['normal', 'large', 'xl'].map((t) => `<label class="radio"><input type="radio" name="st-text" value="${t}" ${s.textSize === t ? 'checked' : ''}> ${t === 'xl' ? 'Extra large' : titleCase(t)}</label>`).join('')}</div>
          <div class="fld"><span>Options</span>
            <label class="toggle"><input id="st-hc" type="checkbox" ${s.highContrast ? 'checked' : ''}><span>High contrast</span></label>
            <label class="toggle"><input id="st-rm" type="checkbox" ${s.reducedMotion ? 'checked' : ''}><span>Reduce motion (no flips or confetti)</span></label>
            <label class="toggle"><input id="st-q" type="checkbox" ${s.showQuestion ? 'checked' : ''}><span>Show the question on the TV (great for noisy rooms)</span></label>
            <label class="toggle"><input id="st-say" type="checkbox" ${s.hostScript !== false ? 'checked' : ''}><span>Show host script lines (what to say next)</span></label>
          </div>
        </div>
        <div class="fld"><span>Screen mode for new games</span>
          <label class="radio"><input type="radio" name="st-mode" value="two" ${s.screenMode === 'two' ? 'checked' : ''}> Two screens (laptop + TV)</label>
          <label class="radio"><input type="radio" name="st-mode" value="single" ${s.screenMode === 'single' ? 'checked' : ''}> One screen</label>
        </div>
      </section>
      <section class="card"><h2>Buzzers</h2>
        <p class="hint">Cheap USB buzzers type a key when pressed. Click Change, then press the buzzer.</p>
        <div class="grid2">${[1, 2].map((n) => `<div class="keyset"><span>Team ${n} buzzer</span><kbd id="st-k${n}">${esc(keyLabel(s.keys['team' + n]))}</kbd><button type="button" class="btn btn-sm" data-key="${n}">Change</button></div>`).join('')}</div>
      </section>
      <section class="card"><h2>Lightning Round</h2>
        <div class="grid4">
          <label class="fld">Player 1 seconds<input id="st-lt1" type="number" min="5" max="120" value="${s.lightningTimes[0]}"></label>
          <label class="fld">Player 2 seconds<input id="st-lt2" type="number" min="5" max="120" value="${s.lightningTimes[1]}"></label>
          <label class="fld">Points to win<input id="st-ltg" type="number" min="50" max="500" value="${s.lightningTarget}"></label>
        </div>
      </section>
      <section class="card"><h2>Fresh questions</h2><p class="hint">We remember which questions you've played, so repeat players get new boards first. You've played ${plural(playedList().length, 'question')} so far.</p><button type="button" class="btn btn-sm" id="st-played">Make every question fresh again</button></section>
      <section class="card"><h2>Keyboard shortcuts</h2>${shortcutsTable()}</section>
      <section class="card"><h2>Backup</h2>
        <p class="hint">Save your custom packs, surveys and settings to a file. Use it to move to another computer.</p>
        <div class="btn-row"><button type="button" class="btn" id="st-export">Export backup</button><button type="button" class="btn" id="st-import">Import backup</button><button type="button" class="btn btn-red" id="st-reset">Reset everything</button></div>
      </section>
    </main>`;
  },
  bind(root) {
    const on = (sel, ev, fn) => { const n = $(sel, root); if (n) n.addEventListener(ev, fn); };
    on('#st-vol', 'input', (e) => { settings.sound.volume = +e.target.value; Sound.setVolume(); saveSettings(); });
    on('#st-vol', 'change', () => Sound.play('reveal', true));
    on('#st-mute', 'change', (e) => { settings.sound.muted = e.target.checked; Sound.setVolume(); saveSettings(); });
    $$('[data-snd]', root).forEach((c) => c.addEventListener('change', () => { settings.sound.on[c.dataset.snd] = c.checked; saveSettings(); }));
    $$('[data-test]', root).forEach((b) => b.addEventListener('click', () => Sound.play(b.dataset.test, true)));
    $$('input[name=st-text]', root).forEach((i) => i.addEventListener('change', () => { settings.textSize = i.value; saveSettings(); }));
    $$('input[name=st-mode]', root).forEach((i) => i.addEventListener('change', () => { settings.screenMode = i.value; saveSettings(); }));
    on('#st-hc', 'change', (e) => { settings.highContrast = e.target.checked; saveSettings(); });
    on('#st-rm', 'change', (e) => { settings.reducedMotion = e.target.checked; saveSettings(); });
    on('#st-q', 'change', (e) => { settings.showQuestion = e.target.checked; saveSettings(); });
    on('#st-say', 'change', (e) => { settings.hostScript = e.target.checked; saveSettings(); });
    on('#st-played', 'click', () => { Store.del('played'); toast('Every question is fresh again.'); go('settings'); });
    const saveL = () => {
      settings.lightningTimes = [clamp(+$('#st-lt1').value || 20, 5, 120), clamp(+$('#st-lt2').value || 25, 5, 120)];
      settings.lightningTarget = clamp(+$('#st-ltg').value || 200, 50, 500);
      saveSettings();
    };
    ['#st-lt1', '#st-lt2', '#st-ltg'].forEach((s) => on(s, 'change', saveL));
    $$('[data-key]', root).forEach((b) => b.addEventListener('click', () => {
      if (keyHooks.length) return;
      const n = b.dataset.key;
      const k = $('#st-k' + n);
      k.textContent = 'Press the buzzer now...';
      k.classList.add('listening');
      const hook = (e) => {
        const otherKey = settings.keys['team' + (n === '1' ? 2 : 1)];
        if (e.code === otherKey) { toast('That key is already Team ' + (n === '1' ? 2 : 1) + "'s buzzer. Try another.", 'warn'); return true; }
        if (e.code === 'Escape') { k.textContent = keyLabel(settings.keys['team' + n]); } else {
          settings.keys['team' + n] = e.code;
          saveSettings();
          k.textContent = keyLabel(e.code);
          toast('Team ' + n + ' buzzer set to ' + keyLabel(e.code) + '.');
        }
        k.classList.remove('listening');
        keyHooks.splice(keyHooks.indexOf(hook), 1);
        return true;
      };
      keyHooks.push(hook);
    }));
    on('#st-export', 'click', exportBackup);
    on('#st-import', 'click', importBackup);
    on('#st-reset', 'click', async () => {
      if (!(await confirmBox('Reset everything?', 'This deletes your custom packs, surveys, settings and saved game from this browser. Export a backup first if you want to keep them.', 'Delete and reset', true))) return;
      ['settings', 'packs', 'crowd', 'live', 'liveHist', 'lastSetup', 'tipSeen', 'usedLightning', 'sync'].forEach((k) => Store.del(k));
      settings = deepCopy(DEFAULT_SETTINGS);
      settings.toured = true;
      saveSettings();
      G = null;
      HIST = [];
      Sync.push();
      toast('Everything was reset.');
      go('home');
    });
  },
};
function shortcutsTable() {
  const rows = [
    ['1 to 8', 'Reveal that answer'], ['X', 'Strike (or "not on the board" in a face-off)'], ['U', 'Undo the last action'],
    ['N', 'Next round'], ['M', 'Mute or unmute all sounds'], ['R', 'Show the rest of the answers'], ['B', 'Open the TV board'], ['H (hold)', 'Show the host panel in one-screen mode'],
    ['F', 'Full screen'], [keyLabel(settings.keys.team1) + ' / ' + keyLabel(settings.keys.team2), 'Team 1 / Team 2 buzzers'], ['Space', 'Next reveal in the Lightning Round'],
  ];
  return `<table class="kbd-table"><tbody>${rows.map(([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
}
function exportBackup() {
  const data = { app: 'friendly-feud', version: APP_VERSION, exportedAt: new Date().toISOString(), settings, packs: customPacks(), crowd: Store.get('crowd', []), lastSetup: Store.get('lastSetup', null) };
  if (download(fileSlug(BRAND_NAME) + '-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2))) toast('Backup saved to your Downloads folder.');
}
async function importBackup() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let data;
  try { data = JSON.parse(f.text); } catch (e) { toast('That file is not a backup file.', 'bad'); return; }
  if (data && Array.isArray(data.rounds)) {
    try { const p = validatePack(data); upsertCustomPack(p); toast('Imported the pack "' + p.name + '".'); } catch (e) { toast(e.message, 'bad'); }
    return;
  }
  if (!data || data.app !== 'friendly-feud') { toast('That file is not a ' + BRAND_NAME + ' backup.', 'bad'); return; }
  let packs = 0;
  (Array.isArray(data.packs) ? data.packs : []).forEach((p) => {
    try {
      const v = validatePack(p);
      if (BUILTIN_PACKS.some((b) => b.id === v.id)) v.id = uid('pack');
      upsertCustomPack(v);
      packs++;
    } catch (e) { /* skip bad pack */ }
  });
  if (Array.isArray(data.crowd)) {
    const cur = Store.get('crowd', []);
    data.crowd.forEach((c) => { if (isObj(c) && c.id && Array.isArray(c.questions)) { c = fixCrowd(Object.assign({}, c, { id: String(c.id).replace(/[^\w-]/g, '').slice(0, 60) || uid('crowd') })); const i = cur.findIndex((x) => x.id === c.id); if (i >= 0) cur[i] = c; else cur.push(c); } });
    Store.set('crowd', cur);
  }
  if (isObj(data.settings)) { settings = sanitizeSettings(data.settings); saveSettings(); }
  if (isObj(data.lastSetup)) Store.set('lastSetup', sanitizeSetup(data.lastSetup));
  toast('Backup imported: ' + plural(packs, 'pack') + ', ' + plural((data.crowd || []).length, 'survey') + '.');
  if (SCREEN === 'settings') go('settings');
}

/* ---------- Help ---------- */
Screens.help = {
  html() {
    return `<main class="page help">${pageTop('Help', 'Everything you need, in plain English.')}
      <nav class="toc card" aria-label="Help topics"><a href="#h-play">How to play</a><a href="#h-two">Two screens</a><a href="#h-one">One screen</a><a href="#h-light">Lightning Round</a><a href="#h-zoom">Video calls</a><a href="#h-print">Printables</a><a href="#h-crowd">Your Crowd</a><a href="#h-keys">Shortcuts</a><a href="#h-faq">Questions</a><a href="#h-about">About</a></nav>
      <section class="card" id="h-play"><h2>How to play</h2>
        <ol>
          <li><b>Face-off.</b> One player from each team steps up. You read the question. First to buzz answers. The top answer wins right away. If not, the other player tries to beat it.</li>
          <li><b>Play or pass.</b> The face-off winner picks: play the board, or pass it to the other team.</li>
          <li><b>Guess.</b> The team in control takes turns guessing. Right answers flip over and their points go into the round pot. Wrong answers get a strike.</li>
          <li><b>Three strikes.</b> The other team gets one guess to steal the whole pot. Right means they take it. Wrong means the playing team keeps it.</li>
          <li><b>Win.</b> Clear the board and the pot is yours. Rounds 4 and 5 are worth double and triple. First to 300 points wins.</li>
          <li><b>Lightning Round.</b> Two players from the winning team answer five quick questions each. Get 200 points together to win.</li>
        </ol>
        <p>Made a mistake? Press <kbd>U</kbd> to undo. You can undo every host action.</p></section>
      <section class="card" id="h-two"><h2>Two screens: laptop and TV</h2>
        <ol><li>Plug your laptop into your TV with an HDMI cable, or cast or AirPlay the screen.</li>
          <li>Set your laptop to <b>extend</b> the display, not mirror it. On Windows press <kbd>Windows</kbd>+<kbd>P</kbd> and choose Extend. On a Mac open System Settings, Displays, and turn off mirroring.</li>
          <li>Start a game. The TV board opens in a new window. Drag that window onto your TV.</li>
          <li>Click the TV board window and press <kbd>F</kbd> for full screen.</li>
          <li>Your laptop keeps the answers. The room only sees the board.</li></ol>
        <p class="hint">Closed the TV window by accident? Click <b>Reopen</b> at the top of the host screen. The game picks up right where it was.</p></section>
      <section class="card" id="h-one"><h2>One screen</h2>
        <p>No second screen? Choose One screen in Custom Game. The board fills the screen. Hold <kbd>H</kbd> to slide in the host panel, and let go to hide it. We suggest printing host cards so you can see the answers without peeking. Use Host cards on the game screen or Edit Questions.</p></section>
      <section class="card" id="h-light"><h2>Lightning Round</h2>
        <p>Player 2 leaves the room. Player 1 gets 20 seconds for five questions. Tap the matching answer or type what they said. Then reveal each answer and its points. Player 2 comes back and gets 25 seconds. If they repeat an answer, you'll hear a buzz and they try again. Reach 200 points together to win. You can change the times and goal in Settings.</p></section>
      <section class="card" id="h-zoom"><h2>Playing over Zoom, Teams or Google Meet</h2>
        <p>Start a game in two-screen mode. In your video call, choose <b>Share screen</b> and pick the <b>TV board window</b> only. Turn on "Share sound" (or "Share computer audio") so guests hear the effects. Your answers stay private on your host desk. Players unmute to answer, or type in the chat.</p></section>
      <section class="card" id="h-print"><h2>Printables</h2>
        <p>Everything prints on US Letter paper.</p>
        <ul><li><b>Host cards</b> list every answer, its points and other ways to say it. Use them in one-screen mode so you never peek at the board.</li><li><b>Rules card and score sheet</b> for the table, handy for classrooms and big groups.</li></ul>
        <div class="btn-row"><button type="button" class="btn btn-sm" id="h-printx">Print rules and score sheet</button></div></section>
      <section class="card" id="h-crowd"><h2>Your Crowd</h2>
        <p>Send your questions to your guests by text before the party. Paste their replies back in. ${esc(BRAND_NAME)} groups matching answers and builds the board from your guests' real answers. Late replies? Paste them in any time and the board updates.</p></section>
      <section class="card" id="h-keys"><h2>Keyboard shortcuts</h2>${shortcutsTable()}</section>
      <section class="card" id="h-faq"><h2>Questions</h2>
        <dl class="faq">
          <dt>Do I need the internet?</dt><dd>No. Everything is inside this one file. It works with no internet at all.</dd>
          <dt>The TV window did not open.</dt><dd>Your browser blocked the pop-up. Click the blocked pop-up icon in the address bar, choose Always allow, then click Open TV board again.</dd>
          <dt>How do I turn off a sound?</dt><dd>During a game, click <b>Sound on</b> at the top of the host screen, or press <kbd>M</kbd>, to mute everything. To turn off just one sound (like the answer ding), go to Settings, Sound.</dd>
          <dt>Where are my changes saved?</dt><dd>In this browser on this computer. Use Export backup in Settings to move them to another computer.</dd>
          <dt>Can I use an iPad or phone?</dt><dd>Use a laptop or desktop computer (Windows, Mac or Chromebook). Phones and iPads are not supported.</dd>
          <dt>A guest gave an answer that's close. Do I count it?</dt><dd>Each answer shows what else to accept. You can also type the guess into Check a guess. You're the host, so your call is final.</dd>
          <dt>Are the answers from a real survey?</dt><dd>The built-in packs are our best estimates of the most popular answers from American adults. For real survey answers, use Your Crowd.</dd>
          <dt>The page refreshed in the middle of a game.</dt><dd>No problem. Open the file again and choose Pick up where you left off.</dd>
        </dl></section>
      <section class="card" id="h-about"><h2>About</h2>
        <p><b>${esc(BRAND_NAME)}</b> version ${APP_VERSION}.</p>
        <p>An independent party game. Not affiliated with any TV show.</p>
        <p class="hint">No accounts, no tracking, no internet connection. Your data stays on your computer.</p>
        <button type="button" class="btn btn-sm" id="h-tour">Show the welcome tour again</button></section>
    </main>`;
  },
  bind(root) {
    $$('.toc a', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const t = $(a.getAttribute('href')); if (t) t.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }));
    $('#h-printx', root).addEventListener('click', () => { const ls = Store.get('lastSetup', {}) || {}; printExtras(ls.teams, ls.rounds); });
    $('#h-tour', root).addEventListener('click', () => { settings.toured = false; saveSettings(); go('home'); });
  },
};

/* ---------- Setup Check wizard ---------- */
let onBoardStatus = null;
Screens.check = {
  html() {
    return `<main class="page check">${pageTop('Setup Check', 'Five quick checks. About a minute.')}
      <ol class="steps" id="ck-steps">${['TV board', 'Sound', 'Full screen', 'Buzzers', 'Ready'].map((s, i) => `<li data-s="${i}"><span>${i + 1}</span>${s}</li>`).join('')}</ol>
      <section class="card ck-body" id="ck-body" aria-live="polite"></section>
    </main>`;
  },
  bind() {
    const res = { board: null, sound: null, full: null, buzz: null };
    let step = 0;
    const body = $('#ck-body');
    const mark = () => $$('#ck-steps li').forEach((li) => { const s = +li.dataset.s; li.classList.toggle('cur', s === step); li.classList.toggle('done', s < step); });
    const show = () => {
      mark();
      keyHooks.length = 0;
      onBoardStatus = null;
      if (step === 0) {
        body.innerHTML = `<h2>Can you see the board on your TV?</h2>
          <p>Click Open TV board. Drag the new window onto your TV.</p>
          <div class="btn-row"><button type="button" class="btn btn-gold btn-big" id="ck-open">Open TV board</button></div>
          <div class="btn-row"><button type="button" class="btn" data-ans="yes">Yes, I see it</button><button type="button" class="btn btn-ghost" data-ans="no">Not yet</button><button type="button" class="btn btn-ghost" data-ans="one">I'm using one screen</button></div>
          <div id="ck-tip"></div>`;
        $('#ck-open').addEventListener('click', () => Sync.open());
        body.addEventListener('click', function h(e) {
          const b = e.target.closest('[data-ans]');
          if (!b) return;
          body.removeEventListener('click', h);
          if (b.dataset.ans === 'no') {
            body.addEventListener('click', h);
            $('#ck-tip').innerHTML = '<div class="note">Check that your laptop is set to <b>extend</b> the display (Windows: press Windows+P, choose Extend. Mac: System Settings, Displays, turn off mirroring). If no window opened, allow pop-ups for this file and try again.</div>';
            return;
          }
          res.board = b.dataset.ans === 'one' ? 'one' : true;
          if (b.dataset.ans === 'one') { settings.screenMode = 'single'; saveSettings(); }
          step = 1; show();
        });
      } else if (step === 1) {
        body.innerHTML = `<h2>Can you hear the sound?</h2>
          <p>Click Play test sound. Turn up the TV or laptop until it sounds right.</p>
          <div class="btn-row"><button type="button" class="btn btn-gold btn-big" id="ck-play">Play test sound</button></div>
          <label class="fld">Volume <input id="ck-vol" type="range" min="0" max="1" step="0.05" value="${settings.sound.volume}"></label>
          <div class="btn-row"><button type="button" class="btn" id="ck-heard">Yes, I heard it</button><button type="button" class="btn btn-ghost" id="ck-noheard">No sound</button></div><div id="ck-tip"></div>`;
        $('#ck-play').addEventListener('click', () => { if (settings.sound.muted) { settings.sound.muted = false; saveSettings(); } Sound.play('award', true); });
        $('#ck-vol').addEventListener('input', (e) => { settings.sound.volume = +e.target.value; Sound.setVolume(); saveSettings(); });
        $('#ck-heard').addEventListener('click', () => { res.sound = true; step = 2; show(); });
        $('#ck-noheard').addEventListener('click', () => { $('#ck-tip').innerHTML = '<div class="note">Check the volume on your TV and laptop. With HDMI, the sound may come from the TV. On Windows, click the speaker icon and pick your TV. On a Mac, choose your TV in Sound settings. <button type="button" class="btn btn-ghost btn-sm" id="ck-skip">Skip for now</button></div>'; $('#ck-skip').addEventListener('click', () => { res.sound = false; step = 2; show(); }); });
      } else if (step === 2) {
        const one = res.board === 'one';
        body.innerHTML = `<h2>Make it full screen</h2>
          <p>${one ? 'Press F now to make this page full screen.' : 'Click the TV board window, then press F.'}</p>
          <p class="status" id="ck-fs">${one ? '' : 'Waiting for the TV board...'}</p>
          <div class="btn-row"><button type="button" class="btn" id="ck-fsok">It's full screen</button><button type="button" class="btn btn-ghost" id="ck-fsskip">Skip</button></div>`;
        const st = $('#ck-fs');
        const upd = (d) => { if (d && d.fullscreen) { st.innerHTML = '<span class="ok">' + ICON.check + ' The TV board is full screen.</span>'; res.full = true; } else if (d) st.textContent = 'The TV board is not full screen yet. Click it, then press F.'; };
        if (!one) { onBoardStatus = upd; upd(Sync.lastStatus && Sync.lastStatus.type ? Sync.lastStatus : null); }
        keyHooks.push((e) => { if (e.code === 'KeyF' && one && !e.fromBoard) { toggleFullscreen(); return true; } return false; });
        $('#ck-fsok').addEventListener('click', () => { res.full = true; step = 3; show(); });
        $('#ck-fsskip').addEventListener('click', () => { step = 3; show(); });
      } else if (step === 3) {
        let stage = 1;
        const got = {};
        body.innerHTML = `<h2>Test the buzzers</h2><p id="ck-bz-p">Press team 1's buzzer now.</p>
          <div class="buzz-test"><div class="bz" id="bz1"><b>Team 1</b><span>${esc(keyLabel(settings.keys.team1))}</span></div><div class="bz" id="bz2"><b>Team 2</b><span>${esc(keyLabel(settings.keys.team2))}</span></div></div>
          <p class="hint">No buzzers? The keyboard works: ${esc(keyLabel(settings.keys.team1))} and ${esc(keyLabel(settings.keys.team2))}. You can also click the team buttons on the host screen. Wrong key? <button type="button" class="btn btn-ghost btn-sm" id="ck-learn">Use the next key I press for team 1</button></p>
          <div class="btn-row"><button type="button" class="btn btn-ghost" id="ck-bzskip">Skip, we'll use the host buttons</button></div>`;
        let learn = false;
        $('#ck-learn').addEventListener('click', () => { learn = true; stage = 1; $('#ck-bz-p').textContent = "Press team 1's buzzer now. We'll remember it."; });
        keyHooks.push((e) => {
          const code = e.code;
          if (learn && stage <= 2) {
            if (stage === 2 && code === settings.keys.team1) { toast("That's Team 1's key. Press a different one for Team 2.", 'warn'); return true; }
            settings.keys['team' + stage] = code;
            saveSettings();
            $('#bz' + stage + ' span').textContent = keyLabel(code);
          }
          if (code === settings.keys.team1 && stage === 1) { got[1] = true; $('#bz1').classList.add('on'); Sound.play('buzz', true); stage = 2; $('#ck-bz-p').textContent = "Got it! Now press team 2's buzzer."; return true; }
          if (code === settings.keys.team2 && stage === 2) {
            got[2] = true; $('#bz2').classList.add('on'); Sound.play('buzz', true);
            res.buzz = true; learn = false; stage = 3; $('#ck-bz-p').textContent = 'Both buzzers work!';
            setTimeout(() => { if (SCREEN === 'check' && step === 3) { step = 4; show(); } }, 900);
            return true;
          }
          return false;
        });
        $('#ck-bzskip').addEventListener('click', () => { step = 4; show(); });
      } else {
        const item = (ok, yes, no) => `<li class="${ok ? 'ok' : 'skip'}">${ok ? ICON.check : '<span class="dash">-</span>'} ${ok ? yes : no}</li>`;
        body.innerHTML = `<div class="ready"><h2>You're ready for game night!</h2>
          <ul class="ready-list">
            ${item(res.board, res.board === 'one' ? 'One-screen mode is on' : 'TV board is showing', 'TV board not checked')}
            ${item(res.sound, 'Sound is working', 'Sound not checked')}
            ${item(res.full, 'Full screen is set', 'Full screen not checked')}
            ${item(res.buzz, 'Buzzers work', 'Using host buttons for buzzers')}
          </ul>
          <div class="btn-row"><button type="button" class="btn btn-gold btn-big" id="ck-qp">Quick Play</button><button type="button" class="btn btn-ghost" data-go="home">Home</button></div></div>`;
        $('#ck-qp').addEventListener('click', () => { go('home'); quickPlay(); });
      }
    };
    show();
  },
};

/* ---------- First-run tour ---------- */
function runTour() {
  const steps = [
    ['#qp', 'Start here', 'Quick Play starts a ready-made game in two clicks.'],
    ['#m-crowd', 'Make it personal', 'Your Crowd turns your guests\' real answers into the board.'],
    ['#m-check', 'Before guests arrive', 'Setup Check tests your TV, sound and buzzers in about a minute.'],
    ['#m-help', 'Need a hand?', 'Help explains the rules and answers common questions.'],
  ];
  let i = 0;
  const wrap = document.createElement('div');
  wrap.className = 'tour';
  wrap.innerHTML = '<div class="tour-hole"></div><div class="tour-tip" role="dialog" aria-modal="true" aria-labelledby="tour-t"><h3 id="tour-t"></h3><p></p><div class="btn-row"><button type="button" class="btn btn-ghost btn-sm" data-t="skip">Skip tour</button><button type="button" class="btn btn-gold btn-sm" data-t="next">Next</button></div></div>';
  document.body.appendChild(wrap);
  const end = () => { wrap.remove(); window.removeEventListener('resize', place); settings.toured = true; saveSettings(); };
  const place = () => {
    const [sel, t, p] = steps[i];
    const el = $(sel);
    if (!el) { end(); return; }
    const r = el.getBoundingClientRect();
    const hole = $('.tour-hole', wrap);
    Object.assign(hole.style, { left: r.left - 8 + 'px', top: r.top - 8 + 'px', width: r.width + 16 + 'px', height: r.height + 16 + 'px' });
    const tip = $('.tour-tip', wrap);
    $('h3', tip).textContent = t;
    $('p', tip).textContent = p;
    $('[data-t=next]', tip).textContent = i === steps.length - 1 ? 'Let\'s play' : 'Next';
    const below = r.bottom + 230 < innerHeight;
    tip.style.top = (below ? r.bottom + 18 : Math.max(12, r.top - 200)) + 'px';
    tip.style.left = clamp(r.left + r.width / 2 - 170, 12, innerWidth - 352) + 'px';
    $('[data-t=next]', tip).focus();
  };
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    if (b.dataset.t === 'skip') end(); else if (++i >= steps.length) end(); else place();
  });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') end(); });
  window.addEventListener('resize', place);
  place();
}
