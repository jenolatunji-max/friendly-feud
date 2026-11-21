/* End-to-end tests against dist/index.html over file://
   Usage: node tests/run.js [chromium|firefox|webkit ...] [--shots] */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const pw = require('playwright');

const ROOT = path.join(__dirname, '..');
const FILE = 'file://' + path.join(ROOT, 'dist', 'index.html');
const SHOTS = path.join(ROOT, 'screenshots');
const args = process.argv.slice(2);
const wantShots = args.includes('--shots');
const browsers = args.filter((a) => !a.startsWith('--'));
const ENGINES = browsers.length ? browsers : ['chromium', 'firefox', 'webkit'];

const CHAT = `[11/20/2026, 9:01 PM] Jenny: Hi everyone! We're playing Friendly Feud at Ashley's party, and we need your answers for the board.
[11/20/2026, 9:03 PM] Ashley: 1. Wine 2. Paris 3. Dancing
[11/20/2026, 9:04 PM] Megan: 1. wine!!
2. Hawaii
3. Dancing
[11/20/2026, 9:05 PM] Priya: 1) Champagne 2) Hawaii 3) Karaoke
Brooke: 1. Glass of wine 2. Paris 3. dance
Taylor: Q1: Champagne Q2: Mexico Q3: Karaoke
Sam: 1 - Wines 2 - Cancun 3 - Singing
Lauren: lol I'll answer later`;
const LATE = `Lauren: 1. Coffee 2. Paris 3. Dancing
Kayla: 1. Wine 2. Hawaii 3. Karaoke`;
const FORM_CSV = `Timestamp,Your name,Name something the bride always says,Name a place the couple might go on their honeymoon,Name something you need at a bachelorette
11/20/2026 9:00:00,Rachel,"Oh my gosh",Paris,Sash
11/20/2026 9:01:00,Olivia,Love you,Hawaii,Tiara
11/20/2026 9:02:00,Emma,"Oh my gosh!",Hawaii,Sash
11/20/2026 9:03:00,Mia,"Literally",Bali,Champagne`;

