/* =========================================================
   Question packs: built-in (inlined at build time) + custom
   ========================================================= */
const BUILTIN_PACKS = __BUILTIN_PACKS__;

function customPacks() {
  const list = Store.get('packs', []);
  return Array.isArray(list) ? list : [];
}
function saveCustomPacks(list) {
  if (!Store.set('packs', list)) toast('Could not save. Your browser storage may be full or turned off. Use Export to keep a copy.', 'bad');
}
function allPacks() {
  return BUILTIN_PACKS.map((p) => Object.assign({}, p, { builtin: true })).concat(customPacks());
}
function getPack(id) { return allPacks().find((p) => p.id === id) || null; }
function upsertCustomPack(pack) {
  const list = customPacks();
  const i = list.findIndex((p) => p.id === pack.id);
  if (i >= 0) list[i] = pack; else list.push(pack);
  saveCustomPacks(list);
}
function deleteCustomPack(id) { saveCustomPacks(customPacks().filter((p) => p.id !== id)); }
const isPlayable = (r) => !!(r && String(r.q || '').trim() && r.answers && r.answers.filter((a) => a && String(a.text || '').trim()).length >= 3);
function playableRounds(p) { return (p.rounds || []).filter(isPlayable).length; }

function cleanAnswer(a) {
  const text = String((a && a.text) || '').trim().slice(0, 40);
  let accept = a && a.accept;
  if (typeof accept === 'string') accept = accept.split(/[|;,]/);
  accept = Array.isArray(accept) ? accept.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [];
  return { text, points: clamp(Math.round(+((a && a.points) || 0)) || 0, 0, 100), accept };
}
function cleanRound(r) {
  return {
    q: String((r && r.q) || '').trim().slice(0, 200),
    answers: ((r && r.answers) || []).map(cleanAnswer).filter((a) => a.text).slice(0, 8),
  };
}
/** Validate any incoming pack object. Throws a friendly Error if unusable. */
function validatePack(p) {
  if (!isObj(p)) throw new Error('That file is not a question pack.');
  const name = String(p.name || '').trim();
  if (!name) throw new Error('The pack needs a name.');
  const rounds = Array.isArray(p.rounds) ? p.rounds.map(cleanRound).filter((r) => r.q) : [];
  const lightning = Array.isArray(p.lightning)
    ? p.lightning.filter((s) => s && Array.isArray(s.questions)).map((s, i) => ({ name: String(s.name || 'Set ' + (i + 1)), questions: s.questions.map(cleanRound).filter((q) => q.q && q.answers.length) }))
    : [];
  if (!rounds.length && !lightning.length) throw new Error('The pack has no questions.');
  return {
    id: String(p.id || uid('pack')).replace(/[^\w-]/g, '').slice(0, 60) || uid('pack'),
    name: name.slice(0, 60),
    audience: String(p.audience || '').slice(0, 80),
    region: String(p.region || 'US').toUpperCase().slice(0, 8),
    source: p.source === 'surveyed' ? 'surveyed' : 'estimate',
    rounds,
    lightning,
  };
}
function roundWarnings(r) {
  const w = [];
  const total = r.answers.reduce((s, a) => s + (+a.points || 0), 0);
  if (r.answers.length < 3) w.push('Add at least 3 answers.');
  if (r.answers.length > 8) w.push('Only the top 8 answers fit on the board.');
  if (total > 100) w.push('Points add up to ' + total + '. Keep it at 100 or less.');
  const seen = new Set();
  r.answers.forEach((a) => {
    const k = normalizeAnswer(a.text);
    if (k && seen.has(k)) w.push('"' + a.text + '" is listed twice.');
    seen.add(k);
  });
  return w;
}

/* ---------- CSV (shared by editor and Your Crowd) ---------- */
function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows) { return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; }

function packToCSV(p) {
  const rows = [['q', 'answer', 'points', 'accept']];
  (p.rounds || []).forEach((r) => r.answers.forEach((a) => rows.push([r.q, a.text, a.points, (a.accept || []).join(' | ')])));
  return toCSV(rows);
}
function csvToRounds(text) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('That CSV file is empty.');
  let start = 0;
  let ci = { q: 0, a: 1, p: 2, acc: 3 };
  const head = rows[0].map((h) => String(h).trim().toLowerCase());
  if (head.some((h) => /^(q|question)$/.test(h)) || head.includes('answer')) {
    start = 1;
    const find = (re, d) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : d; };
    ci = { q: find(/^(q|question)/, 0), a: find(/^answer/, 1), p: find(/^(points|pts|score)/, 2), acc: find(/^(accept|variation|also)/, -1) };
  }
  const rounds = [];
  let cur = null;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const q = String(r[ci.q] || '').trim();
    const a = String(r[ci.a] || '').trim();
    if (!a && !q) continue;
    if (q && (!cur || cur.q !== q)) { cur = { q, answers: [] }; rounds.push(cur); }
    if (!cur) continue;
    if (a) cur.answers.push(cleanAnswer({ text: a, points: r[ci.p], accept: ci.acc >= 0 ? String(r[ci.acc] || '').split(/[|;]/) : [] }));
  }
  if (!rounds.length) throw new Error('No questions found. Use columns: q, answer, points.');
  rounds.forEach((r) => r.answers.sort((x, y) => y.points - x.points));
  return rounds;
}
