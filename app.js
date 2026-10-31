/* Knockout Forms v3: phone app on the shared CRM shell (core.css + core.js).
   Tab screens: home, recent, outbox, settings (More). Sub screens: fill, sign, review, brandScreen, formsScreen, formsEdit.
   Connect screens: install (browser tab opened a setup link) and the Tap to connect card (home screen app, not connected). */
(function () {
  const C = window.APP_CONFIG, K = window.CORE, I = K.I, esc = K.esc, $ = K.$, main = $('#main');
  const LS = K.store('kf', () => toast('Phone storage is full. Send waiting forms, then try again.'));
  const toast = K.toast;
  const clone = o => JSON.parse(JSON.stringify(o));
  const pad2 = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const nowText = () => new Date().toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ICONS = { heater: 'W', clipboard: '$', receipt: '#', check: '\u2713', shield: '\u2605', search: '\u2315' };
  const APP_BASE = new URL('./', location.href).href.split('#')[0].split('?')[0];
  let defaultLogo = '';

  /* ---------- connection: kf_cfg = {api, key, rep}, same shape as the CRM's kec_cfg ---------- */
  (function migrate() { // v2 kept kf_conn {api,key} and kf_tech "name"
    const oc = LS.get('conn', null), ot = LS.get('tech', null);
    if ((oc || ot) && !LS.has('cfg')) LS.set('cfg', { api: (oc && oc.api) || '', key: (oc && oc.key) || '', rep: ot || '' });
    if (oc || ot) { LS.del('conn'); LS.del('tech'); }
  })();
  const cfg = () => Object.assign({ api: '', key: '', rep: '' }, LS.get('cfg', {}));
  const setCfg = p => LS.set('cfg', Object.assign(cfg(), p));
  const conn = () => { const c = cfg(); return c.api && c.key ? c : null; };
  const techName = () => cfg().rep;
  function readSetup(text) {
    const s = K.parseSetup(text); if (!s) return false;
    setCfg({ api: s.api, key: s.key }); if (s.rep && !techName()) setCfg({ rep: s.rep });
    return true;
  }

  /* ---------- settings: shop overrides on top of config.js ---------- */
  const S = {
    get() { return LS.get('settings', { brand: {}, forms: {}, updatedAt: 0 }); },
    save(s, sync) { s.updatedAt = Date.now(); if (!LS.set('settings', s)) return false; applyTheme(); if (sync !== false) syncSettings(); return true; }
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
  function mix(hex, to, t) { // blend a #RRGGBB color toward another
    const h = s => [1, 3, 5].map(i => parseInt(String(s).slice(i, i + 2), 16) || 0), a = h(hex), b = h(to);
    return '#' + a.map((v, i) => pad2(Math.round(v + (b[i] - v) * t).toString(16))).join('');
  }
  function applyTheme() {
    const b = brand(), r = document.documentElement.style, c = b.colors;
    r.setProperty('--brand', c.primary); r.setProperty('--brand-2', mix(c.primary, '#ffffff', .3));
    r.setProperty('--brand-dark', c.accent); r.setProperty('--brand-dark-2', mix(c.accent, '#ffffff', .12)); r.setProperty('--bg', c.bg);
    r.setProperty('--primary', c.primary); r.setProperty('--accent', c.accent); // v2 names, kept for old notes and tests
    document.querySelectorAll('.brandLogo').forEach(i => { if (i.getAttribute('src') !== b.logoSrc) i.src = b.logoSrc; });
    document.querySelectorAll('.brandName').forEach(n => n.textContent = b.name);
    document.title = b.name + ' Forms';
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = document.body.classList.contains('sub') ? c.accent : c.bg;
  }

  /* ---------- talking to the shop ---------- */
  async function api(action, data) {
    const c = conn(); if (!c) throw new Error('not connected');
    const r = await fetch(c.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, key: c.key }, data || {})) });
    const j = await r.json(); if (!j.ok) throw new Error(j.error || 'failed'); return j;
  }
  async function ping() {
    const j = await api('ping');
    if (j.shop) LS.set('shop', j.shop);
    const rs = j.settings, ls = S.get();
    if (rs && (rs.updatedAt || 0) > (ls.updatedAt || 0)) { LS.set('settings', rs); applyTheme(); }
    else if ((ls.updatedAt || 0) > ((rs && rs.updatedAt) || 0)) syncSettings();
    return j;
  }
  function syncSettings() { if (conn()) api('saveSettings', { settings: S.get() }).catch(() => {}); }
  const shopName = () => (LS.get('shop', null) || {}).name || '';

  /* ---------- outbox: forms wait here until they reach the shop ---------- */
  let flushing = false;
  async function flush() {
    if (flushing || !conn()) return 0;
    flushing = true; status(); let sent = 0;
    try {
      for (const rec of LS.get('outbox', [])) {
        try {
          const j = await api('submit', { record: rec });
          LS.set('outbox', LS.get('outbox', []).filter(x => x.id !== rec.id));
          setRecent(rec.id, { status: 'sent', emailedTo: j.emailedTo || '' }); sent++;
        } catch (e) { break; }
      }
    } finally { flushing = false; }
    if (sent && ['home', 'recent', 'outbox'].indexOf(cur.name) >= 0) render(); else status();
    return sent;
  }
  function setRecent(id, patch) { LS.set('recent', LS.get('recent', []).map(r => r.id === id ? Object.assign(r, patch) : r)); }

  /* ---------- status pill + banner (same pill as the CRM) ---------- */
  function pill() {
    const q = LS.get('outbox', []).length;
    if (!conn()) return K.pill('off', 'Not connected');
    if (!navigator.onLine) return K.pill('off', 'Offline' + (q ? ' \u00b7 ' + q : ''));
    if (flushing) return K.pill('busy', 'Sending...');
    if (q) return K.pill('busy', q + ' waiting');
    return K.pill('', 'Synced');
  }
  function status() {
    document.querySelectorAll('[data-sync]').forEach(b => { b.outerHTML = pill(); });
    document.querySelectorAll('[data-sync]').forEach(b => b.onclick = async () => { const n = await flush(); if (conn()) toast(n ? 'Sent ' + n + '.' : LS.get('outbox', []).length ? 'Still no signal. Try again soon.' : 'All forms are sent.'); else go('settings'); });
    const bd = $('#tabs .badge'), q = LS.get('outbox', []).length; if (bd) { bd.textContent = q; bd.hidden = !q; }
  }
  function banner() {
    const el = $('#banner'), waiting = LS.get('outbox', []).length, show = !!(waiting && cur.name === 'home');
    el.innerHTML = show ? '<span class="t">' + waiting + ' form' + (waiting > 1 ? 's' : '') + ' waiting to send. They go out when you have signal.</span>' + (conn() ? '<button class="mini" id="flushNow" type="button">Send now</button>' : '') : '';
    el.hidden = !show;
    const fl = $('#flushNow'); if (fl) fl.onclick = async () => { const n = await flush(); toast(n ? 'Sent ' + n + '.' : 'Still no signal. Try again soon.'); render(); };
  }

  /* ---------- small helpers ---------- */
  const digits = s => String(s || '').replace(/[^0-9+]/g, '');
  function smsLink(phone, first, formTitle) {
    const tech = techName() || 'your tech', biz = brand().name;
    const body = 'Hi ' + (first || 'there') + ', this is ' + tech + ' with ' + biz + '. I just emailed your signed ' + formTitle + '. Text me back anytime with questions.';
    return 'sms:' + digits(phone) + '?&body=' + encodeURIComponent(body);
  }
  function newId() { const d = new Date(); return (C.business.id || 'f').slice(0, 2).toUpperCase() + '-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
  function nextInvoice() { const n = LS.get('invno', 1000) + 1; LS.set('invno', n); return 'INV-' + n; }
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
      const cols = KFPDF.visibleCols(pg, v), col = cols.find(c => has(c) && chosen.indexOf(c.label.toLowerCase()) >= 0) || cols.find(has);
      return col ? KFPDF.money(pv[pv.pick + '_' + col.id]) + ' ' + (pg.unit || '') : '';
    }
    return '';
  }

  /* ---------- navigation + shell ---------- */
  let cur = { name: 'home' }; const stack = [];
  let draft = LS.get('draft', null), sigs = {}, lastDoc = null, lastBlobUrl = '', lastRec = null, justConnected = false, setupRaw = '';
  const TAB_OF = { home: 'home', sent: 'home', recent: 'recent', outbox: 'outbox', settings: 'more' };
  function go(name, p, replace) { if (!replace) stack.push(cur); cur = Object.assign({ name }, p || {}); K.closeSheet(); render(); window.scrollTo(0, 0); }
  function back() { cur = stack.pop() || { name: 'home' }; render(); window.scrollTo(0, 0); }
  function goTab(name) { stack.length = 0; cur = { name }; K.closeSheet(); render(); window.scrollTo(0, 0); }
  $('#scrim').onclick = K.closeSheet;
  // mode: 'tab' (big title + bottom tabs), 'sub' (dark bar with Back), 'bare' (big title, no tabs)
  function chrome(title, mode) {
    const b = brand(), top = $('#top'), sub = mode === 'sub';
    K.fit(cur.name === 'home'); document.body.classList.toggle('sub', sub); document.body.classList.toggle('bare', mode === 'bare');
    top.className = sub ? 'dtop' : 'hdr';
    top.innerHTML = sub
      ? '<div class="dnav"><button id="back" type="button">' + I.back + ' Back</button><div class="brand"><img class="brandLogo logo" id="brandLogo" alt=""><span class="brandName" id="brandName"></span></div></div><h2 id="screenTitle"></h2>'
      : '<div class="hl"><div class="brand"><img class="brandLogo logo" id="brandLogo" alt=""><span class="brandName" id="brandName"></span></div><h1 id="screenTitle"></h1></div><div class="rt">' + pill() + '</div>';
    $('#screenTitle').textContent = title; $('#brandLogo').src = b.logoSrc; $('#brandName').textContent = b.name;
    const bk = $('#back'); if (bk) bk.onclick = back;
    tabs(mode === 'tab' ? TAB_OF[cur.name] : ''); foot(''); banner(); status(); applyTheme();
  }
  function tabs(on) {
    const q = LS.get('outbox', []).length;
    const T = [['home', 'Home', I.home], ['recent', 'Recent', I.file], ['+'], ['outbox', 'Waiting', I.clock], ['more', 'More', I.more]];
    $('#tabs').innerHTML = T.map(([v, t, ic]) => v === '+' ? '<button class="plus tap" id="plusBtn" type="button" aria-label="Start a form">' + I.plus + '</button>' :
      '<button class="tab' + (on === v ? ' on' : '') + '" data-v="' + v + '" type="button"' + (v === 'more' ? ' id="gear" aria-label="More and settings"' : '') + '>' + ic + (v === 'outbox' ? '<span class="badge"' + (q ? '' : ' hidden') + '>' + q + '</span>' : '') + t + '</button>').join('');
    $('#tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => goTab(b.dataset.v === 'more' ? 'settings' : b.dataset.v));
    $('#plusBtn').onclick = pickForm;
  }
  function foot(html) { const f = $('#foot'); f.innerHTML = html ? '<div class="in">' + html + '</div>' : ''; f.hidden = !html; }
  function render() {
    applyTheme();
    ({ home, recent, outbox, fill, sign, review, sent, settings, brandScreen, formsScreen, formsEdit, install })[cur.name]();
  }
  function pickForm() {
    K.sheet('<h3>Start a form</h3><p class="hint">Pick one. You can stop and pick it back up later.</p><div class="opts">' +
      forms().map(f => '<button class="opt tap" type="button" data-f="' + f.id + '"><span class="oi">' + (ICONS[f.icon] || f.title[0]) + '</span><span>' + esc(f.short || f.title) + '<small>' + esc(f.blurb || '') + '</small></span></button>').join('') + '</div>',
      s => s.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { K.closeSheet(); startForm(b.dataset.f); }));
  }

  /* ---------- home ---------- */
  function greet() { const h = new Date().getHours(), n = (techName() || '').split(/\s+/)[0]; return (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + (n ? ', ' + n : ''); }
  function recentRow(r) {
    return '<div class="lead"><div class="av">' + esc(K.initials(r.customer)) + '</div><div class="mid"><div class="row" style="gap:8px"><div class="nm">' + esc(r.customer || 'No name') + '</div>' +
      (r.status === 'sent' ? '<span class="tag ok">Sent</span>' : '<span class="tag wait">Waiting</span>') + '</div><div class="meta">' + esc(r.title) + ' \u00b7 ' + esc(r.when) + '</div></div>' +
      (r.phone ? '<a class="icb tap" aria-label="Text ' + esc(r.first || 'customer') + '" href="' + esc(smsLink(r.phone, r.first, r.title)) + '">' + I.text + '</a>' : '') + '</div>';
  }
  function connectCard() {
    if (conn()) return justConnected ? '<div class="card okcard" id="connectedCard"><span class="oki">' + I.check + '</span><div><b id="connectedTo">Connected to ' + esc(shopName() || 'your shop') + '</b><div class="meta2">Forms you send now go to the shop.</div></div></div>' : '';
    return '<div class="card hot cc" id="connectCard"><div class="k"><i></i>Connect to your shop</div>' +
      '<div class="m">Copy the setup link from your shop, then tap below.</div>' +
      '<button class="btn pri full big tap" id="tapConnect" type="button">' + I.link + ' Tap to connect</button>' +
      '<div id="pasteBox" hidden style="margin-top:12px"><p class="m" id="pasteMsg" style="margin:0 0 8px"></p><div class="fld" style="margin:0 0 10px"><input type="url" id="setupPaste2" placeholder="Paste the setup link" autocomplete="off" autocapitalize="off" spellcheck="false"></div>' +
      '<button class="btn ghost full" id="connect2" type="button">Connect</button></div></div>';
  }
  async function afterConnect() {
    justConnected = true; let ok = false;
    try { await ping(); ok = true; flush(); } catch (e) {}
    toast(ok ? 'Connected to ' + (shopName() || 'your shop') + '.' : 'Saved. It connects when you have signal.');
    render();
  }
  function bindConnect() {
    const showPaste = msg => { $('#pasteBox').hidden = false; $('#pasteMsg').textContent = msg; $('#setupPaste2').focus(); };
    const tc = $('#tapConnect'); if (tc) tc.onclick = async () => {
      let t = ''; try { t = await K.readClip(); } catch (e) { t = null; }
      if (t === null) return showPaste('Your phone did not hand over the link. Press and hold the box, tap Paste, then Connect.');
      if (!/setup/.test(t || '')) return showPaste('No setup link was copied. Copy it from your shop, or paste it here.');
      if (!readSetup(t)) return showPaste('That link did not work. Ask the shop for a new one.');
      afterConnect();
    };
    const c2 = $('#connect2'); if (c2) c2.onclick = () => { if (!readSetup($('#setupPaste2').value)) return toast('That link did not work. Ask the shop for a new one.'); afterConnect(); };
  }
  function home() {
    stack.length = 0; chrome(greet(), 'tab');
    // home fits one screen: small cards on top, form tiles fill the rest. Recent lives in its own tab.
    let h = '<div class="homecards">' + connectCard();
    if (draft && draft.vals) { const f = formById(draft.formId); if (f) h += '<div class="card resume"><div class="t"><small>Not done yet</small><b>' + esc(f.short || f.title) + (draft.vals.c_name ? ' for ' + esc(draft.vals.c_name) : '') + '</b><button class="linkbtn" id="toss" type="button" style="padding:2px 0">Throw it out</button></div><button class="btn dark tap" id="resume" type="button" style="flex:none;padding:0 16px">Keep going</button></div>'; }
    const fs = forms();
    h += '</div><div class="sec home">Start a form</div><div class="formgrid" style="grid-template-rows:repeat(' + Math.ceil(fs.length / 2) + ',1fr)">' + fs.map(f => '<button class="formbtn tap" type="button" data-f="' + f.id + '"><div class="fbi"><div class="ic">' + (ICONS[f.icon] || f.title[0]) + '</div><b>' + esc(f.short || f.title) + '</b><span>' + esc(f.blurb || '') + '</span></div></button>').join('') + '</div>';
    main.innerHTML = h;
    main.querySelectorAll('.formbtn').forEach(b => b.onclick = () => startForm(b.dataset.f));
    const r = $('#resume'); if (r) r.onclick = () => go('fill');
    const t = $('#toss'); if (t) t.onclick = () => { if (confirm('Throw out this unfinished form?')) { draft = null; LS.del('draft'); render(); } };
    bindConnect();
  }
  function recent() {
    chrome('Recent', 'tab'); const rs = LS.get('recent', []);
    main.innerHTML = '<p class="hello">The last 30 forms from this phone. Signed PDFs are saved in the shop\'s Google Drive.</p>' +
      (rs.length ? rs.map(recentRow).join('') : '<div class="empty"><div class="e">\uD83D\uDCC4</div><b>No forms yet</b>Tap the + to start one.</div>');
  }
  function outbox() {
    chrome('Waiting', 'tab'); const ob = LS.get('outbox', []);
    main.innerHTML = '<p class="hello">Forms saved on this phone that have not reached the shop yet. They send on their own when you have signal.</p>' +
      (ob.length ? ob.map(r => recentRow({ customer: r.customer, title: r.title, when: (r.createdAt || '').slice(0, 10), status: 'waiting', phone: '' })).join('') +
        (conn() ? '<button class="btn pri full tap" id="flushNow2" type="button" style="margin-top:12px">' + I.send + ' Send now</button>' : '<div class="card"><b>Not connected</b><p class="meta2" style="margin:4px 0 0">Connect to your shop in More, then these send.</p></div>')
        : '<div class="empty"><div class="e">\u2705</div><b>All sent</b>Nothing waiting on this phone.</div>');
    const f = $('#flushNow2'); if (f) f.onclick = async () => { const n = await flush(); toast(n ? 'Sent ' + n + '.' : 'Still no signal. Try again soon.'); render(); };
  }
  function startForm(id) {
    const f = formById(id);
    draft = { formId: id, vals: { _id: newId(), c_date: today() } };
    f.sections.forEach(s => s.fields.forEach(fl => { if (fl.auto === 'invoice') draft.vals[fl.id] = nextInvoice(); }));
    sigs = {}; LS.set('draft', draft); go('fill');
  }
  const saveDraft = () => LS.set('draft', draft);

  /* ---------- fill ---------- */
  function input(id, label, type, val, extra) {
    return '<div class="fld"><label for="i_' + id + '">' + esc(label) + '</label><input id="i_' + id + '" data-k="' + id + '" type="' + type + '" value="' + esc(val || '') + '"' +
      (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + (type === 'number' ? ' inputmode="decimal"' : '') + (type === 'tel' ? ' autocomplete="tel"' : '') + '></div>';
  }
  function moneyIn(key, val, unit) { return '<div class="money"><span class="cur">$</span><input type="text" inputmode="decimal" data-k="' + key + '" value="' + esc(val || '') + '" placeholder="0"><span class="unit">' + esc(unit || '') + '</span></div>'; }
  function fieldHtml(f, v) {
    const val = v[f.id];
    switch (f.type) {
      case 'text': case 'tel': case 'email': case 'date': case 'number': return input(f.id, f.label, f.type, val, { ph: f.placeholder });
      case 'textarea': return '<div class="fld"><label>' + esc(f.label) + '</label><textarea data-k="' + f.id + '">' + esc(val || '') + '</textarea></div>';
      case 'choice': case 'multi': return '<div class="fld"><span class="lbl">' + esc(f.label) + '</span><div class="seg" data-pick="' + f.id + '" data-multi="' + (f.type === 'multi' ? 1 : 0) + '">' +
        f.options.map(o => { const on = f.type === 'multi' ? (val || []).indexOf(o) >= 0 : val === o; return '<button type="button" class="' + (on ? 'on' : '') + '" data-o="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') + '</div></div>';
      case 'static': return '<ul class="static">' + f.items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>';
      case 'note': return '<div class="note">' + esc(f.text) + '</div>';
      case 'money': return '<div class="fld"><label>' + esc(f.label) + '</label>' + moneyIn(f.id, val, f.unit) + '</div>';
      case 'percent': return '<div class="fld"><label>' + esc(f.label) + '</label><div class="money"><input type="text" inputmode="decimal" data-k="' + f.id + '" value="' + esc(val || '') + '" placeholder="0"><span class="unit">%</span></div></div>';
      case 'pricegrid': { const pv = val || {}, cols = KFPDF.visibleCols(f, v), src = f.showColsFrom && cols.length === f.cols.length && f.cols.length > 1 ? (formById(draft.formId).sections.flatMap(s => s.fields).find(x => x.id === f.showColsFrom) || {}) : null;
        return (src ? '<div class="hint" id="pickTypeHint">Pick the ' + esc((src.label || 'type').toLowerCase()) + ' above to show only its prices.</div>' : '') + '<div class="pg" data-cols="' + cols.map(c => c.id).join(' ') + '">' + f.rows.map(r => '<div class="pgrow"><div class="pghead"><button type="button" class="chk' + (pv.pick === r.id ? ' on' : '') + '" data-grid="' + f.id + '" data-row="' + r.id + '" aria-label="Pick ' + esc(r.label) + '">' + (pv.pick === r.id ? '\u2713' : '') + '</button><b>' + esc(r.label) + '</b><span>' + esc(r.sub || '') + '</span></div><div class="pgcols" style="grid-template-columns:repeat(' + cols.length + ',1fr)">' +
          cols.map(c => '<div><span class="lbl">' + esc(c.label) + '</span>' + moneyIn(f.id + '.' + r.id + '_' + c.id, pv[r.id + '_' + c.id], f.unit) + '</div>').join('') + '</div></div>').join('') + (f.note ? '<div class="hint">' + esc(f.note) + '</div>' : '') + '</div>'; }
      case 'options': { const ov = val || {};
        return f.names.map(n => '<div class="eopt"><b>' + esc(n) + '</b><textarea data-k="' + f.id + '.' + n + '.desc" placeholder="What this option includes">' + esc((ov[n] || {}).desc || '') + '</textarea>' + moneyIn(f.id + '.' + n + '.price', (ov[n] || {}).price, '') + '</div>').join(''); }
      case 'lineitems': { const ls = val && val.length ? val : [{ desc: '', qty: '1', price: '' }];
        return '<div id="lines">' + ls.map((l, i) => '<div class="li"><input data-k="lines.' + i + '.desc" placeholder="What" value="' + esc(l.desc || '') + '"><input data-k="lines.' + i + '.qty" inputmode="decimal" placeholder="Qty" value="' + esc(l.qty || '') + '"><input data-k="lines.' + i + '.price" inputmode="decimal" placeholder="$ each" value="' + esc(l.price || '') + '"><button type="button" class="x" data-rm="' + i + '" aria-label="Remove">\u00d7</button></div>').join('') +
          '</div><button type="button" class="mini" id="addLine">+ Add a charge</button><div class="total"><span>Total</span><span id="invTotal">' + KFPDF.money(KFPDF.invoiceTotals(v).total) + '</span></div>'; }
      case 'inspect': { const iv = val || {};
        return f.items.map(it => '<div class="insp"><b>' + esc(it) + '</b><div class="seg" data-insp="' + esc(it) + '" style="margin-top:6px">' + ['OK', 'Needs work', 'N/A'].map(o => '<button type="button" class="' + ((iv[it] || {}).rate === o ? 'on' : '') + '" data-o="' + o + '">' + o + '</button>').join('') + '</div><input type="text" data-k="' + f.id + '.' + it + '.note" placeholder="Note" value="' + esc((iv[it] || {}).note || '') + '"></div>').join(''); }
      case 'photos': { const ph = val || [];
        return '<div class="fld"><span class="lbl">' + esc(f.label) + ' (up to ' + (f.max || 4) + ')</span><div class="photos">' + ph.map(p => '<img src="' + p + '" alt="">').join('') + '</div>' +
          (ph.length < (f.max || 4) ? '<label class="mini">+ Add a photo<input type="file" accept="image/*" capture="environment" data-photo="' + f.id + '" data-max="' + (f.max || 4) + '" hidden></label>' : '') + (ph.length ? ' <button type="button" class="linkbtn" data-clearph="' + f.id + '">Remove photos</button>' : '') + '</div>'; }
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
    const f = formById(draft.formId), v = draft.vals; chrome(f.title, 'sub');
    let h = '<div class="sec">Customer</div><div class="card form">' + input('c_name', 'Customer name', 'text', v.c_name) +
      '<div class="frow">' + input('c_phone', 'Phone', 'tel', v.c_phone) + input('c_date', 'Date', 'date', v.c_date) + '</div>' +
      input('c_email', 'Email (gets the PDF)', 'email', v.c_email) + input('c_address', 'Service address', 'text', v.c_address) + '</div>';
    f.sections.forEach(s => {
      h += '<div class="sec"><span>' + esc(s.title) + '</span>' + (s.prices ? '<span class="tag">Fill in today\'s rates</span>' : '') + '</div><div class="card form">';
      let row = [];
      const flushRow = () => { if (row.length) { h += row.length > 1 ? '<div class="frow">' + row.join('') + '</div>' : row[0]; row = []; } };
      s.fields.forEach(fl => { const x = fieldHtml(fl, v); if (fl.half) { row.push(x); if (row.length === 2) flushRow(); } else { flushRow(); h += x; } });
      flushRow(); h += '</div>';
    });
    main.innerHTML = h; foot('<button class="btn pri tap" id="toSign" type="button">Next: signatures</button>');
    main.querySelectorAll('[data-k]').forEach(el => el.addEventListener('input', () => {
      setPath(el.dataset.k, el.value); saveDraft();
      if (el.dataset.k.startsWith('lines.') || el.dataset.k === 'tax') { const t = $('#invTotal'); if (t) t.textContent = KFPDF.money(KFPDF.invoiceTotals(draft.vals).total); }
    }));
    main.querySelectorAll('[data-pick]').forEach(g => g.querySelectorAll('button').forEach(p => p.onclick = () => {
      const id = g.dataset.pick, o = p.dataset.o;
      if (g.dataset.multi === '1') { const a = v[id] || []; v[id] = a.indexOf(o) >= 0 ? a.filter(x => x !== o) : a.concat(o); p.classList.toggle('on'); }
      else { v[id] = v[id] === o ? '' : o; g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.o === v[id])); }
      saveDraft();
      if (f.sections.some(s => s.fields.some(x => x.showColsFrom === id))) keepScroll(fill); // linked price columns
    }));
    main.querySelectorAll('[data-grid]').forEach(b => b.onclick = () => {
      const pv = v[b.dataset.grid] = v[b.dataset.grid] || {}; pv.pick = pv.pick === b.dataset.row ? '' : b.dataset.row; saveDraft();
      main.querySelectorAll('[data-grid="' + b.dataset.grid + '"]').forEach(x => { const on = x.dataset.row === pv.pick; x.classList.toggle('on', on); x.textContent = on ? '\u2713' : ''; });
    });
    main.querySelectorAll('[data-insp]').forEach(g => g.querySelectorAll('button').forEach(p => p.onclick = () => {
      const iv = v.inspect = v.inspect || {}, it = g.dataset.insp; iv[it] = iv[it] || {}; iv[it].rate = iv[it].rate === p.dataset.o ? '' : p.dataset.o;
      g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.o === iv[it].rate)); saveDraft();
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
    const f = formById(draft.formId), v = draft.vals; chrome('Signatures', 'sub');
    const sigBlock = (id, title, name) => '<div class="sec">' + title + '</div><div class="card form"><div class="sigwrap" id="w_' + id + '"><canvas id="sig_' + id + '"></canvas><div class="line"></div><div class="ph">Sign here with your finger</div></div><div class="sigtools"><span>Signed ' + esc(nowText()) + '</span><button class="linkbtn" type="button" data-clear="' + id + '">Clear</button></div>' + input(id + 'Name', 'Printed name', 'text', name) + '</div>';
    main.innerHTML = '<p class="hello">Hand the phone to the customer to sign for the ' + esc(f.title) + '.</p>' +
      sigBlock('customer', 'Customer signs', v.c_name) + sigBlock('tech', 'Technician signs', techName());
    foot('<button class="btn soft tap" id="sigBack" type="button" style="flex:0 0 auto">Back</button><button class="btn pri tap" id="toReview" type="button">Review the PDF</button>');
    $('#sigBack').onclick = back;
    const pads = {};
    ['customer', 'tech'].forEach(id => { pads[id] = pad($('#sig_' + id), () => { $('#w_' + id + ' .ph').hidden = true; }); });
    main.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { pads[b.dataset.clear].clear(); $('#w_' + b.dataset.clear + ' .ph').hidden = false; });
    $('#toReview').onclick = () => {
      if (!pads.customer.has()) return toast('The customer needs to sign.');
      if (!pads.tech.has()) return toast('The technician needs to sign.');
      const tn = $('#i_techName').value.trim(); if (tn) setCfg({ rep: tn });
      sigs = { customer: pads.customer.png(), tech: pads.tech.png(), customerName: $('#i_customerName').value.trim(), techName: tn, signedAt: nowText() };
      go('review');
    };
  }

  /* ---------- review and send ---------- */
  // drop prices typed into columns that are hidden now (showColsFrom), so they are never printed or sent
  function prune(f, vals) {
    const o = clone(vals);
    f.sections.forEach(s => s.fields.forEach(fl => {
      if (fl.type !== 'pricegrid' || !o[fl.id]) return;
      const keep = KFPDF.visibleCols(fl, o).map(c => c.id);
      fl.cols.forEach(c => { if (keep.indexOf(c.id) < 0) fl.rows.forEach(r => delete o[fl.id][r.id + '_' + c.id]); });
    }));
    return o;
  }
  function makePdf() {
    const f = formById(draft.formId); lastDoc = KFPDF.build(f, prune(f, draft.vals), sigs, brand());
    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = URL.createObjectURL(lastDoc.output('blob')); return lastDoc;
  }
  const fileName = (f, v) => (brand().name + ' ' + f.title + ' ' + (v.c_name || '') + ' ' + (v.c_date || '')).replace(/[^A-Za-z0-9 \-]/g, '').trim().replace(/\s+/g, '-') + '.pdf';
  function review() {
    const f = formById(draft.formId), v = draft.vals; chrome('Check it over', 'sub'); makePdf();
    const who = v.c_email ? 'Emails to ' + esc(v.c_email) + ' and the shop.' : 'No customer email, so it goes to the shop only.';
    main.innerHTML = '<p class="hello">' + who + '</p><iframe class="pdfframe" id="pdfView" title="PDF" src="' + lastBlobUrl + '#view=FitH"></iframe>' +
      '<a class="btn soft full tap" id="openPdf" href="' + lastBlobUrl + '" target="_blank" rel="noopener" style="margin-top:12px">Open the PDF full screen</a><button class="btn soft full tap" id="fix" type="button">Fix something</button>';
    foot('<button class="btn pri tap" id="send" type="button">' + I.send + ' Send to customer and shop</button>');
    $('#fix').onclick = () => { stack.length = 0; cur = { name: 'home' }; go('fill'); };
    $('#send').onclick = async () => {
      const b = $('#send'); b.disabled = true; b.textContent = 'Sending...';
      const rec = {
        id: v._id, formId: f.id, title: f.title, customer: v.c_name || '', phone: v.c_phone || '', email: v.c_email || '', address: v.c_address || '',
        jobDate: v.c_date || '', total: totalFor(f, prune(f, v)), tech: sigs.techName || '', fileName: fileName(f, v), business: brand().name,
        pdf: lastDoc.output('datauristring').split(',')[1], createdAt: new Date().toISOString()
      };
      lastRec = rec;
      const ob = LS.get('outbox', []).filter(x => x.id !== rec.id); ob.push(rec);
      if (!LS.set('outbox', ob)) { b.disabled = false; b.textContent = 'Send to customer and shop'; return; }
      const rc = LS.get('recent', []).filter(x => x.id !== rec.id);
      rc.unshift({ id: rec.id, customer: rec.customer, first: (rec.customer || '').split(' ')[0], phone: rec.phone, email: rec.email, title: f.title, total: rec.total, when: nowText(), status: 'waiting' });
      LS.set('recent', rc.slice(0, 30));
      draft = null; LS.del('draft');
      await flush();
      go('sent', { id: rec.id }, true); stack.length = 0;
    };
  }
  function sent() {
    const r = (LS.get('recent', []).find(x => x.id === cur.id)) || {}, ok = r.status === 'sent';
    chrome(ok ? 'Sent' : 'Saved', 'tab');
    main.innerHTML = '<div class="card done"><div class="big' + (ok ? '' : ' wait') + '">' + (ok ? '\u2713' : '\u23F3') + '</div><h2 id="sentTitle">' + (ok ? 'Sent' : 'Saved on this phone') + '</h2><p class="hello">' +
      (ok ? (r.emailedTo ? 'Emailed to ' + esc(r.emailedTo) + '. Logged in the shop sheet.' : 'Logged in the shop sheet.') : (conn() ? 'No signal right now. It sends on its own when you have signal.' : 'This phone is not connected to the shop yet. It sends once you connect.')) + '</p></div>' +
      (r.phone ? '<a class="btn green full tap" id="textCust" href="' + esc(smsLink(r.phone, r.first, r.title)) + '">' + I.text + ' Text the customer</a>' : '') +
      '<button class="btn soft full tap" id="share" type="button">' + I.share + ' Share or save the PDF</button><button class="btn pri full tap" id="again" type="button">Start a new form</button>';
    $('#again').onclick = () => goTab('home');
    $('#share').onclick = async () => {
      if (!lastDoc) return toast('PDF not on this screen anymore.');
      const name = (lastRec && lastRec.fileName) || 'form.pdf', file = new File([lastDoc.output('blob')], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch (e) {} }
      else { const a = document.createElement('a'); a.href = lastBlobUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    };
  }

  /* ---------- connect: browser tab opened a setup link ---------- */
  function install() {
    chrome('Almost done', 'bare');
    const shop = shopName();
    main.innerHTML = '<div class="card okcard"><span class="oki">' + I.check + '</span><div><b id="instShop">' + (conn() ? 'This browser is connected' + (shop ? ' to ' + esc(shop) : '') + '.' : 'That setup link did not work.') + '</b><div class="meta2">Now put the app on your Home Screen. Three steps.</div></div></div>' +
      '<div class="sec">Put it on your Home Screen</div><div class="card"><ol class="steps" id="steps">' +
      '<li><b>Tap Copy</b>This copies your shop link.<button class="btn pri full big tap" id="copyLink" type="button" style="margin-top:10px">' + I.copy + ' Copy</button>' +
      '<div id="copyFallback" hidden><p class="meta2" style="margin:10px 0 6px">Press and hold the box, then tap Copy.</p><input class="in" id="linkBox" readonly></div></li>' +
      '<li><b>Tap Share, then Add to Home Screen</b>The Share button <span class="ico">' + I.share + '</span> is at the bottom of Safari. Scroll down to find Add to Home Screen. On Android, tap the menu, then Install app.</li>' +
      '<li><b>Open the app and tap Connect</b>Open Forms from your Home Screen and tap <b style="display:inline">Tap to connect</b>. If it asks, tap Paste.</li></ol></div>' +
      '<button class="btn soft full tap" id="useHere" type="button" style="margin-top:4px">Use it in this browser instead</button>';
    $('#copyLink').onclick = async () => {
      const link = setupRaw || (conn() ? K.makeSetupLink(APP_BASE, { api: cfg().api, key: cfg().key }) : '');
      if (!link) return toast('That setup link did not work. Ask the shop for a new one.');
      if (await K.copyText(link)) { const b = $('#copyLink'); b.innerHTML = I.check + ' Copied'; b.classList.remove('pri'); b.classList.add('green'); toast('Copied. Now tap Share.'); }
      else { $('#copyFallback').hidden = false; const lb = $('#linkBox'); lb.value = link; lb.focus(); lb.select(); }
    };
    $('#useHere').onclick = () => { setupRaw = ''; goTab('home'); };
    if (conn()) ping().then(() => { const el = $('#instShop'); if (el && shopName()) el.textContent = 'This browser is connected to ' + shopName() + '.'; }).catch(() => {});
  }
  // Best effort: also bake the setup link into the Add to Home Screen start address, so a phone that
  // honors it opens already connected. The clipboard path above still works when it does not.
  function bakeManifest(link) {
    try {
      const abs = u => new URL(u, APP_BASE).href;
      const m = { name: brand().name + ' Forms', short_name: 'Forms', id: APP_BASE, start_url: link, scope: APP_BASE, display: 'standalone',
        background_color: brand().colors.bg, theme_color: brand().colors.bg,
        icons: [{ src: abs('icons/icon-192.png'), sizes: '192x192', type: 'image/png' }, { src: abs('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] };
      const l = document.querySelector('link[rel=manifest]'); if (l) l.href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(m));
    } catch (e) {}
  }

  /* ---------- settings (More) ---------- */
  function settings() {
    chrome('More', 'tab');
    const c = conn(), shop = shopName(), standalone = K.isStandalone(), rc = LS.get('recent', []), ob = LS.get('outbox', []);
    main.innerHTML = '<p class="hello">Settings, look, backup</p>' +
      '<div class="card"><div class="h"><b>Shop connection</b></div><p class="meta2" id="connState" style="margin:6px 0 12px">' + (c ? 'Connected' + (shop ? ' to ' + esc(shop) : '') + '.' : 'Not connected. Copy the setup link from your shop, then tap Tap to connect. Or paste it here.') + '</p>' +
      (c ? '<button class="btn soft full tap" id="test" type="button">Test the connection</button>' + (!standalone ? '<button class="btn soft full tap" id="goInstall" type="button">Put it on my Home Screen</button>' : '') + '<button class="linkbtn" id="unlink" type="button">Disconnect this phone</button>'
         : '<button class="btn pri full tap" id="tapConnect" type="button">' + I.link + ' Tap to connect</button><div class="fld" style="margin:12px 0 10px"><label for="setupPaste">Or paste the setup link</label><input type="url" id="setupPaste" placeholder="Paste the setup link" autocomplete="off" autocapitalize="off" spellcheck="false"></div><button class="btn dark full tap" id="connect" type="button">Connect</button>') + '</div>' +
      '<div class="card"><div class="fld" style="margin:0"><label for="i_tech">Your name (technician)</label><input id="i_tech" type="text" value="' + esc(techName()) + '" autocomplete="name"></div></div>' +
      '<div class="sec">Make it yours</div><div class="card set"><div class="item" id="goBrand"><div><b>Business look</b><small>Name, logo, colors, phone and email on forms</small></div><span class="chev">\u203A</span></div>' +
      '<div class="item" id="goForms"><div><b>Forms</b><small>Show or hide forms, change wording</small></div><span class="chev">\u203A</span></div></div>' +
      '<div class="sec">Backup</div><div class="card"><p class="meta2" id="cnt" style="margin:0 0 10px">' + rc.length + ' recent forms and ' + ob.length + ' waiting on this phone. Signed PDFs are saved in the shop\'s Google Drive.</p>' +
      '<button class="btn soft full tap" id="csvRecent" type="button">Download forms list CSV</button></div>' +
      '<div class="sec">Support</div><div class="card donate"><b>Like the app?</b><p class="meta2" style="margin:6px 0 10px">It is free. A way to chip in is coming soon.</p>' +
      (C.donateUrl ? '<a class="btn pri full" id="donateBtn" href="' + esc(C.donateUrl) + '" target="_blank" rel="noopener">Donate</a>' : '<button class="btn pri full" id="donateBtn" type="button" disabled>Donate (coming soon)</button>') + '</div>' +
      '<p class="ver">' + esc(brand().name) + ' Forms v3</p>';
    $('#goBrand').onclick = () => go('brandScreen');
    $('#goForms').onclick = () => go('formsScreen');
    $('#i_tech').oninput = e => setCfg({ rep: e.target.value.trim() });
    $('#csvRecent').onclick = () => K.downloadCSV(rc, ['id', 'when', 'title', 'customer', 'phone', 'email', 'total', 'status', 'emailedTo'], 'forms-' + today() + '.csv');
    const t = $('#test'); if (t) t.onclick = async () => { t.disabled = true; try { await ping(); toast('Connected' + (shopName() ? ' to ' + shopName() : '') + '.'); await flush(); } catch (e) { toast('Could not reach the shop. Check signal.'); } t.disabled = false; render(); };
    const gi = $('#goInstall'); if (gi) gi.onclick = () => go('install');
    const u = $('#unlink'); if (u) u.onclick = () => { if (confirm('Disconnect this phone from the shop?')) { setCfg({ api: '', key: '' }); LS.del('shop'); justConnected = false; render(); } };
    const cn = $('#connect'); if (cn) cn.onclick = () => { if (!readSetup($('#setupPaste').value)) return toast('That link did not work. Ask the shop for a new one.'); afterConnect(); };
    const tc = $('#tapConnect'); if (tc) tc.onclick = async () => {
      let x = null; try { x = await K.readClip(); } catch (e) {}
      if (x && readSetup(x)) return afterConnect();
      toast(x === null ? 'Your phone did not hand over the link. Paste it in the box.' : 'No setup link was copied. Paste it in the box.'); $('#setupPaste').focus();
    };
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
    chrome('Business look', 'sub');
    const b = brand(), w = { name: b.name, phone: b.phone, email: b.email, thanks: b.thanks, logoData: (S.get().brand || {}).logoData || '', colors: clone(b.colors) };
    let lastTarget = 'primary';
    main.innerHTML = '<div class="card">' + input('bname', 'Business name', 'text', w.name) + '<div class="frow">' + input('bphone', 'Phone on forms', 'tel', w.phone) + input('bemail', 'Email on forms', 'email', w.email) + '</div>' +
      '<div class="fld" style="margin:0"><label for="i_bthanks">Thank you line at the bottom of every PDF</label><textarea id="i_bthanks" style="min-height:70px">' + esc(w.thanks) + '</textarea></div></div>' +
      '<div class="card"><span class="lbl">Logo</span><div style="display:flex;align-items:center;gap:12px;margin:6px 0 12px"><img id="logoPrev" alt="" style="width:72px;height:72px;border-radius:16px;object-fit:cover;background:#fff;border:1.5px solid var(--line)"><label class="mini" style="margin:0">Upload a logo<input type="file" id="logoFile" accept="image/*" hidden></label></div>' +
      '<span class="lbl">Colors from your logo (tap a color spot below, then a swatch)</span><div class="swatches" id="sw"></div><button class="btn soft full tap" id="auto" type="button" style="margin-bottom:14px">Pick colors for me</button>' +
      '<div class="colorrow"><span class="lbl">Main color (buttons, the + button)</span><input type="color" id="c_primary" data-c="primary"></div>' +
      '<div class="colorrow"><span class="lbl">Second color (top bar, dark buttons)</span><input type="color" id="c_accent" data-c="accent"></div>' +
      '<div class="colorrow" style="margin:0"><span class="lbl">Background</span><input type="color" id="c_bg" data-c="bg"></div></div>' +
      '<div class="sec">Preview</div><div class="preview" id="pv"><div class="ph" id="pvh"><img id="pvl" alt=""><b id="pvn"></b></div><div class="pb"><div class="bar" id="pvbar">Customer</div><div class="pbtn" id="pvbtn">Send to customer and shop</div></div></div>' +
      '<button class="btn soft full tap" id="samplePdf" type="button">See a sample PDF</button><button class="linkbtn" id="resetLook" type="button">Reset to the ' + esc(C.business.name) + ' look</button>';
    foot('<button class="btn pri tap" id="saveLook" type="button">Save</button>');
    const cIn = k => $('#c_' + k);
    function pv() {
      $('#logoPrev').src = w.logoData || C.business.logo; $('#pvl').src = w.logoData || C.business.logo; $('#pvn').textContent = w.name;
      $('#pvh').style.background = 'linear-gradient(160deg,' + w.colors.accent + ',' + mix(w.colors.accent, '#ffffff', .12) + ')'; $('#pvh').style.borderBottom = '4px solid ' + w.colors.primary; $('#pv').style.background = w.colors.bg;
      $('#pvbar').style.borderLeftColor = w.colors.primary; $('#pvbtn').style.background = w.colors.primary;
      ['primary', 'accent', 'bg'].forEach(k => { cIn(k).value = w.colors[k].toLowerCase(); });
    }
    async function loadSw() {
      const p = await palette(w.logoData || defaultLogo || C.business.logo);
      $('#sw').innerHTML = p.swatches.map(h => '<button class="swatch" type="button" style="background:' + h + '" data-h="' + h + '" aria-label="' + h + '"></button>').join('');
      $('#sw').querySelectorAll('.swatch').forEach(s => s.onclick = () => { w.colors[lastTarget] = s.dataset.h; pv(); });
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
    chrome('Forms', 'sub');
    main.innerHTML = '<p class="hello">Turn off forms you do not use. Tap Change wording to edit the lists and fine print.</p><div class="card set">' +
      forms(true).map(f => '<div class="item" style="cursor:default"><div style="min-width:0"><b>' + esc(f.title) + '</b><button class="linkbtn" type="button" style="padding:4px 0" data-edit="' + f.id + '">Change wording</button></div><button class="sw' + (f.hidden ? '' : ' on') + '" type="button" data-tog="' + f.id + '" aria-label="Show ' + esc(f.title) + '"></button></div>').join('') + '</div>';
    main.querySelectorAll('[data-tog]').forEach(t => t.onclick = () => {
      const s = S.get(), o = s.forms[t.dataset.tog] = s.forms[t.dataset.tog] || {};
      if (!o.hidden && forms().length <= 1) return toast('Keep at least one form on.');
      o.hidden = !o.hidden; S.save(s); render();
    });
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => go('formsEdit', { id: b.dataset.edit }));
  }
  function formsEdit() {
    const f = formById(cur.id), base = C.forms.find(x => x.id === cur.id); chrome('Change wording', 'sub');
    const editable = f.sections.flatMap(s => s.fields.filter(fl => ['static', 'note', 'multi', 'choice', 'inspect'].indexOf(fl.type) >= 0).map(fl => ({ fl, sec: s.title })));
    main.innerHTML = '<div class="card">' + input('ftitle', 'Form name', 'text', f.title) + '</div>' + editable.map(({ fl, sec }) => {
      const v = fl.type === 'note' ? fl.text : (fl.items || fl.options || []).join('\n');
      return '<div class="card"><div class="fld" style="margin:0"><label>' + esc(sec) + (fl.label ? ': ' + esc(fl.label) : '') + (fl.type === 'note' ? '' : ' (one per line)') + '</label><textarea data-fe="' + fl.id + '" data-t="' + fl.type + '">' + esc(v) + '</textarea></div></div>';
    }).join('') + '<button class="linkbtn" id="resetForm" type="button">Reset this form to the original wording</button>';
    foot('<button class="btn pri tap" id="saveForm" type="button">Save</button>');
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
  // A #setup= link. Home screen app: connect quietly (only if not connected yet). Browser tab: connect this
  // browser too, then show the 3 steps so the home screen app gets connected (it has its own storage on iPhone).
  function takeSetup() {
    if (!/setup=/.test(location.hash)) return '';
    const raw = location.href, standalone = K.isStandalone();
    history.replaceState(null, '', location.pathname + location.search);
    if (standalone && conn()) return '';
    if (!readSetup(raw)) { setTimeout(() => toast('That setup link did not work. Ask the shop for a new one.'), 300); return ''; }
    if (standalone) { justConnected = true; return 'connected'; }
    setupRaw = raw; bakeManifest(raw); return 'install';
  }
  function onSetup(r) {
    if (r === 'install') { stack.length = 0; cur = { name: 'install' }; }
    if (r) { render(); ping().then(() => flush()).then(() => render()).catch(() => {}); }
  }
  const first = takeSetup(); if (first === 'install') cur = { name: 'install' };
  window.addEventListener('hashchange', () => onSetup(takeSetup()));
  applyTheme(); render();
  loadDefaultLogo();
  if (conn()) ping().then(() => flush()).then(() => { if (['home', 'install'].indexOf(cur.name) >= 0) render(); else status(); }).catch(() => {});
  if (first === 'connected') setTimeout(() => toast('Connected to ' + (shopName() || 'your shop') + '.'), 300);
  window.addEventListener('online', () => { flush(); status(); });
  window.addEventListener('offline', status);
  setInterval(() => { if (LS.get('outbox', []).length) flush(); }, 30000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  window.KF = { S, settings: S.get, brand, forms, flush, ping, cfg: () => { const c = cfg(); return { connected: !!conn(), rep: c.rep }; } };
})();
