/* Міст SketchUp ↔ застосунок розрахунку. Підключається лише у вікні розширення (сайт не змінюється).
 * Застосунок відкриває SC.app.state (проєкт, результати) і SC.ctx (render, changed, runCalc, toast…);
 * міст лише записує в проєкт геометрію з моделі й віддає результати розрахунку назад у SketchUp. */
(function () {
  'use strict';
  const has = typeof window.sketchup !== 'undefined';
  const st = () => SC.app.state, cx = () => SC.ctx;
  const toast = m => cx() && cx().toast(m);

  function decode(b64) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return Float64Array.from(new Float32Array(u8.buffer));
  }
  const kindOf = n => /шлейф|манті|трен/i.test(n) ? 'train' : /тулуб|плащ|корпус|постать|фігура|тіло/i.test(n) ? 'dist' : 'cant';

  const SFC = {
    has, info: null,
    hello(info) { SFC.info = info; SFC.ready = true; panel(); },

    /** Збережений у файлі .skp проєкт. */
    loadProject(obj) {
      try { st().pr = cx().migrate(obj); st().stale = true; st().R = null; cx().render(); toast('Проєкт розрахунку завантажено з моделі SketchUp.'); }
      catch (e) { toast('Не вдалося прочитати проєкт із моделі: ' + e.message); }
    },
    saveProject() {
      if (!has || !SFC.ready) return;
      const pr = Object.assign({}, st().pr, { images: [] }); // зображення — лише ескіз, у .skp не зберігаються
      const s = JSON.stringify(pr);
      if (s === SFC._last) return;
      SFC._last = s; sketchup.sfc_save(s);
    },

    /** Групи моделі → частини скульптури (геометрія лише з 3D: площа, центр, проєкції під кожним кутом вітру, сніг). */
    receiveParts(list) {
      const pr = st().pr, all = [];
      const done = [];
      list.forEach(it => {
        const T = decode(it.tris);
        if (!T.length) return;
        const m = SC.mesh.analyze(T, { noRecenter: true, scale: 1, step: pr.design.dirStep || 15, res: 300 });
        let p = pr.parts.find(q => q.name === it.name);
        if (!p) {
          const k = kindOf(it.name);
          p = { name: it.name, kind: k, shape: 'volume', tShell: 2, rhoShell: 7850, extraMass: 0, Cf: 1.2, mu: 1, sec: '□80×5' };
          if (k === 'train') Object.assign(p, JSON.parse(JSON.stringify(SC.model.trainDefaults)), { path: [] });
          pr.parts.push(p);
        }
        Object.assign(p, { shellArea: +m.area.toFixed(3), Ax: +m.Ax.toFixed(3), Ay: +m.Ay.toFixed(3), Ah: +m.Ah.toFixed(3), areaTable: m.areaTable.map(a => +a.toFixed(4)), source: '3d', status: 'confirmed', sku: true });
        if (p.kind !== 'train') Object.assign(p, { x: +m.centroid[0].toFixed(3), y: +m.centroid[1].toFixed(3), z: +m.centroid[2].toFixed(3) });
        if (p.kind === 'dist') { p.z1 = +Math.max(0.05, m.bbox.mn[2]).toFixed(2); p.z2 = +m.bbox.mx[2].toFixed(2); }
        if (p.kind === 'train' && !(p.path && p.path.length >= 2)) p.status = 'needs3d';
        for (let i = 0; i < T.length; i++) all.push(T[i]);
        done.push(`${it.name} (${it.n} тр., ${m.area.toFixed(2)} м²)`);
      });
      st().ui.lastMesh = Float64Array.from(all); st().ui.meshName = 'SketchUp: ' + list.map(x => x.name).join(', '); st().ui.slicesFull = null;
      cx().changed('частини з SketchUp', '', done.join('; '));
      toast('Частини з моделі: ' + done.join('; ') + (pr.parts.some(p => p.kind === 'train' && p.status === 'needs3d') ? '. Для шлейфу накресліть гребінь (тег «Гребінь …») і натисніть «Гребінь».' : ''));
      cx().go('parts');
    },

    /** Лінії на тегах «Каркас…» → вузли й стрижні (додаються до каркаса-ядра; збіг із вузлом ядра ≤ 10 мм — спільний вузол). */
    receiveFrame(segs) {
      const pr = st().pr, fr = pr.frame;
      fr.extraNodes = (fr.extraNodes || []).filter(n => !/^SU\d+$/.test(n.id));
      fr.extraElems = (fr.extraElems || []).filter(e => !e.su);
      const core = SC.model.build(JSON.parse(JSON.stringify(pr))).nodes;
      const nodes = [];
      const idOf = p => {
        const c = core.find(n => Math.hypot(n.x - p[0], n.y - p[1], n.z - p[2]) <= 0.01);
        if (c) return c.id;
        let n = nodes.find(q => Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2]) <= 0.005);
        if (!n) { n = { id: 'SU' + (nodes.length + 1), x: +p[0].toFixed(4), y: +p[1].toFixed(4), z: +p[2].toFixed(4), sup: p[2] <= 0.005 ? fr.support : '' }; nodes.push(n); }
        return n.id;
      };
      let added = 0;
      segs.forEach(s => {
        const i = idOf(s.p), j = idOf(s.q);
        if (i === j || fr.extraElems.some(e => (e.i === i && e.j === j) || (e.i === j && e.j === i))) return;
        const sec = s.sec && SC.sections.byName(s.sec) ? s.sec : (fr.secRing || '□60×4');
        fr.extraElems.push({ i, j, sec, type: 'beam', group: `Каркас із SketchUp ${sec}`, su: true }); added++;
      });
      fr.extraNodes = fr.extraNodes.concat(nodes);
      const nSup = nodes.filter(n => n.sup).length;
      cx().changed('каркас із SketchUp', '', `${added} стрижнів, ${nodes.length} вузлів`);
      toast(`Каркас із моделі: ${added} стрижнів, ${nodes.length} нових вузлів${nSup ? `, ${nSup} опор (z = 0)` : ''}. Перегляньте «Вузли та стрижні» і виконайте розрахунок.`);
      cx().render();
    },

    /** Полілінії на тегах «Гребінь <частина>» → гребінь шлейфу. */
    receiveRidge(list) {
      const pr = st().pr, msg = [];
      list.forEach(r => {
        if (!r.pts || r.pts.length < 2) return;
        let p = pr.parts.find(q => q.kind === 'train' && (!r.name || q.name === r.name)) || pr.parts.find(q => q.kind === 'train');
        if (!p) { p = Object.assign({ name: r.name || 'Шлейф', kind: 'train', shape: 'volume', shellArea: 0, tShell: 2, rhoShell: 7850, extraMass: 0, Ax: 0, Ay: 0, Ah: 0, Cf: 1.2, mu: 1, sec: '', status: 'needs3d' }, JSON.parse(JSON.stringify(SC.model.trainDefaults))); pr.parts.push(p); }
        p.path = r.pts; if (p.status === 'needs3d' && p.shellArea > 0) p.status = 'confirmed';
        const sm = SC.model.trainSummary(p);
        msg.push(`«${p.name}»: ${r.pts.length} точок${sm ? `, ${sm.L.toFixed(2)} м` : ''}`);
      });
      cx().changed('гребінь шлейфу з SketchUp', '', msg.join('; '));
      toast('Гребінь із моделі: ' + msg.join('; ')); cx().go('parts');
    },

    /** Результат розрахунку → SketchUp: труби, плити, анкери, фундаменти. */
    sendBuild() {
      const s = st(), R = s.R;
      if (!R || !R.ok) { toast('Спочатку виконайте розрахунок.'); return; }
      if (s.stale) toast('Увага: вихідні дані змінено після розрахунку — будується каркас за останнім розрахунком.');
      const pr = R.pr, bp = pr.base, uOf = new Map(R.memberRes.map(m => [m.e.id, m.best.u]));
      const sups = R.P.model.nodes.filter(n => n.sup || n.baseSpring);
      const la = (bp.hef + bp.tp + 30 + 2 * bp.d + 40) / 1000;
      const lay = SC.base.anchorLayout(bp).map(([x, y]) => [x / 1000, y / 1000]);
      const fd = R.found.fd, sh = R.found.mode === 'shared';
      const data = {
        colorMode: (document.getElementById('sfcColor') || {}).value || 'u', marks: !!(document.getElementById('sfcMarks') || {}).checked,
        nodes: R.P.model.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, z: n.z })),
        elems: R.mdl.elems.map(e => ({ i: e.i, j: e.j, b: e.sec.b, t: e.sec.t, sec: e.sec.name, mark: e.mark || e.id, sect: e.sect || '', color: e.color || '#808080', u: +(uOf.get(e.id) || 0).toFixed(3) })),
        plates: sups.map(n => ({ x: n.x, y: n.y, z: n.z - bp.tp / 1000, B: bp.plateB / 1000, L: bp.plateL / 1000, t: bp.tp / 1000, d: bp.d / 1000, la, anchors: lay })),
        founds: [{ id: 'Ф1', x: sh ? fd.cx || 0 : 0, y: sh ? fd.cy || 0 : 0, B: fd.B, L: fd.L, h: fd.h, pedB: fd.pedB, pedL: fd.pedL, pedH: fd.pedH }]
          .concat((R.found.pads || []).map(p => ({ id: p.id, x: p.cx, y: p.cy, B: p.fd.B, L: p.fd.L, h: p.fd.h, pedB: p.fd.pedB, pedL: p.fd.pedL, pedH: p.fd.pedH }))),
      };
      SFC.lastBuild = data;
      if (has) sketchup.sfc_build(JSON.stringify(data)); else toast('Поза SketchUp: дані для побудови підготовлено (SFC.lastBuild).');
    },
    built(n) { toast(`У модель додано каркас: ${n} стрижнів, опорні плити, анкери, фундаменти (група «Каркас (розрахунок)», теги «Каркас: …»).`); },
  };
  window.SFC = SFC;

  // Завантаження файлів (PDF, JSON, DXF) у вікні SketchUp — через діалог збереження SketchUp.
  // Blob запам'ятовується при створенні посилання (fetch blob: з file:// у вбудованому браузері ненадійний).
  if (has) {
    const blobs = new Map(), mk = URL.createObjectURL.bind(URL);
    URL.createObjectURL = o => { const u = mk(o); if (o instanceof Blob) blobs.set(u, o); return u; };
    const send = (name, buf) => {
      const u8 = new Uint8Array(buf); let bin = '';
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      sketchup.sfc_save_file(name, btoa(bin), 'b64');
    };
    const grab = a => {
      if (!a.download) return false;
      const bl = blobs.get(a.href);
      if (bl) { bl.arrayBuffer().then(buf => send(a.download, buf)); return true; }
      const m = /^data:[^,]*?(;base64)?,(.*)$/.exec(a.href);
      if (m) { const raw = m[1] ? atob(m[2]) : decodeURIComponent(m[2]); send(a.download, Uint8Array.from(raw, c => c.charCodeAt(0)).buffer); return true; }
      return false;
    };
    const click0 = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (grab(this)) return; return click0.call(this); };
    document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[download]'); if (a && grab(a)) e.preventDefault(); }, true);
  }

  /** Плаваюча панель SketchUp у вікні розрахунку. */
  function panel() {
    if (document.getElementById('sfcPanel')) return;
    const d = document.createElement('div');
    d.id = 'sfcPanel';
    d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'SketchUp');
    d.innerHTML = `<style>
      #sfcPanel{position:fixed;right:16px;bottom:16px;z-index:50;background:var(--surface);color:var(--fg);border:1px solid var(--line-strong);border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.18);font:13px var(--font-body,sans-serif);max-width:330px}
      #sfcPanel h4{margin:0 0 6px;font-size:13px;display:flex;justify-content:space-between;gap:8px}
      #sfcPanel .b{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
      #sfcPanel button{font:inherit;padding:5px 9px;border-radius:6px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--fg);cursor:pointer}
      #sfcPanel button.p{background:var(--accent);color:var(--accent-ink,#fff);border-color:var(--accent)}
      #sfcPanel small{color:var(--muted)} #sfcPanel.min .body{display:none}
    </style>
    <h4><span>SketchUp ${SFC.info ? '· ' + (SFC.info.name || 'модель') : ''}</span><button id="sfcMin" aria-label="Згорнути">–</button></h4>
    <div class="body">
      <div class="b"><button data-sfc="parts" class="p">Вибране → частини</button><button data-sfc="frame">Лінії «Каркас»</button><button data-sfc="ridge">Гребінь</button></div>
      <div class="b"><button data-sfc="calc">Розрахувати</button><button data-sfc="build" class="p">Каркас → у модель</button><button data-sfc="clear">Прибрати</button></div>
      <div class="b"><label>Колір <select id="sfcColor"><option value="u">за запасом (U)</option><option value="sect">за секціями</option></select></label><label><input type="checkbox" id="sfcMarks"> марки</label></div>
      <small>Осі моделі: початок — центр низу ядра на верху постаменту, Z — вгору. Проєкт зберігається у файлі .skp.</small>
    </div>`;
    document.body.appendChild(d);
    d.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'sfcMin') { d.classList.toggle('min'); return; }
      const a = b.dataset.sfc;
      if (a === 'parts') sketchup.sfc_get_parts();
      else if (a === 'frame') sketchup.sfc_get_frame();
      else if (a === 'ridge') sketchup.sfc_get_ridge();
      else if (a === 'calc') cx().runCalc();
      else if (a === 'build') SFC.sendBuild();
      else if (a === 'clear') sketchup.sfc_clear();
    });
  }

  if (has) {
    const start = () => { sketchup.sfc_ready(); setInterval(SFC.saveProject, 4000); };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
  }
})();
