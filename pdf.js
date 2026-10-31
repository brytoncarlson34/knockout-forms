/* Builds the branded PDF for any form in config.js. Everything is drawn from the
   form's sections and the shop's brand (name, logo, colors, phone, email). */
(function () {
  const W = 612, H = 792, M = 36, CW = W - 2 * M, BOTTOM = H - 58;

  function rgb(hex) { const h = String(hex || '#000').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function clean(s) {
    return String(s == null ? '' : s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
  }
  function num(v) { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function money(v) { return '$' + num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDate(d) { if (!d) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? (+m[2]) + '/' + (+m[3]) + '/' + m[1] : d; }
  function imgFmt(dataUrl) { const m = /^data:image\/(png|jpe?g|webp)/i.exec(dataUrl || ''); return m ? (m[1].toLowerCase().startsWith('jp') ? 'JPEG' : m[1].toUpperCase()) : 'PNG'; }

  function invoiceTotals(vals) {
    const lines = (vals.lines || []).filter(l => l && (l.desc || l.price));
    const sub = lines.reduce((s, l) => s + num(l.qty || 1) * num(l.price), 0);
    const tax = sub * num(vals.tax) / 100;
    return { lines, sub, tax, total: sub + tax };
  }

  function build(form, vals, sigs, brand) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const P = rgb(brand.colors.primary), A = rgb(brand.colors.accent), B = rgb(brand.colors.bg);
    const GRAY = [110, 104, 96], LINE = [200, 192, 182], INK = [29, 29, 31];
    let y = 0;
    const set = (c, f) => { f ? doc.setFillColor(...c) : doc.setTextColor(...c); };
    const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };

    function header(first) {
      const hh = first ? 108 : 46;
      set(B, 1); doc.rect(0, 0, W, hh, 'F');
      if (first) {
        if (brand.logoData) { try { doc.addImage(brand.logoData, imgFmt(brand.logoData), M, 14, 80, 80); } catch (e) {} }
        const tx = brand.logoData ? M + 96 : M;
        font('bold', 24); set(P); doc.text(clean(brand.name).toUpperCase(), tx, 46);
        font('bold', 15); set(A); doc.text(clean(form.title), tx, 68);
        const bits = [];
        if (brand.phone) bits.push('Call / text: ' + brand.phone);
        if (brand.email) bits.push(brand.email);
        if (bits.length) { font('normal', 10); set(A); doc.text(clean(bits.join('     ')), tx, 88); }
      } else {
        font('bold', 12); set(P); doc.text(clean(brand.name).toUpperCase(), M, 28);
        font('normal', 10); set(A); doc.text(clean(form.title) + ' (continued)', W - M, 28, { align: 'right' });
      }
      set(P, 1); doc.rect(0, hh, W, 3, 'F'); set(A, 1); doc.rect(0, hh + 3, W, 1, 'F');
      y = hh + 22;
    }
    function ensure(h) { if (y + h > BOTTOM) { doc.addPage(); header(false); } }
    function bar(title) {
      ensure(85);
      set(A, 1); doc.rect(M, y, CW, 20, 'F'); set(P, 1); doc.rect(M, y, 4, 20, 'F');
      font('bold', 10); set([255, 255, 255]); doc.text(clean(title).toUpperCase(), M + 14, y + 13.5);
      y += 33;
    }
    function label(t, x, yy) { font('bold', 7); set(GRAY); doc.text(clean(t).toUpperCase(), x, yy); }
    function box(lbl, value, x, w, minH) {
      font('normal', 10.5);
      const lines = doc.splitTextToSize(clean(value), w - 12);
      const h = Math.max(minH || 22, lines.length * 13 + 9);
      label(lbl, x, y);
      doc.setDrawColor(...LINE); doc.setLineWidth(0.8); doc.roundedRect(x, y + 4, w, h, 2, 2, 'S');
      font('normal', 10.5); set(INK); doc.text(lines, x + 6, y + 18);
      return h + 16;
    }
    function boxRow(items) {
      font('normal', 10.5);
      const gap = 12, totalGap = gap * (items.length - 1);
      const ws = items.map(it => CW * it.w - totalGap * it.w);
      const hs = items.map((it, i) => Math.max(22, doc.splitTextToSize(clean(it.value), ws[i] - 12).length * 13 + 9) + 16);
      const maxH = Math.max(...hs); ensure(maxH);
      let x = M;
      items.forEach((it, i) => { box(it.label, it.value, x, ws[i], maxH - 16); x += ws[i] + gap; });
      y += maxH;
    }
    function checkbox(x, yy, on, size) {
      const s = size || 11;
      doc.setDrawColor(...A); doc.setLineWidth(1); doc.rect(x, yy - s + 2, s, s, 'S');
      if (on) { doc.setDrawColor(...P); doc.setLineWidth(2); doc.line(x + 2, yy - s / 2 + 1, x + s / 2 - 1, yy); doc.line(x + s / 2 - 1, yy, x + s + 2, yy - s - 1); }
    }
    function tick(x, yy) { doc.setDrawColor(...P); doc.setLineWidth(1.8); doc.line(x, yy - 4, x + 3.5, yy); doc.line(x + 3.5, yy, x + 10, yy - 9); }
    function choiceLine(lbl, options, chosen) {
      ensure(24);
      const x0 = lbl ? M + 110 : M;
      if (lbl) { font('bold', 7); const ll = doc.splitTextToSize(clean(lbl).toUpperCase(), 100); set(GRAY); doc.text(ll, M, y - 1); }
      let x = x0; font('normal', 11);
      options.forEach(o => {
        const w = doc.getTextWidth(clean(o)) + 34;
        if (x + w > W - M) { x = x0; y += 20; ensure(20); }
        checkbox(x, y + 2, chosen.indexOf(o) >= 0); set(INK); font('normal', 11); doc.text(clean(o), x + 17, y + 1);
        x += w;
      });
      y += 22;
    }
    function moneyStr(v) { return String(v || '').trim() ? money(v) : '$ ______'; }

    function field(f) {
      const v = vals[f.id];
      switch (f.type) {
        case 'choice': choiceLine(f.label, f.options, v ? [v] : []); break;
        case 'multi': choiceLine(f.label, f.options, v || []); break;
        case 'static': {
          font('normal', 11);
          if (f.items.length >= 4 && f.items.every(it => doc.getTextWidth(clean(it)) < CW / 2 - 30)) {
            const half = Math.ceil(f.items.length / 2); ensure(half * 15 + 6);
            f.items.forEach((it, i) => { const x = M + (i < half ? 0 : CW / 2), yy = y + (i % half) * 15; tick(x + 2, yy + 1); set(INK); font('normal', 11); doc.text(clean(it), x + 18, yy); });
            y += half * 15 + 4; break;
          }
          f.items.forEach(it => { const ls = doc.splitTextToSize(clean(it), CW - 22); ensure(ls.length * 14 + 4); tick(M + 2, y + 1); set(INK); font('normal', 11); doc.text(ls, M + 18, y); y += ls.length * 14 + 3; });
          y += 2; break;
        }
        case 'note': {
          font('normal', 10.5); const ls = doc.splitTextToSize(clean(f.text), CW - 26); const h = ls.length * 13 + 14;
          ensure(h + 8); set(B, 1); doc.rect(M, y - 4, CW, h, 'F'); set(P, 1); doc.rect(M, y - 4, 3, h, 'F');
          set(INK); doc.text(ls, M + 14, y + 8); y += h + 10; break;
        }
        case 'pricegrid': {
          const pv = v || {}, cols = visibleCols(f, vals); ensure(30 + f.rows.length * 30);
          const c1 = M + 300, c2 = M + 420;
          font('bold', 8); set(GRAY); doc.text(clean(cols[0].label).toUpperCase(), c1, y); if (cols[1]) doc.text(clean(cols[1].label).toUpperCase(), c2, y); y += 10;
          f.rows.forEach(r => {
            set(B, 1); doc.roundedRect(M, y, CW, 26, 3, 3, 'F');
            checkbox(M + 10, y + 18, pv.pick === r.id, 12);
            font('bold', 12); set(A); doc.text(clean(r.label), M + 30, y + 17); const lw = doc.getTextWidth(clean(r.label));
            font('normal', 10.5); set(INK); doc.text(clean(r.sub || ''), M + 30 + lw + 12, y + 17);
            font('bold', 11); set(P);
            cols.forEach((c, i) => { doc.text(moneyStr(pv[r.id + '_' + c.id]) + ' ' + (f.unit || ''), i ? c2 : c1, y + 17); });
            y += 31;
          });
          if (f.note) { font('italic', 9); set(GRAY); doc.text(clean(f.note), M, y + 4); y += 16; }
          break;
        }
        case 'money': { ensure(20); label(f.label, M, y + 4); font('bold', 11); set(P); doc.text(moneyStr(v) + ' ' + (f.unit || ''), M + 110, y + 4); y += 18; break; }
        case 'percent': { if (f.id === 'tax' && form.sections.some(s2 => s2.fields.some(x => x.type === 'lineitems'))) break; ensure(20); font('bold', 11); set(P); doc.text((String(v || '').trim() ? v : '____') + ' %', M + 2, y); font('normal', 11); set(INK); doc.text(clean(f.label.replace(/^%\s*/, '')), M + 44, y); y += 15; break; }
        case 'options': {
          const ov = v || {};
          f.names.forEach(n => {
            const o = ov[n] || {}; if (!o.desc && !o.price) return;
            font('normal', 10.5); const ls = doc.splitTextToSize(clean(o.desc || ''), CW - 140); const h = Math.max(30, ls.length * 13 + 22);
            ensure(h + 6); doc.setDrawColor(...LINE); doc.setLineWidth(0.8); doc.roundedRect(M, y, CW, h, 3, 3, 'S');
            set(P, 1); doc.rect(M, y, 4, h, 'F');
            font('bold', 12); set(A); doc.text(clean(n).toUpperCase(), M + 14, y + 16);
            font('bold', 13); set(P); doc.text(moneyStr(o.price), W - M - 12, y + 16, { align: 'right' });
            font('normal', 10.5); set(INK); doc.text(ls, M + 14, y + 30);
            y += h + 8;
          });
          break;
        }
        case 'lineitems': {
          const t = invoiceTotals(vals); ensure(40);
          font('bold', 8); set(GRAY); doc.text('WHAT', M + 6, y); doc.text('QTY', M + 340, y, { align: 'right' }); doc.text('PRICE', M + 430, y, { align: 'right' }); doc.text('AMOUNT', W - M - 6, y, { align: 'right' }); y += 6;
          doc.setDrawColor(...A); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 14;
          t.lines.forEach(l => {
            font('normal', 10.5); const ls = doc.splitTextToSize(clean(l.desc), 300); ensure(ls.length * 13 + 8);
            set(INK); doc.text(ls, M + 6, y); doc.text(String(l.qty || 1), M + 340, y, { align: 'right' }); doc.text(money(l.price), M + 430, y, { align: 'right' });
            doc.text(money(num(l.qty || 1) * num(l.price)), W - M - 6, y, { align: 'right' });
            y += ls.length * 13 + 5; doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, y - 8, W - M, y - 8); y += 4;
          });
          ensure(60); font('normal', 10.5); set(INK);
          doc.text('Subtotal', M + 430, y, { align: 'right' }); doc.text(money(t.sub), W - M - 6, y, { align: 'right' }); y += 15;
          if (num(vals.tax)) { doc.text('Tax (' + num(vals.tax) + '%)', M + 430, y, { align: 'right' }); doc.text(money(t.tax), W - M - 6, y, { align: 'right' }); y += 15; }
          set(A, 1); doc.rect(M + 330, y - 11, CW - 330, 22, 'F'); font('bold', 12); set([255, 255, 255]);
          doc.text('TOTAL', M + 430, y + 4, { align: 'right' }); doc.text(money(t.total), W - M - 6, y + 4, { align: 'right' }); y += 24;
          break;
        }
        case 'inspect': {
          const iv = v || {}; font('bold', 8); set(GRAY); ensure(30);
          doc.text('SPOT', M + 6, y); doc.text('RESULT', M + 190, y); doc.text('NOTES', M + 290, y); y += 6;
          doc.setDrawColor(...A); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 14;
          f.items.forEach(it => {
            const r = iv[it] || {}; font('normal', 10); const ls = doc.splitTextToSize(clean(r.note || ''), CW - 296); ensure(Math.max(1, ls.length) * 12 + 8);
            set(INK); doc.text(clean(it), M + 6, y);
            font('bold', 10); set(r.rate === 'Needs work' ? P : r.rate === 'OK' ? [46, 125, 79] : GRAY); doc.text(clean(r.rate || '-'), M + 190, y);
            font('normal', 10); set(INK); doc.text(ls, M + 290, y);
            y += Math.max(1, ls.length) * 12 + 4; doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, y - 8, W - M, y - 8); y += 4;
          });
          y += 4; break;
        }
        case 'photos': {
          const ph = (v || []).filter(Boolean); if (!ph.length) break;
          ensure(20); label(f.label, M, y); y += 8;
          const pw = (CW - 12) / 2, phh = pw * 0.72;
          for (let i = 0; i < ph.length; i += 2) {
            ensure(phh + 10);
            [ph[i], ph[i + 1]].forEach((p, j) => { if (!p) return; try { doc.addImage(p, imgFmt(p), M + j * (pw + 12), y, pw, phh, undefined, 'FAST'); } catch (e) {} });
            y += phh + 10;
          }
          break;
        }
        case 'textarea': { if (!String(v || '').trim()) break; font('normal', 10.5); const n = doc.splitTextToSize(clean(v || ''), CW - 12).length; ensure(n * 13 + 34); y += box(f.label, v || '', M, CW, 40); break; }
        default: break;
      }
    }

    function section(sec) {
      const fs = sec.fields; bar(sec.title);
      const simple = t => ['text', 'tel', 'email', 'date', 'number'].indexOf(t) >= 0;
      let i = 0;
      while (i < fs.length) {
        const f = fs[i];
        if (simple(f.type) && !String(vals[f.id] == null ? '' : vals[f.id]).trim()) { i++; continue; }
        if (simple(f.type)) {
          const group = [f]; let j = i + 1;
          if (f.half) while (j < fs.length && simple(fs[j].type) && fs[j].half && group.length < 2) { if (String(vals[fs[j].id] == null ? '' : vals[fs[j].id]).trim()) group.push(fs[j]); j++; }
          boxRow(group.map(g => ({ label: g.label, value: g.type === 'date' ? fmtDate(vals[g.id]) : (vals[g.id] || ''), w: 1 / group.length })));
          i = j; continue;
        }
        field(f); i++;
      }
      y += 2;
    }

    header(true);
    bar('Customer info');
    boxRow([{ label: 'Name', value: vals.c_name || '', w: 0.5 }, { label: 'Phone', value: vals.c_phone || '', w: 0.27 }, { label: 'Date', value: fmtDate(vals.c_date), w: 0.23 }]);
    boxRow([{ label: 'Service address', value: vals.c_address || '', w: 0.58 }, { label: 'Email', value: vals.c_email || '', w: 0.42 }]);
    y += 2;
    form.sections.forEach(section);

    ensure(120); bar('Sign here');
    const sw = (CW - 12) / 2;
    [['Customer signature', sigs.customer, sigs.customerName], ['Technician signature', sigs.tech, sigs.techName]].forEach((s, k) => {
      const x = M + k * (sw + 12);
      label(s[0], x, y);
      doc.setDrawColor(...LINE); doc.setLineWidth(0.8); doc.roundedRect(x, y + 4, sw, 62, 2, 2, 'S');
      if (s[1]) { try { doc.addImage(s[1], 'PNG', x + 8, y + 7, sw - 16, 56); } catch (e) {} }
      font('normal', 10); set(INK); doc.text(clean(s[2] || ''), x + 2, y + 80);
      font('normal', 9); set(GRAY); doc.text('Signed ' + clean(sigs.signedAt || ''), x + sw - 2, y + 80, { align: 'right' });
    });
    y += 90;

    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor(...P); doc.setLineWidth(1); doc.line(M, H - 44, W - M, H - 44);
      font('bold', 9); set(A); doc.text(clean(brand.thanks || ('Thanks for choosing ' + brand.name + '.')), W / 2, H - 30, { align: 'center' });
      font('normal', 7.5); set(GRAY); doc.text('Form ' + clean(vals._id || '') + '   |   Page ' + p + ' of ' + pages, W / 2, H - 18, { align: 'center' });
    }
    doc.setProperties({ title: brand.name + ' - ' + form.title + ' - ' + (vals.c_name || ''), creator: brand.name });
    return doc;
  }

  // pricegrid option showColsFrom: '<field id>'. Only the columns whose label (or c.when) was picked in that
  // choice/multi field show, on screen and on the PDF. Nothing picked (or no match) shows every column.
  function visibleCols(f, vals) {
    if (!f.showColsFrom) return f.cols;
    const sel = [].concat((vals || {})[f.showColsFrom] || []).filter(Boolean).map(x => String(x).toLowerCase());
    const vis = f.cols.filter(c => sel.indexOf(String(c.when || c.label).toLowerCase()) >= 0);
    return vis.length ? vis : f.cols;
  }
  window.KFPDF = { build, invoiceTotals, money, num, visibleCols };
})();
