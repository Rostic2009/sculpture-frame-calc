/* Повний розрахунок проєкту: модель → модальний аналіз → кліматика → сполучення → МСЕ (1-й/2-й порядок)
 * → перевірки елементів → опорні вузли → фундамент → специфікація → попередження.
 */
(function (SC) {
  'use strict';

  const A = {};
  const g = 9.81;

  A.run = function (pr, progress) {
    const t0 = Date.now();
    const warn = [];
    const W = (level, msg, ref) => warn.push({ level, msg, ref });
    const N = SC.norms, gG = N.gammaG.steel;
    const mdl = SC.model.build(pr);
    const P = SC.fem.prepare({ nodes: mdl.nodes, elems: mdl.elems });
    const steel = mdl.steel;

    // ---------- 1. маси та власні коливання (для вибору табл. Ch і Cd) ----------
    const climPre = SC.loads.climate(pr, null);
    const cases0 = SC.loads.baseCases(pr, mdl, P, climPre);
    const massG = new Float64Array(P.nn);
    for (const n of cases0.G.nodal) massG[P.idx.get(n.node)] += -n.f[2] / g;
    for (const d of cases0.G.dist) { const el = P.els[d.elem]; const m = -d.w[2] * el.L / g / 2; massG[el.ni] += m; massG[el.nj] += m; }
    const modalG = SC.fem.modal(P, massG, Math.min(6, pr.site.seismic.nModes || 6));
    if (!modalG.ok) return { ok: false, error: 'Розрахункова схема геометрично змінювана (механізм). Перевірте опори та зв\'язки.' };
    const T1 = modalG.modes[0].T;
    const clim = SC.loads.climate(pr, T1);
    if (T1 > 0.25 && !pr.site.CdConfirmed) W('warn', `Період T1 = ${T1.toFixed(3)} с > 0,25 с: застосовано табл. 9.02, Cd = ${pr.site.Cd} прийнято користувачем — підтвердіть Cd за Зміною № 1 ДБН В.1.2-2.`, 'wind');
    const cases = SC.loads.baseCases(pr, mdl, P, clim);
    // контроль Ch у межах таблиці
    const zMax = mdl.H + (pr.site.hPed || 0) + 1;
    if (!clim.qAt(zMax).ok) W('error', `Висота ${zMax.toFixed(1)} м поза внесеними значеннями табл. ${clim.ChTable}. Введіть Ch вручну у «Нормативна база».`, 'wind');

    // ---------- 2. сполучення ----------
    const gN = pr.site.gammaN || 1;
    const combos = [];
    const add = (id, name, terms, opt) => combos.push(Object.assign({ id, name, terms, kind: 'uls' }, opt || {}));
    add('C1', `${fmt(gG)}·G + ${fmt(clim.gfmS)}·S`, [{ c: cases.G, k: gG * gN }, { c: cases.S, k: clim.gfmS * gN }], { dir: [1, 0, 0] });
    for (const Wc of cases.W) {
      const th = Wc.theta, d = [Math.cos(th * Math.PI / 180), Math.sin(th * Math.PI / 180), 0];
      add(`W${th}`, `${fmt(gG)}·G + ${fmt(clim.gfmW)}·W(${th}°)`, [{ c: cases.G, k: gG * gN }, { c: Wc, k: clim.gfmW * gN }], { dir: d, theta: th });
      add(`SW${th}`, `${fmt(gG)}·G + ${N.psi.short}·(${fmt(clim.gfmS)}·S + ${fmt(clim.gfmW)}·W(${th}°))`, [{ c: cases.G, k: gG * gN }, { c: cases.S, k: N.psi.short * clim.gfmS * gN }, { c: Wc, k: N.psi.short * clim.gfmW * gN }], { dir: d, theta: th });
      add(`U${th}`, `${N.gammaG.favourable}·G + ${fmt(clim.gfmW)}·W(${th}°) (відрив, перекидання)`, [{ c: cases.G, k: N.gammaG.favourable * gN }, { c: Wc, k: clim.gfmW * gN }], { dir: d, theta: th, favourable: true });
    }
    // SLS (характеристичні)
    const sls = [];
    sls.push({ id: 'K1', name: 'G + S (характ.)', terms: [{ c: cases.G, k: 1 }, { c: cases.S, k: 1 }] });
    for (const Wc of cases.W) {
      sls.push({ id: `KW${Wc.theta}`, name: `G + W(${Wc.theta}°) (характ.)`, terms: [{ c: cases.G, k: 1 }, { c: Wc, k: 1 }], theta: Wc.theta });
      sls.push({ id: `KSW${Wc.theta}`, name: `G + 0,9(S + W(${Wc.theta}°)) (характ.)`, terms: [{ c: cases.G, k: 1 }, { c: cases.S, k: 0.9 }, { c: Wc, k: 0.9 }], theta: Wc.theta });
    }

    // ---------- 3. розв'язання ----------
    const second = !!pr.design.second;
    const stations = [0, 0.25, 0.5, 0.75, 1];
    const solved = [];
    let eqMax = 0, notConv = 0;
    for (let ci = 0; ci < combos.length; ci++) {
      const cb = combos[ci];
      if (progress && ci % 10 === 0) progress(ci / combos.length);
      let load = SC.loads.combine(cb.terms);
      const imp = SC.loads.imperfection(load, mdl, P, cb.dir);
      cb.phi = imp.phi;
      load = { nodal: load.nodal.concat(imp.nodal), dist: load.dist };
      const r = SC.fem.solve(P, load, { second });
      if (!r.ok) {
        W('error', `Сполучення ${cb.id}: ${r.error === 'instability' ? 'втрата стійкості системи (розрахунок 2-го порядку не збігся)' : 'механізм'} — вузол ${r.dof && r.dof.node}.`, 'fem');
        continue;
      }
      if (!r.converged) notConv++;
      eqMax = Math.max(eqMax, r.eq.rel);
      solved.push({ cb, r, forces: stationForces(P, r, stations) });
    }
    if (notConv) W('warn', `${notConv} сполучень: ітерації 2-го порядку не досягли точності 1e-4.`, 'fem');
    if (eqMax > 1e-6) W('warn', `Нев'язка рівноваги ${eqMax.toExponential(2)} перевищує 1e-6.`, 'fem');

    // ---------- 4. сейсміка (спектральний метод) ----------
    let seis = null;
    if (pr.site.seismic.on && clim.seis.a0 > 0) {
      const masses = SC.loads.seismicMasses(cases, P, clim);
      const modal = SC.fem.modal(P, masses, pr.site.seismic.nModes || 8);
      const kc = N.seismicComb;
      const staticLoad = SC.loads.combine([{ c: cases.G, k: kc.G * gG }, { c: cases.S, k: kc.snow * clim.gfmS }]);
      const rs = SC.fem.solve(P, staticLoad, { second: false });
      const dirs = [{ d: 0, name: 'X' }, { d: 1, name: 'Y' }];
      const res = [];
      const sumMeff = [0, 1, 2].map(d => modal.modes.reduce((s, m) => s + m.meff[d], 0));
      for (const D of dirs) {
        const modeLoads = SC.loads.seismicModalLoads(P, masses, modal, clim, D.d);
        const vert = pr.site.seismic.vertical ? SC.loads.seismicModalLoads(P, masses, modal, clim, 2, 0.7) : [];
        const resp = modeLoads.concat(vert).map(ml => { const r = SC.fem.solve(P, ml.load); return { ml, r, forces: stationForces(P, r, stations) }; });
        // SRSS за формами і напрямками (ДБН В.1.1-12: (6.?) S = √ΣS²)
        const env = srss(resp.map(x => x.forces));
        const renv = srssReactions(resp.map(x => x.r.reactions));
        const uenv = srssArr(resp.map(x => x.r.u));
        const shear = resp.filter(x => modeLoads.includes(x.ml)).map(x => ({ mode: x.ml.mode, T: x.ml.T, beta: x.ml.beta, Sa: x.ml.Sa, meff: x.ml.meff, base: x.r.reactions.reduce((s, rr) => s + rr.r[D.d], 0) }));
        res.push({ dir: D.name, d: D.d, env, renv, uenv, modes: shear });
      }
      seis = { modal, masses, staticR: rs, staticForces: stationForces(P, rs, stations), res, sumMeff, totalMass: masses.reduce((a, b) => a + b, 0) };
      if (sumMeff[0] < 0.9 || sumMeff[1] < 0.9) W('warn', `Сума ефективних мас врахованих форм: X ${(sumMeff[0] * 100).toFixed(0)} %, Y ${(sumMeff[1] * 100).toFixed(0)} % (< 90 %). Збільшіть кількість форм.`, 'seis');
      W('info', 'Сейсмічний модуль реалізує структуру спектрального методу ДБН В.1.1-12:2014. З 01.07.2026 діє нова редакція ДБН — звірте коефіцієнти k1, k2, kгр, kψ і β(T).', 'seis');
    }

    // ---------- 5. перевірки елементів ----------
    const memberRes = mdl.elems.map((e, k) => {
      const el = P.els[k];
      const Lsys = systemLength(e, el, mdl, pr);
      let best = { u: -1 };
      const consider = (f, cbName, st, extra) => {
        const chk = SC.checks.member(e.sec, e.steel, f, Lsys.Lcr, { gammaC: pr.frame.gammaC, gammaM0: pr.design.gammaM0, gammaM1: pr.design.gammaM1, curve: pr.design.curve, Cm: 0.9 });
        const u = pr.design.norm === 'en' ? chk.en.max : pr.design.norm === 'dbn' ? chk.dbn.max : Math.max(chk.en.max, chk.dbn.max);
        if (u > best.u) best = { u, chk, combo: cbName, station: st, f, extra };
      };
      for (const s of solved) s.forces[k].forEach((f, si) => consider(f, s.cb.id + ': ' + s.cb.name, stations[si]));
      if (seis) for (const R of seis.res) seis.staticForces[k].forEach((fs, si) => {
        const fe = R.env[k][si];
        for (const sN of [1, -1]) for (const sY of [1, -1]) for (const sZ of [1, -1]) {
          consider({ N: fs.N + sN * fe.N, Vy: Math.abs(fs.Vy) + fe.Vy, Vz: Math.abs(fs.Vz) + fe.Vz, T: Math.abs(fs.T) + fe.T, My: fs.My + sY * fe.My, Mz: fs.Mz + sZ * fe.Mz }, `E${R.dir}: ${kcStr()} ± E${R.dir}`, stations[si]);
        }
      });
      // гнучкість
      const lam = Lsys.Lcr / e.sec.i;
      const kind = e.type === 'truss' ? 'brace' : (e.group === 'Стійки ядра' ? 'main' : 'second');
      const lim = SC.checks.lambdaLimit(kind, best.u);
      if (best.chk && best.chk.Nc === 0 && kind === 'brace') { /* розтягнутий зв'язок */ }
      return { e, k, L: el.L, Lsys, lam, lamLim: lim, best, mass: e.sec.mass * el.L };
    });
    function kcStr() { return `${N.seismicComb.G}·G + ${N.seismicComb.snow}·S`; }
    memberRes.forEach(m => { if (m.lam > m.lamLim) W('warn', `${m.e.id} (${m.e.group}): гнучкість λ = ${m.lam.toFixed(0)} > ${m.lamLim.toFixed(0)}.`, 'members'); });
    const failing = memberRes.filter(m => m.best.u > 1);
    if (failing.length) W('error', `${failing.length} елементів не проходять перевірку (U > 1). Збільшіть переріз або змініть схему.`, 'members');
    memberRes.forEach(m => { if (m.best.chk && m.best.chk.en.cls === 4) W('warn', `${m.e.id}: переріз ${m.e.sec.name} класу 4 (c/t = ${m.best.chk.en.ct.toFixed(1)}) — враховано ефективну площу.`, 'members'); });

    // ---------- 6. стійкість системи αcr ----------
    let alphaCr = null, alphaCombo = null;
    {
      const sc = solved.filter(s => !s.cb.favourable).reduce((m, s) => { const nc = s.forces.reduce((a, f) => a + Math.max(0, -f[0].N), 0); return nc > m.nc ? { nc, s } : m; }, { nc: -1, s: null }).s;
      if (sc) {
        const Nax = sc.forces.map(f => f[0].N);
        alphaCr = SC.fem.alphaCr(P, Nax); alphaCombo = sc.cb.id;
        if (alphaCr < 3) W('error', `Критичний коефіцієнт αcr = ${alphaCr.toFixed(2)} < 3: система надто податлива (EN 1993-1-1, 5.2.1).`, 'fem');
        else if (alphaCr < 10 && !second) W('warn', `αcr = ${alphaCr.toFixed(2)} < 10: потрібен розрахунок 2-го порядку (увімкніть у налаштуваннях).`, 'fem');
      }
    }

    // ---------- 7. переміщення (SLS) ----------
    let uMax = 0, uNode = null, uCombo = null;
    for (const cb of sls) {
      const r = SC.fem.solve(P, SC.loads.combine(cb.terms), { second });
      if (!r.ok) continue;
      cb.r = r;
      P.model.nodes.forEach((nd, k) => { const u = Math.hypot(r.u[k * 6], r.u[k * 6 + 1]); if (u > uMax) { uMax = u; uNode = nd; uCombo = cb.name; } });
    }
    const Htot = Math.max(...P.model.nodes.map(n => n.z));
    const uLim = Htot / (pr.design.defLimit || 150);
    if (uMax > uLim) W('warn', `Горизонтальне переміщення ${(uMax * 1000).toFixed(1)} мм > H/${pr.design.defLimit} = ${(uLim * 1000).toFixed(1)} мм.`, 'sls');

    // ---------- 8. опорні вузли ----------
    const supNodes = P.model.nodes.filter(n => n.sup);
    const postSec = SC.sections.byName(pr.frame.secPost) || SC.sections.shs(100, 5);
    const plateSteel = N.steels.find(s => s.id === pr.frame.steel) || N.steels[1];
    const supportRes = supNodes.map(nd => {
      let best = { u: -1 };
      const consider = (r, name) => {
        const b = SC.base.baseNode(pr.base, r, postSec, plateSteel, { pedB: pr.found.pedB, pedL: pr.found.pedL, pedH: pr.found.pedH, px: nd.x, py: nd.y });
        const u = b.fail ? 99 : b.max;
        if (u > best.u) best = { u, b, r, combo: name };
      };
      for (const s of solved) { const rr = s.r.reactions.find(x => x.node === nd.id); if (rr) consider(rr.r, s.cb.id + ': ' + s.cb.name); }
      if (seis) for (const R of seis.res) {
        const r0 = seis.staticR.reactions.find(x => x.node === nd.id).r, re = R.renv.get(nd.id);
        for (const s1 of [1, -1]) for (const s2 of [1, -1]) for (const s3 of [1, -1]) {
          const r = [r0[0] + s1 * re[0], r0[1] + s1 * re[1], r0[2] + s2 * re[2], r0[3] + s3 * re[3], r0[4] + s3 * re[4], r0[5] + s1 * re[5]];
          consider(r, `E${R.dir}`);
        }
      }
      return { node: nd, best };
    });
    supportRes.forEach(s => { if (s.best.u > 1) W('error', `Опора ${s.node.id}: опорний вузол не проходить (U = ${s.best.u.toFixed(2)}, ${s.best.combo}).`, 'base'); });
    if (pr.found.pedB * 1000 < pr.base.plateB + 2 * 100 && supNodes.length === 1) W('warn', 'Підколонник вужчий за пластину + 2×100 мм: перевірте відстані анкерів до краю.', 'base');

    // ---------- 9. фундамент ----------
    const fd = Object.assign({}, pr.found);
    const supPos = id => { const n = P.model.nodes[P.idx.get(id)]; return { x: n.x, y: n.y }; };
    const Rsoil = fd.soilMode === 'calc' ? SC.found.soilR(fd).R : fd.R;
    const fSls = [], fUls = [];
    for (const cb of sls) { if (!cb.r) continue; const res = SC.found.resultant(fd, cb.r.reactions.map(x => Object.assign(supPos(x.node), { r: x.r })), 1.0); fSls.push({ cb, res, chk: SC.found.check(fd, res, Rsoil, 'sls') }); }
    for (const s of solved) { const kG = s.cb.favourable ? 0.9 : 1.1; const res = SC.found.resultant(fd, s.r.reactions.map(x => Object.assign(supPos(x.node), { r: x.r })), kG); const chk = SC.found.check(fd, res, Rsoil, 'uls'); chk.res = res; fUls.push({ cb: s.cb, res, chk }); }
    if (seis) for (const R of seis.res) {
      for (const s1 of [1, -1]) {
        const rr = seis.staticR.reactions.map(x => { const re = R.renv.get(x.node); return Object.assign(supPos(x.node), { r: x.r.map((v, i) => v + s1 * re[i] * (i === 2 ? 1 : 1)) }); });
        const res = SC.found.resultant(fd, rr, 0.9);
        const chk = SC.found.check(fd, res, Rsoil, 'uls'); chk.res = res;
        fUls.push({ cb: { id: `E${R.dir}${s1 > 0 ? '+' : '−'}`, name: `особливе сполучення, сейсміка ${R.dir}` }, res, chk });
      }
    }
    const govSls = fSls.reduce((m, x) => x.chk.max > m.chk.max ? x : m, fSls[0]);
    const govUls = fUls.reduce((m, x) => x.chk.max > m.chk.max ? x : m, fUls[0]);
    const reinf = SC.found.reinforce(fd, fUls.filter(x => !x.cb.favourable).map(x => ({ p: x.chk.p, res: x.res })));
    if (govSls && govSls.chk.max > 1) W('error', `Фундамент: перевірка тиску під підошвою не виконується (U = ${govSls.chk.max.toFixed(2)}, ${govSls.cb.name}).`, 'found');
    if (govUls && govUls.chk.max > 1) W('error', `Фундамент: перекидання/зсув не забезпечено (U = ${govUls.chk.max.toFixed(2)}, ${govUls.cb.name}).`, 'found');
    if (reinf.punching > 1) W('error', `Продавлювання плити: vEd/vRd,c = ${reinf.punching.toFixed(2)} > 1. Збільшіть товщину плити.`, 'found');

    // ---------- 10. специфікація ----------
    const spec = A.specification(pr, mdl, P, memberRes, supNodes, reinf, fd);

    // ---------- 11. додаткові попередження ----------
    const anyCfDefault = (pr.parts || []).some(p => !p.CfConfirmed);
    if (anyCfDefault) W('warn', 'Аеродинамічні коефіцієнти C_F частин не підтверджені продуванням/CFD або погодженою методикою — результат є ПОПЕРЕДНІМ (ТЗ, п. 5, 3.2.6).', 'wind');
    // вихрове збудження (EN 1991-1-4, дод. E): v_crit = b/(T1·St)
    const top = (pr.parts || []).reduce((m, p) => (p.z > (m ? m.z : -1) ? p : m), null);
    if (top) {
      const b = Math.sqrt(Math.max(top.Ax, top.Ay) || 0.5);
      const vcrit = b / (T1 * 0.12);
      const vm = Math.sqrt(2 * clim.W0 * clim.qAt(top.z + (pr.site.hPed || 0)).Ch / 1.25);
      if (vcrit < 1.25 * vm) W('warn', `Вихрове збудження: v_crit = ${vcrit.toFixed(1)} м/с < 1,25·v_m = ${(1.25 * vm).toFixed(1)} м/с. Потрібна перевірка поперечних коливань і втоми (EN 1991-1-4, дод. E).`, 'dyn');
    }
    if ((pr.parts || []).length === 0) W('error', 'Не задано жодної частини скульптури.', 'geom');

    const govMember = memberRes.reduce((m, x) => (x.best.u > (m ? m.best.u : -1) ? x : m), null);
    const status = warn.some(w => w.level === 'error') ? 'not-ok' : anyCfDefault ? 'preliminary' : 'ok';
    return {
      ok: true, time: Date.now() - t0, pr, mdl, P, clim, cases, combos, sls, solved, stations, seis, modalG, T1,
      memberRes, govMember, alphaCr, alphaCombo, uMax, uNode, uCombo, uLim, Htot, supportRes,
      found: { fd, Rsoil, fSls, fUls, govSls, govUls, reinf, soil: fd.soilMode === 'calc' ? SC.found.soilR(fd) : null },
      spec, warn, status, eqMax,
    };
  };

  function fmt(v) { return (Math.round(v * 1000) / 1000).toString().replace('.', ','); }

  /** Системна (розрахункова) довжина. Метод A: 2-й порядок + недосконалості → μ = 1 на довжині між закріпленнями.
   *  Метод B: 1-й порядок → μ = 2 для консолей. */
  function systemLength(e, el, mdl, pr) {
    const B = pr.design.method === 'B';
    if (mdl.posts === 1 && e.group === 'Стійки ядра') return { Lcr: (B ? 2 : 1) * mdl.H, mu: B ? 2 : 1, Lsys: mdl.H, note: 'консольна стійка, довжина — вся висота' };
    if (e.cantilever) return { Lcr: (B ? 2 : 1) * el.L, mu: B ? 2 : 1, Lsys: el.L, note: 'консоль' };
    if (e.group === 'Стійки ядра' && pr.frame.bracing === 'none') return { Lcr: (B ? 2 : 1) * el.L, mu: B ? 2 : 1, Lsys: el.L, note: 'ядро без зв\'язків (рамне)' };
    return { Lcr: el.L, mu: 1, Lsys: el.L, note: 'між вузлами' };
  }

  function stationForces(P, r, stations) {
    return P.els.map((el, k) => stations.map(s => SC.fem.sectionForces(r.ef[k], r.wl.get(k), s * el.L)));
  }
  function srss(list) {
    const out = list[0].map(st => st.map(() => ({ N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 })));
    for (const fr of list) fr.forEach((st, k) => st.forEach((f, i) => { for (const key in f) out[k][i][key] += f[key] * f[key]; }));
    out.forEach(st => st.forEach(f => { for (const key in f) f[key] = Math.sqrt(f[key]); }));
    return out;
  }
  function srssReactions(list) {
    const m = new Map();
    for (const rs of list) for (const r of rs) { const a = m.get(r.node) || [0, 0, 0, 0, 0, 0]; r.r.forEach((v, i) => { a[i] += v * v; }); m.set(r.node, a); }
    for (const [k, a] of m) m.set(k, a.map(Math.sqrt));
    return m;
  }
  function srssArr(list) { const o = new Float64Array(list[0].length); for (const u of list) for (let i = 0; i < o.length; i++) o[i] += u[i] * u[i]; return o.map(Math.sqrt); }

  /** Відомість матеріалів: чиста кількість, відходи, закупівля, вартість. */
  A.specification = function (pr, mdl, P, memberRes, supNodes, reinf, fd) {
    const rows = [];
    const byGroup = new Map();
    memberRes.forEach(m => {
      const key = m.e.sec.name + ' ' + m.e.steel.id;
      const r = byGroup.get(key) || { item: `Труба квадратна ${m.e.sec.name}`, steel: m.e.steel.id, std: 'ДСТУ EN 10219-2 / ГОСТ 30245', L: 0, mass: 0, mpm: m.e.sec.mass, paint: 0, weld: 0, groups: new Set() };
      r.L += m.L; r.mass += m.mass; r.paint += m.e.sec.perim * m.L; r.groups.add(m.e.group);
      r.weld += 2 * 4 * m.e.sec.b; // кутовий шов по периметру на обох кінцях
      byGroup.set(key, r);
    });
    const waste = (pr.design.waste || 7) / 100;
    let tubeMass = 0, paint = 0, weld = 0;
    for (const r of byGroup.values()) {
      tubeMass += r.mass; paint += r.paint; weld += r.weld;
      rows.push({ cat: 'Каркас', item: r.item, mark: r.steel, std: r.std, unit: 'м', net: r.L, buy: r.L * (1 + waste), massNet: r.mass, massBuy: r.mass * (1 + waste), note: [...r.groups].join(', ') + `; ${r.mpm.toFixed(2)} кг/м` });
    }
    // оболонка
    const sheets = new Map();
    (pr.parts || []).forEach(p => { const k = p.tShell; const s = sheets.get(k) || { A: 0, m: 0, rho: p.rhoShell }; s.A += p.shellArea; s.m += p.shellArea * p.tShell / 1000 * p.rhoShell; sheets.set(k, s); });
    const sw = (pr.design.sheetWaste || 15) / 100;
    let sheetMass = 0;
    for (const [t, s] of sheets) { sheetMass += s.m; rows.push({ cat: 'Оболонка', item: `Лист t = ${t} мм`, mark: s.rho > 8000 ? 'мідь/бронза' : s.rho < 3000 ? 'алюміній' : 'сталь', std: '', unit: 'м²', net: s.A, buy: s.A * (1 + sw), massNet: s.m, massBuy: s.m * (1 + sw), note: 'відходи розкрою/фасетування ' + (sw * 100).toFixed(0) + ' %' }); }
    // опорні пластини
    const bp = pr.base, nS = supNodes.length;
    const plateM = bp.plateB / 1000 * bp.plateL / 1000 * bp.tp / 1000 * 7850;
    rows.push({ cat: 'Опорні вузли', item: `Пластина ${bp.plateB}×${bp.plateL}×${bp.tp}`, mark: pr.frame.steel, std: 'ДСТУ 8540 / EN 10025', unit: 'шт', net: nS, buy: nS, massNet: plateM * nS, massBuy: plateM * nS * 1.05, note: 'з отворами Ø' + (bp.d + 6) });
    const nA = bp.nAnchor * nS;
    const la = (bp.hef + bp.tp + 30 + 2 * bp.d + 40) / 1000;
    const am = Math.PI * (bp.d / 1000) ** 2 / 4 * la * 7850;
    rows.push({ cat: 'Опорні вузли', item: `Анкер М${bp.d} з анкерною плитою/головкою Ø${bp.dh}, L = ${(la * 1000).toFixed(0)} мм`, mark: `клас ${bp.grade}`, std: 'ДСТУ ISO 898-1 / ГОСТ 24379.1', unit: 'шт', net: nA, buy: nA, massNet: am * nA, massBuy: am * nA, note: `+ ${nA * 2} гайок, ${nA} шайб` });
    // фундамент
    const w = SC.found.weights(fd);
    const Vc = w.Vslab + w.Vped;
    rows.push({ cat: 'Фундамент', item: `Бетон ${fd.concrete}`, mark: fd.concrete, std: 'ДСТУ Б В.2.7-176', unit: 'м³', net: Vc, buy: Vc * 1.03, massNet: Vc * fd.rhoC, massBuy: Vc * fd.rhoC * 1.03, note: `плита ${fd.B}×${fd.L}×${fd.h} м + підколонник ${fd.pedB}×${fd.pedL}×${fd.pedH} м` });
    const bar = reinf.pick;
    const nbx = Math.floor(fd.L * 1000 / bar.s) + 1, nby = Math.floor(fd.B * 1000 / bar.s) + 1;
    const Lbars = nbx * (fd.B - 0.1) + nby * (fd.L - 0.1);
    const topL = (Math.floor(fd.L / 0.2) + 1) * (fd.B - 0.1) + (Math.floor(fd.B / 0.2) + 1) * (fd.L - 0.1);
    const pedBars = Math.ceil(2 * (fd.pedB + fd.pedL) / 0.2) * (fd.pedH + fd.h + 0.4);
    const kgm = d => Math.PI * (d / 1000) ** 2 / 4 * 7850;
    rows.push({ cat: 'Фундамент', item: `Арматура Ø${bar.dia} крок ${bar.s} (нижня сітка, 2 напрямки)`, mark: fd.rebar, std: 'ДСТУ 3760', unit: 'м', net: Lbars, buy: Lbars * 1.05, massNet: Lbars * kgm(bar.dia), massBuy: Lbars * kgm(bar.dia) * 1.05, note: `As,req = ${(reinf.Areq * 1e6).toFixed(0)} мм²/м` });
    rows.push({ cat: 'Фундамент', item: 'Арматура Ø12 крок 200 (верхня сітка, конструктивно)', mark: fd.rebar, std: 'ДСТУ 3760', unit: 'м', net: topL, buy: topL * 1.05, massNet: topL * kgm(12), massBuy: topL * kgm(12) * 1.05, note: 'мінімальне армування' });
    rows.push({ cat: 'Фундамент', item: 'Арматура Ø16 крок 200 (вертикальна підколонника)', mark: fd.rebar, std: 'ДСТУ 3760', unit: 'м', net: pedBars, buy: pedBars * 1.05, massNet: pedBars * kgm(16), massBuy: pedBars * kgm(16) * 1.05, note: 'орієнтовно, конструктивно' });
    const leg = bp.weldLeg || 6;
    const weldDep = weld * (leg / 1000) ** 2 / 2 * 7850 * 1.1;
    rows.push({ cat: 'Зварювання', item: `Кутові шви катетом ${leg} мм (орієнтовно)`, mark: 'Е42А / G3Si1', std: 'ДСТУ EN ISO 2560', unit: 'м', net: weld, buy: weld, massNet: weldDep, massBuy: weldDep * 1.7, note: 'маса наплавленого металу; закупівля електродів ×1,7' });
    rows.push({ cat: 'Захист', item: 'Антикорозійне покриття каркаса (площа)', mark: 'С3/С4 за ДСТУ ISO 12944', std: 'ДСТУ ISO 12944', unit: 'м²', net: paint, buy: paint * 1.1, massNet: 0, massBuy: 0, note: 'зовнішня поверхня труб; внутрішні порожнини — герметизувати' });
    // вартість
    const pz = pr.prices || {};
    const costOf = r => r.cat === 'Каркас' ? r.massBuy * pz.tube : r.cat === 'Оболонка' ? r.massBuy * pz.sheet : r.item.startsWith('Пластина') ? r.massBuy * pz.plate : r.item.startsWith('Анкер') ? r.buy * pz.anchor : r.item.startsWith('Бетон') ? r.buy * pz.concrete : r.item.startsWith('Арматура') ? r.massBuy * pz.rebar : 0;
    rows.forEach(r => { r.cost = costOf(r) || 0; });
    const total = rows.reduce((s, r) => s + r.cost, 0) + (pz.fabrication || 0) + (pz.transport || 0) + (pz.install || 0);
    return { rows, tubeMass, sheetMass, total, plateMass: plateM * nS, anchorMass: am * nA, Vc };
  };

  /** Автоматичний підбір перерізів груп (найлегший типорозмір, для якого U ≤ ціль). Повертає історію ітерацій. */
  A.optimize = function (pr0, progress, maxIt) {
    const pr = JSON.parse(JSON.stringify(pr0));
    const tMin = pr.design.tMin || 3, target = pr.design.target || 0.9;
    const steel = SC.norms.steels.find(s => s.id === pr.frame.steel) || SC.norms.steels[1];
    const cat = SC.sections.list().filter(s => s.tmm >= tMin && SC.checks.sectionClass(s, steel.Ryn).cls <= 3).sort((a, b) => a.mass - b.mass);
    const keys = [{ key: 'secPost', group: 'Стійки ядра', get: () => pr.frame.secPost, set: v => { pr.frame.secPost = v; } }];
    if (pr.frame.type !== 'single') keys.push({ key: 'secRing', group: 'Пояси (кільця)', get: () => pr.frame.secRing, set: v => { pr.frame.secRing = v; } });
    if (pr.frame.type !== 'single' && pr.frame.bracing !== 'none') keys.push({ key: 'secBrace', group: "Зв'язки", get: () => pr.frame.secBrace, set: v => { pr.frame.secBrace = v; } });
    pr.parts.forEach((p, i) => { if (p.kind === 'cant') keys.push({ key: 'part' + i, group: `Консоль: ${p.name}`, get: () => p.sec, set: v => { p.sec = v; } }); });
    const pos = name => { const i = cat.findIndex(s => s.name === name); return i >= 0 ? i : cat.findIndex(s => s.mass >= (SC.sections.byName(name) || cat[0]).mass); };
    const idx = keys.map(k => Math.max(0, pos(k.get())));
    const best = keys.map(() => null);
    const hist = [];
    const lowFail = keys.map(() => -1);
    for (let it = 0; it < (maxIt || 14); it++) {
      keys.forEach((k, j) => k.set(cat[idx[j]].name));
      const R = A.run(pr);
      if (!R.ok) break;
      const U = keys.map(k => Math.max(0, ...R.memberRes.filter(m => m.e.group === k.group).map(m => m.best.u)));
      hist.push({ it, sections: keys.map(k => k.get()), U, mass: R.spec.tubeMass });
      if (progress) progress(it, hist[hist.length - 1]);
      let changed = false;
      keys.forEach((k, j) => {
        const cur = cat[idx[j]];
        if (U[j] <= target && (best[j] == null || cat[idx[j]].mass < cat[best[j]].mass)) best[j] = idx[j];
        if (U[j] > target) lowFail[j] = Math.max(lowFail[j], idx[j]);
        // оцінка U для іншого перерізу: U' ≈ U·max(Wel/Wel', A/A', (i/i')²·A/A') — далі перевіряється повним розрахунком
        const est = c => U[j] * Math.max(cur.Wel / c.Wel, cur.A / c.A, (cur.i / c.i) ** 2 * cur.A / c.A * 0.6);
        let ni = cat.findIndex((c, ci) => ci > lowFail[j] && est(c) <= target * 0.97);
        if (ni < 0) ni = cat.length - 1;
        if (U[j] > target && ni <= idx[j]) ni = Math.min(cat.length - 1, idx[j] + 1);
        if (ni !== idx[j] && !(best[j] != null && ni >= best[j] && U[j] <= target)) { idx[j] = ni; changed = true; }
      });
      if (!changed) break;
    }
    keys.forEach((k, j) => { if (best[j] != null) k.set(cat[best[j]].name); });
    return { pr, hist, keys: keys.map(k => ({ group: k.group, sec: k.get() })) };
  };

  SC.analysis = A;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
