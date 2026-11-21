/* =========================================================
   Start-up
   ========================================================= */
function startHost() {
  document.title = BRAND_NAME;
  applyDisplay(displaySettings());
  mountGame();
  Sync.initHost();
  document.addEventListener('pointerdown', () => Sound.ensure(), { once: true });
  document.addEventListener('keydown', () => Sound.ensure(), { once: true });

  // Pick up where you left off?
  const live = Store.get('live', null);
  go('home');
  if (live && live.round && live.phase !== 'gameOver' && live.v === 1) {
    const sum = `Round ${live.roundNo}: ${esc(live.teams[0].name)} ${live.teams[0].score}, ${esc(live.teams[1].name)} ${live.teams[1].score}.`;
    modal({
      title: 'Pick up where you left off?',
      body: `<p>You have a game in progress.</p><p><b>${sum}</b></p>`,
      actions: [{ label: 'Start fresh', value: 'fresh' }, { label: 'Resume game', primary: true, value: 'resume' }],
      dismissible: false,
    }).then((v) => {
      if (v === 'resume') {
        G = live;
        G.fx = null;
        if (G.lightning) G.lightning.running = false;
        const h = Store.get('liveHist', []);
        HIST = Array.isArray(h) ? h : [];
        go('game');
        Sync.push();
        if (G.cfg.screenMode === 'two' && !Sync.isOpen()) toast('Click Reopen at the top to bring back the TV board.');
      } else {
        G = null;
        HIST = [];
        persistLive();
        Sync.push();
        if (!settings.toured) runTour();
      }
    });
    settings.toured = settings.toured || false;
  }
  // Keep the board in step with display settings changed in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'ff.settings' && e.newValue) {
      try { settings = sanitizeSettings(JSON.parse(e.newValue)); applyDisplay(displaySettings()); } catch (err) { /* ignore */ }
    }
  });
  window.__ff = { get G() { return G; }, Actions, Lightning, Clock, go, get SCREEN() { return SCREEN; }, Sync, t: { normalizeAnswer, matchGuess, splitNumbered, csvMapping, parseChat, removeCrowdQuestion, fixCrowd, groupsFor, sanitizeSettings, freshCount, playedList } };
}

window.addEventListener('error', (e) => {
  // Never show a broken screen at a party. Log quietly and keep going.
  try { console.warn('[' + BRAND_NAME + ']', e.message); } catch (err) { /* ignore */ }
});

if (IS_BOARD) startBoardWindow(); else startHost();
