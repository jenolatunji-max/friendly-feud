#!/usr/bin/env node
/* Zero-dependency build: inlines CSS, JS, font and packs into dist/index.html.
   The font comes from the @fontsource/anton dev dependency (OFL licence).
   If it is missing, the build still works and falls back to Impact. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

const JS_ORDER = ['core.js', 'logo.js', 'audio.js', 'packs.js', 'game.js', 'sync.js', 'board.js', 'confetti.js', 'host.js', 'screens.js', 'editor.js', 'crowd.js', 'main.js'];
const PACK_ORDER = ['family-game-night', 'christmas', 'thanksgiving', 'new-years-eve', 'bachelorette', 'office-party', 'baby-shower', 'kids', 'lightning'];
const BANNED = [/family feud/i, /fast money/i, /survey says/i, /steve harvey/i, /\btelly\b/i, /surveyed 100/i];

function brandName() {
  const m = /const BRAND_NAME = '([^']+)'/.exec(read('js/core.js'));
  if (!m) throw new Error('BRAND_NAME not found in src/js/core.js');
  return m[1];
}

function loadPacks() {
  const dir = path.join(SRC, 'packs');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const packs = files.map((f) => {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    p.region = p.region || 'US';
    p.source = p.source || 'estimate';
    return p;
  });
  packs.sort((a, b) => {
    const ia = PACK_ORDER.indexOf(a.id);
    const ib = PACK_ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
  });
  // Validate
  const problems = [];
  const checkRound = (where, r) => {
    const n = r.answers.length;
    const total = r.answers.reduce((s, a) => s + a.points, 0);
    if (n < 3 || n > 8) problems.push(`${where}: ${n} answers`);
    if (total > 100) problems.push(`${where}: total ${total}`);
    for (let i = 1; i < n; i++) if (r.answers[i].points > r.answers[i - 1].points) problems.push(`${where}: points not sorted`);
    const seen = new Set();
    r.answers.forEach((a) => { const k = a.text.toLowerCase(); if (seen.has(k)) problems.push(`${where}: duplicate "${a.text}"`); seen.add(k); });
  };
  let rounds = 0;
  let sets = 0;
  packs.forEach((p) => {
    p.rounds.forEach((r, i) => { rounds++; checkRound(`${p.id} #${i + 1}`, r); });
    (p.lightning || []).forEach((s, i) => { sets++; s.questions.forEach((q, j) => checkRound(`${p.id} set ${i + 1} q${j + 1}`, q)); });
    const txt = JSON.stringify(p);
    BANNED.forEach((re) => { if (re.test(txt)) problems.push(`${p.id}: banned phrase ${re}`); });
  });
  return { packs, rounds, sets, problems };
}

function fontCSS() {
  try {
    const f = require.resolve('@fontsource/anton/files/anton-latin-400-normal.woff2', { paths: [ROOT] });
    const b64 = fs.readFileSync(f).toString('base64');
    return `@font-face{font-family:'Anton';font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  } catch (e) {
    console.warn('  ! Anton font not found (run npm install). Using the Impact fallback.');
    return '';
  }
}

function favicon() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0A1238"/><path d="M10 18h44a4 4 0 0 1 4 4v6a4 4 0 0 0 0 8v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-6a4 4 0 0 0 0-8v-6a4 4 0 0 1 4-4z" fill="#F6B93B"/><text x="32" y="41" font-family="Impact,Arial Narrow,sans-serif" font-size="20" text-anchor="middle" fill="#0A1238">FF</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const safeScript = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

function build() {
  const t0 = Date.now();
  const BRAND = brandName();
  const { packs, rounds, sets, problems } = loadPacks();
  if (problems.length) {
    console.warn('  ! Pack warnings:');
    problems.slice(0, 40).forEach((p) => console.warn('    - ' + p));
  }
  let js = JS_ORDER.map((f) => `/* ---- ${f} ---- */\n` + read('js/' + f)).join('\n');
  if (!js.includes('__BUILTIN_PACKS__')) throw new Error('Pack placeholder missing');
  js = js.replace('__BUILTIN_PACKS__', () => JSON.stringify(packs));
  js = `(function () {\n${js}\n})();`;
  const font = fontCSS();
  const css = read('styles.css');
  let html = read('index.html');
  html = html
    .replace('/*@FONT*/', () => font)
    .replace('/*@CSS*/', () => css)
    .replace('/*@JS*/', () => safeScript(js))
    .replace(/\{\{BRAND\}\}/g, BRAND)
    .replace('{{FAVICON}}', favicon());
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'index.html'), html);

  // Quick-Start Guide (shares the logo code)
  const logoSVG = new Function(read('js/logo.js') + '\nreturn logoSVG;')();
  let guide = read('guide.html');
  guide = guide
    .replace('/*@FONT*/', () => font)
    .replace('{{LOGO}}', () => logoSVG(BRAND))
    .replace(/\{\{BRAND\}\}/g, BRAND)
    .replace('{{FAVICON}}', favicon());
  fs.writeFileSync(path.join(DIST, 'Quick-Start-Guide.html'), guide);

  const kb = (fs.statSync(path.join(DIST, 'index.html')).size / 1024).toFixed(0);
  console.log(`Built ${BRAND}: dist/index.html ${kb} KB, ${packs.length} packs, ${rounds} rounds, ${sets} Lightning sets (${Date.now() - t0} ms)`);
  if (+kb > 2048) console.warn('  ! index.html is over 2 MB');
}

build();
