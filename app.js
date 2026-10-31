/* Knockout Forms: phone app. Screens: home, fill, sign, review, sent, settings, brand, forms, formsEdit. */
(function () {
  const C = window.APP_CONFIG, $ = s => document.querySelector(s), main = $('#main');
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Phone storage is full. Send waiting forms, then try again.'); return false; } },
    del(k) { localStorage.removeItem(k); }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const nowText = () => new Date().toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ICONS = { heater: 'W', clipboard: '$', receipt: '#', check: '\u2713', shield: '\u2605', search: '\u2315' };
  let defaultLogo = '';

  /* ---------- settings: shop overrides on top of config.js ---------- */
  const S = {
    get() { return LS.get('kf_settings', { brand: {}, forms: {}, updatedAt: 0 }); },
    save(s, sync) { s.updatedAt = Date.now(); if (!LS.set('kf_settings', s)) return false; applyTheme(); if (sync !== false) syncSettings(); return true; }
  };
  function brand() {
    const b = clone(C.business), o = S.get().brand || {};
    ['name', 'phone', 'email', 'thanks'].forEach(k => { if (o[k] != null) b[k] = o[k]; });
    b.colors = Object.assign({}, b.colors, o.colors || {});
    b.logoData = o.logoData || defaultLogo;
    b.logoSrc = o.logoData || b.logo;
    return b;
  }
  function forms(all) {
    const o = S.get().forms || {};
    return C.forms.map(f => {
      const g = clone(f), x = o[f.id] || {};
      g.hidden = !!x.hidden;
      if (x.title) g.title = x.title;
      g.sections.forEach(sec => sec.fields.forEach(fl => {
        const fo = (x.fields || {})[fl.id]; if (!fo) return;
        ['items', 'options', 'text'].forEach(k => { if (fo[k] != null) fl[k] = fo[k]; });
      }));
      return g;
    }).filter(f => all || !f.hidden);
  }
  const formById = id => forms(true).find(f => f.id === id);
  function applyTheme() {
    const b = brand(), r = document.documentElement.style;
    r.setProperty('--primary', b.colors.primary); r.setProperty('--accent', b.colors.accent); r.setProperty('--bg', b.colors.bg);
    $('#brandLogo').src = b.logoSrc; $('#brandName').textContent = b.name; document.title = b.name + ' Forms';
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = b.colors.accent;
  }

  /* ---------- connection to the shop's Google Sheet ---------- */
  const conn = () => LS.get('kf_conn', null);
  function readSetup(text) {
    const m = /setup=([^&\s]+)/.exec(text || ''); if (!m) return false;
    try {
      const j = JSON.parse(atob(decodeURIComponent(m[1])));
      if (!j.api || !j.key) return false;
      LS.set('kf_conn', { api: j.api, key: j.key });
      if (j.tech && !LS.get('kf_tech', '')) LS.set('kf_tech', j.tech);
      return true;
    } catch (e) { return false; }
  }
  async function api(action, data) {
    const c = conn(); if (!c) throw new Error('not connected');
    const r = await fetch(c.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, key: c.key }, data || {})) });
    const j = await r.json(); if (!j.ok) throw new Error(j.error || 'failed'); return j;
  }
  async function ping() {
    const j = await api('ping');
    if (j.shop) LS.set('kf_shop', j.shop);
    const rs = j.settings, ls = S.get();
    if (rs && (rs.updatedAt || 0) > (ls.updatedAt || 0)) { LS.set('kf_settings', rs); applyTheme(); }
    else if ((ls.updatedAt || 0) > ((rs && rs.updatedAt) || 0)) syncSettings();
    return j;
  }
  function syncSettings() { if (conn()) api('saveSettings', { settings: S.get() }).catch(() => {}); }

  /* ---------- outbox: forms wait here until they reach the shop ---------- */
  let flushing = false;
  async function flush() {
    if (flushing || !conn()) return 0;
    flushing = true; let sent = 0;
    try {
      for (const rec of LS.get('kf_outbox', [])) {
        try {
          const j = await api('submit', { record: rec });
          LS.set('kf_outbox', LS.get('kf_outbox', []).filter(x => x.id !== rec.id));
          setRecent(rec.id, { status: 'sent', emailedTo: j.emailedTo || '' }); sent++;
        } catch (e) { break; }
      }
    } finally { flushing = false; }
    if (sent && cur.name === 'home') render();
    return sent;
  }
  function setRecent(id, patch) { LS.set('kf_recent', LS.get('kf_recent', []).map(r => r.id === id ? Object.assign(r, patch) : r)); }

  /* ---------- small helpers ---------- */
  function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); }
  function banner() {
    const el = $('#banner'), waiting = LS.get('kf_outbox', []).length;
    let t = '';
    if (!conn()) t = 'Not connected to the shop yet. Forms save on this phone. Open the setup link from the shop to connect.';
    else if (waiting) t = waiting + ' form' + (waiting > 1 ? 's' : '') + ' waiting to send. They go out when you have signal.';
    el.textContent = t; el.hidden = !t;
  }
  const digits = s => String(s || '').replace(/[^0-9+]/g, '');
  function smsLink(phone, first, formTitle) {
    const tech = LS.get('kf_tech', '') || 'your tech', biz = brand().name;
    const body = 'Hi ' + (first || 'there') + ', this is ' + tech + ' with ' + biz + '. I just emailed your signed ' + formTitle + '. Text me back anytime with questions.';
    return 'sms:' + digits(phone) + '?&body=' + encodeURIComponent(body);
  }
  function newId() { const d = new Date(); return (C.business.id || 'f').slice(0, 2).toUpperCase() + '-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
  function nextInvoice() { const n = LS.get('kf_invno', 1000) + 1; LS.set('kf_invno', n); return 'INV-' + n; }
  function resizeImage(file, max, type, q) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const im = new Image(); im.onload = () => {
        const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        const x = c.getContext('2d'); if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
        x.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL(type, q));
      }; im.onerror = rej; im.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  function totalFor(form, v) {
    if (form.id === 'invoice') return KFPDF.money(KFPDF.invoiceTotals(v).total);
    if (form.id === 'estimate') { const o = (v.options || {})[v.picked]; return o && o.price ? KFPDF.money(o.price) : ''; }
    const pg = form.sections.flatMap(s => s.fields).find(f => f.type === 'pricegrid');
    if (pg && v[pg.id] && v[pg.id].pick) {
      const pv = v[pg.id], has = c => String(pv[pv.pick + '_' + c.id] || '').trim();
      const chosen = Object.values(v).filter(Array.isArray).flat().map(x => String(x).toLowerCase());
      const col = pg.cols.find(c => has(c) && chosen.indexOf(c.label.toLowerCase()) >= 0) || pg.cols.find(has);
      return col ? KFPDF.money(pv[pv.pick + '_' + col.id]) + ' ' + (pg.unit || '') : '';
    }
    return '';
  }

  /* ---------- navigation ---------- */
  let cur = { name: 'home' }; const stack = [];
  let draft = LS.get('kf_draft', null), sigs = {}, lastDoc = null, lastBlobUrl = '', lastRec = null;
  function go(name, p, replace) { if (!replace) stack.push(cur); cur = Object.assign({ name }, p || {}); render(); window.scrollTo(0, 0); }
  function back() { cur = stack.pop() || { name: 'home' }; render(); window.scrollTo(0, 0); }
  $('#back').onclick = back;
  $('#gear').onclick = () => { if (cur.name !== 'settings') go('settings'); };
  function chrome(title, showBack) { $('#screenTitle').textContent = title; $('#back').hidden = !showBack; $('#gear').hidden = !!showBack && cur.name !== 'home'; banner(); }
  function dock(html) { return '<div class="dock">' + html + '</div>'; }
  function render() {
    applyTheme();
    ({ home, fill, sign, review, sent, settings, brandScreen, formsScreen, formsEdit })[cur.name]();
  }

  /* ---------- home ---------- */
  function home() {
    stack.length = 0; chrome('Pick a form', false);
    const recent = LS.get('kf_recent', []), waiting = LS.get('kf_outbox', []).length;
    let h = '<p class="hello">Pick a form to start. Fill it in, get signatures, and it emails a PDF to the customer and the shop.</p>';
    if (draft && draft.vals) { const f = formById(draft.formId); if (f) h += '<div class="card"><b>Pick up where you left off</b><div class="hint" style="margin:4px 0 10px">' + esc(f.title) + (draft.vals.c_name ? ' for ' + esc(draft.vals.c_name) : '') + '</div><button class="btn dark" id="resume">Keep going</button><button class="linkbtn" id="toss">Throw it out</button></div>'; }
    h += '<div class="formgrid">' + forms().map(f => '<button class="formbtn" data-f="' + f.id + '"><div class="ic">' + (ICONS[f.icon] || f.title[0]) + '</div><b>' + esc(f.short || f.title) + '</b><span>' + esc(f.blurb || '') + '</span></button>').join('') + '</div>';
    if (recent.length) {
      h += '<h2>Recent</h2><div class="card list">' + recent.slice(0, 12).map(r => '<div class="item"><div class="grow"><b>' + esc(r.customer) + '</b><small>' + esc(r.title) + ' \u00b7 ' + esc(r.when) + '</small></div>' +
        (r.status === 'sent' ? '<span class="st ok">Sent</span>' : '<span class="st wait">Waiting</span>') +
        (r.phone ? '<a class="btn small ghost" href="' + esc(smsLink(r.phone, r.first, r.title)) + '">Text</a>' : '') + '</div>').join('') + '</div>';
    }
    if (waiting && conn()) h += '<button class="btn ghost" id="flushNow">Send waiting forms now</button>';
    main.innerHTML = h;
    main.querySelectorAll('.formbtn').forEach(b => b.onclick = () => startForm(b.dataset.f));
    const r = $('#resume'); if (r) r.onclick = () => go('fill');
    const t = $('#toss'); if (t) t.onclick = () => { if (confirm('Throw out this unfinished form?')) { draft = null; LS.del('kf_draft'); render(); } };
    const fl = $('#flushNow'); if (fl) fl.onclick = async () => { const n = await flush(); toast(n ? 'Sent ' + n + '.' : 'Still no signal. Try again soon.'); render(); };
  }
  function startForm(id) {
    const f = formById(id);
    draft = { formId: id, vals: { _id: newId(), c_date: today() } };
    f.sections.forEach(s => s.fields.forEach(fl => { if (fl.auto === 'invoice') draft.vals[fl.id] = nextInvoice(); }));
    sigs = {}; LS.set('kf_draft', draft); go('fill');
  }
  const saveDraft = () => LS.set('kf_draft', draft);

  /* ---------- fill ---------- */
  function input(id, label, type, val, extra) {
    return '<div class="fld' + (extra && extra.half ? '' : '') + '"><label for="i_' + id + '">' + esc(label) + '</label><input id="i_' + id + '" data-k="' + id + '" type="' + type + '" value="' + esc(val || '') + '"' +
      (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + (type === 'number' ? ' inputmode="decimal"' : '') + (type === 'tel' ? ' autocomplete="tel"' : '') + '></div>';
  }
  function moneyIn(key, val, unit) { return '<div class="money"><span class="cur">$</span><input type="text" inputmode="decimal" data-k="' + key + '" value="' + esc(val || '') + '" placeholder="0"><span class="unit">' + esc(unit || '') + '</span></div>'; }
  function fieldHtml(f, v) {
    const val = v[f.id];
    switch (f.type) {
      case 'text': case 'tel': case 'email': case 'date': case 'number': return input(f.id, f.label, f.type, val, { ph: f.placeholder });
      case 'textarea': return '<div class="fld"><label>' + esc(f.label) + '</label><textarea data-k="' + f.id + '">' + esc(val || '') + '</textarea></div>';
      case 'choice': case 'multi': return '<div class="fld"><span class="lbl">' + esc(f.label) + '</span><div class="pills" data-pick="' + f.id + '" data-multi="' + (f.type === 'multi' ? 1 : 0) + '">' +
        f.options.map(o => { const on = f.type === 'multi' ? (val || []).indexOf(o) >= 0 : val === o; return '<button type="button" class="pill' + (on ? ' on' : '') + '" data-o="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') + '</div></div>';
      case 'static': return '<ul class="static">' + f.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>';
      case 'note': return '<div class="note">' + esc(f.text) + '</div>';
      case 'money': return '<div class="fld"><label>' + esc(f.label) + '</label>' + moneyIn(f.id, val, f.unit) + '</div>';
      case 'percent': return '<div class="fld"><label>' + esc(f.label) + '</label><div class="money"><input type="text" inputmode="decimal" data-k="' + f.id + '" value="' + esc(val || '') + '" placeholder="0"><span class="unit">%</span></div></div>';
      case 'pricegrid': { const pv = val || {};
        return '<div class="pg">' + f.rows.map(r => '<div class="pgrow"><div class="pghead"><button type="button" class="chk' + (pv.pick === r.id ? ' on' : '') + '" data-grid="' + f.id + '" data-row="' + r.id + '" aria-label="Pick ' + esc(r.label) + '">' + (pv.pick === r.id ? '\u2713' : '') + '</button><b>' + esc(r.label) + '</b><span>' + esc(r.sub || '') + '</span></div><div class="pgcols">' +
          f.cols.map(c => '<div><span class="lbl">' + esc(c.label) + '</span>' + moneyIn(f.id + '.' + r.id + '_' + c.id, pv[r.id + '_' + c.id], f.unit) + '</div>').join('') + '</div></div>').join('') + (f.note ? '<div class="hint">' + esc(f.note) + '</div>' : '') + '</div>'; }
      case 'options': { const ov = val || {};
        return f.names.map(n => '<div class="opt"><b>' + esc(n) + '</b><textarea data-k="' + f.id + '.' + n + '.desc" placeholder="What this option includes" style="min-height:70px;margin:6px 0">' + esc((ov[n] || {}).desc || '') + '</textarea>' + moneyIn(f.id + '.' + n + '.price', (ov[n] || {}).price, '') + '</div>').join(''); }
      case 'lineitems': { const ls = val && val.length ? val : [{ desc: '', qty: '1', price: '' }];
        return '<div id="lines">' + ls.map((l, i) => '<div class="li"><input data-k="lines.' + i + '.desc" placeholder="What" value="' + esc(l.desc || '') + '"><input data-k="lines.' + i + '.qty" inputmode="decimal" placeholder="Qty" value="' + esc(l.qty || '') + '"><input data-k="lines.' + i + '.price" inputmode="decimal" placeholder="$ each" value="' + esc(l.price || '') + '"><button type="button" class="x" data-rm="' + i + '" aria-label="Remove">\u00d7</button></div>').join('') +
          '</div><button type="button" class="btn small ghost" id="addLine">+ Add a charge</button><div class="total"><span>Total</span><span id="invTotal">' + KFPDF.money(KFPDF.invoiceTotals(v).total) + '</span></div>'; }
      case 'inspect': { const iv = val || {};
        return f.items.map(it => '<div class="insp"><b>' + esc(it) + '</b><div class="pills" data-insp="' + esc(it) + '">' + ['OK', 'Needs work', 'N/A'].map(o => '<button type="button" class="pill' + ((iv[it] || {}).rate === o ? ' on' : '') + '" data-o="' + o + '">' + o + '</button>').join('') + '</div><input type="text" data-k="' + f.id + '.' + it + '.note" placeholder="Note" value="' + esc((iv[it] || {}).note || '') + '"></div>').join(''); }
      case 'photos': { const ph = val || [];
        return '<div class="fld"><span class="lbl">' + esc(f.label) + ' (up to ' + (f.max || 4) + ')</span><div class="photos">' + ph.map(p => '<img src="' + p + '" alt="">').join('') + '</div>' +
          (ph.length < (f.max || 4) ? '<label class="btn small ghost">+ Add a photo<input type="file" accept="image/*" capture="environment" data-photo="' + f.id + '" data-max="' + (f.max || 4) + '" hidden></label>' : '') + (ph.length ? ' <button type="button" class="linkbtn" data-clearph="' + f.id + '">Remove photos</button>' : '') + '</div>'; }
    }
    return '';
  }
  function setPath(path, value) {
    const parts = path.split('.'); let o = draft.vals;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i], nextIsIdx = /^\d+$/.test(parts[i + 1]);
      if (o[k] == null || typeof o[k] !== 'object') o[k] = nextIsIdx ? [] : {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = value;
  }
  function fill() {
    const f = formById(draft.formId), v = draft.vals; chrome(f.title, true);
    let h = '<div class="sec"><h3>Customer info</h3><div class="body">' + input('c_name', 'Customer name', 'text', v.c_name) +
      '<div class="row">' + input('c_phone', 'Phone', 'tel', v.c_phone) + input('c_date', 'Date', 'date', v.c_date) + '</div>' +
      input('c_email', 'Email (gets the PDF)', 'email', v.c_email) + input('c_address', 'Service address', 'text', v.c_address) + '</div></div>';
    f.sections.forEach(s => {
      h += '<div class="sec"><h3>' + esc(s.title) + (s.prices ? '<span class="tag">Fill in today\'s rates</span>' : '') + '</h3><div class="body">';
      let row = [];
      const flushRow = () => { if (row.length) { h += row.length > 1 ? '<div class="row">' + row.join('') + '</div>' : row[0]; row = []; } };
      s.fields.forEach(fl => { const x = fieldHtml(fl, v); if (fl.half) { row.push(x); if (row.length === 2) flushRow(); } else { flushRow(); h += x; } });
      flushRow(); h += '</div></div>';
    });
    main.innerHTML = h + dock('<button class="btn primary" id="toSign">Next: signatures</button>');
    main.querySelectorAll('[data-k]').forEach(el => el.addEventListener('input', () => {
      setPath(el.dataset.k, el.value); saveDraft();
      if (el.dataset.k.startsWith('lines.') || el.dataset.k === 'tax') { const t = $('#invTotal'); if (t) t.textContent = KFPDF.money(KFPDF.invoiceTotals(draft.vals).total); }
    }));
    main.querySelectorAll('[data-pick]').forEach(g => g.querySelectorAll('.pill').forEach(p => p.onclick = () => {
      const id = g.dataset.pick, o = p.dataset.o;
      if (g.dataset.multi === '1') { const a = v[id] || []; v[id] = a.indexOf(o) >= 0 ? a.filter(x => x !== o) : a.concat(o); p.classList.toggle('on'); }
      else { v[id] = v[id] === o ? '' : o; g.querySelectorAll('.pill').forEach(x => x.classList.toggle('on', x.dataset.o === v[id])); }
      saveDraft();
    }));
    main.querySelectorAll('[data-grid]').forEach(b => b.onclick = () => {
      const pv = v[b.dataset.grid] = v[b.dataset.grid] || {}; pv.pick = pv.pick === b.dataset.row ? '' : b.dataset.row; saveDraft();
      main.querySelectorAll('[data-grid="' + b.dataset.grid + '"]').forEach(x => { const on = x.dataset.row === pv.pick; x.classList.toggle('on', on); x.textContent = on ? '\u2713' : ''; });
    });
    main.querySelectorAll('[data-insp]').forEach(g => g.querySelectorAll('.pill').forEach(p => p.onclick = () => {
      const iv = v.inspect = v.inspect || {}, it = g.dataset.insp; iv[it] = iv[it] || {}; iv[it].rate = iv[it].rate === p.dataset.o ? '' : p.dataset.o;
      g.querySelectorAll('.pill').forEach(x => x.classList.toggle('on', x.dataset.o === iv[it].rate)); saveDraft();
    }));
    const add = $('#addLine'); if (add) add.onclick = () => { v.lines = (v.lines && v.lines.length ? v.lines : [{ desc: '', qty: '1', price: '' }]).concat({ desc: '', qty: '1', price: '' }); saveDraft(); keepScroll(fill); };
    main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { v.lines = (v.lines || []).filter((_, i) => i !== +b.dataset.rm); saveDraft(); keepScroll(fill); });
    main.querySelectorAll('[data-photo]').forEach(inp => inp.onchange = async () => {
      if (!inp.files[0]) return; const d = await resizeImage(inp.files[0], 1200, 'image/jpeg', 0.7);
      v[inp.dataset.photo] = (v[inp.dataset.photo] || []).concat(d).slice(0, +inp.dataset.max); saveDraft(); keepScroll(fill);
    });
    main.querySelectorAll('[data-clearph]').forEach(b => b.onclick = () => { v[b.dataset.clearph] = []; saveDraft(); keepScroll(fill); });
    $('#toSign').onclick = () => {
      if (!String(v.c_name || '').trim()) { toast('Add the customer name first.'); const el = $('#i_c_name'); el.parentNode.classList.add('need'); el.focus(); return; }
      go('sign');
    };
  }
  function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

  /* ---------- signatures ---------- */
  function pad(canvas, onDraw) {
    const ctx = canvas.getContext('2d'); let drawing = false, last = null, has = false;
    function size() { const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1; canvas.width = r.width * d; canvas.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14213d'; }
    size();
    const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); drawing = true; last = pt(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, 7); ctx.fillStyle = '#14213d'; ctx.fill(); });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); const p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; if (!has) { has = true; onDraw(); } });
    const end = () => { drawing = false; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    return {
      has: () => has,
      clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); has = false; },
      png() { const o = document.createElement('canvas'); o.width = 700; o.height = Math.round(700 * canvas.height / canvas.width); o.getContext('2d').drawImage(canvas, 0, 0, o.width, o.height); return o.toDataURL('image/png'); }
    };
  }
  function sign() {
    const f = formById(draft.formId), v = draft.vals; chrome('Signatures', true);
    const sigBlock = (id, title, name) => '<div class="sec"><h3>' + title + '</h3><div class="body"><div class="sigwrap" id="w_' + id + '"><canvas id="sig_' + id + '"></canvas><div class="line"></div><div class="ph">Sign here with your finger</div></div><div class="sigtools"><span>Signed ' + esc(nowText()) + '</span><button class="linkbtn" data-clear="' + id + '">Clear</button></div>' + input(id + 'Name', 'Printed name', 'text', name) + '</div></div>';
    main.innerHTML = '<p class="hello">Hand the phone to the customer to sign for the ' + esc(f.title) + '.</p>' +
      sigBlock('customer', 'Customer signs', v.c_name) + sigBlock('tech', 'Technician signs', LS.get('kf_tech', '')) + dock('<button class="btn primary" id="toReview">Review the PDF</button>');
    const pads = {};
    ['customer', 'tech'].forEach(id => { pads[id] = pad($('#sig_' + id), () => { $('#w_' + id + ' .ph').hidden = true; }); });
    main.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { pads[b.dataset.clear].clear(); $('#w_' + b.dataset.clear + ' .ph').hidden = false; });
    $('#toReview').onclick = () => {
      if (!pads.customer.has()) return toast('The customer needs to sign.');
      if (!pads.tech.has()) return toast('The technician needs to sign.');
      const tn = $('#i_techName').value.trim(); if (tn) LS.set('kf_tech', tn);
      sigs = { customer: pads.customer.png(), tech: pads.tech.png(), customerName: $('#i_customerName').value.trim(), techName: tn, signedAt: nowText() };
      go('review');
    };
  }

  /* ---------- review and send ---------- */
  function makePdf() {
    const f = formById(draft.formId); lastDoc = KFPDF.build(f, draft.vals, sigs, brand());
    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = URL.createObjectURL(lastDoc.output('blob')); return lastDoc;
  }
  const fileName = (f, v) => (brand().name + ' ' + f.title + ' ' + (v.c_name || '') + ' ' + (v.c_date || '')).replace(/[^A-Za-z0-9 \-]/g, '').trim().replace(/\s+/g, '-') + '.pdf';
  function review() {
    const f = formById(draft.formId), v = draft.vals; chrome('Check it over', true); makePdf();
    const who = v.c_email ? 'Emails to ' + esc(v.c_email) + ' and the shop.' : 'No customer email, so it goes to the shop only.';
    main.innerHTML = '<p class="hello">' + who + '</p><iframe class="pdfframe" id="pdfView" title="PDF" src="' + lastBlobUrl + '#view=FitH"></iframe>' +
      '<a class="btn ghost" id="openPdf" href="' + lastBlobUrl + '" target="_blank" rel="noopener" style="margin-top:12px">Open the PDF full screen</a><button class="btn ghost" id="fix">Fix something</button>' +
      dock('<button class="btn primary" id="send">Send to customer and shop</button>');
    $('#fix').onclick = () => { stack.length = 0; cur = { name: 'home' }; go('fill'); };
    $('#send').onclick = async () => {
      const b = $('#send'); b.disabled = true; b.textContent = 'Sending...';
      const rec = {
        id: v._id, formId: f.id, title: f.title, customer: v.c_name || '', phone: v.c_phone || '', email: v.c_email || '', address: v.c_address || '',
        jobDate: v.c_date || '', total: totalFor(f, v), tech: sigs.techName || '', fileName: fileName(f, v), business: brand().name,
        pdf: lastDoc.output('datauristring').split(',')[1], createdAt: new Date().toISOString()
      };
      lastRec = rec;
      const ob = LS.get('kf_outbox', []).filter(x => x.id !== rec.id); ob.push(rec);
      if (!LS.set('kf_outbox', ob)) { b.disabled = false; b.textContent = 'Send to customer and shop'; return; }
      const recent = LS.get('kf_recent', []).filter(x => x.id !== rec.id);
      recent.unshift({ id: rec.id, customer: rec.customer, first: (rec.customer || '').split(' ')[0], phone: rec.phone, title: f.title, when: nowText(), status: 'waiting' });
      LS.set('kf_recent', recent.slice(0, 30));
      draft = null; LS.del('kf_draft');
      await flush();
      go('sent', { id: rec.id }, true); stack.length = 0;
    };
  }
  function sent() {
    const r = (LS.get('kf_recent', []).find(x => x.id === cur.id)) || {}, ok = r.status === 'sent';
    chrome(ok ? 'Sent' : 'Saved', false); $('#gear').hidden = false;
    main.innerHTML = '<div class="done"><div class="big">' + (ok ? '\u2713' : '\u23F3') + '</div><h2 id="sentTitle">' + (ok ? 'Sent' : 'Saved on this phone') + '</h2><p class="hello">' +
      (ok ? (r.emailedTo ? 'Emailed to ' + esc(r.emailedTo) + '. Logged in the shop sheet.' : 'Logged in the shop sheet.') : (conn() ? 'No signal right now. It sends on its own when you have signal.' : 'This phone is not connected to the shop yet. It sends once you open the setup link.')) + '</p></div>' +
      (r.phone ? '<a class="btn dark" id="textCust" href="' + esc(smsLink(r.phone, r.first, r.title)) + '">Text the customer</a>' : '') +
      '<button class="btn ghost" id="share">Share or save the PDF</button><button class="btn primary" id="again">Start a new form</button>';
    $('#again').onclick = () => go('home', {}, true);
    $('#share').onclick = async () => {
      if (!lastDoc) return toast('PDF not on this screen anymore.');
      const name = (lastRec && lastRec.fileName) || 'form.pdf', file = new File([lastDoc.output('blob')], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch (e) {} }
      else { const a = document.createElement('a'); a.href = lastBlobUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    };
  }

  /* ---------- settings ---------- */
  function settings() {
    chrome('Settings', true); $('#gear').hidden = true;
    const c = conn(), shop = LS.get('kf_shop', null);
    main.innerHTML = '<div class="card"><div class="setrow" id="goBrand"><div><b>Business look</b><small>Name, logo, colors, phone and email on forms</small></div><span class="chev">\u203A</span></div>' +
      '<div class="setrow" id="goForms"><div><b>Forms</b><small>Show or hide forms, change wording</small></div><span class="chev">\u203A</span></div></div>' +
      '<div class="card">' + input('tech', 'Your name (technician)', 'text', LS.get('kf_tech', '')) + '</div>' +
      '<div class="card"><span class="lbl">Shop connection</span><p id="connState" style="margin:4px 0 10px">' + (c ? 'Connected' + (shop && shop.name ? ' to ' + esc(shop.name) : '') + '.' : 'Not connected. Open the setup link from the shop, or paste it here.') + '</p>' +
      (c ? '<button class="btn ghost" id="test">Test the connection</button><button class="linkbtn" id="unlink">Disconnect this phone</button>'
         : '<div class="fld"><input type="url" id="setupPaste" placeholder="Paste the setup link"></div><button class="btn dark" id="connect">Connect</button>') + '</div>' +
      '<div class="card donate"><b>Like the app?</b><p class="hint" style="margin:6px 0 10px">It is free. A way to chip in is coming soon.</p>' +
      (C.donateUrl ? '<a class="btn primary" id="donateBtn" href="' + esc(C.donateUrl) + '" target="_blank" rel="noopener">Donate</a>' : '<button class="btn primary" id="donateBtn" disabled>Donate (coming soon)</button>') + '</div>';
    $('#goBrand').onclick = () => go('brandScreen');
    $('#goForms').onclick = () => go('formsScreen');
    $('#i_tech').oninput = e => LS.set('kf_tech', e.target.value.trim());
    const t = $('#test'); if (t) t.onclick = async () => { t.disabled = true; try { const j = await ping(); toast('Connected' + (j.shop && j.shop.name ? ' to ' + j.shop.name : '') + '.'); await flush(); } catch (e) { toast('Could not reach the shop. Check signal.'); } t.disabled = false; render(); };
    const u = $('#unlink'); if (u) u.onclick = () => { if (confirm('Disconnect this phone from the shop?')) { LS.del('kf_conn'); render(); } };
    const cn = $('#connect'); if (cn) cn.onclick = async () => { if (!readSetup($('#setupPaste').value)) return toast('That link did not work. Ask the shop for a new one.'); try { await ping(); await flush(); toast('Connected.'); } catch (e) { toast('Saved. Will connect when there is signal.'); } render(); };
  }

  /* ---------- business look ---------- */
  function palette(dataUrl) {
    return new Promise(res => {
      const im = new Image(); im.onload = () => {
        const c = document.createElement('canvas'), n = 64; c.width = n; c.height = n; const x = c.getContext('2d'); x.drawImage(im, 0, 0, n, n);
        const d = x.getImageData(0, 0, n, n).data, buckets = {};
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const k = [d[i] >> 4, d[i + 1] >> 4, d[i + 2] >> 4].join(','); const b = buckets[k] = buckets[k] || { n: 0, r: 0, g: 0, b: 0 }; b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; }
        const cols = Object.values(buckets).map(b => { const r = b.r / b.n, g = b.g / b.n, bl = b.b / b.n, mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); return { n: b.n, r, g, b: bl, l: (mx + mn) / 510, s: mx ? (mx - mn) / mx : 0 }; }).sort((a, b) => b.n - a.n);
        const dist = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b), pick = [];
        cols.forEach(cl => { if (pick.length < 8 && pick.every(p => dist(p, cl) > 70)) pick.push(cl); });
        const hex = cl => '#' + [cl.r, cl.g, cl.b].map(v => pad2(Math.round(v).toString(16))).join('').toUpperCase();
        const light = pick.slice().sort((a, b) => b.l - a.l)[0], rest = pick.filter(p => p !== light && p.l < 0.75);
        const primary = rest.slice().sort((a, b) => (b.s * 2 - Math.abs(b.l - 0.45)) - (a.s * 2 - Math.abs(a.l - 0.45)))[0] || pick[0];
        const accent = rest.filter(p => p !== primary).sort((a, b) => a.l - b.l)[0] || { r: 31, g: 45, b: 69 };
        let bg = light && light.l > 0.8 ? light : { r: 247, g: 243, b: 236 };
        res({ swatches: pick.map(hex), suggest: { primary: hex(primary), accent: hex(accent), bg: hex(bg) } });
      }; im.onerror = () => res({ swatches: [], suggest: null }); im.src = dataUrl;
    });
  }
  function brandScreen() {
    chrome('Business look', true); $('#gear').hidden = true;
    const b = brand(), w = { name: b.name, phone: b.phone, email: b.email, thanks: b.thanks, logoData: (S.get().brand || {}).logoData || '', colors: clone(b.colors) };
    let lastTarget = 'primary';
    main.innerHTML = '<div class="card">' + input('bname', 'Business name', 'text', w.name) + '<div class="row">' + input('bphone', 'Phone on forms', 'tel', w.phone) + input('bemail', 'Email on forms', 'email', w.email) + '</div>' +
      '<div class="fld"><label>Thank you line at the bottom of every PDF</label><textarea id="i_bthanks" style="min-height:70px">' + esc(w.thanks) + '</textarea></div></div>' +
      '<div class="card"><span class="lbl">Logo</span><div style="display:flex;align-items:center;gap:12px;margin:6px 0 10px"><img id="logoPrev" style="width:72px;height:72px;border-radius:12px;object-fit:cover;background:#fff;border:1.5px solid var(--line)"><label class="btn small ghost" style="margin:0">Upload a logo<input type="file" id="logoFile" accept="image/*" hidden></label></div>' +
      '<span class="lbl">Colors from your logo (tap one, then a color spot below)</span><div class="swatches" id="sw"></div><button class="btn ghost" id="auto">Pick colors for me</button>' +
      '<div class="colorrow"><span class="lbl">Main color (buttons, name)</span><input type="color" id="c_primary" data-c="primary"></div>' +
      '<div class="colorrow"><span class="lbl">Second color (bars, header)</span><input type="color" id="c_accent" data-c="accent"></div>' +
      '<div class="colorrow"><span class="lbl">Background</span><input type="color" id="c_bg" data-c="bg"></div></div>' +
      '<span class="lbl">Preview</span><div class="preview" id="pv"><div class="ph" id="pvh"><img id="pvl"><b id="pvn"></b></div><div class="pb"><div class="bar" id="pvbar">Customer info</div><div class="pbtn" id="pvbtn">Send to customer and shop</div></div></div>' +
      '<button class="btn ghost" id="samplePdf">See a sample PDF</button><button class="linkbtn" id="resetLook">Reset to the ' + esc(C.business.name) + ' look</button>' +
      dock('<button class="btn primary" id="saveLook">Save</button>');
    const cIn = k => $('#c_' + k);
    function pv() {
      $('#logoPrev').src = w.logoData || C.business.logo; $('#pvl').src = w.logoData || C.business.logo; $('#pvn').textContent = w.name;
      $('#pvh').style.background = w.colors.accent; $('#pvh').style.borderBottom = '4px solid ' + w.colors.primary; $('#pv').style.background = w.colors.bg;
      $('#pvbar').style.background = w.colors.accent; $('#pvbar').style.borderLeftColor = w.colors.primary; $('#pvbtn').style.background = w.colors.primary;
      ['primary', 'accent', 'bg'].forEach(k => { cIn(k).value = w.colors[k].toLowerCase(); });
    }
    async function loadSw() {
      const p = await palette(w.logoData || defaultLogo || C.business.logo);
      $('#sw').innerHTML = p.swatches.map(h => '<button class="sw" style="background:' + h + '" data-h="' + h + '" aria-label="' + h + '"></button>').join('');
      $('#sw').querySelectorAll('.sw').forEach(s => s.onclick = () => { w.colors[lastTarget] = s.dataset.h; pv(); });
      return p;
    }
    pv(); loadSw();
    [['bname', 'name'], ['bphone', 'phone'], ['bemail', 'email']].forEach(([id, k]) => $('#i_' + id).oninput = e => { w[k] = e.target.value; pv(); });
    $('#i_bthanks').oninput = e => { w.thanks = e.target.value; };
    ['primary', 'accent', 'bg'].forEach(k => { cIn(k).onfocus = () => lastTarget = k; cIn(k).onclick = () => lastTarget = k; cIn(k).oninput = e => { w.colors[k] = e.target.value.toUpperCase(); pv(); }; });
    $('#logoFile').onchange = async e => {
      const fl = e.target.files[0]; if (!fl) return;
      w.logoData = await resizeImage(fl, 400, 'image/png'); pv();
      const p = await loadSw(); if (p.suggest) { w.colors = p.suggest; pv(); toast('Colors picked from your logo. Change any you like.'); }
    };
    $('#auto').onclick = async () => { const p = await palette(w.logoData || defaultLogo); if (p.suggest) { w.colors = p.suggest; pv(); } };
    $('#samplePdf').onclick = () => {
      const f = forms()[0] || forms(true)[0], bb = Object.assign(brand(), { name: w.name, phone: w.phone, email: w.email, thanks: w.thanks, colors: w.colors, logoData: w.logoData || defaultLogo });
      const doc = KFPDF.build(f, { _id: 'SAMPLE', c_name: 'Sample Customer', c_date: today(), c_address: '123 Main St', c_phone: '(555) 555-0100', c_email: 'customer@example.com' }, {}, bb);
      window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    };
    $('#resetLook').onclick = () => { if (!confirm('Go back to the ' + C.business.name + ' name, logo and colors?')) return; const s = S.get(); s.brand = {}; S.save(s); toast('Back to the ' + C.business.name + ' look.'); render(); };
    $('#saveLook').onclick = () => {
      const s = S.get(); s.brand = { name: w.name.trim() || C.business.name, phone: w.phone.trim(), email: w.email.trim(), thanks: w.thanks.trim(), colors: w.colors };
      if (w.logoData) s.brand.logoData = w.logoData;
      if (S.save(s)) { toast('Saved. Every new PDF uses this look.'); back(); }
    };
  }

  /* ---------- forms: show or hide, change wording ---------- */
  function formsScreen() {
    chrome('Forms', true); $('#gear').hidden = true;
    main.innerHTML = '<p class="hello">Turn off forms you do not use. Tap Change wording to edit the lists and fine print.</p><div class="card list">' +
      forms(true).map(f => '<div class="item"><div class="grow"><b>' + esc(f.title) + '</b><button class="linkbtn" style="padding:4px 0" data-edit="' + f.id + '">Change wording</button></div><button class="toggle' + (f.hidden ? '' : ' on') + '" data-tog="' + f.id + '" aria-label="Show ' + esc(f.title) + '"></button></div>').join('') + '</div>';
    main.querySelectorAll('[data-tog]').forEach(t => t.onclick = () => {
      const s = S.get(), o = s.forms[t.dataset.tog] = s.forms[t.dataset.tog] || {};
      if (!o.hidden && forms().length <= 1) return toast('Keep at least one form on.');
      o.hidden = !o.hidden; S.save(s); render();
    });
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => go('formsEdit', { id: b.dataset.edit }));
  }
  function formsEdit() {
    const f = formById(cur.id), base = C.forms.find(x => x.id === cur.id); chrome('Change wording', true); $('#gear').hidden = true;
    const editable = f.sections.flatMap(s => s.fields.filter(fl => ['static', 'note', 'multi', 'choice', 'inspect'].indexOf(fl.type) >= 0).map(fl => ({ fl, sec: s.title })));
    main.innerHTML = '<div class="card">' + input('ftitle', 'Form name', 'text', f.title) + '</div>' + editable.map(({ fl, sec }) => {
      const v = fl.type === 'note' ? fl.text : (fl.items || fl.options || []).join('\n');
      return '<div class="card"><label class="lbl">' + esc(sec) + (fl.label ? ': ' + esc(fl.label) : '') + (fl.type === 'note' ? '' : ' (one per line)') + '</label><textarea data-fe="' + fl.id + '" data-t="' + fl.type + '">' + esc(v) + '</textarea></div>';
    }).join('') + '<button class="linkbtn" id="resetForm">Reset this form to the original wording</button>' + dock('<button class="btn primary" id="saveForm">Save</button>');
    $('#saveForm').onclick = () => {
      const s = S.get(), o = s.forms[f.id] = s.forms[f.id] || {}; o.fields = o.fields || {};
      const t = $('#i_ftitle').value.trim(); if (t && t !== base.title) o.title = t; else delete o.title;
      main.querySelectorAll('[data-fe]').forEach(ta => {
        const typ = ta.dataset.t, lines = ta.value.split('\n').map(x => x.trim()).filter(Boolean);
        o.fields[ta.dataset.fe] = typ === 'note' ? { text: ta.value.trim() } : typ === 'static' || typ === 'inspect' ? { items: lines } : { options: lines };
      });
      S.save(s); toast('Saved.'); back();
    };
    $('#resetForm').onclick = () => { const s = S.get(); if (s.forms[f.id]) { delete s.forms[f.id].fields; delete s.forms[f.id].title; } S.save(s); toast('Back to the original wording.'); render(); };
  }

  /* ---------- start ---------- */
  async function loadDefaultLogo() {
    try { const r = await fetch(C.business.logo); const bl = await r.blob(); defaultLogo = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(bl); }); } catch (e) {}
  }
  function takeSetup() {
    if (!readSetup(location.hash)) return false;
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => toast('This phone is now connected to the shop.'), 300);
    return true;
  }
  takeSetup();
  window.addEventListener('hashchange', () => { if (takeSetup()) { render(); ping().then(() => flush()).then(() => render()).catch(() => {}); } });
  applyTheme(); render();
  loadDefaultLogo();
  if (conn()) ping().then(() => flush()).then(() => { if (cur.name === 'home') render(); }).catch(() => {});
  window.addEventListener('online', () => flush());
  setInterval(() => { if (LS.get('kf_outbox', []).length) flush(); }, 30000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  window.KF = { S, settings: S.get, brand, forms, flush, ping };
})();
