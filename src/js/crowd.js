/* =========================================================
   Your Crowd: survey your own guests (no back end)
   ========================================================= */
const CROWD_TEMPLATES = {
  bachelorette: { label: 'Bachelorette', qs: ['Name something the bride always says', 'Name something the bride can\'t live without', 'Name a place the couple might go on their honeymoon', 'Name something the groom does that drives the bride crazy', 'Name a song that has to be played at the wedding', 'Name something you need to survive a bachelorette weekend', 'Name the bride\'s go-to drink', 'Name something the bride will make the groom give up after the wedding'] },
  bridal: { label: 'Bridal shower', qs: ['Name something every new couple needs in their kitchen', 'Name a famous couple you think of as relationship goals', 'Name something couples argue about', 'Name something the bride does better than the groom', 'Name a wedding tradition everyone knows', 'Name something that could go wrong on a wedding day', 'Name a romantic date night idea', 'Name the first thing the couple will buy together'] },
  baby: { label: 'Baby shower', qs: ['Name something new parents never get enough of', 'Name something a baby does all day', 'Name a popular baby name right now', 'Name something you always find in a diaper bag', 'Name something the mom-to-be is craving', 'Name a classic baby shower game', 'Name something new dads are scared of', 'Name a lullaby or bedtime song'] },
  friendsgiving: { label: 'Friendsgiving', qs: ['Name a dish someone always brings to Friendsgiving', 'Name something you\'re thankful for', 'Name something that happens after a big meal', 'Name a pie people love at Thanksgiving', 'Name something that can go wrong when cooking a turkey', 'Name a game people play after dinner', 'Name something people do to avoid doing the dishes', 'Name a leftover you\'re excited to eat the next day'] },
  reunion: { label: 'Family reunion', qs: ['Name something every family reunion has', 'Name a food that always shows up at a family cookout', 'Name something a relative asks you every time you see them', 'Name a game families play outside', 'Name something Grandma always says', 'Name a reason people show up late to a family event', 'Name something you find in Grandpa\'s garage', 'Name something cousins fight over'] },
  office: { label: 'Office party', qs: ['Name something you\'d find in the break room', 'Name something people do during a boring meeting', 'Name an excuse for being late to work', 'Name something coworkers argue about', 'Name the best perk a job can have', 'Name something you always hear on a video call', 'Name a snack that disappears fast at the office', 'Name something people do on a Friday afternoon at work'] },
  birthday: { label: 'Birthday', qs: ['Name something you see at every birthday party', 'Name a popular birthday cake flavor', 'Name something people do on their birthday', 'Name a gift everyone likes to get', 'Name something that happens when you get older', 'Name a place people go to celebrate a birthday', 'Name a party game for grown-ups', 'Name something people wish for when they blow out candles'] },
  christmas: { label: 'Christmas', qs: ['Name something you hang on a Christmas tree', 'Name a Christmas movie everyone has seen', 'Name something people do on Christmas Eve', 'Name a gift that gets returned the most', 'Name something you leave out for Santa', 'Name a holiday cookie', 'Name something that stresses people out at Christmas', 'Name a reindeer'] },
};

function crowdList() { const l = Store.get('crowd', []); return Array.isArray(l) ? l : []; }
function crowdSave(proj) {
  const l = crowdList();
  const i = l.findIndex((x) => x.id === proj.id);
  if (i >= 0) l[i] = proj; else l.unshift(proj);
  if (!Store.set('crowd', l)) toast('Could not save. Use Export in Settings to keep a copy.', 'bad');
}
function crowdGet(id) { const p = crowdList().find((x) => x.id === id); return p ? fixCrowd(p) : null; }
/** Fill in anything missing (for surveys from older versions or backup files). */
function fixCrowd(p) {
  p.name = String(p.name || 'My party survey').slice(0, 60);
  p.event = String(p.event || '').slice(0, 60);
  p.questions = (Array.isArray(p.questions) ? p.questions : ['']).map((q) => String(q == null ? '' : q).slice(0, 140));
  if (!p.questions.length) p.questions = [''];
  p.responses = (Array.isArray(p.responses) ? p.responses : []).filter((r) => r && isObj(r.answers)).map((r) => ({ id: String(r.id || uid('resp')), who: String(r.who || 'Guest').slice(0, 60), answers: Object.fromEntries(Object.entries(r.answers).filter(([k]) => /^\d+$/.test(k)).map(([k, v]) => [k, String(v == null ? '' : v).slice(0, 120)])) }));
  if (!isObj(p.rules)) p.rules = {};
  Object.keys(p.rules).forEach((k) => {
    const R = p.rules[k];
    if (!isObj(R)) { delete p.rules[k]; return; }
    R.map = isObj(R.map) ? R.map : {};
    R.names = isObj(R.names) ? R.names : {};
    R.deleted = Array.isArray(R.deleted) ? R.deleted : [];
    R.dismissed = Array.isArray(R.dismissed) ? R.dismissed : [];
  });
  p.locked = !!p.locked;
  return p;
}
/** Remove question qi and shift every stored answer and rule after it, so nothing attaches to the wrong question. */
function removeCrowdQuestion(proj, qi) {
  proj.questions.splice(qi, 1);
  const shift = (obj) => {
    const out = {};
    Object.keys(obj).forEach((k) => { const n = +k; if (n < qi) out[n] = obj[k]; else if (n > qi) out[n - 1] = obj[k]; });
    return out;
  };
  proj.responses.forEach((r) => { r.answers = shift(r.answers); });
  proj.rules = shift(proj.rules);
}
function newCrowd(name, qs) {
  return { id: uid('crowd'), name: name || 'My party survey', event: '', questions: qs || [''], responses: [], rules: {}, locked: false, created: Date.now() };
}
function rulesFor(proj, qi) {
  if (!proj.rules[qi]) proj.rules[qi] = { map: {}, names: {}, deleted: [], dismissed: [] };
  return proj.rules[qi];
}

