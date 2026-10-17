/* Побудова розрахункової моделі каркаса скульптури з параметрів проєкту.
 * Каркас-ядро: одна стійка або просторове ядро з 3/4 стійок, рівні з поясами, зв'язки.
 * Частини скульптури: «розподілена» (тулуб, плащ — передає навантаження на ядро по висоті)
 * або «консольна» (голова, руки, книга — на виносній трубі від найближчого вузла ядра).
 */
(function (SC) {
  'use strict';

  const M = {};
  const V = () => SC.fem.vec;

  M.defaultProject = function () {
    return {
      version: 1,
      meta: { name: 'Скульптура — каркас', customer: '', location: 'м. Київ', author: '', date: new Date().toISOString().slice(0, 10), stage: 'Попередній розрахунок' },
      site: {
        city: 'Київ', windMode: 'city', windDistrict: 'I', W0: 370, terrain: 'III', Hsea: 0.18, w0Station: false,
        Crel: 1.0, Cdir: 1.0, Cd: 1.0, CdConfirmed: false,
        snowMode: 'city', snowDistrict: 'IV', S0: 1550, snowRegion: 'plain', Ce: 1.0,
        Tlife: 100, cc: 'CC2', gammaN: 1.0, hPed: 0.6,
        seismic: { on: true, place: 'Київ', A: null, B: null, C: 6, soil: 'II', damage: 'steel', cultural: false, a1core: true, gammaI: 'auto', vertical: true, nModes: 12 },
        ice: { on: true, mode: 'city', b: 19, WB: 160 },
        temp: { on: true, mode: 'dbn', exposure: 'sun', rho: 0.7, surface: 'horizontal', dTplus: 58, dTminus: -39, gf: 1.1 },
        env: { corrosivity: 'C3', protection: 'Ґрунтування + фарбування (ДСТУ ISO 12944, C3-H)', approach: 'none', corrAllow: 0.5, inspection: 'раз на рік', drainage: true },
        aero: { mode: 'forces', source: 'Попередня оцінка (C_F за аналогами)', confirmed: false },
      },
      shell: { mode: 'non-structural', ribStep: 0, ribStepMax: 600, ribSpan: 800, cLocal: 2.0, wLim: 100 },
      loadsUser: [
        { name: 'Обслуговування: драбина/монтажник біля голови', kind: 'service', x: 0.1, y: 0, z: 6.0, Fx: 0, Fy: 0, Fz: -1.0 },
      ],
      supports: { confirmed: false, note: 'Опирання лише через каркас-ядро на фундамент; плащ не спирається на ґрунт (зазор 30 мм)', existingFoundation: false, allowDisp: 10 },
      frame: {
        type: 'core4', a: 0.6, b: 0.6, aTop: 0.4, bTop: 0.4,
        levels: [0, 1.5, 3.0, 4.5, 6.0], bracing: 'X',
        secPost: '□100×5', secRing: '□60×4', secBrace: '□50×3',
        steel: 'С245', support: 'fixed', exposed: false, CfFrame: 2.0, gammaC: 1.0,
        anchorPostsToPlate: 'each',
        extraNodes: [], extraElems: [],
      },
      parts: [
        { name: 'Тулуб і плащ', kind: 'dist', x: 0, y: 0, z: 3.0, z1: 0.3, z2: 6.0, shellArea: 38, tShell: 2, rhoShell: 7850, extraMass: 0, Ax: 9.5, Ay: 6.0, Cf: 1.2, Ah: 1.2, mu: 1.0, sec: '' },
        { name: 'Голова', kind: 'cant', x: 0.1, y: 0, z: 6.6, shellArea: 3.2, tShell: 2, rhoShell: 7850, extraMass: 15, Ax: 0.75, Ay: 0.65, Cf: 1.2, Ah: 0.35, mu: 1.0, sec: '□80×4' },
        { name: 'Права рука', kind: 'cant', x: 0.2, y: -1.3, z: 4.9, shellArea: 2.6, tShell: 2, rhoShell: 7850, extraMass: 5, Ax: 0.9, Ay: 0.25, Cf: 1.2, Ah: 0.4, mu: 1.0, sec: '□80×5' },
        { name: 'Ліва рука з книгою', kind: 'cant', x: 0.45, y: 0.9, z: 4.4, shellArea: 2.9, tShell: 2, rhoShell: 7850, extraMass: 25, Ax: 0.8, Ay: 0.45, Cf: 1.2, Ah: 0.5, mu: 1.0, sec: '□80×5' },
      ],
      base: {
        plateB: 300, plateL: 300, tp: 20, nAnchor: 4, edge: 50, d: 20, grade: '5.6', hef: 350, dh: 45,
        lb: 200, concrete: 'C25/30', cracked: true, shear: 'anchors', cf: 0.2, alphaBearing: 'auto', weldLeg: 6,
        type: 'bolts', boltType: 'plate', nRibs: 0, hr: 120, tr: 10, ribWeldLeg: 6, tw: 10, flex: 'iter',
        lugB: 100, lugH: 80, lugT: 12, splitReinf: true,
        anchorReinf: { on: false, ds: 12, nPerAnchor: 2, hooked: true, dist: 100, cover: 50 },
      },
      found: {
        B: 2.8, L: 2.8, h: 0.6, depth: 1.2, pedH: 0.6, pedB: 1.4, pedL: 1.4, soilMode: 'R', R: 200,
        phi: 24, cII: 5, gammaSoil: 18, gammaC1: 1.2, gammaC2: 1.0, kfactor: 1.1, frictionMu: 0.3,
        concrete: 'C25/30', rebar: 'A500C', cover: 50, rhoC: 2500, rhoSoil: 1800, minContact: 0.75, overturnSF: 1.5,
        layers: [
          { name: 'Насипний ґрунт', h: 0.8, gamma: 17, E: 5, nu: 0.35, phi: 15, c: 5 },
          { name: 'Суглинок тугопластичний', h: 3.5, gamma: 19.5, E: 16, nu: 0.35, phi: 22, c: 22 },
          { name: 'Пісок середньої крупності', h: 8, gamma: 18.5, E: 30, nu: 0.3, phi: 35, c: 1 },
        ],
        gwl: 4.5, sLim: 0.2, tiltLim: 0.004, limRow: 'rigid', surcharge: 10, soilType: 'clay', gammaGphi: 1.1, gammaGc: 1.5, existing: false,
      },
      design: { bMin: 40, bMax: 200, lockPost: false, electrode: 'Е42 / Э42 (ручне)', weldLegFrame: 'auto', weldLegBrace: 'auto', meshUnit: '0.001', meshUp: 'z', target: 0.9, tMin: 3, dirStep: 15, second: true, method: 'A', defLimit: 150, norm: 'both', gammaM0: 1.0, gammaM1: 1.0, curve: 'c', waste: 7, sheetWaste: 15 },
      prices: { tube: 62, sheet: 58, plate: 55, anchor: 180, concrete: 3900, rebar: 38, fabrication: 0, transport: 0, install: 0 },
      overrides: {},
      mesh: [],
      images: [],
      vision: { parts: [], depthRatio: 0.6, yCenter: 0, checklist: {} },
      status: { value: 'Чернетка', log: [] },
      journal: [],
      role: 'Інженер-конструктор',
    };
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  /** Генерує вузли та елементи каркаса. */
  M.build = function (pr) {
    const S = SC.sections;
    const fr = pr.frame;
    const steel = SC.norms.steels.find(s => s.id === fr.steel) || SC.norms.steels[1];
    const nodes = [], elems = [], groups = {};
    const levels = [...new Set(fr.levels.map(Number))].filter(z => z >= 0).sort((a, b) => a - b);
    if (levels[0] !== 0) levels.unshift(0);
    const H = levels[levels.length - 1];
    // корозійний припуск: розрахунок на залишковий переріз (ТЗ 2.6.3) — товщина стінки зменшується на Δ
    const env = (pr.site && pr.site.env) || {};
    const dCorr = env.approach === 'residual' ? (env.corrAllow || 0) : 0;
    const sec = name => {
      const s0 = S.byName(name) || S.shs(100, 5);
      if (!dCorr) return s0;
      const r = S.shs(s0.bmm, Math.max(0.5, s0.tmm - dCorr), { ro: s0.ro * 1000 });
      r.name = s0.name; r.mass = s0.mass; r.nominal = s0; r.tmmNom = s0.tmm; r.corr = dCorr;
      return r;
    };
    const posts = fr.type === 'single' ? 1 : fr.type === 'core3' ? 3 : 4;
    const plan = (t) => {
      const a = lerp(fr.a, fr.aTop != null ? fr.aTop : fr.a, t), b = lerp(fr.b, fr.bTop != null ? fr.bTop : fr.b, t);
      if (posts === 1) return [[0, 0]];
      if (posts === 3) { const r = a / Math.sqrt(3); return [0, 1, 2].map(k => [r * Math.cos(Math.PI / 2 + k * 2 * Math.PI / 3), r * Math.sin(Math.PI / 2 + k * 2 * Math.PI / 3)]); }
      return [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]];
    };
    const levelNodes = [];
    levels.forEach((z, li) => {
      const ids = [];
      plan(H > 0 ? z / H : 0).forEach((p, k) => {
        const id = `L${li}P${k + 1}`;
        const sup = li === 0 ? (fr.support === 'pinned' ? [1, 1, 1, 0, 0, 0] : [1, 1, 1, 1, 1, 1]) : null;
        nodes.push({ id, x: p[0], y: p[1], z, sup, level: li, post: k });
        ids.push(id);
      });
      levelNodes.push({ z, ids });
    });
    const add = (i, j, s, type, group, extra) => {
      const e = Object.assign({ id: `E${elems.length + 1}`, i, j, sec: s, type, group, steel }, extra || {});
      elems.push(e); (groups[group] = groups[group] || []).push(e); return e;
    };
    const sp = sec(fr.secPost), sr = sec(fr.secRing), sb = sec(fr.secBrace);
    for (let li = 0; li < levels.length - 1; li++) {
      const A = levelNodes[li].ids, B = levelNodes[li + 1].ids;
      for (let k = 0; k < posts; k++) add(A[k], B[k], sp, 'beam', 'Стійки ядра', { secName: fr.secPost });
      if (posts > 1 && fr.bracing !== 'none') {
        for (let k = 0; k < posts; k++) {
          const k2 = (k + 1) % posts;
          if (fr.bracing === 'X') { add(A[k], B[k2], sb, 'truss', 'Зв\'язки', { secName: fr.secBrace }); add(A[k2], B[k], sb, 'truss', 'Зв\'язки', { secName: fr.secBrace }); }
          else { (li + k) % 2 === 0 ? add(A[k], B[k2], sb, 'truss', 'Зв\'язки', { secName: fr.secBrace }) : add(A[k2], B[k], sb, 'truss', 'Зв\'язки', { secName: fr.secBrace }); }
        }
      }
    }
    if (posts > 1) for (let li = 1; li < levels.length; li++) {
      const A = levelNodes[li].ids;
      for (let k = 0; k < posts; k++) add(A[k], A[(k + 1) % posts], sr, 'beam', 'Пояси (кільця)', { secName: fr.secRing });
    }
    // Додаткові вузли й стрижні (редактор каркаса, ТЗ 7.1: G = (V, E))
    for (const xn of fr.extraNodes || []) {
      if (!xn.id || nodes.some(n => n.id === xn.id)) continue;
      nodes.push({ id: xn.id, x: +xn.x, y: +xn.y, z: +xn.z, sup: xn.sup === 'fixed' ? [1, 1, 1, 1, 1, 1] : xn.sup === 'pinned' ? [1, 1, 1, 0, 0, 0] : null, extra: true });
    }
    for (const xe of fr.extraElems || []) {
      if (!nodes.some(n => n.id === xe.i) || !nodes.some(n => n.id === xe.j) || xe.i === xe.j) continue;
      add(xe.i, xe.j, sec(xe.sec || '□60×4'), xe.type === 'truss' ? 'truss' : 'beam', xe.group || 'Додаткові елементи', { secName: xe.sec || '□60×4' });
    }
    // Частини скульптури
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const partAttach = [];
    (pr.parts || []).forEach((p, pi) => {
      const mass = (p.shellArea || 0) * (p.tShell || 0) / 1000 * (p.rhoShell || 7850) + (p.extraMass || 0);
      if (p.kind === 'cant') {
        // найближчий рівень ядра (за висотою), потім найближчий вузол цього рівня
        let best = null, bd = Infinity;
        for (const L of levelNodes) {
          if (L.z === 0 && levelNodes.length > 1) continue;
          for (const id of L.ids) {
            const n = nodeById.get(id);
            const d = Math.hypot(n.x - p.x, n.y - p.y, (n.z - p.z) * 1.0);
            if (d < bd) { bd = d; best = n; }
          }
        }
        let tip = best;
        if (bd > 0.05) {
          tip = { id: `P${pi + 1}`, x: p.x, y: p.y, z: p.z, sup: null, part: pi };
          nodes.push(tip); nodeById.set(tip.id, tip);
          add(best.id, tip.id, sec(p.sec || '□80×5'), 'beam', `Консоль: ${p.name}`, { secName: p.sec || '□80×5', cantilever: true, part: pi });
        }
        partAttach.push({ part: pi, mass, targets: [{ share: 1, z: p.z, nodes: [tip.id], c: [p.x, p.y, p.z] }] });
      } else {
        // розподілена по рівнях у діапазоні [z1, z2] за вантажними висотами
        const z1 = Math.max(0, Math.min(p.z1, p.z2)), z2 = Math.max(p.z1, p.z2);
        const lv = levelNodes.filter(L => L.z > 0);
        const zs = lv.map(L => L.z);
        const targets = [];
        let tot = 0;
        lv.forEach((L, k) => {
          const lo = k === 0 ? 0 : (zs[k - 1] + zs[k]) / 2;
          const hi = k === lv.length - 1 ? Infinity : (zs[k] + zs[k + 1]) / 2;
          const a = Math.max(lo, z1), b = Math.min(hi, z2);
          if (b > a) { targets.push({ share: b - a, z: (a + b) / 2, nodes: L.ids, c: [p.x, p.y, L.z] }); tot += b - a; }
        });
        if (!targets.length) { const L = lv.reduce((m, L) => Math.abs(L.z - p.z) < Math.abs(m.z - p.z) ? L : m, lv[0]); targets.push({ share: 1, z: p.z, nodes: L.ids, c: [p.x, p.y, L.z] }); tot = 1; }
        targets.forEach(t => { t.share /= tot; });
        partAttach.push({ part: pi, mass, targets });
      }
    });
    const sections = M.markSections({ nodes, elems, levels, levelNodes, posts, pr });
    return { nodes, elems, groups, levels, levelNodes, H, posts, partAttach, steel, sections };
  };

  /** Палітра секцій: розрізнювані кольори, читаються на світлому й темному фоні. */
  M.sectColors = ['#2b6cb0', '#c05621', '#2f855a', '#9b2c9b', '#b7791f', '#0f8a8a', '#c53030', '#5a67d8', '#718096', '#d53f8c', '#38a169', '#805ad5'];
  const ROLE = { post: ['С', 'стійка'], brace: ['Р', 'розкіс / зв\'язок'], ring: ['П', 'пояс'], cant: ['К', 'консоль'], extra: ['Д', 'додатковий'] };
  M.roleName = r => (ROLE[r] || ['?', r])[1];

  /**
   * Ділить каркас на розрахункові секції й маркує вузли та стрижні.
   *  Я1, Я2… — яруси ядра між сусідніми рівнями (стійки, зв'язки ярусу й верхній пояс);
   *  К1, К2… — консолі частин скульптури; Д — додаткові елементи редактора.
   *  Марка стрижня: <секція>-<роль><№>, напр. Я2-Р3 (третій розкіс другого ярусу).
   *  Кожен ярус ядра має грані (розгортки) між сусідніми стійками — для 2D-креслень.
   */
  M.markSections = function ({ nodes, elems, levels, levelNodes, posts, pr }) {
    const byId = new Map(nodes.map(n => [n.id, n]));
    nodes.forEach((n, i) => { n.num = i + 1; });
    const sections = [];
    const sect = (code, kind, name, extra) => { const s = Object.assign({ code, kind, name, elems: [], color: M.sectColors[sections.length % M.sectColors.length] }, extra || {}); sections.push(s); return s; };
    for (let li = 0; li < levels.length - 1; li++) {
      const A = levelNodes[li].ids, B = levelNodes[li + 1].ids;
      const faces = [];
      if (posts > 1) for (let k = 0; k < posts; k++) { const k2 = (k + 1) % posts; faces.push({ name: `грань ${k + 1}–${k2 + 1}`, nodes: [A[k], A[k2], B[k2], B[k]] }); }
      const s = sect(`Я${li + 1}`, 'tier', `Ядро, ярус ${li + 1} (z = ${levels[li].toFixed(2)}…${levels[li + 1].toFixed(2)} м)`, { li, z0: levels[li], z1: levels[li + 1], faces, nodeIds: A.concat(B) });
    }
    const tiers = sections.slice();
    const tierFor = e => {
      const a = byId.get(e.i), b = byId.get(e.j);
      if (a.level == null || b.level == null) return null;
      const lo = Math.min(a.level, b.level), hi = Math.max(a.level, b.level);
      if (hi === lo) return tiers[Math.max(0, hi - 1)] || null; // пояс належить ярусу під ним
      return tiers[lo] || null;
    };
    let nCant = 0, extraS = null;
    const cantS = new Map();
    elems.forEach(e => {
      let s, role;
      if (e.cantilever) {
        if (!cantS.has(e.part)) { nCant++; const p = (pr.parts || [])[e.part] || {}; cantS.set(e.part, sect(`К${nCant}`, 'cant', `Консоль «${p.name || 'частина ' + (e.part + 1)}»`, { part: e.part })); }
        s = cantS.get(e.part); role = 'cant';
      } else if (e.group === 'Стійки ядра' || e.group === "Зв'язки" || e.group === 'Пояси (кільця)') {
        s = tierFor(e); role = e.group === 'Стійки ядра' ? 'post' : e.group === 'Пояси (кільця)' ? 'ring' : 'brace';
      }
      if (!s) { if (!extraS) extraS = sect('Д', 'extra', 'Додаткові елементи'); s = extraS; role = role || 'extra'; }
      const cnt = (s.cnt = s.cnt || {}); cnt[role] = (cnt[role] || 0) + 1;
      e.sect = s.code; e.role = role; e.color = s.color; e.mark = `${s.code}-${ROLE[role][0]}${cnt[role]}`;
      s.elems.push(e.id);
    });
    return sections.filter(s => s.elems.length);
  };

  /**
   * Розподіл сили F, прикладеної в точці c, на вузли (як RBE3): мінімум Σ|f|² за умов ΣF і ΣM збережені.
   * Для 1–2 вузлів додаються вузлові моменти.
   */
  M.distribute = function (nodesPos, c, Fv) {
    const n = nodesPos.length;
    if (n === 1) {
      const r = V().sub(c, nodesPos[0]);
      const m = V().cross(r, Fv);
      return [[Fv[0], Fv[1], Fv[2], m[0], m[1], m[2]]];
    }
    const cen = [0, 1, 2].map(a => nodesPos.reduce((s, p) => s + p[a], 0) / n);
    // невідомі: f_k (3n). Обмеження: Σf = F (3), Σ (p_k − cen) × f_k = (c − cen) × F (3)
    const rows = 6, cols = 3 * n;
    const A = []; for (let i = 0; i < rows; i++) A.push(new Float64Array(cols));
    nodesPos.forEach((p, k) => {
      const r = V().sub(p, cen);
      for (let a = 0; a < 3; a++) A[a][3 * k + a] = 1;
      // M = r × f: Mx = ry fz − rz fy; My = rz fx − rx fz; Mz = rx fy − ry fx
      A[3][3 * k + 2] += r[1]; A[3][3 * k + 1] -= r[2];
      A[4][3 * k + 0] += r[2]; A[4][3 * k + 2] -= r[0];
      A[5][3 * k + 1] += r[0]; A[5][3 * k + 0] -= r[1];
    });
    const Mt = V().cross(V().sub(c, cen), Fv);
    const b = [Fv[0], Fv[1], Fv[2], Mt[0], Mt[1], Mt[2]];
    // f = Aᵀ (A Aᵀ)⁻¹ b з регуляризацією для вироджених напрямків (колінеарні вузли)
    const AAt = []; for (let i = 0; i < rows; i++) { AAt.push(new Float64Array(rows)); for (let j = 0; j < rows; j++) { let s = 0; for (let k = 0; k < cols; k++) s += A[i][k] * A[j][k]; AAt[i][j] = s; } }
    let tr = 0; for (let i = 0; i < rows; i++) tr += AAt[i][i];
    for (let i = 0; i < rows; i++) AAt[i][i] += 1e-12 * tr;
    const y = solveSmall(AAt, b);
    const f = new Float64Array(cols);
    for (let k = 0; k < cols; k++) { let s = 0; for (let i = 0; i < rows; i++) s += A[i][k] * y[i]; f[k] = s; }
    const out = nodesPos.map((p, k) => [f[3 * k], f[3 * k + 1], f[3 * k + 2], 0, 0, 0]);
    // залишковий момент (якщо вузли колінеарні) — прикладається вузловими моментами порівну
    const res = [0, 0, 0];
    nodesPos.forEach((p, k) => { const m = V().cross(V().sub(p, cen), out[k].slice(0, 3)); for (let a = 0; a < 3; a++) res[a] += m[a]; });
    for (let a = 0; a < 3; a++) { const d = (Mt[a] - res[a]) / n; if (Math.abs(Mt[a] - res[a]) > 1e-9 * (Math.abs(Mt[a]) + 1)) out.forEach(o => { o[3 + a] += d; }); }
    // перенесення моменту з центроїда: ΣF прикладена в cen дає момент відносно cen = 0, а Mt враховано
    return out;
  };
  function solveSmall(A0, b0) {
    const n = b0.length; const A = A0.map(r => Array.from(r)); const b = b0.slice();
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      const d = A[c][c] || 1e-300;
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / d; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / (A[r][r] || 1e-300); }
    return x;
  }

  SC.model = M;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
