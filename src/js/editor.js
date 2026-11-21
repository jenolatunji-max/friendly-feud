/* =========================================================
   Question editor and pack manager
   ========================================================= */
let edSel = null;

Screens.editor = {
  html(arg) {
    if (arg && arg.pack) edSel = arg.pack;
    const packs = allPacks();
    if (!edSel || !packs.find((p) => p.id === edSel)) edSel = (customPacks()[0] || packs[0] || {}).id;
    return `<main class="page wide">${pageTop('Edit Questions', 'Built-in packs are read-only. Duplicate one to make it your own.')}
      <div class="ed">
        <aside class="ed-list card" aria-label="Packs">
          <div class="btn-row"><button type="button" class="btn btn-gold btn-sm" id="ed-new">New pack</button><button type="button" class="btn btn-sm" id="ed-imp">Import .json</button><button type="button" class="btn btn-sm" id="ed-csv">Import CSV</button></div>
          <ul>${packs.map((p) => `<li><button type="button" class="ed-p ${p.id === edSel ? 'sel' : ''}" data-pid="${esc(p.id)}"><b>${esc(p.name)}</b><small>${plural((p.rounds || []).length, 'question')}${(p.lightning || []).length ? ', ' + plural(p.lightning.length, 'Lightning set') : ''} &middot; ${p.builtin ? 'Built-in' : p.source === 'surveyed' ? 'Your crowd' : 'Custom'}</small></button></li>`).join('')}</ul>
        </aside>
        <section class="ed-main" id="ed-main"></section>
      </div>
    </main>`;
  },
  bind(root) {
    $$('.ed-p', root).forEach((b) => b.addEventListener('click', () => { edSel = b.dataset.pid; go('editor'); }));
    $('#ed-new', root).addEventListener('click', () => {
      const p = { id: uid('pack'), name: 'My pack', audience: '', region: 'US', source: 'estimate', rounds: [{ q: 'Name something...', answers: [{ text: '', points: 0, accept: [] }, { text: '', points: 0, accept: [] }, { text: '', points: 0, accept: [] }] }], lightning: [] };
      upsertCustomPack(p);
      edSel = p.id;
      go('editor');
    });
    $('#ed-imp', root).addEventListener('click', async () => {
      const f = await pickFile('.json,application/json');
      if (!f) return;
      try {
        const data = JSON.parse(f.text);
        const p = validatePack(data);
        if (getPack(p.id) && getPack(p.id).builtin) p.id = uid('pack');
        upsertCustomPack(p);
        edSel = p.id;
        toast('Imported "' + p.name + '".');
        go('editor');
      } catch (e) { toast(e instanceof SyntaxError ? 'That file is not a pack file.' : e.message, 'bad'); }
    });
    $('#ed-csv', root).addEventListener('click', async () => {
      const f = await pickFile('.csv,text/csv,text/plain');
      if (!f) return;
      try {
        const rounds = csvToRounds(f.text);
        const p = { id: uid('pack'), name: f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Imported pack', audience: '', region: 'US', source: 'estimate', rounds, lightning: [] };
        upsertCustomPack(p);
        edSel = p.id;
        toast('Imported ' + plural(rounds.length, 'question') + '.');
        go('editor');
      } catch (e) { toast(e.message, 'bad'); }
    });
    renderEditorMain();
  },
};

function renderEditorMain() {
  const main = $('#ed-main');
  const p = getPack(edSel);
  if (!main) return;
  if (!p) { main.innerHTML = '<div class="card"><p>Pick a pack on the left.</p></div>'; return; }
  const tools = `<div class="btn-row">
      ${p.builtin ? '<button type="button" class="btn btn-gold btn-sm" data-ed="dup">Duplicate to edit</button>' : '<button type="button" class="btn btn-sm" data-ed="dup">Duplicate</button>'}
      <button type="button" class="btn btn-sm" data-ed="json">Export .json</button>
      <button type="button" class="btn btn-sm" data-ed="csv">Export CSV</button>
      <button type="button" class="btn btn-sm" data-ed="print">Print host cards</button>
      <button type="button" class="btn btn-sm" data-ed="play">Play this pack</button>
      ${p.builtin ? '' : '<button type="button" class="btn btn-red btn-sm" data-ed="del">Delete pack</button>'}
    </div>`;
  if (p.builtin) {
    main.innerHTML = `<div class="card"><h2>${esc(p.name)}</h2><p class="hint">${esc(p.audience)}. Region ${esc(p.region)}. Answers are estimates of popular answers, not a formal survey.</p>${tools}</div>
      ${(p.rounds || []).map((r, i) => `<div class="card ro"><h3>${i + 1}. ${esc(r.q)}</h3><ol class="ro-ans">${r.answers.map((a) => `<li><b>${esc(a.text)}</b> <span class="pts-chip">${a.points}</span>${a.accept && a.accept.length ? `<small>${esc(a.accept.join(', '))}</small>` : ''}</li>`).join('')}</ol></div>`).join('')}
      ${(p.lightning || []).map((s) => `<div class="card ro"><h3>${esc(s.name)} (Lightning Round)</h3><ol>${s.questions.map((q) => `<li>${esc(q.q)} <small>${esc(q.answers.map((a) => a.text + ' ' + a.points).join(', '))}</small></li>`).join('')}</ol></div>`).join('')}`;
  } else {
    main.innerHTML = `<div class="card">
        <div class="grid2"><label class="fld">Pack name<input id="ed-name" type="text" maxlength="60" value="${esc(p.name)}"></label>
        <label class="fld">Who it's for<input id="ed-aud" type="text" maxlength="80" value="${esc(p.audience || '')}" placeholder="For example: coworkers, family"></label></div>
        ${tools}
        <p class="hint">Saves as you type. Points for a question should add up to 100 or less. "Also accept" is a comma list of other ways to say it.</p>
      </div>
      <div id="ed-rounds">${p.rounds.map((r, i) => roundEditor(r, i, p.rounds.length)).join('')}</div>
      <div class="btn-row"><button type="button" class="btn btn-gold" data-ed="addq">Add a question</button></div>`;
    bindRoundEditor(p);
  }
  main.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => editorAction(b.dataset.ed, p, b)));
}