/* ---------- Parsing ---------- */
const WA_LINE = /^‎?\[?(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}),?\s+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s?[AaPp]\.?\s?[Mm]\.?)?)\]?\s*(?:[-–]\s*)?([^:]{1,40}):\s?(.*)$/;
const NAMED_LINE = /^\s*([A-Za-zÀ-ɏ][^:\d\n]{0,30}?)\s*:\s*(.*)$/;

function splitNumbered(body, nQ) {
  // A colon only counts as a delimiter when no digit follows it (so 7:30 stays a time).
  const re = /(?:^|[\s,;])(?:q(?:uestion)?\s*)?(\d{1,2})\s*(?:[.)\]–-]|:(?!\d)|\s-\s)\s*/gi;
  const hits = [];
  let m;
  while ((m = re.exec(body))) hits.push({ n: +m[1], start: m.index, end: m.index + m[0].length });
  const seq = [];
  let last = 0;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (h.n <= last || h.n > nQ) continue;
    // Prefer the very next number. Only skip ahead if the next number never appears later.
    if (h.n !== last + 1 && hits.slice(i + 1).some((x) => x.n === last + 1)) continue;
    seq.push(h);
    last = h.n;
  }
  const out = {};
  seq.forEach((h, i) => {
    const end = i + 1 < seq.length ? seq[i + 1].start : body.length;
    const txt = body.slice(h.end, end).replace(/^[\s,;:.\-–]+|[\s,;]+$/g, '').trim();
    if (txt) out[h.n - 1] = txt;
  });
  return out;
}
function looksLikeQuestions(body, proj) {
  const nb = normalizeAnswer(body);
  let hits = 0;
  proj.questions.forEach((q) => { const nq = normalizeAnswer(q); if (nq.length > 6 && nb.includes(nq)) hits++; });
  return hits >= 2;
}
function parseChat(text, proj) {
  const nQ = proj.questions.length;
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const entries = [];
  let cur = null;
  let anyNamed = false;
  const push = () => { if (cur) entries.push(cur); };
  for (const raw of lines) {
    const line = raw.replace(/‎|‏/g, '');
    let m = WA_LINE.exec(line);
    if (m) { push(); cur = { who: m[3].trim(), body: m[4] }; anyNamed = true; continue; }
    m = NAMED_LINE.exec(line);
    if (m && !/^\s*q?\d/i.test(line) && m[1].trim().split(/\s+/).length <= 4) { push(); cur = { who: m[1].trim(), body: m[2] }; anyNamed = true; continue; }
    if (!line.trim()) { if (!anyNamed && cur) { push(); cur = null; } continue; }
    if (cur) cur.body += '\n' + line; else cur = { who: '', body: line };
  }
  push();
  // Combine messages from the same person
  const byWho = new Map();
  let anon = 0;
  entries.forEach((e) => {
    const key = e.who ? e.who.toLowerCase() : '__anon' + (anon++);
    if (!byWho.has(key)) byWho.set(key, { who: e.who, bodies: [] });
    byWho.get(key).bodies.push(e.body);
  });
  const out = [];
  let guest = 0;
  byWho.forEach((v) => {
    const body = v.bodies.join('\n');
    if (looksLikeQuestions(body, proj)) return;
    let answers = splitNumbered(body, nQ);
    if (!Object.keys(answers).length) {
      const ls = body.split('\n').map((s) => s.trim()).filter(Boolean);
      if (ls.length === nQ) { answers = {}; ls.forEach((s, i) => { answers[i] = s; }); }
    }
    if (!Object.keys(answers).length) return;
    out.push({ who: v.who || 'Guest ' + (++guest), answers });
  });
  return out;
}
function headerScore(h, q) {
  const a = new Set(normalizeAnswer(h).split(' ').filter((w) => w.length > 2));
  const b = normalizeAnswer(q).split(' ').filter((w) => w.length > 2);
  if (!b.length || !a.size) return 0;
  return b.filter((w) => a.has(w)).length / b.length;
}
function csvMapping(header, proj) {
  const used = new Set();
  const skip = (h) => /^(timestamp|email|email address|score)$/i.test(String(h).trim());
  // Only a short "Name" style header is the name column. "Name something..." is a question.
  const whoCol = header.findIndex((h) => /^(name|your name|first name|full name|who|who are you|nickname)\??:?$/i.test(String(h).trim())
    && !proj.questions.some((q) => headerScore(h, q) > 0.5));
  if (whoCol >= 0) used.add(whoCol);
  header.forEach((h, i) => { if (skip(h)) used.add(i); });
  const map = proj.questions.map((q) => {
    let best = -1;
    let bs = 0.5;
    header.forEach((h, i) => { if (used.has(i)) return; const s = headerScore(h, q); if (s > bs) { bs = s; best = i; } });
    if (best >= 0) used.add(best);
    return best;
  });
  // Fill gaps in order with leftover columns
  const left = header.map((_, i) => i).filter((i) => !used.has(i));
  map.forEach((c, qi) => { if (c < 0 && left.length) map[qi] = left.shift(); });
  return { map, whoCol };
}
function parseCSVReplies(rows, mapping) {
  const out = [];
  rows.slice(1).forEach((r, n) => {
    const answers = {};
    mapping.map.forEach((c, qi) => { if (c >= 0 && r[c] && String(r[c]).trim()) answers[qi] = String(r[c]).trim(); });
    if (!Object.keys(answers).length) return;
    out.push({ who: (mapping.whoCol >= 0 && String(r[mapping.whoCol] || '').trim()) || 'Form reply ' + (n + 1), answers });
  });
  return out;
}

