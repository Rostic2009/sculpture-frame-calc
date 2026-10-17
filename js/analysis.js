/* Повний розрахунок проєкту: модель → модальний аналіз → кліматика → сполучення → МСЕ (1-й/2-й порядок)
 * → перевірки елементів → опорні вузли → фундамент → специфікація → попередження.
 */
(function (SC) {
  'use strict';

  const A = {};
  const g = 9.81;

  A.run = function (pr0, progress, opts) {
    opts = opts || {};
    const t0 = Date.now();
    const warn = [];
    const W = (level, msg, ref) => warn.push({ level, msg, ref });
    const N = SC.norms, gG = N.gammaG.steel;
    const pr = JSON.parse(JSON.stringify(pr0));
    if (opts.dirStep) pr.design.dirStep = opts.dirStep;
    if (opts.noSeismic) pr.site.seismic.on = false;

    // температура за ДБН В.1.2-2, р. 11 (якщо не задано вручну) — на копії проєкту, щоб звіт показував прийняті значення
    if (pr.site.temp && pr.site.temp.mode !== 'manual') { const tc = N.tempClimate(pr.site.temp); pr.site.temp.dTplus = +tc.dTw.toFixed(1); pr.site.temp.dTminus = +tc.dTc.toFixed(1); pr.site.temp.calc = tc; }
    // ожеледь і W_B — з Додатка Е для міста (якщо обрано режим «за містом»)
    if (pr.site.ice && pr.site.ice.mode !== 'manual') { const ct = N.cityByName(pr.site.city); if (ct) { pr.site.ice.b = ct.b; pr.site.ice.WB = ct.WB; } }
    // ---------- 0. оболонка: крок ребер допоміжного каркаса і їхня маса (додається до маси частин) ----------
    const climPre = SC.loads.climate(pr, null);
    const shellRes = (pr.parts || []).map(p => {
      const zTop = (p.kind === 'cant' ? p.z : Math.max(p.z1 || 0, p.z2 || 0)) + (pr.site.hPed || 0);
      const qLoc = climPre.qAt(zTop).q * (pr.shell.cLocal || 1.5);
      const d = SC.shell.design(p, qLoc, { ribStep: pr.shell.ribStep || 0, ribStepMax: pr.shell.ribStepMax, ribSpan: pr.shell.ribSpan, wLim: pr.shell.wLim });
      return Object.assign(d, { part: p.name, zTop });
    });
    pr.parts.forEach((p, i) => { p.extraMassRibs = shellRes[i].ribMass; p.extraMass = (p.extraMass || 0) + shellRes[i].ribMass; });

    const mdl = SC.model.build(pr);
    let P = SC.fem.prepare({ nodes: mdl.nodes, elems: mdl.elems });

    // ---------- 1. маси та власні коливання ----------
    const cases0 = SC.loads.baseCases(pr, mdl, P, climPre);
    const massG = new Float64Array(P.nn);
    for (const n of cases0.G.nodal) massG[P.idx.get(n.node)] += -n.f[2] / g;
    for (const d of cases0.G.dist) { const el = P.els[d.elem]; const m = -d.w[2] * el.L / g / 2; massG[el.ni] += m; massG[el.nj] += m; }
    const modalG = SC.fem.modal(P, massG, Math.min(6, pr.site.seismic.nModes || 6));
    if (!modalG.ok) return { ok: false, error: 'Розрахункова схема геометрично змінювана (механізм). Перевірте опори, зв\'язки та додаткові елементи.' };
    const T1 = modalG.modes[0].T;
    const clim = SC.loads.climate(pr, T1);
    if (T1 > 0.25 && !pr.site.CdConfirmed) W('warn', `Період T₁ = ${T1.toFixed(3)} с > 0,25 с: застосовано табл. 9.02, C_d = ${pr.site.Cd} прийнято користувачем — підтвердіть C_d за Зміною № 1 ДБН В.1.2-2.`, 'wind');
    const cases = SC.loads.baseCases(pr, mdl, P, clim);
    // вихрове збудження (п. 9.17, дод. К) — потрібна форма коливань, тому після модального аналізу
    const Hsc = Math.max(...mdl.nodes.map(n => n.z), ...(pr.parts || []).map(p => Math.max(p.z2 || 0, p.z || 0))) + (pr.site.hPed || 0);
    const vortex = SC.loads.vortex(pr, mdl, P, clim, modalG, Hsc);
    if (vortex.VX) cases.VX = vortex.VX;
    const zMax = mdl.H + (pr.site.hPed || 0) + 1;
    if (!clim.qAt(zMax).ok) W('error', `Висота ${zMax.toFixed(1)} м поза внесеними значеннями табл. ${clim.ChTable}. Введіть C_h вручну у «Нормативна база».`, 'wind');

    // ---------- 2. сполучення (ДБН В.1.2-2, п. 4.18, формула (4.4) у редакції Зміни № 2) ----------
    // Короткочасні: основне (провідне) — ψ = 1,0; друге — 0,9; решта — 0,7. Перебираються всі варіанти провідного й другого.
    const gN = pr.site.gammaN || 1, PS = N.psi.short;
    const combos = [];
    const add = (id, name, terms, o) => combos.push(Object.assign({ id, name, terms, kind: 'uls', situation: 'постійна' }, o || {}));
    const ice = pr.site.ice || {}, tmp = pr.site.temp || {};
    const ov = pr.overrides || {};
    const gI = ov.gfmI != null ? ov.gfmI : N.interp(N.iceGammaFm.T, N.iceGammaFm.g, pr.site.Tlife);
    const gIW = ov.gfwI != null ? ov.gfwI : N.interp(N.iceWindGamma.T, N.iceWindGamma.g, pr.site.Tlife);
    const gT = tmp.gf || 1.1, gQ = 1.2;
    // набір короткочасних впливів: {key, name, term(c), γ}
    const shortSet = (Wc) => {
      const L = [];
      if (Wc) L.push({ key: 'W', name: `W(${Wc.theta}°)`, c: Wc, g: clim.gfmW });
      if (cases.S && cases.S.info.total > 0) L.push({ key: 'S', name: 'S', c: cases.S, g: clim.gfmS });
      if (cases.Tp) { L.push({ key: 'T+', name: 'T+', c: cases.Tp, g: gT, excl: 'T' }); L.push({ key: 'T−', name: 'T−', c: cases.Tm, g: gT, excl: 'T' }); }
      if (cases.Q) L.push({ key: 'Q', name: 'Q', c: cases.Q, g: gQ });
      return L;
    };
    // сполучення: провідний a (ψ=1), другий b (ψ=0,9), інші (ψ=0,7); T+ і T− взаємовиключні (п. 4.16)
    const comboFrom = (L, a, b, extra) => {
      const used = [a].concat(b ? [b] : []);
      const rest = L.filter(x => !used.includes(x) && !used.some(u => u.excl && u.excl === x.excl));
      const restSel = []; const seenEx = new Set(used.filter(u => u.excl).map(u => u.excl));
      for (const x of rest) { if (x.excl) { if (seenEx.has(x.excl)) continue; seenEx.add(x.excl); } restSel.push(x); }
      const terms = [{ c: cases.G, k: gG * gN }, { c: a.c, k: PS[0] * a.g * gN }];
      if (b) terms.push({ c: b.c, k: PS[1] * b.g * gN });
      restSel.forEach(x => terms.push({ c: x.c, k: PS[2] * x.g * gN }));
      const nm = `${fmt(gG)}·G + ${fmt(a.g)}·${a.name}` + (b ? ` + 0,9·${fmt(b.g)}·${b.name}` : '') + restSel.map(x => ` + 0,7·${fmt(x.g)}·${x.name}`).join('');
      return Object.assign({ name: nm, terms, lead: a.key === 'T+' || a.key === 'T−' ? a.key : a.key, acc: (b ? [b.key] : []).concat(restSel.map(x => x.key)) }, extra || {});
    };
    {
      const L = shortSet(null);
      L.forEach((a, ia) => {
        const others = L.filter(x => x !== a && !(x.excl && x.excl === a.excl));
        if (!others.length) { const c0 = comboFrom(L, a, null); add(`${a.key}1`.replace('+', 'p').replace('−', 'm'), c0.name, c0.terms, { dir: [1, 0, 0], lead: c0.lead, acc: c0.acc }); return; }
        others.forEach(b => { const c0 = comboFrom(L, a, b); add(`${a.key}${b.key}`.replace(/\+/g, 'p').replace(/−/g, 'm'), c0.name, c0.terms, { dir: [1, 0, 0], lead: c0.lead, acc: c0.acc }); });
      });
      if (cases.I) add('I1', `${fmt(gG)}·G + ${fmt(gI)}·I (ожеледь)`, [{ c: cases.G, k: gG * gN }, { c: cases.I, k: gI * gN }], { dir: [1, 0, 0], lead: 'I', acc: [] });
    }
    for (const Wc of cases.W) {
      const th = Wc.theta, d = [Math.cos(th * Math.PI / 180), Math.sin(th * Math.PI / 180), 0];
      const L = shortSet(Wc), w = L[0];
      add(`W${th}`, `${fmt(gG)}·G + ${fmt(clim.gfmW)}·W(${th}°)`, [{ c: cases.G, k: gG * gN }, { c: Wc, k: clim.gfmW * gN }], { dir: d, theta: th, lead: 'W', acc: [] });
      // вітер провідний, другий — кожен з інших; та кожен інший провідний, вітер другий
      L.filter(x => x !== w).forEach(b => {
        const c1 = comboFrom(L, w, b); add(`W${b.key}${th}`.replace(/\+/g, 'p').replace(/−/g, 'm'), c1.name, c1.terms, { dir: d, theta: th, lead: 'W', acc: c1.acc });
        const c2 = comboFrom(L, b, w); add(`${b.key}W${th}`.replace(/\+/g, 'p').replace(/−/g, 'm'), c2.name, c2.terms, { dir: d, theta: th, lead: c2.lead, acc: c2.acc });
      });
      add(`U${th}`, `${N.gammaG.favourable}·G + ${fmt(clim.gfmW)}·W(${th}°) (відрив, перекидання)`, [{ c: cases.G, k: N.gammaG.favourable * gN }, { c: Wc, k: clim.gfmW * gN }], { dir: d, theta: th, favourable: true, lead: 'W', acc: [] });
      if (cases.I && th % 90 === 0) {
        // п. 10.9: вітер на вкриті ожеледдю елементи — W_B замість W₀ при C_rel = C_dir = C_d = 1; γ_fw — табл. 10.5
        const wi = (ice.WB || 0) / Math.max(clim.W0 * clim.Crel * clim.Cdir * clim.Cd, 1);
        add(`IW${th}`, `${fmt(gG)}·G + ${fmt(gI)}·I + ${fmt(gIW)}·W_B(${th}°) [W_B = ${ice.WB} Па]`, [{ c: cases.G, k: gG * gN }, { c: cases.I, k: gI * gN }, { c: Wc, k: wi * gIW * gN }], { dir: d, theta: th, lead: 'I', acc: ['W_B'] });
      }
    }
    if (cases.VX) {
      const Wal = cases.W.find(w => w.theta === cases.VX.alongTheta) || cases.W[0];
      add('VX', `${fmt(gG)}·G + F_вихр(К.4) + (V_cr/V_max)²·${fmt(clim.gfmW)}·W(${Wal.theta}°) (К.6)`, [{ c: cases.G, k: gG * gN }, { c: cases.VX, k: gN }, { c: Wal, k: cases.VX.info.ratio * clim.gfmW * gN }], { dir: cases.VX.dir, lead: 'VX', acc: ['W'] });
    }
    if (cases.M) add('M1', `1,0·G + 1,2·M (монтажна ситуація; кліматичні −20 %, п. 4.20)`, [{ c: cases.G, k: 1.0 }, { c: cases.M, k: 1.2 }], { dir: [1, 0, 0], situation: 'монтажна', lead: 'M', acc: [] });
    if (cases.A) add('A1', `1,0·G + 1,0·A (аварійна ситуація)`, [{ c: cases.G, k: 1.0 }, { c: cases.A, k: 1.0 }], { dir: [1, 0, 0], situation: 'аварійна', lead: 'A', acc: [] });
    const sls = [];
    sls.push({ id: 'K1', name: 'G + S (характ.)', terms: [{ c: cases.G, k: 1 }, { c: cases.S, k: 1 }] });
    sls.push({ id: 'K0', name: 'G (квазіпостійне)', terms: [{ c: cases.G, k: 1 }], quasi: true });
    for (const Wc of cases.W) {
      sls.push({ id: `KW${Wc.theta}`, name: `G + W(${Wc.theta}°) (характ.)`, terms: [{ c: cases.G, k: 1 }, { c: Wc, k: 1 }], theta: Wc.theta });
      sls.push({ id: `KSW${Wc.theta}`, name: `G + 0,9(S + W(${Wc.theta}°)) (характ.)`, terms: [{ c: cases.G, k: 1 }, { c: cases.S, k: 0.9 }, { c: Wc, k: 0.9 }], theta: Wc.theta });
    }

    // ---------- 3. розв'язання з ітерацією податливості бази (ТЗ, 10; «податливість бази») ----------
    const second = !!pr.design.second;
    const stations = [0, 0.25, 0.5, 0.75, 1];
    const postSec = SC.sections.byName(pr.frame.secPost) || SC.sections.shs(100, 5);
    const plateSteel = N.steels.find(s => s.id === pr.frame.steel) || N.steels[1];
    const baseOpts = nd => ({ pedB: pr.found.pedB, pedL: pr.found.pedL, pedH: pr.found.pedH, slabH: 0, px: nd.x, py: nd.y, electrode: pr.design.electrode });
    const solveAll = (list, sec2) => {
      const out = []; let eq = 0, nc = 0;
      for (let ci = 0; ci < list.length; ci++) {
        const cb = list[ci];
        if (progress && ci % 12 === 0) progress(ci / list.length);
        let load = SC.loads.combine(cb.terms);
        const imp = SC.loads.imperfection(load, mdl, P, cb.dir || [1, 0, 0]);
        cb.phi = imp.phi;
        load = { nodal: load.nodal.concat(imp.nodal), dist: load.dist, therm: load.therm };
        const r = SC.fem.solve(P, load, { second: sec2 });
        if (!r.ok) { W('error', `Сполучення ${cb.id}: ${r.error === 'instability' ? 'втрата стійкості системи (2-й порядок не збігся)' : 'механізм'} — вузол ${r.dof && r.dof.node}.`, 'fem'); continue; }
        if (!r.converged) nc++;
        eq = Math.max(eq, r.eq.rel);
        out.push({ cb, r, forces: stationForces(P, r, stations) });
      }
      return { out, eq, nc };
    };
    const flexLog = [];
    if (pr.base.flex === 'iter' && pr.frame.support === 'fixed') {
      const sub = combos.filter(c => c.theta == null || c.theta % 45 === 0);
      for (let it = 0; it < 4; it++) {
        const sv = solveAll(sub, false).out;
        let change = 0;
        const sup = P.model.nodes.filter(n => n.sup || n.baseSpring);
        const ks = sup.map(nd => {
          let gov = null, gm = -1;
          for (const s of sv) { const rr = s.r.reactions.find(x => x.node === nd.id); if (!rr) continue; const m = Math.hypot(rr.r[3], rr.r[4]); if (m > gm) { gm = m; gov = rr.r; } }
          if (!gov) return null;
          const b = SC.base.baseNode(pr.base, gov, postSec, plateSteel, baseOpts(nd));
          return b.stiff;
        });
        sup.forEach((nd, i) => {
          const k = ks[i]; if (!k) return;
          const old = nd.spring ? [nd.spring[3], nd.spring[4]] : [Infinity, Infinity];
          change = Math.max(change, isFinite(old[0]) ? Math.abs(k.kx - old[0]) / k.kx : 1, isFinite(old[1]) ? Math.abs(k.ky - old[1]) / k.ky : 1);
          nd.baseSpring = true;
          nd.sup = [1, 1, 1, 0, 0, 1];
          nd.spring = [0, 0, 0, Math.max(k.kx, 1e3), Math.max(k.ky, 1e3), 0];
        });
        P = SC.fem.prepare({ nodes: mdl.nodes, elems: mdl.elems });
        flexLog.push({ it: it + 1, change, k: ks.map(k => k && { kx: k.kx, ky: k.ky }) });
        if (change < 0.05) break;
      }
    }
    const main = solveAll(combos, second);
    const solved = main.out, eqMax = main.eq;
    if (main.nc) W('warn', `${main.nc} сполучень: ітерації 2-го порядку не досягли точності 1e-4.`, 'fem');
    if (eqMax > 1e-6) W('warn', `Нев'язка рівноваги ${eqMax.toExponential(2)} перевищує 1e-6.`, 'fem');

    // ---------- 4. сейсміка ----------
    let seis = null;
    if (pr.site.seismic.on && clim.seis.a0 > 0) {
      const masses = SC.loads.seismicMasses(cases, P, clim);
      const modal = SC.fem.modal(P, masses, pr.site.seismic.nModes || 8);
      const kc = N.seismicComb;
      const staticLoad = SC.loads.combine([{ c: cases.G, k: kc.G * gG }, { c: cases.S, k: kc.snow * clim.gfmS }]);
      const rs = SC.fem.solve(P, staticLoad, { second: false });
      const res = [];
      const sumMeff = [0, 1, 2].map(d => modal.modes.reduce((s, m) => s + m.meff[d], 0));
      for (const D of [{ d: 0, name: 'X' }, { d: 1, name: 'Y' }]) {
        const modeLoads = SC.loads.seismicModalLoads(P, masses, modal, clim, D.d);
        const vert = pr.site.seismic.vertical ? SC.loads.seismicModalLoads(P, masses, modal, clim, 2, 0.7) : [];
        const resp = modeLoads.concat(vert).map(ml => { const r = SC.fem.solve(P, ml.load); return { ml, r, forces: stationForces(P, r, stations) }; });
        const env = srss(resp.map(x => x.forces));
        const renv = srssReactions(resp.map(x => x.r.reactions));
        const uenv = srssArr(resp.map(x => x.r.u));
        const shear = resp.filter(x => modeLoads.includes(x.ml)).map(x => ({ mode: x.ml.mode, T: x.ml.T, beta: x.ml.beta, Sa: x.ml.Sa, meff: x.ml.meff, base: x.r.reactions.reduce((s, rr) => s + rr.r[D.d], 0) }));
        res.push({ dir: D.name, d: D.d, env, renv, uenv, modes: shear });
      }
      seis = { modal, masses, staticR: rs, staticForces: stationForces(P, rs, stations), res, sumMeff, totalMass: masses.reduce((a, b) => a + b, 0) };
      if (sumMeff[0] < 0.9 || sumMeff[1] < 0.9) W('warn', `Сума ефективних мас врахованих форм: X ${(sumMeff[0] * 100).toFixed(0)} %, Y ${(sumMeff[1] * 100).toFixed(0)} % (< 90 %). Збільшіть кількість форм.`, 'seis');
      W('info', 'Сейсмічний модуль реалізує структуру спектрального методу ДБН В.1.1-12:2014. З 01.07.2026 діє нова редакція ДБН — звірте k₁, k₂, k_гр, k_ψ і β(T).', 'seis');
    }

    // ---------- 5. перевірки елементів ----------
    const kcStr = () => `${N.seismicComb.G}·G + ${N.seismicComb.snow}·S`;
    const memberRes = mdl.elems.map((e, k) => {
      const el = P.els[k];
      const Lsys = systemLength(e, el, mdl, pr);
      let best = { u: -1 };
      const all = [];
      const consider = (f, cbName, st, cbId) => {
        const chk = SC.checks.member(e.sec, e.steel, f, Lsys.Lcr, { gammaC: pr.frame.gammaC, gammaM0: pr.design.gammaM0, gammaM1: pr.design.gammaM1, curve: pr.design.curve, Cm: 0.9 });
        const u = pr.design.norm === 'en' ? chk.en.max : pr.design.norm === 'dbn' ? chk.dbn.max : Math.max(chk.en.max, chk.dbn.max);
        if (u > best.u) best = { u, chk, combo: cbName, station: st, f, cbId };
        return u;
      };
      for (const s of solved) { let um = 0; s.forces[k].forEach((f, si) => { um = Math.max(um, consider(f, s.cb.id + ': ' + s.cb.name, stations[si], s.cb.id)); }); all.push({ id: s.cb.id, u: um }); }
      if (seis) for (const R of seis.res) seis.staticForces[k].forEach((fs, si) => {
        const fe = R.env[k][si];
        for (const sN of [1, -1]) for (const sY of [1, -1]) for (const sZ of [1, -1]) consider({ N: fs.N + sN * fe.N, Vy: Math.abs(fs.Vy) + fe.Vy, Vz: Math.abs(fs.Vz) + fe.Vz, T: Math.abs(fs.T) + fe.T, My: fs.My + sY * fe.My, Mz: fs.Mz + sZ * fe.Mz }, `E${R.dir}: ${kcStr()} ± E${R.dir}`, stations[si], 'E' + R.dir);
      });
      const lam = Lsys.Lcr / e.sec.i;
      const kind = e.type === 'truss' ? 'brace' : (e.group === 'Стійки ядра' ? 'main' : 'second');
      return { e, k, L: el.L, Lsys, lam, lamLim: SC.checks.lambdaLimit(kind, best.u), best, mass: e.sec.mass * el.L, byCombo: all };
    });
    memberRes.forEach(m => { if (m.lam > m.lamLim) W('warn', `${m.e.id} (${m.e.group}): гнучкість λ = ${m.lam.toFixed(0)} > ${m.lamLim.toFixed(0)}.`, 'members'); });
    // результати по секціях (ярус ядра, консоль): довжина, маса, визначальний стрижень
    const sectionRes = (mdl.sections || []).map(sc => {
      const ms = memberRes.filter(m => m.e.sect === sc.code);
      const gov = ms.reduce((a, m) => (!a || m.best.u > a.best.u ? m : a), null);
      const prof = new Map();
      ms.forEach(m => { const q = prof.get(m.e.sec.name) || { sec: m.e.sec.name, n: 0, L: 0, mass: 0, mpm: m.e.sec.mass }; q.n++; q.L += m.L; q.mass += m.mass; prof.set(m.e.sec.name, q); });
      return Object.assign({}, sc, { members: ms, gov, uMax: gov ? gov.best.u : 0, L: ms.reduce((a, m) => a + m.L, 0), mass: ms.reduce((a, m) => a + m.mass, 0), profiles: [...prof.values()] });
    });
    const failing = memberRes.filter(m => m.best.u > 1);
    if (failing.length) W('error', `${failing.length} елементів не проходять перевірку (U > 1). Збільшіть переріз або змініть схему.`, 'members');
    memberRes.forEach(m => { if (m.best.chk && m.best.chk.en.cls === 4) W('warn', `${m.e.id}: переріз ${m.e.sec.name} класу 4 (c/t = ${m.best.chk.en.ct.toFixed(1)}) — враховано ефективну площу.`, 'members'); });
    if ((pr.site.env || {}).approach === 'residual') W('info', `Перевірки виконано для залишкового перерізу (стінка зменшена на ${pr.site.env.corrAllow} мм — ТЗ 2.6.3).`, 'members');

    // ---------- 6. стійкість системи ----------
    let alphaCr = null, alphaCombo = null;
    {
      const sc = solved.filter(s => !s.cb.favourable).reduce((m, s) => { const nc = s.forces.reduce((a, f) => a + Math.max(0, -f[0].N), 0); return nc > m.nc ? { nc, s } : m; }, { nc: -1, s: null }).s;
      if (sc) {
        alphaCr = SC.fem.alphaCr(P, sc.forces.map(f => f[0].N)); alphaCombo = sc.cb.id;
        if (alphaCr < 3) W('error', `Критичний коефіцієнт α_cr = ${alphaCr.toFixed(2)} < 3: система надто податлива (EN 1993-1-1, 5.2.1).`, 'fem');
        else if (alphaCr < 10 && !second) W('warn', `α_cr = ${alphaCr.toFixed(2)} < 10: потрібен розрахунок 2-го порядку.`, 'fem');
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

    // ---------- 8. шви каркаса ----------
    const tmpR = { pr, mdl, P, solved, seis };
    const welds = SC.welds.frame(tmpR);
    const wBad = welds.filter(w => w.u > 1), wLim = welds.filter(w => !w.lim.ok);
    if (wBad.length) W('error', `${wBad.length} зварних швів каркаса не проходять (U > 1) — збільшіть катет або переріз.`, 'welds');
    if (wLim.length) W('warn', `${wLim.length} швів: катет поза межами k_f,min…1,2·t_min (ДБН В.2.6-198, табл. 38).`, 'welds');

    // ---------- 9. опорні вузли ----------
    const supNodes = P.model.nodes.filter(n => n.sup || n.baseSpring);
    const supportRes = supNodes.map(nd => {
      let best = { u: -1 };
      const consider = (r, name) => {
        const b = SC.base.baseNode(pr.base, r, postSec, plateSteel, baseOpts(nd));
        const u = b.fail ? 99 : b.max;
        if (u > best.u) best = { u, b, r, combo: name };
      };
      for (const s of solved) { const rr = s.r.reactions.find(x => x.node === nd.id); if (rr) consider(rr.r, s.cb.id + ': ' + s.cb.name); }
      if (seis) for (const R of seis.res) {
        const r0 = seis.staticR.reactions.find(x => x.node === nd.id).r, re = R.renv.get(nd.id);
        for (const s1 of [1, -1]) for (const s2 of [1, -1]) for (const s3 of [1, -1]) consider([r0[0] + s1 * re[0], r0[1] + s1 * re[1], r0[2] + s2 * re[2], r0[3] + s3 * re[3], r0[4] + s3 * re[4], r0[5] + s1 * re[5]], `E${R.dir}`);
      }
      // класифікація бази за жорсткістю (EN 1993-1-8, 5.2.2.5)
      const Lc = mdl.posts === 1 ? mdl.H : (mdl.levels[1] || mdl.H);
      const EIL = N.E * postSec.Iy / Lc;
      const st = best.b && best.b.stiff ? Math.min(best.b.stiff.kx, best.b.stiff.ky) : 0;
      best.cls = st >= 30 * EIL ? 'жорстка' : st <= 0.5 * EIL ? 'номінально шарнірна' : 'напівжорстка';
      best.ratio = st / EIL;
      return { node: nd, best };
    });
    supportRes.forEach(s => { if (s.best.u > 1) W('error', `Опора ${s.node.id}: опорний вузол не проходить (U = ${s.best.u.toFixed(2)}, ${s.best.combo}).`, 'base'); });
    supportRes.forEach(s => { if (s.best.b && s.best.b.concrete && !s.best.b.concrete.geomOk) W('warn', `Опора ${s.node.id}: мінімальні відстані між анкерами/до краю або товщина підколонника не відповідають конструктивним вимогам EN 1992-4.`, 'base'); });
    if (pr.base.flex !== 'iter' && supportRes.some(s => s.best.cls !== 'жорстка')) W('warn', 'База не класифікується як жорстка, а каркас розраховано з жорстким закріпленням — увімкніть «Податливість бази: ітераційно».', 'base');

    // ---------- 10. фундамент ----------
    const fd = Object.assign({}, pr.found);
    const supPos = id => { const n = P.model.nodes[P.idx.get(id)]; return { x: n.x, y: n.y }; };
    const soil = fd.soilMode === 'calc' ? SC.concrete.soilRLayer(fd) : null;
    const Rsoil = fd.soilMode === 'calc' ? soil.R : fd.R;
    const fSls = [], fUls = [];
    for (const cb of sls) { if (!cb.r) continue; const res = SC.found.resultant(fd, cb.r.reactions.map(x => Object.assign(supPos(x.node), { r: x.r })), 1.0); fSls.push({ cb, res, chk: SC.found.check(fd, res, Rsoil, 'sls') }); }
    for (const s of solved) { const kG = s.cb.favourable ? 0.9 : 1.1; const res = SC.found.resultant(fd, s.r.reactions.map(x => Object.assign(supPos(x.node), { r: x.r })), kG); const chk = SC.found.check(fd, res, Rsoil, 'uls'); chk.res = res; fUls.push({ cb: s.cb, res, chk }); }
    if (seis) for (const R of seis.res) for (const s1 of [1, -1]) {
      const rr = seis.staticR.reactions.map(x => { const re = R.renv.get(x.node); return Object.assign(supPos(x.node), { r: x.r.map((v, i) => v + s1 * re[i]) }); });
      const res = SC.found.resultant(fd, rr, 0.9);
      const chk = SC.found.check(fd, res, Rsoil, 'uls'); chk.res = res;
      fUls.push({ cb: { id: `E${R.dir}${s1 > 0 ? '+' : '−'}`, name: `особливе сполучення, сейсміка ${R.dir}` }, res, chk });
    }
    const govSls = fSls.reduce((m, x) => x.chk.max > m.chk.max ? x : m, fSls[0]);
    const govUls = fUls.reduce((m, x) => x.chk.max > m.chk.max ? x : m, fUls[0]);
    const slab = SC.concrete.slab(fd, fUls.filter(x => !x.cb.favourable).map(x => ({ p: x.chk.p, res: x.res, name: x.cb.id })), fSls.filter(x => x.cb.quasi).map(x => ({ p: x.chk.p, res: x.res, name: x.cb.id })));
    // осідання і крен — від найбільшого середнього тиску SLS та найбільшого моменту
    const sMean = fSls.reduce((m, x) => x.chk.p && x.chk.p.pmean > m.chk.p.pmean ? x : m, fSls[0]);
    const sMom = fSls.reduce((m, x) => Math.hypot(x.res.Mx, x.res.My) > Math.hypot(m.res.Mx, m.res.My) ? x : m, fSls[0]);
    let settle = SC.concrete.settlement(fd, sMean.chk.p.pmean, sMom.res.Mx, sMom.res.My);
    // зони руйнування ґрунту під краями підошви (Барвашов): за H₀ > 0 осідання уточнюється (компресія в межах H₀)
    const edgeZone = SC.concrete.edgeZone(fd, govSls.chk.p.pmax);
    if (edgeZone.H0 > 0) { const s1 = settle; settle = SC.concrete.settlement(fd, sMean.chk.p.pmean, sMom.res.Mx, sMom.res.My, { H0: edgeZone.H0 }); settle.sLinear = s1.s; W('info', `Під краями підошви утворюється зона руйнування ґрунту глибиною H₀ = ${(edgeZone.H0 * 1000).toFixed(0)} мм (Барвашов, за Пузиревським); осідання уточнено: ${(s1.s * 1000).toFixed(1)} → ${(settle.s * 1000).toFixed(1)} мм.`, 'found'); }
    settle.edgeZone = edgeZone;
    settle.uS = settle.s / (fd.sLim || 0.1); settle.uT = settle.tilt / (fd.tiltLim || 0.004);
    // підколонник
    const pedN = Math.min(...fUls.map(x => -x.res.Fz));
    const pedM = Math.max(...fUls.map(x => supNodes.reduce((a, nd) => { const r = (x.cb.id && solved.find(s => s.cb.id === x.cb.id)); const rr = r && r.r.reactions.find(q => q.node === nd.id); return a + (rr ? Math.hypot(rr.r[3], rr.r[4]) : 0); }, 0)));
    const pedH = Math.max(...fUls.map(x => Math.hypot(x.res.Fx, x.res.Fy)));
    const ped = SC.concrete.pedestal(fd, pedN, pedM, pedH);
    const nA = (pr.base.nAnchor || 4);
    const rebar = SC.concrete.schedule(fd, slab, ped, pr.base.anchorReinf, supNodes.length, nA);
    if (govSls && govSls.chk.max > 1) W('error', `Фундамент: тиск під підошвою не проходить (U = ${govSls.chk.max.toFixed(2)}, ${govSls.cb.name}).`, 'found');
    if (govUls && govUls.chk.max > 1) W('error', `Фундамент: перекидання/зсув не забезпечено (U = ${govUls.chk.max.toFixed(2)}, ${govUls.cb.name}).`, 'found');
    // масивність плити: виліт a_v від грані підколонника до робочої висоти d (EN 1992-1-1, 6.2.2(6), 6.5; Гоцуляк, Войтенко, 2011)
    slab.av = Math.min(fd.B - fd.pedB, fd.L - fd.pedL) / 2; slab.avd = slab.av / Math.max(slab.dBot || 0.5, 0.05); slab.deep = slab.avd <= 2;
    if (slab.deep) W('info', `Фундаментна плита масивна: a_v/d = ${slab.avd.toFixed(2)} ≤ 2 — зусилля передаються стиснутими «підкосами» через товщину плити; армування, підібране за згином консолі (теорія пластин), іде в запас. Уточнення — тривимірна модель або модель «підкіс–затяжка» (EN 1992-1-1, 6.5).`, 'found');
    if (slab.punching > 1) W('error', `Продавлювання плити: v_Ed/v_Rd,c = ${slab.punching.toFixed(2)} > 1.`, 'found');
    if (Math.max(slab.shearX, slab.shearY) > 1) W('error', 'Поперечна сила в плиті перевищує V_Rd,c — збільшіть товщину.', 'found');
    if (slab.crack > 1) W('warn', `Тріщиностійкість: діаметр стрижнів більший за допустимий φ*_s = ${slab.phiMax} мм при σ_s = ${slab.sigS.toFixed(0)} МПа (EN 1992-1-1, табл. 7.2N).`, 'found');
    if (settle.uS > 1) W('error', `Осідання s = ${(settle.s * 1000).toFixed(0)} мм > s_u = ${(fd.sLim * 1000).toFixed(0)} мм.`, 'found');
    if (settle.uT > 1) W('error', `Крен i = ${settle.tilt.toFixed(4)} > i_u = ${fd.tiltLim}.`, 'found');
    if (!fd.layers || !fd.layers.length) W('warn', 'Не задано шари ґрунту — осідання оцінено для однорідної основи (ТЗ 2.3: потрібні інженерно-геологічні вишукування).', 'found');

    // ---------- 11. оболонка ----------
    shellRes.forEach(s => { if (s.u > 1) W('error', `Оболонка «${s.part}»: панель листа або ребро не проходить (U = ${s.u.toFixed(2)}) — зменшіть крок ребер або збільшіть товщину.`, 'shell'); });
    if (pr.shell.mode !== 'non-structural') W('warn', 'Обрано спільну роботу оболонки й каркаса: у цій версії оболонка в жорсткість не включається — потрібна оболонкова модель МСЕ та погодження конструктора (ТЗ 2.3.3).', 'shell');

    // ---------- 12. специфікація ----------
    const spec = A.specification(pr, mdl, P, memberRes, supNodes, slab, fd, { welds, shellRes, rebar, supportRes });

    // ---------- 13. інші попередження ----------
    const anyCfDefault = (pr.parts || []).some(p => !p.CfConfirmed) && !(pr.site.aero && pr.site.aero.confirmed);
    if (anyCfDefault) W('warn', 'Аеродинамічні коефіцієнти C_F не підтверджені продуванням/CFD або погодженою методикою — результат ПОПЕРЕДНІЙ (ТЗ 5; 3.2.6).', 'wind');
    for (const v of vortex.modes) {
      if (v.resonance) W(v.required ? 'error' : 'warn', `Вихрове збудження (ДБН В.1.2-2, дод. К): форма ${v.dir}, T = ${v.T.toFixed(3)} с, V_cr = n·d/St = ${v.Vcr.toFixed(1)} м/с ≤ V_max = 1,28√(C_h·W₀) = ${v.Vmax.toFixed(1)} м/с — резонанс можливий; навантаження за (К.4) і (К.6) враховано в сполученні VX. Можливе накопичення втомних пошкоджень швів і анкерів (п. К.6).${v.required ? '' : ` h/d = ${v.Hd.toFixed(1)} ≤ 10 — за п. 9.17 перевірка не обов'язкова, виконано в запас.`}`, 'dyn');
    }
    // анкерні болти — незалежна перевірка за Посібником до СНиП 2.09.03 (формули 1–19)
    let posobie = null;
    if (SC.posobie) {
      posobie = SC.posobie.run({ pr, supportRes, solved, vortex });
      if (posobie.applicable && posobie.best && posobie.best.u > 1) W('error', `Анкерні болти не проходять перевірку за Посібником до СНиП 2.09.03 (U = ${posobie.best.u.toFixed(2)}, опора ${posobie.best.node}): збільште діаметр, глибину закладення або кількість болтів.`, 'base');
    }
    const region = N.checkRegion(pr);
    region.rows.filter(r => r.status === 'range' || r.status === 'diff').forEach(r => W(r.status === 'range' ? 'error' : 'warn', `Дані регіону: ${r.param} = ${r.entered} ${r.unit} — ${N.regionStatusText[r.status]} (${r.ref == null ? '—' : r.ref}; ${r.src})${r.note ? '. ' + r.note : ''}.`, 'site'));
    if (!(pr.supports && pr.supports.confirmed)) W('warn', 'Опори не підтверджені користувачем (ТЗ UI-5.4): розрахункову схему закріплення потрібно підтвердити в розділі «Опори».', 'geom');
    if ((pr.parts || []).length === 0) W('error', 'Не задано жодної частини скульптури.', 'geom');
    (pr.parts || []).forEach(p => { if (p.status === 'assumed') W('warn', `Частина «${p.name}»: геометрія припущена (не підтверджена розмірами).`, 'geom'); });

    const govMember = memberRes.reduce((m, x) => (x.best.u > (m ? m.best.u : -1) ? x : m), null);
    const status = warn.some(w => w.level === 'error') ? 'not-ok' : anyCfDefault ? 'preliminary' : 'ok';
    return {
      ok: true, time: Date.now() - t0, pr, mdl, P, clim, cases, combos, sls, solved, stations, seis, modalG, T1,
      memberRes, sectionRes, govMember, alphaCr, alphaCombo, uMax, uNode, uCombo, uLim, Htot, supportRes, welds, flexLog, shellRes, vortex,
      found: { fd, Rsoil, fSls, fUls, govSls, govUls, slab, reinf: slab, settle, ped, rebar, soil },
      spec, warn, status, eqMax, region, posobie,
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

  /** Відомість матеріалів і кошторис: чиста кількість, відходи (один раз на позицію), закупівля, вартість. */
  A.specification = function (pr, mdl, P, memberRes, supNodes, slab, fd, ex) {
    ex = ex || {};
    const rows = [];
    const byGroup = new Map();
    memberRes.forEach(m => {
      const key = m.e.sec.name + ' ' + m.e.steel.id;
      const r = byGroup.get(key) || { item: `Труба квадратна ${m.e.sec.name}`, steel: m.e.steel.id, std: 'ДСТУ EN 10219-2 / ГОСТ 30245', L: 0, mass: 0, mpm: m.e.sec.mass, paint: 0, n: 0, groups: new Set() };
      r.L += m.L; r.mass += m.mass; r.paint += m.e.sec.perim * m.L; r.groups.add(m.e.group); r.n++;
      byGroup.set(key, r);
    });
    const waste = (pr.design.waste || 7) / 100;
    let tubeMass = 0, paint = 0;
    for (const r of byGroup.values()) {
      tubeMass += r.mass; paint += r.paint;
      rows.push({ cat: 'Каркас', item: r.item, mark: r.steel, std: r.std, unit: 'м', net: r.L, buy: r.L * (1 + waste), massNet: r.mass, massBuy: r.mass * (1 + waste), note: `${r.n} ел.; ${[...r.groups].join(', ')}; ${r.mpm.toFixed(2)} кг/м` });
    }
    const sheets = new Map();
    (pr.parts || []).forEach(p => { const k = p.tShell + '|' + p.rhoShell; const s = sheets.get(k) || { t: p.tShell, A: 0, m: 0, rho: p.rhoShell }; s.A += p.shellArea; s.m += p.shellArea * p.tShell / 1000 * p.rhoShell; sheets.set(k, s); });
    const sw = (pr.design.sheetWaste || 15) / 100;
    let sheetMass = 0;
    for (const s of sheets.values()) { sheetMass += s.m; rows.push({ cat: 'Оболонка', item: `Лист t = ${s.t} мм`, mark: s.rho > 8000 ? 'мідь/бронза' : s.rho < 3000 ? 'алюміній' : 'сталь С245', std: 'ДСТУ 8540', unit: 'м²', net: s.A, buy: s.A * (1 + sw), massNet: s.m, massBuy: s.m * (1 + sw), note: 'відходи розкрою/фасетування ' + (sw * 100).toFixed(0) + ' %' }); }
    let ribMass = 0;
    (ex.shellRes || []).forEach(sr => { ribMass += sr.ribMass; });
    if (ribMass > 0) {
      const byRib = new Map();
      (ex.shellRes || []).forEach(sr => { const k = `${sr.rib.h}×${sr.rib.t}`; const r = byRib.get(k) || { L: 0, m: 0 }; r.L += sr.ribLen; r.m += sr.ribMass; byRib.set(k, r); });
      for (const [k, r] of byRib) rows.push({ cat: 'Оболонка', item: `Ребра допоміжного каркаса — штаба ${k}`, mark: 'С245', std: 'ДСТУ 4747', unit: 'м', net: r.L, buy: r.L * (1 + waste), massNet: r.m, massBuy: r.m * (1 + waste), note: 'крок за розрахунком листа' });
    }
    const bp = pr.base, nS = supNodes.length;
    const plateM = bp.plateB / 1000 * bp.plateL / 1000 * bp.tp / 1000 * 7850;
    rows.push({ cat: 'Опорні вузли', item: `Опорна плита ${bp.plateB}×${bp.plateL}×${bp.tp}`, mark: pr.frame.steel, std: 'ДСТУ 8540', unit: 'шт', net: nS, buy: nS, massNet: plateM * nS, massBuy: plateM * nS * 1.05, note: bp.type === 'embed' ? 'закладна деталь' : 'отвори Ø' + (bp.d + 6) });
    if ((bp.nRibs || 0) > 0) {
      const sec = SC.sections.byName(pr.frame.secPost);
      const cr = (bp.plateB / 1000 - sec.b) / 2;
      const m1 = bp.tr / 1000 * bp.hr / 1000 * cr * 7850;
      const n = bp.nRibs * nS;
      rows.push({ cat: 'Опорні вузли', item: `Ребро жорсткості ${bp.hr}×${(cr * 1000).toFixed(0)}×${bp.tr}`, mark: pr.frame.steel, std: 'ДСТУ 8540', unit: 'шт', net: n, buy: n, massNet: m1 * n, massBuy: m1 * n * 1.05, note: '' });
    }
    if (bp.shear === 'lug') { const m = bp.lugB / 1000 * bp.lugH / 1000 * bp.lugT / 1000 * 7850 * 2; rows.push({ cat: 'Опорні вузли', item: `Зсувний упор (2 пластини ${bp.lugB}×${bp.lugH}×${bp.lugT})`, mark: pr.frame.steel, std: '', unit: 'шт', net: nS, buy: nS, massNet: m * nS, massBuy: m * nS * 1.05, note: '' }); }
    const nA = bp.nAnchor * nS;
    const la = (bp.hef + bp.tp + 30 + 2 * bp.d + 40) / 1000;
    const am = Math.PI * (bp.d / 1000) ** 2 / 4 * la * 7850;
    rows.push({ cat: 'Опорні вузли', item: bp.type === 'embed' ? `Шпилька з головкою Ø${bp.d}, L = ${bp.hef + 10} мм (EN ISO 13918)` : `Фундаментний болт М${bp.d} з анкерною плитою Ø${bp.dh}×${bp.tw || 10}, L = ${(la * 1000).toFixed(0)} мм`, mark: bp.type === 'embed' ? 'S235J2+C450' : `клас ${bp.grade}`, std: bp.type === 'embed' ? 'EN ISO 13918' : 'ДСТУ ISO 898-1 / ГОСТ 24379.1', unit: 'шт', net: nA, buy: nA, massNet: am * nA, massBuy: am * nA, note: bp.type === 'embed' ? 'приварка дуговим способом' : `+ ${nA * 2} гайок, ${nA} шайб, шаблон` });
    const w = SC.found.weights(fd);
    const Vc = w.Vslab + w.Vped;
    rows.push({ cat: 'Фундамент', item: `Бетон ${fd.concrete}`, mark: fd.concrete, std: 'ДСТУ Б В.2.7-176', unit: 'м³', net: Vc, buy: Vc * 1.03, massNet: Vc * fd.rhoC, massBuy: Vc * fd.rhoC * 1.03, note: `плита ${fd.B}×${fd.L}×${fd.h} м + підколонник ${fd.pedB}×${fd.pedL}×${fd.pedH} м` });
    rows.push({ cat: 'Фундамент', item: 'Бетонна підготовка C8/10, 100 мм', mark: 'C8/10', std: '', unit: 'м³', net: (fd.B + 0.2) * (fd.L + 0.2) * 0.1, buy: (fd.B + 0.2) * (fd.L + 0.2) * 0.1 * 1.03, massNet: 0, massBuy: 0, note: '' });
    rows.push({ cat: 'Фундамент', item: 'Підливка безусадкова під опорні плити, 30 мм', mark: '≥ C30/37', std: '', unit: 'м³', net: nS * (bp.plateB + 100) / 1000 * (bp.plateL + 100) / 1000 * 0.03, buy: nS * (bp.plateB + 100) / 1000 * (bp.plateL + 100) / 1000 * 0.03 * 1.1, massNet: 0, massBuy: 0, note: '' });
    const rb = ex.rebar || { rows: [], total: 0 };
    const byDia = new Map();
    rb.rows.forEach(r => { const x = byDia.get(r.dia) || { L: 0, m: 0, pos: [] }; x.L += r.total; x.m += r.mass; x.pos.push(r.pos); byDia.set(r.dia, x); });
    for (const [dia, x] of [...byDia].sort((a, b) => a[0] - b[0])) rows.push({ cat: 'Фундамент', item: `Арматура Ø${dia}`, mark: fd.rebar, std: 'ДСТУ 3760', unit: 'м', net: x.L, buy: x.L * 1.05, massNet: x.m, massBuy: x.m * 1.05, note: 'поз. ' + x.pos.join(', ') });
    // шви
    const wl = new Map();
    (ex.welds || []).forEach(q => { const k = Math.round(q.kf * 1000); wl.set(k, (wl.get(k) || 0) + q.Lgeom); });
    const leg = bp.weldLeg || 6;
    wl.set(leg, (wl.get(leg) || 0) + nS * 4 * (SC.sections.byName(pr.frame.secPost) || { b: 0.1 }).b);
    if ((bp.nRibs || 0) > 0) { const kR = bp.ribWeldLeg || 6; const cr = (bp.plateB / 1000 - (SC.sections.byName(pr.frame.secPost) || { b: 0.1 }).b) / 2; wl.set(kR, (wl.get(kR) || 0) + nS * bp.nRibs * 2 * (bp.hr / 1000 + cr)); }
    let weldTotal = 0;
    for (const [k, L] of [...wl].sort((a, b) => a[0] - b[0])) {
      const dep = L * (k / 1000) ** 2 / 2 * 7850 * 1.1;
      weldTotal += L;
      rows.push({ cat: 'Зварювання', item: `Кутові шви k_f = ${k} мм`, mark: pr.design.electrode || 'Е42', std: 'ДСТУ EN ISO 2560', unit: 'м', net: L, buy: L, massNet: dep, massBuy: dep * 1.7, note: 'маса наплавленого металу; електроди ×1,7' });
    }
    rows.push({ cat: 'Захист', item: 'Антикорозійне покриття каркаса', mark: (pr.site.env || {}).protection || 'C3', std: 'ДСТУ ISO 12944', unit: 'м²', net: paint, buy: paint * 1.1, massNet: 0, massBuy: 0, note: 'зовнішня поверхня; порожнини труб — герметизувати' });
    const pz = pr.prices || {};
    const costOf = r => r.cat === 'Каркас' ? r.massBuy * pz.tube : r.cat === 'Оболонка' ? r.massBuy * (r.item.startsWith('Ребра') ? pz.tube : pz.sheet) : r.cat === 'Опорні вузли' && !/болт|Шпилька/.test(r.item) ? r.massBuy * pz.plate : /болт|Шпилька/.test(r.item) ? r.buy * pz.anchor : r.item.startsWith('Бетон') ? r.buy * pz.concrete : r.item.startsWith('Арматура') ? r.massBuy * pz.rebar : r.cat === 'Зварювання' ? r.massBuy * (pz.electrode || 120) : r.cat === 'Захист' ? r.buy * (pz.paint || 250) : 0;
    rows.forEach(r => { r.cost = costOf(r) || 0; });
    const total = rows.reduce((s, r) => s + r.cost, 0) + (pz.fabrication || 0) + (pz.transport || 0) + (pz.install || 0);
    return { rows, tubeMass, sheetMass, ribMass, total, plateMass: plateM * nS, anchorMass: am * nA, Vc, weldTotal, rebarMass: rb.total, nTypes: byGroup.size, nMembers: memberRes.length };
  };

  /** Автоматичний підбір перерізів груп (найлегший типорозмір, для якого U ≤ ціль). Повертає історію ітерацій. */
  A.optimize = function (pr0, progress, maxIt, runOpts) {
    const pr = JSON.parse(JSON.stringify(pr0));
    const tMin = pr.design.tMin || 3, target = pr.design.target || 0.9;
    const steel = SC.norms.steels.find(s => s.id === pr.frame.steel) || SC.norms.steels[1];
    const cat = SC.sections.list().filter(s => s.tmm >= tMin && SC.checks.sectionClass(s, steel.Ryn).cls <= 3).sort((a, b) => a.mass - b.mass);
    const keys = pr.design.lockPost ? [] : [{ key: 'secPost', group: 'Стійки ядра', get: () => pr.frame.secPost, set: v => { pr.frame.secPost = v; }, filt: s => s.bmm >= (pr.design.bMin || 0) && s.bmm <= (pr.design.bMax || 1e9) }];
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
      const R = A.run(pr, null, runOpts);
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
        const ok = c2 => !k.filt || k.filt(c2);
        let ni = cat.findIndex((c2, ci) => ci > lowFail[j] && ok(c2) && est(c2) <= target * 0.97);
        if (ni < 0) ni = cat.length - 1;
        if (U[j] > target && ni <= idx[j]) { ni = idx[j] + 1; while (ni < cat.length - 1 && !ok(cat[ni])) ni++; ni = Math.min(cat.length - 1, ni); }
        if (ni !== idx[j] && !(best[j] != null && ni >= best[j] && U[j] <= target)) { idx[j] = ni; changed = true; }
      });
      if (!changed) break;
    }
    keys.forEach((k, j) => { if (best[j] != null) k.set(cat[best[j]].name); });
    return { pr, hist, keys: keys.map(k => ({ group: k.group, sec: k.get() })) };
  };

  /** Порівняння конструктивних варіантів каркаса (ТЗ UI-7.3, 3.4): для кожної схеми — підбір перерізів і показники. */
  A.variantList = function (pr) {
    const v = [{ type: 'single', bracing: 'none', name: 'Одна консольна стійка' }];
    for (const t of ['core3', 'core4']) for (const b of ['X', 'Z', 'none']) v.push({ type: t, bracing: b, name: `${t === 'core3' ? 'Тригранне' : 'Чотиригранне'} ядро, зв'язки: ${{ X: 'хрестові', Z: 'розкісні', none: 'немає (рамне)' }[b]}` });
    return v;
  };
  A.variant = function (pr0, v) {
    const pr = JSON.parse(JSON.stringify(pr0));
    pr.frame.type = v.type; pr.frame.bracing = v.bracing;
    const o = A.optimize(pr, null, 8, { dirStep: 30 });
    const R = A.run(o.pr, null, { dirStep: 30 });
    if (!R.ok) return { v, ok: false, reason: R.error };
    const maxU = Math.max(...R.memberRes.map(m => m.best.u));
    const supU = Math.max(...R.supportRes.map(s => s.best.u));
    const Rmax = Math.max(...R.supportRes.map(s => Math.hypot(s.best.r[3], s.best.r[4])));
    const joints = R.P.model.nodes.filter(n => !n.sup).length;
    const feasible = maxU <= 1 && supU <= 1 && !R.warn.some(w => w.level === 'error' && w.ref === 'members');
    return { v, ok: true, feasible, pr: o.pr, keys: o.keys, mass: R.spec.tubeMass, cost: R.spec.total, nMembers: R.spec.nMembers, nTypes: R.spec.nTypes, weld: R.spec.weldTotal, joints, maxU, supU, uMax: R.uMax, Rmax, T1: R.T1,
      complexity: joints + R.spec.nMembers / 2, reason: feasible ? '' : (maxU > 1 ? 'перерізи не проходять навіть після підбору' : 'опорний вузол не проходить') };
  };

  /** Підбір фундаменту (ТЗ «Правила зміни конструкції»): мінімальний об'єм бетону, за якого виконуються всі перевірки
   *  основи, стійкості, продавлювання, поперечної сили, осідання й крену. Реакції каркаса — з виконаного розрахунку. */
  A.optimizeFoundation = function (R) {
    const supPos = id => { const n = R.P.model.nodes[R.P.idx.get(id)]; return { x: n.x, y: n.y }; };
    const base = R.pr.found;
    const minPed = Math.max(base.pedB, base.pedL);
    let best = null; const tried = [];
    for (let B = Math.max(minPed + 0.2, 1.0); B <= 6.01; B += 0.2) for (const h of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0]) {
      const fd = Object.assign({}, base, { B: +B.toFixed(2), L: +B.toFixed(2), h });
      if (fd.depth < h) fd.depth = h;
      const Rs = fd.soilMode === 'calc' ? SC.concrete.soilRLayer(fd).R : fd.R;
      let u = 0, gov = '';
      const ulsP = [];
      for (const cb of R.sls) { if (!cb.r) continue; const res = SC.found.resultant(fd, cb.r.reactions.map(x => Object.assign(supPos(x.node), { r: x.r })), 1.0); const c = SC.found.check(fd, res, Rs, 'sls'); if (c.max > u) { u = c.max; gov = cb.name; } }
      for (const s of R.solved) { const res = SC.found.resultant(fd, s.r.reactions.map(x => Object.assign(supPos(x.node), { r: x.r })), s.cb.favourable ? 0.9 : 1.1); const c = SC.found.check(fd, res, Rs, 'uls'); if (c.max > u) { u = c.max; gov = s.cb.name; } if (!s.cb.favourable) ulsP.push({ p: c.p, res, name: s.cb.id }); }
      if (u > 1) { tried.push({ B: fd.B, h, u, gov }); continue; }
      const slab = SC.concrete.slab(fd, ulsP, []);
      const uS = Math.max(slab.punching, slab.shearX, slab.shearY);
      if (uS > 1) { tried.push({ B: fd.B, h, u: uS, gov: 'залізобетон' }); continue; }
      const V = fd.B * fd.L * h + fd.pedB * fd.pedL * fd.pedH;
      if (!best || V < best.V - 1e-9) best = { B: fd.B, L: fd.L, h, V, u: Math.max(u, uS), gov };
      break; // для даного B мінімальна h знайдена
    }
    return { best, tried };
  };

  SC.analysis = A;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