function roundEditor(r, i, n) {
  const w = roundWarnings(r);
  const total = r.answers.reduce((s, a) => s + (+a.points || 0), 0);
  return `<div class="card red" data-ri="${i}">
    <div class="red-head"><span class="red-n">${i + 1}</span>
      <input class="red-q" type="text" value="${esc(r.q)}" aria-label="Question ${i + 1}" placeholder="Name something...">
      <div class="red-tools">
        <button type="button" class="btn btn-ghost btn-sm" data-ed="up" data-ri="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">Up</button>
        <button type="button" class="btn btn-ghost btn-sm" data-ed="down" data-ri="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">Down</button>
        <button type="button" class="btn btn-ghost btn-sm" data-ed="delq" data-ri="${i}">Remove</button>
      </div></div>
    <table class="red-t"><thead><tr><th>#</th><th>Answer</th><th>Points</th><th>Also accept</th><th></th></tr></thead><tbody>
      ${r.answers.map((a, j) => `<tr data-ai="${j}"><td>${j + 1}</td>
        <td><input class="ra-t" type="text" maxlength="40" value="${esc(a.text)}" aria-label="Answer ${j + 1}"></td>
        <td><input class="ra-p" type="number" min="0" max="100" value="${a.points}" aria-label="Points for answer ${j + 1}"></td>
        <td><input class="ra-a" type="text" value="${esc((a.accept || []).join(', '))}" aria-label="Other ways to say answer ${j + 1}"></td>
        <td><button type="button" class="btn btn-ghost btn-sm" data-ed="dela" data-ri="${i}" data-ai="${j}" aria-label="Remove answer ${j + 1}">Remove</button></td></tr>`).join('')}
    </tbody></table>
    <div class="red-foot"><button type="button" class="btn btn-sm" data-ed="adda" data-ri="${i}" ${r.answers.length >= 8 ? 'disabled' : ''}>Add answer</button>
      <span class="total ${total > 100 ? 'bad' : ''}">Total ${total} of 100</span>
      <span class="warns">${w.map((x) => `<span class="warn">${esc(x)}</span>`).join('')}</span></div>
  </div>`;
}