/* ---------- Grouping ---------- */
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function groupKeyFor(R, k) {
  let g = own(R.map, k) ? R.map[k] : k;
  let guard = 0;
  while (own(R.map, g) && R.map[g] !== g && guard++ < 30) g = R.map[g];
  return g;
}
function groupsFor(proj, qi) {
  const R = rulesFor(proj, qi);
  const groups = new Map();
  let respondents = 0;
  proj.responses.forEach((resp) => {
    const raw = resp.answers[qi];
    if (raw == null || !String(raw).trim()) return;
    const clean = String(raw).trim();
    respondents++;
    const k = normalizeAnswer(clean) || clean.toLowerCase();
    const g = groupKeyFor(R, k);
    if (!groups.has(g)) groups.set(g, { key: g, count: 0, raws: {}, members: new Set() });
    const gr = groups.get(g);
    gr.count++;
    gr.raws[clean] = (gr.raws[clean] || 0) + 1;
    gr.members.add(k);
  });
  const all = [...groups.values()].map((g) => {
    const top = Object.entries(g.raws).sort((a, b) => b[1] - a[1])[0][0];
    return { key: g.key, count: g.count, raws: g.raws, members: [...g.members], name: (own(R.names, g.key) && R.names[g.key]) || titleCase(top) };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const list = all.filter((g) => !R.deleted.includes(g.key));
  const deleted = all.filter((g) => R.deleted.includes(g.key));
  return { list, deleted, respondents };
}
function fuzzySuggestions(proj, qi, list) {
  const R = rulesFor(proj, qi);
  const out = [];
  const L = list.slice(0, 40);
  for (let i = 0; i < L.length; i++) {
    for (let j = i + 1; j < L.length; j++) {
      const a = L[i].key;
      const b = L[j].key;
      const pair = [a, b].sort().join('|');
      if (R.dismissed.includes(pair)) continue;
      const min = Math.min(a.length, b.length);
      const max = Math.max(a.length, b.length);
      if (min < 3) continue;
      const d = levenshtein(a, b);
      const wordIn = (x, y) => (' ' + y + ' ').includes(' ' + x + ' ');
      if (d <= Math.max(1, Math.floor(max * 0.25)) || (min >= 4 && (wordIn(a, b) || wordIn(b, a)))) out.push([L[i], L[j]]);
      if (out.length >= 6) return out;
    }
  }
  return out;
}
function mergeGroups(proj, qi, intoKey, fromKeys, list) {
  const R = rulesFor(proj, qi);
  fromKeys.forEach((k) => {
    if (k === intoKey) return;
    const g = list.find((x) => x.key === k);
    (g ? g.members : [k]).forEach((m) => { R.map[m] = intoKey; });
    R.map[k] = intoKey;
    delete R.names[k];
  });
  if (R.map[intoKey] === intoKey) delete R.map[intoKey];
}
function splitGroup(proj, qi, g) {
  const R = rulesFor(proj, qi);
  g.members.forEach((m) => { if (groupKeyFor(R, m) === g.key) delete R.map[m]; });
  delete R.map[g.key];
  delete R.names[g.key];
}
function boardFor(proj, qi) {
  const { list, respondents } = groupsFor(proj, qi);
  const top = list.slice(0, 8).map((g) => ({
    text: g.name.slice(0, 40),
    points: respondents ? Math.round((g.count / respondents) * 100) : 0,
    count: g.count,
    accept: [...new Set(Object.keys(g.raws).map((r) => r.toLowerCase()).filter((r) => r !== g.name.toLowerCase()))].slice(0, 12),
  }));
  return { answers: top, respondents };
}

/* ---------- Screen ---------- */
let crowdState = { id: null, step: 0, qi: 0, pasteMode: 'chat', pending: null, csv: null };

Screens.crowd = {
  html() {
    const list = crowdList();
    const proj = crowdState.id ? crowdGet(crowdState.id) : null;
    if (!proj) {
      return `<main class="page">${pageTop('Your Crowd', 'Survey your own guests. Put their real answers on the board.')}
        <section class="card hero-card"><h2>The answers on the board are your guests' real answers. That's what makes it unforgettable.</h2>
          <p>Text your questions to the group before the party. Paste their replies back here. We count them up and build the board for you. Late replies? Add them any time.</p>
          <div class="btn-row"><button type="button" class="btn btn-gold btn-big" id="cr-new">Start a new survey</button></div></section>
        ${list.length ? `<section class="card"><h2>Your surveys</h2><ul class="cr-list">${list.map((p) => `<li><button type="button" class="cr-open" data-cid="${esc(p.id)}"><b>${esc(p.name)}</b><small>${plural(p.questions.length, 'question')}, ${plural(p.responses.length, 'reply', 'replies')}${p.locked ? ', locked' : ''}</small></button><button type="button" class="btn btn-ghost btn-sm" data-cdel="${esc(p.id)}">Delete</button></li>`).join('')}</ul></section>` : ''}
      </main>`;
    }
    const steps = ['Questions', 'Send', 'Paste replies', 'Group answers', 'Board'];
    return `<main class="page wide">${pageTop(proj.name, 'Your Crowd survey', 'crowd')}
      <ol class="steps clickable" id="cr-steps">${steps.map((s, i) => `<li data-s="${i}" class="${i === crowdState.step ? 'cur' : ''} ${i < crowdState.step ? 'done' : ''}"><button type="button" data-step="${i}"><span>${i + 1}</span>${s}</button></li>`).join('')}</ol>
      <section id="cr-body"></section>
    </main>`;
  },
  bind(root) {
    const nb = $('#cr-new', root);
    if (nb) nb.addEventListener('click', () => {
      const p = newCrowd('My party survey', ['']);
      crowdSave(p);
      crowdState = { id: p.id, step: 0, qi: 0, pasteMode: 'chat', pending: null, csv: null };
      go('crowd');
    });
    $$('.cr-open', root).forEach((b) => b.addEventListener('click', () => {
      const p = crowdGet(b.dataset.cid);
      crowdState = { id: b.dataset.cid, step: p && p.responses.length ? 3 : 0, qi: 0, pasteMode: 'chat', pending: null, csv: null };
      go('crowd');
    }));
    $$('[data-cdel]', root).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Delete this survey?', 'Its replies will be removed from this browser. Packs you already saved stay.', 'Delete', true))) return;
      Store.set('crowd', crowdList().filter((x) => x.id !== b.dataset.cdel));
      go('crowd');
    }));
    const back = $('.pagehead [data-go=crowd]', root);
    if (back) back.addEventListener('click', (e) => { e.stopPropagation(); crowdState.id = null; go('crowd'); }, true);
    $$('[data-step]', root).forEach((b) => b.addEventListener('click', () => { crowdState.step = +b.dataset.step; go('crowd'); }));
    if (crowdState.id && crowdGet(crowdState.id)) renderCrowdStep();
  },
};

