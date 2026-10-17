/* Формування PDF у браузері без сервера й API: HTML звіту → pdfmake (html-to-pdfmake), шрифт DejaVu Sans
 * (кирилиця, грецькі літери, ≤ ≥ √ □ ⊥ λ̄). Креслення SVG растеризуються в PNG зі світлою палітрою.
 * Збереження: у вікні Claude — через можливість «downloads» (користувач підтверджує), інакше — звичайне завантаження. */
(function (SC) {
  'use strict';
  const PDF = {};
  // світла палітра для креслень у PDF (незалежно від теми сторінки)
  const PAL = { '--fg': '#1b2127', '--muted': '#5a6570', '--surface': '#ffffff', '--surface-2': '#eef0f3', '--line': '#d3d8dd', '--line-strong': '#8b96a1', '--accent': '#c4501b', '--link': '#1f5f8b', '--ok': '#2f7d4f', '--warn': '#b7791f', '--bad': '#b3261e', '--font-mono': 'DejaVu Sans Mono, monospace', '--font-body': 'DejaVu Sans, sans-serif' };
  const DWG_CSS = `.ln{fill:none;stroke:#1b2127;stroke-width:1}.gr{stroke:#5a6570;stroke-dasharray:6 4}.mb{stroke:#2f7d4f;stroke-width:3}.mb.br{stroke-width:1.5;stroke-dasharray:5 3}.mb.warn{stroke:#b7791f}.mb.bad{stroke:#b3261e}
    .dm{stroke:#5a6570;stroke-width:.7}.tx{fill:#1b2127}.tx.sm{font-size:10px}.dt{fill:#5a6570;font-size:10px}.tt{fill:#1b2127;font-weight:600;font-size:13px}
    .pl{fill:#dfe9f1;stroke:#1f5f8b;stroke-width:1.2}.tube{fill:#e6e7e8;stroke:#1b2127;stroke-width:1.5}.rib{stroke:#c4501b;stroke-width:3}.ribs{fill:#f3d6c8;stroke:#c4501b}
    .anc{fill:#fff;stroke:#1b2127;stroke-width:1.5}.anc.ten{fill:#b3261e}.conc{fill:#e9ebed;stroke:#5a6570}.ped{fill:#dcdfe2;stroke:#1b2127}
    .reb{stroke:#b3261e;stroke-width:.6;opacity:.7}.rebb{stroke:#b3261e;stroke-width:2;stroke-dasharray:2 3}.bolt{stroke:#1b2127;stroke-width:2}.sup{fill:#1b2127}`;
  const varRe = /var\((--[a-z0-9-]+)\)/g;

  function svgToPng(svg) {
    return new Promise(resolve => {
      const vb = (svg.getAttribute('viewBox') || '0 0 600 400').split(/\s+/).map(Number);
      const w = vb[2], h = vb[3];
      let src = new XMLSerializer().serializeToString(svg).replace(varRe, (m, v) => PAL[v] || '#1b2127');
      src = src.replace(/<svg([^>]*)>/, (m, a) => `<svg${a.replace(/\swidth="[^"]*"/, '').replace(/\sstyle="[^"]*"/, '')} width="${w}" height="${h}"><style>${DWG_CSS}</style><rect width="100%" height="100%" fill="#fff"/>`);
      if (!/xmlns=/.test(src.slice(0, 200))) src = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      const img = new Image();
      img.onload = () => { const k = 2, cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height); resolve({ url: cv.toDataURL('image/png'), w, h }); };
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(src)));
    });
  }

  /** Готує копію HTML звіту для перетворення: креслення → PNG, розкриває <details>, прибирає кнопки. */
  async function prepare(el) {
    const box = el.cloneNode(true);
    box.querySelectorAll('button, .noprint, script').forEach(n => n.remove());
    box.querySelectorAll('details').forEach(d => { const div = document.createElement('div'); [...d.childNodes].forEach(ch => { if (ch.nodeName === 'SUMMARY') { const p = document.createElement('p'); p.innerHTML = '<b>' + ch.innerHTML + '</b>'; div.appendChild(p); } else div.appendChild(ch.cloneNode(true)); }); d.replaceWith(div); });
    const svgs = [...box.querySelectorAll('svg')];
    for (const sv of svgs) {
      const r = await svgToPng(sv);
      const host = sv.closest('.dwg') || sv;
      if (!r) { host.remove(); continue; }
      const img = document.createElement('img'); img.src = r.url; img.setAttribute('width', String(Math.min(515, r.w * 0.75)));
      host.replaceWith(img);
    }
    // довгі слова в таблицях: невидимі точки переносу (U+200B), щоб колонки вміщались у ширину сторінки
    const tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const texts = []; while (tw.nextNode()) texts.push(tw.currentNode);
    texts.forEach(t => { if (t.parentElement && t.parentElement.closest('td, th')) t.nodeValue = t.nodeValue.replace(/[^\s\u200B]{11,}/g, w => w.replace(/(.{6})(?=.{3})/g, '$1\u200B')); });
    // марки секцій і коефіцієнти: класи → стилі pdfmake
    box.querySelectorAll('.sect-chip').forEach(n => { n.setAttribute('style', `color:#ffffff;background-color:${n.style.background || n.style.backgroundColor || '#2b6cb0'};font-weight:bold`); });
    return box;
  }

  function postProcess(node, depth) {
    if (Array.isArray(node)) { node.forEach(n => postProcess(n, depth)); return; }
    if (!node || typeof node !== 'object') return;
    if (node.table) {
      const body = node.table.body, n = body[0] ? body[0].length : 1;
      node.table.widths = new Array(n).fill('*');
      node.table.headerRows = 1; node.table.dontBreakRows = true;
      node.fontSize = n > 8 ? 6 : n > 6 ? 6.6 : n > 4 ? 7.2 : 7.8;
      node.layout = { hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => '#c9ced3', vLineColor: () => '#c9ced3', fillColor: r => (r === 0 ? '#eef0f3' : null), paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2 };
      node.margin = [0, 3, 0, 6];
      body.forEach(r => r.forEach(cell => { if (cell && typeof cell === 'object') { delete cell.width; postProcess(cell, depth + 1); } }));
      return;
    }
    if (node.image) { const w = Math.min(node.width || 515, depth > 0 ? 160 : 515); node.width = w; delete node.height; node.alignment = 'center'; node.margin = [0, 4, 0, 6]; }
    ['stack', 'ul', 'ol', 'columns'].forEach(k => { if (node[k]) postProcess(node[k], depth); });
    if (Array.isArray(node.text)) postProcess(node.text, depth);
  }

  /** HTML-елемент звіту → Blob PDF. */
  PDF.fromElement = async function (el, meta) {
    if (typeof pdfMake === 'undefined' || typeof htmlToPdfmake === 'undefined') throw new Error('Бібліотека PDF не завантажилась');
    const box = await prepare(el);
    const content = htmlToPdfmake(box.innerHTML, {
      window,
      tableAutoSize: false,
      defaultStyles: {
        h1: { fontSize: 15, bold: true, marginBottom: 6, marginTop: 4, color: '#1b2127' },
        h2: { fontSize: 11.5, bold: true, marginBottom: 4, marginTop: 10, color: '#1b2127' },
        h3: { fontSize: 9.8, bold: true, marginBottom: 3, marginTop: 8 },
        h4: { fontSize: 9, bold: true, marginBottom: 2, marginTop: 6 },
        p: { margin: [0, 2, 0, 4] }, ul: { marginBottom: 4 }, ol: { marginBottom: 4 }, li: { marginBottom: 1 },
        th: { bold: true, fillColor: '#eef0f3' }, td: {}, a: { color: '#1f5f8b' },
        b: { bold: true }, strong: { bold: true }, small: { fontSize: 7 },
      },
    });
    postProcess(content, 0);
    const title = (meta && meta.title) || 'Звіт';
    const doc = {
      info: { title, author: (meta && meta.author) || '', creator: 'Каркас скульптури (ДБН, у браузері)' },
      pageSize: 'A4', pageMargins: [40, 46, 40, 44],
      defaultStyle: { font: 'DejaVu', fontSize: 8.3, lineHeight: 1.18, color: '#1b2127' },
      styles: {
        ok: { color: '#2f7d4f', bold: true }, warn: { color: '#a46a12', bold: true }, bad: { color: '#b3261e', bold: true }, 'bad-t': { color: '#b3261e' },
        eyebrow: { fontSize: 7.5, color: '#5a6570' }, note: { fontSize: 7.4, color: '#5a6570' }, 'rep-status': { bold: true, margin: [0, 4, 0, 8] },
        error: { color: '#b3261e' }, pill: { fontSize: 7 },
      },
      header: (cur) => cur === 1 ? null : { text: title, fontSize: 7, color: '#8b96a1', margin: [40, 20, 40, 0] },
      footer: (cur, tot) => ({ columns: [{ text: (meta && meta.project) || '', fontSize: 7, color: '#8b96a1' }, { text: `${cur} / ${tot}`, alignment: 'right', fontSize: 7, color: '#8b96a1' }], margin: [40, 14, 40, 0] }),
      content,
    };
    const pdf = pdfMake.createPdf(doc);
    return new Promise((resolve, reject) => { try { pdf.getBlob(resolve); } catch (e) { reject(e); } });
  };

  /** Зберегти файл: у вікні Claude — через «downloads» (підтвердження користувача), інакше — завантаження браузера. */
  PDF.save = async function (blob, filename) {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const dl = await window.claude.use('downloads');
        if (dl) { await dl.save({ filename, data: blob }); return 'saved'; }
      }
    } catch (e) {
      if (e && e.code === 'declined') return 'declined';
      if (e && e.code && !['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) throw e;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return 'browser';
  };

  SC.pdf = PDF;
})(window.SC = window.SC || {});