function bindRoundEditor(p) {
  const save = debounce(() => { upsertCustomPack(p); }, 300);
  $('#ed-name').addEventListener('input', (e) => { p.name = e.target.value.trim() || 'My pack'; save(); });
  $('#ed-aud').addEventListener('input', (e) => { p.audience = e.target.value; save(); });
  const box = $('#ed-rounds');
  box.addEventListener('input', (e) => {
    const card = e.target.closest('[data-ri]');
    if (!card) return;
    const r = p.rounds[+card.dataset.ri];
    if (e.target.classList.contains('red-q')) r.q = e.target.value;
    const tr = e.target.closest('tr[data-ai]');
    if (tr) {
      const a = r.answers[+tr.dataset.ai];
      if (e.target.classList.contains('ra-t')) a.text = e.target.value;
      if (e.target.classList.contains('ra-p')) a.points = clamp(Math.round(+e.target.value || 0), 0, 100);
      if (e.target.classList.contains('ra-a')) a.accept = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
    }
    // refresh warnings without re-rendering inputs
    const total = r.answers.reduce((s, a) => s + (+a.points || 0), 0);
    const tEl = card.querySelector('.total');
    tEl.textContent = 'Total ' + total + ' of 100';
    tEl.classList.toggle('bad', total > 100);
    card.querySelector('.warns').innerHTML = roundWarnings(r).map((x) => `<span class="warn">${esc(x)}</span>`).join('');
    save();
  });
  box.addEventListener('change', (e) => {
    if (e.target.classList.contains('ra-p')) e.target.closest('[data-ri]').dataset.dirty = '1';
  });
  // Re-sort answers by points only after focus leaves the question card, so typing is never interrupted.
  box.addEventListener('focusout', (e) => {
    const card = e.target.closest('[data-ri]');
    if (!card || !card.dataset.dirty || (e.relatedTarget && card.contains(e.relatedTarget))) return;
    const r = p.rounds[+card.dataset.ri];
    r.answers.sort((x, y) => y.points - x.points);
    upsertCustomPack(p);
    card.outerHTML = roundEditor(r, +card.dataset.ri, p.rounds.length);
    $$(`[data-ri="${card.dataset.ri}"] [data-ed]`, box).forEach((b) => b.addEventListener('click', () => editorAction(b.dataset.ed, p, b)));
  });
}

async function editorAction(a, p, b) {
  const ri = b.dataset.ri != null ? +b.dataset.ri : null;
  const re = () => { upsertCustomPack(p); renderEditorMain(); };
  switch (a) {
    case 'dup': {
      const c = deepCopy(p);
      delete c.builtin;
      c.id = uid('pack');
      c.name = (p.name + ' (my copy)').slice(0, 60);
      upsertCustomPack(c);
      edSel = c.id;
      toast('Made a copy you can edit.');
      go('editor');
      break;
    }
    case 'json': { const c = deepCopy(p); delete c.builtin; download(fileSlug(p.name) + '.json', JSON.stringify(c, null, 2)); break; }
    case 'csv': download(fileSlug(p.name) + '.csv', packToCSV(p), 'text/csv'); break;
    case 'print': printCards(p.rounds, p.name); break;
    case 'play': go('setup', { pack: p.id }); break;
    case 'del':
      if (await confirmBox('Delete "' + p.name + '"?', 'This removes the pack from this browser. Export it first if you want a copy.', 'Delete pack', true)) { deleteCustomPack(p.id); edSel = null; go('editor'); }
      break;
    case 'addq': p.rounds.push({ q: '', answers: [0, 1, 2].map(() => ({ text: '', points: 0, accept: [] })) }); re(); setTimeout(() => { const q = $$('.red-q'); if (q.length) q[q.length - 1].focus(); }, 30); break;
    case 'delq': if (await confirmBox('Remove this question?', esc(p.rounds[ri].q || 'This question') + ' will be removed.', 'Remove')) { p.rounds.splice(ri, 1); re(); } break;
    case 'up': if (ri > 0) { [p.rounds[ri - 1], p.rounds[ri]] = [p.rounds[ri], p.rounds[ri - 1]]; re(); } break;
    case 'down': if (ri < p.rounds.length - 1) { [p.rounds[ri + 1], p.rounds[ri]] = [p.rounds[ri], p.rounds[ri + 1]]; re(); } break;
    case 'adda': if (p.rounds[ri].answers.length < 8) { p.rounds[ri].answers.push({ text: '', points: 0, accept: [] }); re(); } break;
    case 'dela': p.rounds[ri].answers.splice(+b.dataset.ai, 1); re(); break;
    default: break;
  }
}