function crowdNav(prev, next, nextLabel) {
  return `<div class="actions-bar">${prev != null ? `<button type="button" class="btn btn-ghost" data-cstep="${prev}">Back</button>` : '<span></span>'}${next != null ? `<button type="button" class="btn btn-gold btn-big" data-cstep="${next}">${nextLabel || 'Next'}</button>` : ''}</div>`;
}

function renderCrowdStep() {
  const proj = crowdGet(crowdState.id);
  const body = $('#cr-body');
  const save = () => crowdSave(proj);
  const step = crowdState.step;
  if (step === 0) {
    body.innerHTML = `<div class="card">
        <div class="grid2"><label class="fld">Survey name<input id="cr-name" type="text" maxlength="60" value="${esc(proj.name)}"></label>
        <label class="fld">Event (used in the group text)<input id="cr-event" type="text" maxlength="60" value="${esc(proj.event || '')}" placeholder="For example: Ashley's bachelorette"></label></div>
        <h2>Start from a template</h2><div class="tpl">${Object.entries(CROWD_TEMPLATES).map(([k, t]) => `<button type="button" class="btn btn-sm" data-tpl="${k}">${esc(t.label)}</button>`).join('')}</div>
        <h2>Your questions</h2><p class="hint">Up to 10. Keep them short. "Name something..." works best.</p>
        <ol class="cr-qs" id="cr-qs">${proj.questions.map((q, i) => `<li><input type="text" data-qi="${i}" value="${esc(q)}" maxlength="140" aria-label="Question ${i + 1}" placeholder="Name something..."><button type="button" class="btn btn-ghost btn-sm" data-qdel="${i}" aria-label="Remove question ${i + 1}">Remove</button></li>`).join('')}</ol>
        <button type="button" class="btn btn-sm" id="cr-addq" ${proj.questions.length >= 10 ? 'disabled' : ''}>Add a question</button>
        ${proj.responses.length ? '<p class="note warn">You already have replies. Changing the order of questions will mix up answers.</p>' : ''}
      </div>${crowdNav(null, 1, 'Next: send to guests')}`;
    $('#cr-name').addEventListener('input', (e) => { proj.name = e.target.value.trim() || 'My party survey'; save(); });
    $('#cr-event').addEventListener('input', (e) => { proj.event = e.target.value.trim(); save(); });
    $('#cr-qs').addEventListener('input', (e) => { if (e.target.dataset.qi != null) { proj.questions[+e.target.dataset.qi] = e.target.value; save(); } });
    $$('[data-qdel]').forEach((b) => b.addEventListener('click', async () => {
      const qi = +b.dataset.qdel;
      const has = proj.responses.some((r) => r.answers[qi] != null && String(r.answers[qi]).trim());
      if (has && !(await confirmBox('Remove this question?', 'Its replies will be removed too. Other questions keep their answers.', 'Remove'))) return;
      removeCrowdQuestion(proj, qi);
      if (!proj.questions.length) proj.questions.push('');
      save();
      renderCrowdStep();
    }));
    $('#cr-addq').addEventListener('click', () => { proj.questions.push(''); save(); renderCrowdStep(); const ins = $$('#cr-qs input'); ins[ins.length - 1].focus(); });
    $$('[data-tpl]').forEach((b) => b.addEventListener('click', async () => {
      const t = CROWD_TEMPLATES[b.dataset.tpl];
      if (proj.questions.some((q) => q.trim()) && !(await confirmBox('Use the ' + t.label + ' template?', 'This replaces your current questions.', 'Use template'))) return;
      proj.questions = t.qs.slice();
      if (proj.name === 'My party survey') proj.name = t.label + ' survey';
      save();
      go('crowd');
    }));
  } else if (step === 1) {
    for (let i = proj.questions.length - 1; i >= 0; i--) { if (!String(proj.questions[i]).trim()) removeCrowdQuestion(proj, i); else proj.questions[i] = proj.questions[i].trim(); }
    save();
    if (!proj.questions.length) { crowdState.step = 0; toast('Add at least one question first.', 'warn'); renderCrowdStep(); return; }
    const n = proj.questions.length;
    const msg = `Hi everyone! We're playing ${BRAND_NAME}${proj.event ? ' at ' + proj.event : ''}, and we need your answers for the board.\n\nAnswer with the first thing that comes to mind. There are no wrong answers. Reply with your answers numbered 1 to ${n}.\n\n${proj.questions.map((q, i) => (i + 1) + '. ' + q).join('\n')}\n\nThanks! No peeking at other people's answers.`;
    body.innerHTML = `<div class="card"><h2>Send your questions</h2>
        <p>Copy this message and paste it into your group text. It works in iMessage, regular texts, WhatsApp, Facebook Messenger or email.</p>
        <textarea id="cr-msg" rows="${Math.min(18, n + 8)}" readonly>${esc(msg)}</textarea>
        <div class="btn-row"><button type="button" class="btn btn-gold" id="cr-copy">Copy message</button></div></div>
      <div class="card"><h2>Prefer a Google Form?</h2>
        <ol class="how"><li>Download the questions file below.</li><li>In Google Forms, make one "Short answer" question for each line.</li><li>When replies are in, open Responses, click the three dots, and choose Download responses (.csv).</li></ol>
        <button type="button" class="btn btn-sm" id="cr-qcsv">Download questions (CSV)</button></div>
      ${crowdNav(0, 2, 'Next: paste replies')}`;
    $('#cr-copy').addEventListener('click', async () => {
      const ok = await copyText(msg);
      if (ok) toast('Copied. Paste it into your group text.'); else { $('#cr-msg').select(); toast('Press Ctrl+C (or Cmd+C on Mac) to copy.'); }
    });
    $('#cr-qcsv').addEventListener('click', () => download(fileSlug(proj.name) + '-questions.csv', toCSV([['Question']].concat(proj.questions.map((q) => [q]))), 'text/csv'));
  } else if (step === 2) {
    renderPasteStep(proj, body);
  } else if (step === 3) {
    renderGroupStep(proj, body);
  } else {
    renderBoardStep(proj, body);
  }
  $$('[data-cstep]', body).forEach((b) => b.addEventListener('click', () => {
    const s = +b.dataset.cstep;
    if (s === 1 && !proj.questions.some((q) => q.trim())) { toast('Add at least one question first.', 'warn'); return; }
    if (s >= 3 && !proj.responses.length) { toast('Paste some replies first.', 'warn'); return; }
    crowdState.step = s;
    go('crowd');
  }));
}