let failures = 0;
const log = (...a) => console.log(...a);
function check(cond, msg) {
  if (cond) log('   ok  ' + msg); else { failures++; log('  FAIL ' + msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  if (!wantShots) return;
  await sleep(1100);
  const vp = page.viewportSize();
  await page.screenshot({ path: path.join(SHOTS, `${name}-${vp.width}x${vp.height}.png`) });
}

async function runEngine(name) {
  log(`\n=== ${name} ===`);
  const errors = [];
  const external = [];
  const browser = await pw[name].launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  context.on('request', (req) => {
    const u = req.url();
    if (!/^(file|data|blob|about):/.test(u)) external.push(u);
  });
  const watch = (p, label) => {
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  };
  context.on('page', (p) => watch(p, 'popup'));
  const page = await context.newPage();
  watch(page, 'host');
  await page.goto(FILE);
  await page.waitForSelector('#qp');
  check(await page.title() === 'Friendly Feud', 'title is the brand name');

  // Tour shows on first run
  await page.waitForSelector('.tour-tip', { timeout: 3000 });
  check(true, 'first-run tour appears');
  await shot(page, '01-home-tour');
  await page.click('.tour-tip [data-t=skip]');
  await shot(page, '02-home');

  // Quick Play: two clicks, TV board opens
  await page.click('#qp');
  await page.waitForSelector('.modal');
  await shot(page, '03-quickplay');
  await page.click('input[name=qp][value=family-game-night]');
  const [board] = await Promise.all([context.waitForEvent('page'), page.click('.modal-actions .btn-gold')]);
  await board.waitForLoadState('domcontentloaded');
  await board.waitForSelector('.bd-grid .tile');
  await page.waitForSelector('#desk');
  check(true, 'Quick Play started a game and opened the TV board');
  await board.setViewportSize({ width: 1920, height: 1080 });
  await sleep(600);
  const conn = await page.textContent('#d-conn');
  check(/connected/i.test(conn) && !/disconnected/i.test(conn), 'host shows TV board connected');
  const q1 = await page.evaluate(() => window.__ff.G.round.q);
  const bq = await board.textContent('.bd-q');
  check(q1 === bq, 'board shows the same question as the host');
  await shot(page, '04-host-faceoff');
  await shot(board, '05-board-faceoff');

  // Face-off: team 1 buzzes with Left Shift, gives answer #3, team 2 misses -> team 1 wins
  await page.keyboard.press('ShiftLeft');
  await sleep(100);
  let st = await page.evaluate(() => window.__ff.G.round.fo);
  check(st.first === 0 && st.step === 'first', 'Left Shift buzzes team 1');
  await page.click('[data-rev="2"]');
  await page.keyboard.press('x');
  st = await page.evaluate(() => window.__ff.G.round.fo);
  check(st.step === 'playpass' && st.winner === 0, 'higher answer wins the face-off');
  await page.click('[data-act=play]');
  check(await page.evaluate(() => window.__ff.G.phase) === 'play', 'team 1 plays');
  // Reveal #1 with key 1 and check the board flipped it
  await page.keyboard.press('1');
  await sleep(300);
  check(await board.$eval('.tile[data-i="0"]', (t) => t.classList.contains('revealed')), 'board flips the revealed tile');
  check(!(await board.$eval('.bd-hint', (h) => h.classList.contains('show'))), 'TV tip hides after the first reveal');
  check(/^Playing: /.test(await board.textContent('.bd-banner')), 'banner wording works for any team name (Playing: ...)');
  check(await board.$$eval('.tile-back .ans', (ns) => ns.every((n) => n.scrollWidth <= n.clientWidth + 1 && n.scrollHeight <= n.clientHeight + 1)), 'no answer is cut off on the board');
  // Duplicate guard
  await page.keyboard.press('1');
  check(await page.$eval('#toasts', (t) => /already on the board/i.test(t.textContent)), 'duplicate answer warning');
  await shot(page, '06-host-play');
  await shot(board, '07-board-play');
  // Three strikes -> steal
  await page.keyboard.press('x');
  await page.waitForTimeout(150);
  check(await board.$eval('.bd-strikes', (s) => s.classList.contains('show') && s.children.length === 1), 'board shows one big X');
  await page.keyboard.press('x');
  await page.keyboard.press('x');
  await sleep(200);
  check(await board.$eval('.bd-strikes', (s) => s.children.length === 3), 'board shows three X marks');
  await shot(board, '08-board-strikes');
  check(await page.evaluate(() => window.__ff.G.phase) === 'steal', 'three strikes hands over the steal');
  await shot(page, '09-host-steal');
  const pot = await page.evaluate(() => window.__ff.G.round.pot + window.__ff.G.round.answers[1].points);
  // Steal succeeds with answer #2
  await page.click('[data-rev="1"]');
  st = await page.evaluate(() => ({ s: window.__ff.G.teams[1].score, ph: window.__ff.G.phase }));
  check(st.ph === 'roundEnd' && st.s === pot, `steal awards the whole pot (${pot}) to team 2`);
  await sleep(300);
  check((await board.textContent('.bd-t1 .bd-tscore')) === String(pot), 'board shows team 2 score');
  // Undo the steal, then fail it instead
  await page.keyboard.press('u');
  st = await page.evaluate(() => ({ s: window.__ff.G.teams[1].score, ph: window.__ff.G.phase }));
  check(st.ph === 'steal' && st.s === 0, 'undo reverts the steal');
  await page.keyboard.press('x');
  st = await page.evaluate(() => ({ a: window.__ff.G.teams[0].score, ph: window.__ff.G.phase }));
  check(st.ph === 'roundEnd' && st.a > 0, 'failed steal gives the pot to the playing team');
  await page.click('[data-act=rest]');
  check(await page.evaluate(() => window.__ff.G.round.revealed.every(Boolean)), 'show the rest reveals every answer');
  await shot(board, '10-board-roundend');
  await shot(page, '11-host-roundend');

  // Rounds 2 to 5: clear the board each time
  for (let r = 2; r <= 5; r++) {
    if (await page.evaluate(() => window.__ff.G.teams.some((t) => t.score >= 300))) break;
    await page.keyboard.press('n');
    await page.evaluate(() => { window.__ff.Actions.buzz(1); });
    await page.keyboard.press('1');
    await page.click('[data-act=play]');
    const n = await page.evaluate(() => window.__ff.G.round.answers.length);
    for (let i = 2; i <= n; i++) await page.keyboard.press(String(i));
    if (r === 4) {
      check(await page.evaluate(() => window.__ff.G.round.mult) === 2, 'round 4 is double points');
      await sleep(200);
      check(/double/i.test(await board.textContent('.bd-mult')), 'board shows Double points!');
    }
  }
  const sc = await page.evaluate(() => window.__ff.G.teams.map((t) => t.score));
  check(Math.max(...sc) >= 300, 'a team crossed the winning score: ' + sc.join(' to '));
  // Answer timer shows on the TV and counts down
  await page.click('[data-act=clock][data-s="5"]');
  await sleep(1300);
  const clk = await board.$eval('.bd-clock', (c) => [c.classList.contains('on'), c.textContent.trim()]);
  check(clk[0] && +clk[1] <= 4 && +clk[1] >= 3, 'answer timer counts down on the TV (' + clk[1] + ')');
  await page.click('[data-act=clockstop]');
  // A key sent from the TV window must not act behind an open dialog
  await page.click('[data-act=end]');
  await page.waitForSelector('.modal');
  const before = await page.evaluate(() => JSON.stringify(window.__ff.G.teams));
  await board.keyboard.press('n');
  await sleep(200);
  check(await page.evaluate((b) => JSON.stringify(window.__ff.G.teams) === b && window.__ff.G.phase !== 'gameOver', before), 'TV-window keys are ignored while a dialog is open');
  await page.click('.modal-actions .btn-ghost');

  // One-click mute on the host screen
  await page.keyboard.press('m');
  const muted = await page.evaluate(() => JSON.parse(localStorage.getItem('ff.settings')).sound.muted);
  check(muted && /muted/i.test(await page.textContent('#d-mute')), 'M mutes all sounds from the host screen');
  await page.click('#d-mute');
  check(!(await page.evaluate(() => JSON.parse(localStorage.getItem('ff.settings')).sound.muted)), 'mute button turns sound back on');

  // Score adjust
  await page.click('[data-act=adj][data-team="0"][data-d="10"]');
  check((await page.evaluate(() => window.__ff.G.teams[0].score)) === sc[0] + 10, 'manual score adjust');
  await page.keyboard.press('n');
  await sleep(400);
  check(await page.evaluate(() => window.__ff.G.phase) === 'gameOver', 'game ends at the winning score');
  check(await board.$eval('.bd-win', (w) => w.classList.contains('show')), 'board shows the winner screen');
  await shot(board, '12-board-winner');
  await shot(page, '13-host-winner');

  // Lightning Round
  await page.click('[data-act=lightning]');
  await sleep(200);
  check(await board.$eval('.bd-lr', (w) => w.classList.contains('show')), 'board shows the Lightning Round');
  await shot(board, '14-board-lightning-ready');
  await page.click('[data-act=l-start]');
  await sleep(300);
  check(await page.evaluate(() => window.__ff.G.lightning.running), 'Lightning timer runs');
  await page.click('[data-lans="0"]');
  await page.fill('#l-input', await page.evaluate(() => window.__ff.G.lightning.qs[1].answers[1].text));
  await page.press('#l-input', 'Enter');
  await page.click('[data-act=l-nomatch]');
  await page.keyboard.press('2');
  await page.fill('#l-input', 'zzzz qqq');
  await page.press('#l-input', 'Enter');
  let l = await page.evaluate(() => window.__ff.G.lightning);
  check(l.stage === 'reveal' && l.ans[0].every(Boolean), 'player 1 answered all five');
  await shot(page, '15-host-lightning-reveal');
  for (let i = 0; i < 10; i++) await page.keyboard.press('Space');
  l = await page.evaluate(() => window.__ff.G.lightning);
  check(l.stage === 'between', 'player 1 answers revealed one by one');
  await page.click('[data-act=l-p2]');
  await sleep(250);
  check(await board.$eval('.lr-col[data-p="0"]', (c) => c.classList.contains('masked')), "player 1's answers are hidden on the TV");
  await page.click('[data-act=l-start]');
  await page.click('[data-lans="0"]');
  l = await page.evaluate(() => window.__ff.G.lightning);
  check(!l.ans[1][0] && l.qi === 0, 'duplicate answer gets Try again');
  await page.click('[data-lans="1"]');
  await shot(board, '16-board-lightning-p2');
  await shot(page, '17-host-lightning-p2');
  await page.click('[data-act=l-done]');
  await page.click('[data-act=l-revealall]');
  l = await page.evaluate(() => ({ st: window.__ff.G.lightning.stage }));
  check(l.st === 'done', 'Lightning Round finishes');
  await sleep(400);
  await shot(board, '18-board-lightning-done');

  // Undo works in lightning, then go home
  await page.keyboard.press('u');
  check(await page.evaluate(() => window.__ff.G.lightning.stage) === 'reveal', 'undo works in the Lightning Round');

  // Board reconnect: close the board, host shows disconnected
  await board.close();
  await sleep(1300);
  check(/disconnected/i.test(await page.textContent('#d-conn')), 'host shows TV board disconnected');
  const [board2] = await Promise.all([context.waitForEvent('page'), page.click('#d-conn [data-act=openboard]')]);
  await board2.waitForSelector('.bd-lr.show', { timeout: 5000 });
  check(true, 'Reopen brings the board back with the current state');
  await board2.close();

  // Refresh: pick up where you left off
  await page.evaluate(() => window.__ff.Lightning.stopLoop());
  await page.reload();
  await page.waitForSelector('.modal');
  check(/pick up where you left off/i.test(await page.textContent('.modal h2')), 'refresh offers to resume');
  await page.click('.modal-actions .btn-gold');
  check(await page.evaluate(() => window.__ff.SCREEN === 'game' && window.__ff.G.phase === 'lightning'), 'resumed the live game');
  await page.click('[data-act=home]');

  // Your Crowd: chat paste, merge, save, late answers, CSV
  await page.click('[data-go=crowd]');
  await shot(page, '19-crowd-start');
  await page.click('#cr-new');
  await page.click('[data-tpl=bachelorette]');
  await page.$$eval('#cr-qs input', (ins) => ins.forEach((i, n) => { if (n === 1) { i.value = 'Name a place the couple might go on their honeymoon'; i.dispatchEvent(new Event('input', { bubbles: true })); } }));
  // keep 3 questions
  await page.evaluate(() => { for (let k = 0; k < 5; k++) document.querySelector('[data-qdel="3"]') && document.querySelector('[data-qdel="3"]').click(); });
  await shot(page, '20-crowd-questions');
  await page.click('[data-cstep="1"]');
  check(/numbered 1 to 3/.test(await page.inputValue('#cr-msg')), 'group text asks for numbered answers');
  await shot(page, '21-crowd-send');
  await page.click('[data-cstep="2"]');
  await page.fill('#cr-paste', CHAT);
  await page.click('#cr-parse');
  const rows = await page.$$eval('.pv-t tbody tr', (r) => r.length);
  check(rows === 6, 'understood 6 replies (Lauren had no answers yet) from the group chat (got ' + rows + ')');
  await shot(page, '22-crowd-preview');
  await page.click('#cr-add');
  await page.waitForSelector('.groups');
  const g1 = await page.$$eval('.groups li', (li) => li.map((x) => x.querySelector('.g-name').textContent + ':' + x.querySelector('.g-count').textContent));
  check(g1.some((x) => /^wine:3$/i.test(x)), 'auto-merged Wine / wine!! / Wines: ' + g1.join(', '));
  check(/\b6\b/.test(await page.textContent('.big-stat')), 'shows 6 people answered');
  const hasSugg = await page.$('[data-sm="0"]');
  check(!!hasSugg, 'suggests a fuzzy merge (Glass of wine / Wine)');
  await shot(page, '23-crowd-group');
  if (hasSugg) await page.click('[data-sm="0"]');
  const g2 = await page.$$eval('.groups li', (li) => li.map((x) => x.querySelector('.g-name').textContent + ':' + x.querySelector('.g-count').textContent));
  check(g2.some((x) => /^wine:4$/i.test(x)), 'merge combined the groups: ' + g2.join(', '));
  await page.click('[data-cstep="4"]');
  const pts = await page.$$eval('.cr-board:first-child .mini-board li', (li) => li.map((x) => x.textContent.trim()));
  check(/67$/.test(pts[0]), 'points = round(count / respondents x 100): ' + pts.join(' | '));
  await page.click('#cr-save');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('ff.packs')).some((p) => p.source === 'surveyed')), 'saved as a surveyed pack');
  await shot(page, '24-crowd-board');
  // Late answers
  await page.click('[data-cstep="2"]');
  await page.fill('#cr-paste', CHAT + '\n' + LATE);
  await page.click('#cr-parse');
  await page.click('#cr-add');
  check(/2 new replies/.test(await page.textContent('#toasts')) && /skipped 6/.test(await page.textContent('#toasts')), 'late replies: adds new, skips already counted');
  const g3 = await page.$$eval('.groups li', (li) => li.map((x) => x.querySelector('.g-name').textContent + ':' + x.querySelector('.g-count').textContent));
  check(g3.some((x) => /^wine:5$/i.test(x)), 'remembered merge applied to late answers: ' + g3.join(', '));
  // Google Forms CSV
  await page.click('[data-cstep="2"]');
  await page.click('[data-pm=csv]');
  await page.fill('#cr-paste', FORM_CSV);
  await page.click('#cr-parse');
  const csvRows = await page.$$eval('.pv-t tbody tr', (r) => r.length);
  const mapped = await page.$$eval('[data-map]', (s) => s.map((x) => x.value));
  check(csvRows === 4 && mapped[1] === '3', `Google Forms CSV: 4 replies, columns matched (${mapped.join(',')})`);
  await shot(page, '25-crowd-csv');
  await page.click('#cr-add');
  await page.evaluate(() => window.__ff.go('home'));

  // Regression checks on the text helpers
  const unit = await page.evaluate(() => {
    const t = window.__ff.t;
    const r = {};
    r.plural = t.matchGuess('Movies', [{ text: 'Movie', accept: [] }]) === 0 && t.normalizeAnswer('Cookies') === t.normalizeAnswer('cookie') && t.normalizeAnswer('cities') === t.normalizeAnswer('City');
    const sn = t.splitNumbered('1. wake up at 7:30 2. coffee 3. tea', 3);
    r.time = sn[0] === 'wake up at 7:30' && sn[1] === 'coffee' && sn[2] === 'tea';
    const proj = { questions: ['Name something the bride always says', 'Name a honeymoon spot'] };
    const m = t.csvMapping(['Timestamp', 'Name something the bride always says', 'Name a honeymoon spot'], proj);
    r.csv = m.whoCol === -1 && m.map[0] === 1 && m.map[1] === 2;
    const m2 = t.csvMapping(['Timestamp', 'Name', 'Name something the bride always says', 'Name a honeymoon spot'], proj);
    r.csvName = m2.whoCol === 1 && m2.map[0] === 2 && m2.map[1] === 3;
    const p = t.fixCrowd({ id: 'x', questions: ['a', 'b', 'c'], responses: [{ who: 'A', answers: { 0: 'one', 1: 'two', 2: 'three' } }], rules: { 2: { map: {}, names: { three: 'Three!' }, deleted: [], dismissed: [] } } });
    t.removeCrowdQuestion(p, 1);
    r.remove = p.questions.join() === 'a,c' && p.responses[0].answers[0] === 'one' && p.responses[0].answers[1] === 'three' && !!p.rules[1];
    const p2 = t.fixCrowd({ id: 'y', questions: ['q'], responses: [{ who: 'A', answers: { 0: 'Constructor' } }, { who: 'B', answers: { 0: 'toString' } }] });
    const g = t.groupsFor(p2, 0);
    r.proto = g.list.length === 2 && g.list.every((x) => typeof x.key === 'string');
    const s = t.sanitizeSettings({ sound: { volume: '"><img src=x onerror=alert(1)>' }, lightningTimes: ['<b>', 9999], textSize: 'huge', keys: { team1: '<x>' } });
    r.sanitize = s.sound.volume === 0.8 && s.lightningTimes[0] === 20 && s.lightningTimes[1] === 120 && s.textSize === 'normal' && s.keys.team1 === 'ShiftLeft';
    r.played = t.playedList().length > 0;
    return r;
  });
  Object.entries(unit).forEach(([k, v]) => check(v, 'regression: ' + k));
  // A Google Forms CSV with no name column keeps question 1's answers
  await page.evaluate(() => window.__ff.go('crowd'));
  if (await page.$('.cr-open')) await page.click('.cr-open');
  await page.click('[data-step="2"]');
  await page.click('[data-pm=csv]');
  await page.fill('#cr-paste', 'Timestamp,Name something the bride always says,Name a place the couple might go on their honeymoon,Name something you need at a bachelorette\n11/20/2026 9:00:00,Wine,Paris,Sash\n11/20/2026 9:01:00,Champagne,Hawaii,Tiara');
  await page.click('#cr-parse');
  const firstCells = await page.$$eval('.pv-t tbody tr', (rows) => rows.map((r) => r.querySelector('[data-q="0"]').value));
  check(firstCells.join() === 'Wine,Champagne', 'CSV without a name column keeps question 1 answers (' + firstCells.join() + ')');
  await page.evaluate(() => window.__ff.go('home'));

  // Export and re-import a backup
  await page.click('[data-go=settings]');
  await shot(page, '26-settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#st-export')]);
  const dlPath = path.join(os.tmpdir(), `ff-backup-${name}.json`);
  await dl.saveAs(dlPath);
  const backup = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
  check(backup.app === 'friendly-feud' && backup.packs.length >= 1 && backup.crowd.length >= 1, 'export writes a backup file');
  await page.evaluate(() => { localStorage.removeItem('ff.packs'); localStorage.removeItem('ff.crowd'); });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#st-import')]);
  await fc.setFiles(dlPath);
  await sleep(400);
  check(await page.evaluate(() => (JSON.parse(localStorage.getItem('ff.packs') || '[]').length >= 1 && JSON.parse(localStorage.getItem('ff.crowd') || '[]').length >= 1)), 'import restores packs and surveys');

  // Sound toggle persists
  await page.click('[data-snd=strike]');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('ff.settings')).sound.on.strike === false), 'individual sound toggle saves');

  // Remaining screens for screenshots
  await page.evaluate(() => window.__ff.go('home'));
  await page.click('[data-go=setup]');
  await shot(page, '27-setup');
  await page.evaluate(() => window.__ff.go('home'));
  await page.click('[data-go=editor]');
  await shot(page, '28-editor-builtin');
  await page.click('#ed-new');
  await shot(page, '29-editor-custom');
  await page.evaluate(() => window.__ff.go('home'));
  await page.click('[data-go=help]');
  await shot(page, '30-help');
  await page.evaluate(() => window.__ff.go('home'));
  await page.click('[data-go=check]');
  await shot(page, '31-setup-check');
  // Setup Check buzzer step via keyboard
  await page.click('[data-ans=one]');
  await page.click('#ck-heard');
  await page.click('#ck-fsskip');
  await page.keyboard.press('ShiftLeft');
  await page.keyboard.press('ShiftRight');
  await page.waitForSelector('.ready', { timeout: 3000 });
  check(true, 'Setup Check reaches "You\'re ready for game night!"');
  await shot(page, '32-setup-ready');

  // One-screen mode with host panel on H
  await page.evaluate(() => window.__ff.go('home'));
  await page.click('#qp');
  await page.click('.modal-actions .btn-gold');
  await page.waitForSelector('#single-board .bd');
  check(await page.$eval('#single-board', (b) => !b.hidden), 'one-screen mode shows the board full screen');
  await shot(page, '33-single-board');
  await page.keyboard.down('h');
  await sleep(350);
  check(await page.$eval('#desk', (d) => d.classList.contains('open')), 'holding H slides in the host panel');
  await shot(page, '34-single-hostpanel');
  await page.keyboard.up('h');

  // 1280x720 pass
  if (wantShots) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ff.settings')); s.screenMode = 'two'; localStorage.setItem('ff.settings', JSON.stringify(s)); });
    await shot(page, '33-single-board');
    await page.click('#drawer-tab');
    await shot(page, '34-single-hostpanel');
    for (const [scr, n] of [['home', '02-home'], ['setup', '27-setup'], ['settings', '26-settings'], ['editor', '28-editor-builtin'], ['help', '30-help'], ['check', '31-setup-check'], ['crowd', '19-crowd-start']]) {
      await page.evaluate((s) => window.__ff.go(s), scr);
      await shot(page, n);
    }
  }

  await sleep(200);
  check(errors.length === 0, 'zero console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  check(external.length === 0, 'zero network requests' + (external.length ? ': ' + external.slice(0, 5).join(' ') : ''));
  await browser.close();
}

