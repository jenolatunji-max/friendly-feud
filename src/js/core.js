'use strict';
/* =========================================================
   Core: brand, helpers, storage, settings, toasts, modals
   ========================================================= */

// Rename the product here. The build script reads this line too.
const BRAND_NAME = 'Friendly Feud';
const APP_VERSION = '1.0.0';
const IS_BOARD = location.hash === '#board';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const deepCopy = (o) => JSON.parse(JSON.stringify(o));
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function uid(p = 'id') {
  return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function mergeDeep(base, over) {
  const out = deepCopy(base);
  if (!isObj(over)) return out;
  for (const k of Object.keys(over)) {
    if (isObj(out[k]) && isObj(over[k])) out[k] = mergeDeep(out[k], over[k]);
    else if (over[k] !== undefined) out[k] = over[k];
  }
  return out;
}
function titleCase(s) {
  s = String(s || '').trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- Storage (never throws) ---------- */
const Store = {
  ok: (() => {
    try { const k = '__ff_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  })(),
  get(k, d) {
    try { const v = localStorage.getItem('ff.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('ff.' + k, JSON.stringify(v)); return true; } catch (e) { return false; }
  },
  del(k) { try { localStorage.removeItem('ff.' + k); } catch (e) { /* ignore */ } },
};

/* ---------- Team colors (colorblind-safe set) ---------- */
const TEAM_COLORS = [
  { id: 'sunset', name: 'Sunset', hex: '#D55E00' },
  { id: 'sky', name: 'Sky', hex: '#56B4E9' },
  { id: 'mint', name: 'Mint', hex: '#009E73' },
  { id: 'lemon', name: 'Lemon', hex: '#F0E442' },
  { id: 'orchid', name: 'Orchid', hex: '#CC79A7' },
  { id: 'tangerine', name: 'Tangerine', hex: '#E69F00' },
];
const colorHex = (id) => (TEAM_COLORS.find((c) => c.id === id) || TEAM_COLORS[0]).hex;

/* ---------- Settings ---------- */
const SOUND_LIST = [
  ['reveal', 'Answer reveal'],
  ['strike', 'Strike buzzer'],
  ['buzz', 'Buzz in'],
  ['faceoff', 'Face-off whoosh'],
  ['award', 'Points awarded'],
  ['tick', 'Countdown tick'],
  ['timeup', 'Time is up'],
  ['duplicate', 'Duplicate answer'],
  ['zero', 'No points thud'],
  ['win', 'Winner fanfare'],
  ['intro', 'Game start jingle'],
];
const DEFAULT_SETTINGS = {
  textSize: 'normal',
  highContrast: false,
  reducedMotion: false,
  showQuestion: true,
  screenMode: 'two',
  sound: { volume: 0.8, muted: false, on: Object.fromEntries(SOUND_LIST.map(([k]) => [k, true])) },
  keys: { team1: 'ShiftLeft', team2: 'ShiftRight' },
  lightningTimes: [20, 25],
  lightningTarget: 200,
  hostScript: true,
  toured: false,
};
/** Coerce settings from storage or a backup file into safe, known values. */
function sanitizeSettings(s) {
  const d = DEFAULT_SETTINGS;
  const num = (v, def, a, b) => { const n = Math.round(+v); return Number.isFinite(n) ? clamp(n, a, b) : def; };
  const out = mergeDeep(d, isObj(s) ? s : {});
  out.textSize = ['normal', 'large', 'xl'].includes(out.textSize) ? out.textSize : 'normal';
  out.screenMode = out.screenMode === 'single' ? 'single' : 'two';
  ['highContrast', 'reducedMotion', 'showQuestion', 'hostScript', 'toured'].forEach((k) => { out[k] = !!out[k]; });
  out.sound.volume = clamp(Number.isFinite(+out.sound.volume) ? +out.sound.volume : 0.8, 0, 1);
  out.sound.muted = !!out.sound.muted;
  Object.keys(out.sound.on).forEach((k) => { out.sound.on[k] = out.sound.on[k] !== false; });
  const codeOk = (c) => typeof c === 'string' && /^[A-Za-z0-9]{1,24}$/.test(c);
  out.keys.team1 = codeOk(out.keys.team1) ? out.keys.team1 : d.keys.team1;
  out.keys.team2 = codeOk(out.keys.team2) ? out.keys.team2 : d.keys.team2;
  const lt = Array.isArray(out.lightningTimes) ? out.lightningTimes : d.lightningTimes;
  out.lightningTimes = [num(lt[0], 20, 5, 120), num(lt[1], 25, 5, 120)];
  out.lightningTarget = num(out.lightningTarget, 200, 50, 500);
  return out;
}
let settings = sanitizeSettings(Store.get('settings', {}));

function saveSettings() {
  Store.set('settings', settings);
  applyDisplay(displaySettings());
  if (typeof Sync !== 'undefined' && !IS_BOARD) Sync.push();
}
function displaySettings() {
  return {
    textSize: settings.textSize,
    highContrast: settings.highContrast,
    reducedMotion: settings.reducedMotion,
    showQuestion: settings.showQuestion,
  };
}
function prefersReducedMotion(disp) {
  let mq = false;
  try { mq = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }
  return !!((disp || settings).reducedMotion || mq);
}
function applyDisplay(d) {
  const h = document.documentElement;
  h.dataset.text = d.textSize || 'normal';
  h.classList.toggle('hc', !!d.highContrast);
  h.classList.toggle('rm', !!d.reducedMotion);
}

function keyLabel(code) {
  const map = {
    ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt', AltRight: 'Right Alt', Space: 'Space bar', Enter: 'Enter', ArrowLeft: 'Left arrow',
    ArrowRight: 'Right arrow', ArrowUp: 'Up arrow', ArrowDown: 'Down arrow', MetaLeft: 'Left Command', MetaRight: 'Right Command',
  };
  if (map[code]) return map[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'Keypad ' + code.slice(6);
  return code || 'None';
}

/* ---------- Text helpers for judging ---------- */
const STOP_WORDS = new Set(['the', 'a', 'an', 'my', 'your', 'some', 'their', 'his', 'her']);
function singular(w) {
  // movie/movies, city/cities, pie/pies all reduce to the same stem
  if (/ies$/.test(w) && w.length >= 4) return w.slice(0, -3) + 'i';
  if (/ie$/.test(w) && w.length >= 3) return w.slice(0, -2) + 'i';
  if (w.length <= 3) return w;
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'i';
  if (/(ss|us|is|ous)$/.test(w)) return w;
  if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}
function normalizeAnswer(s) {
  let t = String(s == null ? '' : s).toLowerCase();
  try { t = t.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* ignore */ }
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, ' ');
  t = t.replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
  return t.split(/\s+/).filter(Boolean).filter((w) => !STOP_WORDS.has(w)).map(singular).join(' ');
}
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
/** Returns the index of the best matching answer for a typed guess, or -1. */
function matchGuess(guess, answers) {
  const g = normalizeAnswer(guess);
  if (!g) return -1;
  let best = -1;
  let bestScore = 0;
  answers.forEach((a, i) => {
    const keys = [a.text].concat(a.accept || []).map(normalizeAnswer).filter(Boolean);
    for (const k of keys) {
      let s = 0;
      if (k === g) s = 100;
      else if ((' ' + g + ' ').includes(' ' + k + ' ') || (' ' + k + ' ').includes(' ' + g + ' ')) s = Math.min(k.length, g.length) >= 3 ? 70 : 0;
      else {
        const d = levenshtein(k, g);
        const L = Math.max(k.length, g.length);
        if (L >= 4 && d <= Math.max(1, Math.floor(L * 0.2))) s = 60 - d;
      }
      if (s > bestScore) { bestScore = s; best = i; }
    }
  });
  return best;
}

/* ---------- Toasts ---------- */
function toast(msg, kind = '') {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  host.appendChild(t);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 2800);
}

/* ---------- Modal dialogs ---------- */
function modal(opts) {
  const { title, body = '', actions = [{ label: 'OK', primary: true }], dismissible = true, wide = false, onOpen } = opts;
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mdl-t">
      <h2 id="mdl-t">${esc(title)}</h2>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">${actions.map((a, i) => `<button type="button" class="btn ${a.primary ? 'btn-gold' : a.danger ? 'btn-red' : 'btn-ghost'}" data-mi="${i}">${esc(a.label)}</button>`).join('')}</div>
    </div>`;
    const prevFocus = document.activeElement;
    document.body.appendChild(wrap);
    let done = false;
    const close = (v) => {
      if (done) return;
      done = true;
      wrap.remove();
      document.removeEventListener('keydown', onKey, true);
      try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) { /* ignore */ }
      resolve(v);
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mi]');
      if (b) {
        const a = actions[+b.dataset.mi];
        if (a.validate && !a.validate(wrap)) return;
        close(a.value !== undefined ? a.value : +b.dataset.mi);
      } else if (e.target === wrap && dismissible) close(null);
    });
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); e.preventDefault(); close(null); return; }
      if (e.key === 'Tab') {
        const f = $$('button, input, select, textarea, [tabindex]:not([tabindex="-1"])', wrap).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    const auto = wrap.querySelector('[autofocus]') || wrap.querySelector('.modal-actions .btn-gold') || wrap.querySelector('button');
    if (auto) auto.focus();
    if (onOpen) onOpen(wrap, close);
  });
}
const confirmBox = (title, body, yes = 'Yes', danger = false) =>
  modal({ title, body: `<p>${body}</p>`, actions: [{ label: 'Cancel', value: false }, { label: yes, value: true, primary: !danger, danger }] });
const modalOpen = () => !!$('.modal-wrap');

/* ---------- Files ---------- */
function download(name, data, mime = 'application/json') {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
    return true;
  } catch (e) {
    toast('Could not save the file. Try another browser.', 'bad');
    return false;
  }
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, text: String(r.result || '') });
      r.onerror = () => { toast('Could not read that file.', 'bad'); resolve(null); };
      r.readAsText(f);
    });
    inp.click();
  });
}
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
function fileSlug(s) { return String(s || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'file'; }

/* ---------- Full screen ---------- */
function toggleFullscreen() {
  try {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else {
      const el = d.documentElement;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fn) {
        const p = fn.call(el);
        if (p && p.catch) p.catch(() => toast('Full screen was blocked. Try pressing F11 (Windows) or Ctrl+Cmd+F (Mac).', 'warn'));
      }
    }
  } catch (e) { toast('Full screen is not available in this browser.', 'warn'); }
}
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