function renderPasteStep(proj, body) {
  const mode = crowdState.pasteMode;
  if (proj.locked) {
    body.innerHTML = `<div class="card"><h2>This board is locked</h2><p>Unlock it on the Board step to add more replies.</p></div>${crowdNav(1, 3)}`;
    return;
  }
  body.innerHTML = `<div class="card">
      <h2>${proj.responses.length ? 'Add more replies' : 'Paste the replies'}</h2>
      ${proj.responses.length ? `<p class="hint">You have ${plural(proj.responses.length, 'reply', 'replies')} so far. Paste the whole chat again if you like. We skip replies we already counted.</p>` : ''}
      <div class="tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${mode === 'chat'}" data-pm="chat">Group chat or texts</button>
        <button type="button" role="tab" aria-selected="${mode === 'csv'}" data-pm="csv">Google Forms CSV</button>
        <button type="button" role="tab" aria-selected="${mode === 'lines'}" data-pm="lines">One question at a time</button>
      </div>
      ${mode === 'chat' ? `<p class="hint">Copy the replies from your group chat and paste them below. We understand "Name: 1. answer", WhatsApp exports, and answers written as 1. or 1) or Q1:.</p>
        <textarea id="cr-paste" rows="12" placeholder="Ashley: 1. Wine 2. Paris 3. Dancing&#10;[11/20/2026, 9:03 PM] Megan: 1. Champagne&#10;2. Hawaii"></textarea>
        <div class="btn-row"><button type="button" class="btn btn-gold" id="cr-parse">Read the replies</button><button type="button" class="btn btn-ghost btn-sm" id="cr-file">Open a chat export (.txt)</button></div>` : ''}
      ${mode === 'csv' ? `<p class="hint">Download the responses from Google Forms as a .csv file, then open it here. Or paste the CSV text.</p>
        <div class="btn-row"><button type="button" class="btn btn-gold" id="cr-csvfile">Open CSV file</button></div>
        <textarea id="cr-paste" rows="8" placeholder="Timestamp,Name something the bride always says,..."></textarea>
        <div class="btn-row"><button type="button" class="btn" id="cr-parse">Read pasted CSV</button></div>
        <div id="cr-map"></div>` : ''}
      ${mode === 'lines' ? `<p class="hint">Got answers on paper or in a list? Pick a question, then paste one answer per line. Each line is one person.</p>
        <label class="fld">Question<select id="cr-lq">${proj.questions.map((q, i) => `<option value="${i}">${i + 1}. ${esc(q)}</option>`).join('')}</select></label>
        <textarea id="cr-paste" rows="10" placeholder="Wine&#10;Champagne&#10;wine!!"></textarea>
        <div class="btn-row"><button type="button" class="btn btn-gold" id="cr-parse">Read the answers</button></div>` : ''}
    </div>
    <div id="cr-preview"></div>
    ${crowdNav(1, proj.responses.length ? 3 : null, 'Next: group answers')}`;
  $$('[data-pm]', body).forEach((b) => b.addEventListener('click', () => { crowdState.pasteMode = b.dataset.pm; crowdState.pending = null; crowdState.csv = null; renderCrowdStep(); }));
  const parse = () => {
    const text = $('#cr-paste').value;
    if (!text.trim()) { toast('Paste some replies first.', 'warn'); return; }
    let res = [];
    if (mode === 'chat') res = parseChat(text, proj);
    else if (mode === 'lines') {
      const qi = +$('#cr-lq').value;
      res = text.replace(/\r/g, '').split('\n').map((s) => s.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).map((s, i) => ({ who: 'Answer ' + (i + 1), answers: { [qi]: s }, single: true }));
    } else { handleCSV(text); return; }
    showPreview(res);
  };
  const handleCSV = (text) => {
    const rows = parseCSV(text);
    if (rows.length < 2) { toast('That CSV has no replies yet.', 'warn'); return; }
    crowdState.csv = { rows, mapping: csvMapping(rows[0], proj) };
    renderCSVMap();
  };
  const renderCSVMap = () => {
    const { rows, mapping } = crowdState.csv;
    const head = rows[0];
    $('#cr-map').innerHTML = `<h3>Match columns to questions</h3><table class="map-t"><tbody>${proj.questions.map((q, qi) => `<tr><td>${qi + 1}. ${esc(q)}</td><td><select data-map="${qi}"><option value="-1">Not in this file</option>${head.map((h, ci) => `<option value="${ci}" ${mapping.map[qi] === ci ? 'selected' : ''}>${esc(h || 'Column ' + (ci + 1))}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
    $$('[data-map]').forEach((s) => s.addEventListener('change', () => { mapping.map[+s.dataset.map] = +s.value; showPreview(parseCSVReplies(rows, mapping)); }));
    showPreview(parseCSVReplies(rows, mapping));
  };
  $('#cr-parse').addEventListener('click', parse);
  const fb = $('#cr-file');
  if (fb) fb.addEventListener('click', async () => { const f = await pickFile('.txt,text/plain'); if (f) { $('#cr-paste').value = f.text; parse(); } });
  const cf = $('#cr-csvfile');
  if (cf) cf.addEventListener('click', async () => { const f = await pickFile('.csv,text/csv,text/plain'); if (f) handleCSV(f.text); });
  if (crowdState.pending) showPreview(crowdState.pending);
}

function showPreview(res) {
  const proj = crowdGet(crowdState.id);
  crowdState.pending = res;
  const box = $('#cr-preview');
  if (!res.length) {
    box.innerHTML = '<div class="card"><p class="warn">We could not find any numbered answers. Make sure each reply has the person\'s name and answers like "1. Wine 2. Paris". You can also use One question at a time.</p></div>';
    return;
  }
  const qs = proj.questions;
  box.innerHTML = `<div class="card"><h2>Here's what we understood</h2><p class="hint">${plural(res.length, 'person', 'people')}. Fix anything that looks wrong, untick anyone to skip them, then add them.</p>
    <div class="table-scroll"><table class="pv-t"><thead><tr><th>Add</th><th>Name</th>${qs.map((q, i) => `<th title="${esc(q)}">${i + 1}</th>`).join('')}</tr></thead><tbody>
    ${res.map((r, ri) => `<tr><td><input type="checkbox" data-inc="${ri}" checked aria-label="Add ${esc(r.who)}"></td><td><input type="text" data-who="${ri}" value="${esc(r.who)}" aria-label="Name"></td>${qs.map((_, qi) => `<td><input type="text" data-r="${ri}" data-q="${qi}" value="${esc(r.answers[qi] || '')}" aria-label="${esc(r.who)}, answer ${qi + 1}"></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <div class="btn-row"><button type="button" class="btn btn-gold btn-big" id="cr-add">Add ${plural(res.length, 'reply', 'replies')}</button></div></div>`;
  box.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.who != null) res[+t.dataset.who].who = t.value;
    if (t.dataset.r != null) res[+t.dataset.r].answers[+t.dataset.q] = t.value;
  });
  $('#cr-add').addEventListener('click', () => {
    const inc = $$('[data-inc]', box).filter((c) => c.checked).map((c) => res[+c.dataset.inc]);
    const r = addReplies(proj, inc);
    crowdSave(proj);
    crowdState.pending = null;
    toast(`Added ${plural(r.added, 'new reply', 'new replies')}${r.updated ? ', updated ' + r.updated : ''}${r.skipped ? ', skipped ' + r.skipped + ' already counted' : ''}.`);
    crowdState.step = 3;
    go('crowd');
  });
}

function addReplies(proj, list) {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  list.forEach((r) => {
    const answers = {};
    Object.entries(r.answers).forEach(([k, v]) => { if (String(v || '').trim()) answers[k] = String(v).trim(); });
    if (!Object.keys(answers).length) return;
    if (r.single) { proj.responses.push({ id: uid('resp'), who: r.who, answers }); added++; return; }
    const who = String(r.who || '').trim();
    const ex = who && !/^(guest|form reply|answer) \d+$/i.test(who) ? proj.responses.find((x) => x.who.toLowerCase() === who.toLowerCase()) : null;
    if (ex) {
      const before = JSON.stringify(ex.answers);
      Object.assign(ex.answers, answers);
      if (JSON.stringify(ex.answers) === before) skipped++; else updated++;
    } else {
      const sig = JSON.stringify(answers);
      if (proj.responses.some((x) => JSON.stringify(x.answers) === sig && x.who === who)) { skipped++; return; }
      proj.responses.push({ id: uid('resp'), who: who || 'Guest ' + (proj.responses.length + 1), answers });
      added++;
    }
  });
  return { added, updated, skipped };
}

function renderGroupStep(proj, body) {
  const qi = clamp(crowdState.qi, 0, proj.questions.length - 1);
  crowdState.qi = qi;
  const { list, deleted, respondents } = groupsFor(proj, qi);
  const sugg = fuzzySuggestions(proj, qi, list);
  body.innerHTML = `<div class="card">
      <div class="qtabs" role="tablist">${proj.questions.map((q, i) => `<button type="button" role="tab" aria-selected="${i === qi}" data-gq="${i}" title="${esc(q)}">Q${i + 1}</button>`).join('')}</div>
      <h2>${qi + 1}. ${esc(proj.questions[qi])}</h2>
      <p class="big-stat"><b>${respondents}</b> ${respondents === 1 ? 'person' : 'people'} answered</p>
      ${sugg.length ? `<div class="sugg"><h3>Same thing?</h3>${sugg.map(([a, b], i) => `<div class="sugg-row"><span>"${esc(a.name)}" and "${esc(b.name)}"</span><button type="button" class="btn btn-gold btn-sm" data-sm="${i}">Merge</button><button type="button" class="btn btn-ghost btn-sm" data-sk="${i}">Keep separate</button></div>`).join('')}</div>` : ''}
      <p class="hint">Tick two or more answers and click Merge to count them as one. Click a name to rename it. Merges are remembered when you add late replies.</p>
      <div class="btn-row"><button type="button" class="btn btn-sm" id="g-merge" disabled>Merge selected</button></div>
      <ul class="groups">${list.map((g, i) => `<li class="${i < 8 ? 'top' : ''}">
        <input type="checkbox" data-gsel="${esc(g.key)}" aria-label="Select ${esc(g.name)}">
        <button type="button" class="g-name" data-gren="${esc(g.key)}" title="Rename">${esc(g.name)}</button>
        <span class="g-count">${g.count}</span>
        <span class="g-raw">${Object.keys(g.raws).length > 1 ? esc(Object.keys(g.raws).join(', ')) : ''}</span>
        ${g.members.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-gsplit="${esc(g.key)}">Split</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-gdel="${esc(g.key)}">Delete</button></li>`).join('')}</ul>
      ${deleted.length ? `<details><summary>Deleted answers (${deleted.length})</summary><ul class="groups">${deleted.map((g) => `<li><span class="g-name">${esc(g.name)}</span><span class="g-count">${g.count}</span><button type="button" class="btn btn-ghost btn-sm" data-gres="${esc(g.key)}">Restore</button></li>`).join('')}</ul></details>` : ''}
    </div>${crowdNav(2, 4, 'Next: see the board')}`;
  const R = rulesFor(proj, qi);
  const redo = () => { crowdSave(proj); renderCrowdStep(); };
  $$('[data-gq]', body).forEach((b) => b.addEventListener('click', () => { crowdState.qi = +b.dataset.gq; renderCrowdStep(); }));
  $$('[data-sm]', body).forEach((b) => b.addEventListener('click', () => { const [a, c] = sugg[+b.dataset.sm]; mergeGroups(proj, qi, a.key, [c.key], list); redo(); }));
  $$('[data-sk]', body).forEach((b) => b.addEventListener('click', () => { const [a, c] = sugg[+b.dataset.sk]; R.dismissed.push([a.key, c.key].sort().join('|')); redo(); }));
  const sel = () => $$('[data-gsel]', body).filter((c) => c.checked).map((c) => c.dataset.gsel);
  $$('[data-gsel]', body).forEach((c) => c.addEventListener('change', () => { $('#g-merge').disabled = sel().length < 2; }));
  $('#g-merge').addEventListener('click', () => {
    const keys = sel();
    const into = list.find((g) => keys.includes(g.key)).key;
    mergeGroups(proj, qi, into, keys, list);
    toast('Merged.');
    redo();
  });
  $$('[data-gren]', body).forEach((b) => b.addEventListener('click', async () => {
    const g = list.find((x) => x.key === b.dataset.gren);
    let val = g.name;
    const v = await modal({
      title: 'Rename answer',
      body: `<label class="fld">Show on the board as<input id="g-ren" type="text" maxlength="40" value="${esc(g.name)}" autofocus></label>`,
      actions: [{ label: 'Cancel', value: null }, { label: 'Save', primary: true, value: 'ok', validate: (w) => { val = w.querySelector('#g-ren').value.trim(); return !!val; } }],
    });
    if (v === 'ok') { R.names[g.key] = val; redo(); }
  }));
  $$('[data-gsplit]', body).forEach((b) => b.addEventListener('click', () => { splitGroup(proj, qi, list.find((x) => x.key === b.dataset.gsplit)); redo(); }));
  $$('[data-gdel]', body).forEach((b) => b.addEventListener('click', () => { R.deleted.push(b.dataset.gdel); redo(); }));
  $$('[data-gres]', body).forEach((b) => b.addEventListener('click', () => { R.deleted = R.deleted.filter((k) => k !== b.dataset.gres); redo(); }));
}

function crowdPack(proj) {
  const rounds = [];
  proj.questions.forEach((q, qi) => {
    const b = boardFor(proj, qi);
    if (b.answers.length >= 3) rounds.push({ q, answers: b.answers.map((a) => ({ text: a.text, points: a.points, accept: a.accept })) });
  });
  return { id: 'crowd-' + proj.id.replace(/^crowd-/, ''), name: proj.name.slice(0, 60), audience: 'Our guests', region: 'US', source: 'surveyed', rounds, lightning: [] };
}

function renderBoardStep(proj, body) {
  const boards = proj.questions.map((q, qi) => ({ q, ...boardFor(proj, qi) }));
  const packId = 'crowd-' + proj.id.replace(/^crowd-/, '');
  const saved = !!customPacks().find((p) => p.id === packId);
  body.innerHTML = `<div class="card">
      <h2>Your boards</h2>
      <p class="hint">Points = how many people gave that answer, out of everyone who answered. Each board shows the top 8.</p>
      <div class="btn-row">
        <label class="toggle"><input type="checkbox" id="cr-lock" ${proj.locked ? 'checked' : ''}><span>Lock board (no more changes)</span></label>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-gold btn-big" id="cr-save">${saved ? 'Update the pack' : 'Save as a pack'}</button>
        <button type="button" class="btn" id="cr-play" ${saved ? '' : 'disabled'}>Play with this pack</button>
        <button type="button" class="btn" id="cr-json">Export JSON</button>
        ${proj.locked ? '' : '<button type="button" class="btn btn-ghost" data-cstep="2">Add more replies</button>'}
      </div>
    </div>
    <div class="cr-boards">${boards.map((b, i) => `<div class="card cr-board"><h3>${i + 1}. ${esc(b.q)}</h3><p class="hint">${b.respondents} ${b.respondents === 1 ? 'person' : 'people'} answered</p>
      ${b.answers.length < 3 ? '<p class="warn">Needs at least 3 different answers to play.</p>' : ''}
      <ol class="mini-board">${b.answers.map((a) => `<li><span>${esc(a.text)}</span><b>${a.points}</b></li>`).join('')}</ol></div>`).join('')}</div>
    ${crowdNav(3, null)}`;
  $('#cr-lock').addEventListener('change', (e) => { proj.locked = e.target.checked; crowdSave(proj); renderCrowdStep(); });
  $('#cr-save').addEventListener('click', () => {
    const p = crowdPack(proj);
    if (!p.rounds.length) { toast('No question has 3 answers yet. Add more replies first.', 'warn'); return; }
    upsertCustomPack(p);
    toast('Saved "' + p.name + '" with ' + plural(p.rounds.length, 'question') + '.');
    renderCrowdStep();
  });
  $('#cr-play').addEventListener('click', () => go('setup', { pack: packId }));
  $('#cr-json').addEventListener('click', () => download(fileSlug(proj.name) + '-pack.json', JSON.stringify(crowdPack(proj), null, 2)));
}