async function shots720() {
  // Board and host screens at 1280x720 (Chromium)
  const browser = await pw.chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(FILE);
  await page.evaluate(() => localStorage.setItem('ff.settings', JSON.stringify({ toured: true })));
  await page.reload();
  await page.click('#qp');
  const [board] = await Promise.all([context.waitForEvent('page'), page.click('.modal-actions .btn-gold')]);
  await board.setViewportSize({ width: 1280, height: 720 });
  await board.waitForSelector('.tile');
  await shot(page, '04-host-faceoff');
  await page.evaluate(() => { const A = window.__ff.Actions; A.buzz(0); A.reveal(0); A.choose(true); A.reveal(3); A.miss(); });
  await sleep(1700);
  await shot(page, '06-host-play');
  await shot(board, '07-board-play');
  await page.evaluate(() => { const A = window.__ff.Actions; A.miss(); A.miss(); });
  await sleep(1700);
  await shot(page, '09-host-steal');
  await page.evaluate(() => { window.__ff.Actions.miss(); window.__ff.Actions.showRest(); });
  await sleep(900);
  await shot(board, '10-board-roundend');
  await page.evaluate(() => { window.__ff.Actions.endGame(); });
  await sleep(600);
  await shot(board, '12-board-winner');
  await page.evaluate(() => { window.__ff.Lightning.start(0); });
  await sleep(300);
  await shot(page, '17-host-lightning-p2');
  await shot(board, '14-board-lightning-ready');
  await browser.close();
}

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  for (const e of ENGINES) {
    try { await runEngine(e); } catch (err) { failures++; log(`  FAIL ${e} crashed: ${err.message.split('\n').slice(0, 3).join(' / ')}`); }
  }
  if (wantShots) await shots720();
  log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
