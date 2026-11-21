/* =========================================================
   Two-screen sync. Host -> board via postMessage on the window
   reference ('*' target, because file:// origins are opaque).
   Board -> host "hello" via window.opener. Storage event is a
   fallback when the browser shares localStorage between them.
   ========================================================= */
const Sync = {
  win: null,
  lastStatus: {},
  payload() {
    return { ff: 1, type: 'state', state: G, disp: displaySettings(), t: Date.now() };
  },
  open() {
    const url = location.href.split('#')[0] + '#board';
    let w = null;
    try { w = window.open(url, 'ff_board', 'popup=yes,width=1280,height=720'); } catch (e) { w = null; }
    if (!w) {
      modal({
        title: 'Your browser blocked the TV window',
        body: '<p>Look for a small "pop-up blocked" icon at the right end of the address bar. Choose <b>Always allow</b>, then click <b>Open TV board</b> again.</p><p>Or switch to one-screen mode in Settings.</p>',
      });
      return false;
    }
    Sync.win = w;
    try { w.focus(); } catch (e) { /* ignore */ }
    setTimeout(() => Sync.push(), 400);
    setTimeout(() => Sync.push(), 1200);
    Sync.updateConn();
    toast('Drag the new window onto your TV, then click it and press F for full screen.');
    return true;
  },
  isOpen() {
    try { return !!(Sync.win && !Sync.win.closed); } catch (e) { return false; }
  },
  push: debounce(() => Sync.pushNow(), 16),
  pushNow() {
    if (IS_BOARD) return;
    const msg = Sync.payload();
    if (Sync.isOpen()) { try { Sync.win.postMessage(msg, '*'); } catch (e) { /* ignore */ } }
    Store.set('sync', { t: msg.t, msg });
  },
  updateConn() {
    if (typeof renderConn === 'function') renderConn();
  },
  initHost() {
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || d.ff !== 1) return;
      if (d.type === 'hello') {
        if (e.source && e.source !== window) Sync.win = e.source;
        Sync.pushNow();
        Sync.updateConn();
      } else if (d.type === 'key') {
        if (typeof handleKey !== 'function' || modalOpen()) return;
        const typing = document.activeElement && document.activeElement.matches && document.activeElement.matches('input, textarea, select, [contenteditable]');
        const isBuzz = d.code === settings.keys.team1 || d.code === settings.keys.team2;
        if (typing && !isBuzz && !keyHooks.length) return;
        handleKey({ code: d.code, key: d.key, fromBoard: true, preventDefault() {} });
      } else if (d.type === 'status') {
        Sync.lastStatus = d;
        if (typeof onBoardStatus === 'function') onBoardStatus(d);
      }
    });
    setInterval(Sync.updateConn, 1000);
    window.addEventListener('beforeunload', () => { /* board stays open and re-requests state after reload */ });
  },
};

/* ---------- Board window side ---------- */
const BoardLink = {
  lastT: 0,
  onState: null,
  hello() {
    try { if (window.opener && !window.opener.closed) window.opener.postMessage({ ff: 1, type: 'hello' }, '*'); } catch (e) { /* ignore */ }
  },
  send(msg) {
    try { if (window.opener && !window.opener.closed) window.opener.postMessage(Object.assign({ ff: 1 }, msg), '*'); } catch (e) { /* ignore */ }
  },
  accept(msg) {
    if (!msg || msg.ff !== 1 || msg.type !== 'state') return;
    if (msg.t && msg.t < BoardLink.lastT) return;
    BoardLink.lastT = msg.t || Date.now();
    if (BoardLink.onState) BoardLink.onState(msg.state, msg.disp);
  },
  init(onState) {
    BoardLink.onState = onState;
    window.addEventListener('message', (e) => BoardLink.accept(e.data));
    window.addEventListener('storage', (e) => {
      if (e.key !== 'ff.sync' || !e.newValue) return;
      try { BoardLink.accept(JSON.parse(e.newValue).msg); } catch (err) { /* ignore */ }
    });
    // Start from whatever was last saved, then ask the host for fresh state.
    const saved = Store.get('sync', null);
    if (saved && saved.msg) BoardLink.accept(saved.msg);
    BoardLink.hello();
    // If the host reloads, keep asking until it answers again.
    setInterval(() => { if (Date.now() - BoardLink.lastT > 3000) BoardLink.hello(); }, 1500);
  },
};
