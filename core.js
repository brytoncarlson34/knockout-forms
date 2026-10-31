/* ===== Shared app core (Kern CRM family) =====
   Small helpers both apps can share: storage, toast, bottom sheet, status pill, setup links,
   copy and paste, home screen detection, CSV backup, icons. Same markup and names as the
   Kern Energy Check CRM v2 (toast #toast/#toastT/#toastU, sheet #sheet/#scrim, pill [data-sync]).
   Storage keys are '<app>_<thing>' (kec_cfg, kf_cfg, ...). Connection is always {api, key, rep}.
   Never log a key or a setup link. */
window.CORE = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function store(prefix, onFull) {
    const k = n => prefix + '_' + n;
    return {
      key: k,
      get(n, d) { try { const v = localStorage.getItem(k(n)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set(n, v) { try { localStorage.setItem(k(n), JSON.stringify(v)); return true; } catch (e) { if (onFull) onFull(); return false; } },
      del(n) { localStorage.removeItem(k(n)); },
      has(n) { return localStorage.getItem(k(n)) != null; }
    };
  }
  /* toast, same as the CRM: one line, optional Undo */
  let tT;
  function toast(m, undo) {
    const t = $('#toast'); if (!t) return;
    $('#toastT').textContent = m; const u = $('#toastU'); u.style.display = undo ? 'block' : 'none';
    u.onclick = () => { t.classList.remove('on'); undo && undo(); };
    t.classList.add('on'); clearTimeout(tT); tT = setTimeout(() => t.classList.remove('on'), undo ? 5000 : 2600);
  }
  /* bottom sheet, same as the CRM */
  function sheet(html, bind) { const s = $('#sheet'); $('#toast').classList.remove('on'); s.innerHTML = '<div class="grab"></div>' + html; s.classList.add('on'); $('#scrim').classList.add('on'); s.scrollTop = 0; bind && bind(s); }
  function closeSheet() { $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); }
  /* status pill: cls '' (good), 'busy', 'off' */
  const pill = (cls, text) => '<button class="pill ' + (cls || '') + '" data-sync="1" type="button"><span class="dot"></span>' + esc(text) + '</button>';
  /* home screen app or a browser tab? */
  const isStandalone = () => window.navigator.standalone === true || !!(window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches));
  /* setup links: <app url>#setup=<urlencoded base64 JSON {api, key, rep|tech}> (same format in both apps) */
  function parseSetup(text) {
    // also finds a link that was wrapped by a mail app (…url?q=https%3A…%23setup%3D…)
    let t = String(text || ''), m = null;
    for (let i = 0; i < 3 && !(m = /setup=([^&\s#"'<>]+)/.exec(t)); i++) { try { t = decodeURIComponent(t); } catch (e) { break; } }
    if (!m) return null;
    let raw; try { raw = atob(decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/')); } catch (e) { return null; }
    let j = null; try { j = JSON.parse(decodeURIComponent(escape(raw))); } catch (e) { try { j = JSON.parse(raw); } catch (e2) { return null; } }
    if (!j || typeof j.api !== 'string' || typeof j.key !== 'string' || !j.api || !j.key) return null;
    return { api: j.api, key: j.key, rep: j.rep || j.tech || '' };
  }
  function makeSetupLink(base, c) {
    const o = { api: c.api, key: c.key }; if (c.rep) o.rep = c.rep;
    return base + '#setup=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(o)))));
  }
  /* copy and paste */
  async function copyText(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) {}
    try {
      const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length); const ok = document.execCommand('copy'); ta.remove(); return !!ok;
    } catch (e) { return false; }
  }
  async function readClip() { if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('no clipboard'); return await navigator.clipboard.readText(); }
  /* CSV backup, same as the CRM */
  function downloadCSV(rows, cols, name) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const t = [cols.join(',')].concat(rows.map(r => cols.map(c => q(r[c])).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  const initials = n => String(n || '?').split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase() || '?';
  /* icons: the CRM set plus a few */
  const I = {
    phone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5l18-8.5L3 3.5 3 10l12 2-12 2z"/></svg>'
  };
  /* shared shell rule: no pinch or double tap zoom (iOS ignores user-scalable=no) */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // double tap zoom is off through touch-action: manipulation in core.css
  /* fit(on): lock the page to one screen (home), or let it scroll (forms) */
  function fit(on) { document.documentElement.classList.toggle('fit', !!on); document.body.classList.toggle('fit', !!on); }
  return { fit, $, esc, store, toast, sheet, closeSheet, pill, isStandalone, parseSetup, makeSetupLink, copyText, readClip, downloadCSV, initials, I };
})();
