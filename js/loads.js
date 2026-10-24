/* Кліматичні та сейсмічні впливи, формування завантажень і сполучень.
 * Вітер:  Wm = γfm·W0·C,  C = Caer·Ch·Calt·Crel·Cdir·Cd   (ДБН В.1.2-2:2006, р. 9)
 *         спрощений спосіб: q_m,j = γfm·W0·Ch(z_j)·Calt·Crel·Cdir·Cd;  F_j(θ) = q_m,j·C_F,j·A_ref,j(θ)
 * Сніг:   Sm = γfm·S0·C,  C = μ·Ce·Calt                     (ДБН В.1.2-2:2006, р. 8);  F_s,j = Sm·μ_j·A_h,j
 * Сейсміка: S_ik = k1·k2·kгр·m_k·g·a0·β_i·kψ·η_ik (структура ДБН В.1.1-12:2014, спектральний метод)
 */
(function (SC) {
  'use strict';

  const L = {};
  const g = 9.81;

  /** Кліматичні параметри майданчика з повним протоколом обчислення. */
  L.climate = function (pr, T1) {
    const N = SC.norms, s = pr.site, ov = pr.overrides || {};
    const out = { log: [] };
    // --- вітер
    let W0 = s.W0;
    if (s.windMode === 'district') W0 = (N.windDistricts.find(d => d.id === s.windDistrict) || {}).W0 || s.W0;
    out.W0 = W0;
    out.gfmW = ov.gfmW != null ? ov.gfmW : N.windGamma(s.Tlife, ov.windGammaFm);
    out.CaltW = N.windCalt(s.Hsea, s.w0Station);
    out.Crel = s.Crel; out.Cdir = s.Cdir;
    out.Cd = (T1 != null && T1 <= 0.25) ? 1.0 : s.Cd;
    out.T1 = T1;
    out.ChTable = (T1 != null && T1 > 0.25) ? '9.02' : '9.01';
    out.q0 = out.gfmW * W0 * out.CaltW * out.Crel * out.Cdir * out.Cd; // Па, без Ch та аеродинамічного коеф.
    out.qAt = (z) => {
      const ch = N.Ch(Math.max(z, 0), s.terrain, T1, ov.ChTables);
      return { q: out.q0 * ch.value, Ch: ch.value, ok: ch.ok, table: ch.table };
    };
    out.qkAt = (z) => out.qAt(z).q / out.gfmW; // характеристичне (для SLS)
    // --- сніг
    let S0 = s.S0;
    if (s.snowMode === 'district') S0 = (N.snowDistricts.find(d => d.id === s.snowDistrict) || {}).S0 || s.S0;
    out.S0 = S0;
    out.gfmS = ov.gfmS != null ? ov.gfmS : N.snowGamma(s.Tlife, ov.snowGammaFm);
    out.CaltS = N.snowCalt(s.Hsea, s.snowRegion);
    out.Ce = s.Ce;
    out.Sm1 = out.gfmS * S0 * out.Ce * out.CaltS; // Па при μ = 1
    out.Sk1 = S0 * out.Ce * out.CaltS;
    // --- сейсміка
    const sz = s.seismic;
    out.seis = { on: !!sz.on, soil: sz.soil || 'II' }; // параметри рівнів впливу — N.seismicSite (у розрахунку, коли відома геометрія)
    out.gammaN = s.gammaN;
    return out;
  };

  /** Площа проєкції частини для напрямку вітру θ. Якщо імпортовано 3D-модель — табличні значення з об'єднання проєкцій. */
  L.partArea = function (p, theta) {
    if (p.areaTable && p.areaTable.length) {
      const step = 360 / p.areaTable.length;
      const t = ((theta % 360) + 360) % 360;
      const i = Math.floor(t / step), f = t / step - i;
      return p.areaTable[i % p.areaTable.length] * (1 - f) + p.areaTable[(i + 1) % p.areaTable.length] * f;
    }
    const r = theta * Math.PI / 180;
    return p.Ax * Math.abs(Math.cos(r)) + p.Ay * Math.abs(Math.sin(r));
  };

  /**
   * Базові завантаження (характеристичні значення, без γ):
   *  G — власна вага каркаса (розподілена по елементах) + оболонка та обладнання частин;
   *  S — сніг (розрахунковий при γfm = 1, тобто S0·μ·Ce·Calt);
   *  W(θ) — вітер з характеристичним тиском (γfm = 1).
   */
  L.baseCases = function (pr, mdl, P, clim) {
    const nodeIdx = P.idx;
    const pos = id => { const n = P.model.nodes[nodeIdx.get(id)]; return [n.x, n.y, n.z]; };
    const hPed = pr.site.hPed || 0;
    const cases = {};
    // G
    const G = { nodal: [], dist: [], info: { frameMass: 0, shellMass: 0 } };
    mdl.elems.forEach((e, k) => {
      const m = e.sec.mass || 0; if (!m) return;
      G.dist.push({ elem: k, w: [0, 0, -m * g] });
      G.info.frameMass += m * P.els[k].L;
    });
    // вузлові накладки, фасонки (+ 5 % маси каркаса в техн. запас, задається користувачем у майбутньому)
    mdl.partAttach.forEach(pa => {
      G.info.shellMass += pa.mass;
      pa.targets.forEach(t => pushDistributed(G.nodal, t, [0, 0, -pa.mass * g * t.share], pos));
    });
    cases.G = G;
    // S
    const Sc = { nodal: [], dist: [], info: { total: 0 } };
    (pr.parts || []).forEach((p, pi) => {
      const pa = mdl.partAttach.find(a => a.part === pi);
      const F = clim.Sk1 * (p.mu != null ? p.mu : 1) * (p.Ah || 0);
      Sc.info.total += F;
      pa.targets.forEach(t => pushDistributed(Sc.nodal, t, [0, 0, -F * t.share], pos));
    });
    cases.S = Sc;
    // W(θ)
    const step = pr.design.dirStep || 15;
    cases.W = [];
    for (let th = 0; th < 360; th += step) {
      const d = [Math.cos(th * Math.PI / 180), Math.sin(th * Math.PI / 180), 0];
      const W = { theta: th, nodal: [], dist: [], info: { F: [0, 0, 0], M: [0, 0, 0], parts: [] } };
      (pr.parts || []).forEach((p, pi) => {
        const pa = mdl.partAttach.find(a => a.part === pi);
        const A = L.partArea(p, th);
        const Cf = L.partCf(p, th);
        let Fp = 0, Mz = 0;
        pa.targets.forEach(t => {
          const zg = (p.kind === 'cant' ? p.z : t.z) + hPed;
          const qk = clim.qAt(zg).q / clim.gfmW; // характеристичний тиск з Ch
          const F = qk * Cf * A * (t.shareW != null ? t.shareW : t.share);
          Fp += F; Mz += F * zg;
          pushDistributed(W.nodal, t, [F * d[0], F * d[1], 0], pos, p.kind === 'cant' || p.kind === 'train' ? null : [p.x, p.y, t.c[2]]);
        });
        W.info.parts.push({ name: p.name, A, F: Fp, zcp: Fp ? Mz / Fp : 0 });
      });
      if (pr.frame.exposed) {
        mdl.elems.forEach((e, k) => {
          const el = P.els[k];
          const zc = (P.model.nodes[el.ni].z + P.model.nodes[el.nj].z) / 2 + hPed;
          const qk = clim.qAt(zc).q / clim.gfmW;
          const ex = el.ax.x; const dd = SC.fem.vec.dot(d, ex);
          const perp = [d[0] - dd * ex[0], d[1] - dd * ex[1], d[2] - dd * ex[2]];
          const w = qk * pr.frame.CfFrame * e.sec.b;
          W.dist.push({ elem: k, w: perp.map(v => v * w) });
        });
      }
      cases.W.push(W);
    }
    // Ожеледь I (ДБН В.1.2-2, р. 10): вага шару на поверхні i = b·k(z)·μ₂·ρ·g, Па
    const ice = pr.site.ice || {};
    if (ice.on && ice.b > 0) {
      const I = { nodal: [], dist: [], info: { total: 0 } };
      (pr.parts || []).forEach((p, pi) => {
        const pa = mdl.partAttach.find(a => a.part === pi);
        const kz = SC.norms.interp(SC.norms.iceK.z, SC.norms.iceK.k, p.z + hPed);
        const w = ice.b / 1000 * kz * SC.norms.iceMu2 * SC.norms.iceRho * g;
        const F = w * (p.shellArea || 0);
        I.info.total += F;
        pa.targets.forEach(t => pushDistributed(I.nodal, t, [0, 0, -F * t.share], pos));
      });
      cases.I = I;
    }
    // Температура T± (ДБН В.1.2-2, р. 11): початкова деформація ε₀ = α·ΔT у кожному елементі каркаса
    const tmp = pr.site.temp || {};
    if (tmp.on) {
      cases.Tp = { nodal: [], dist: [], therm: mdl.elems.map((e, k) => ({ elem: k, eps: SC.norms.alphaT * (tmp.dTplus || 0) })) };
      cases.Tm = { nodal: [], dist: [], therm: mdl.elems.map((e, k) => ({ elem: k, eps: SC.norms.alphaT * (tmp.dTminus || 0) })) };
    }
    // Навантаження користувача: обслуговування (Q), монтаж (M), аварійні (A) — у найближчий вузол
    const userCase = kind => {
      const c = { nodal: [], dist: [], items: [] };
      (pr.loadsUser || []).filter(u => u.kind === kind).forEach(u => {
        let best = null, bd = Infinity;
        P.model.nodes.forEach(n => { const d = Math.hypot(n.x - u.x, n.y - u.y, n.z - u.z); if (d < bd) { bd = d; best = n; } });
        if (!best) return;
        const F = [u.Fx * 1000, u.Fy * 1000, u.Fz * 1000];
        const r = [u.x - best.x, u.y - best.y, u.z - best.z];
        const m = SC.fem.vec.cross(r, F);
        c.nodal.push({ node: best.id, f: [F[0], F[1], F[2], m[0], m[1], m[2]] });
        c.items.push({ name: u.name, node: best.id, dist: bd });
      });
      return c.nodal.length ? c : null;
    };
    cases.Q = userCase('service'); cases.M = userCase('erection'); cases.A = userCase('accidental');
    return cases;
  };

  /** Аеродинамічний коефіцієнт частини для напрямку θ: таблиця C_F(θ) зі звіту (якщо завантажено) або постійний C_F. */
  L.partCf = function (p, theta) {
    const t = p.cfTable;
    if (t && t.length) {
      const pts = t.slice().sort((a, b) => a.theta - b.theta);
      const th = ((theta % 360) + 360) % 360;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const tb = i + 1 < pts.length ? b.theta : b.theta + 360;
        const x = (i + 1 === pts.length && th < a.theta) ? th + 360 : th;
        if (x >= a.theta && x <= tb) return a.Cf + (x - a.theta) / ((tb - a.theta) || 1) * (b.Cf - a.Cf);
      }
      return pts[0].Cf;
    }
    return p.Cf;
  };

  function pushDistributed(arr, t, Fv, pos, cOverride) {
    const pts = t.nodes.map(pos);
    const c = cOverride || t.c;
    const fs = SC.model.distribute(pts, c, Fv);
    t.nodes.forEach((id, k) => arr.push({ node: id, f: fs[k] }));
  }

  /**
   * Резонансне вихрове збудження (ДБН В.1.2-2, п. 9.17, Додаток К, Зміна № 2).
   *  V_cr = n·d/St (К.1); резонансу немає, якщо V_cr > V_max(z_e) = 1,28·√(C_h(z_e)·W₀) (К.2, К.3), z_e = 0,8H.
   *  Поперечне навантаження F(z) = 0,75·V_cr²·C_e,cr·φ(z)·d/δ, Н/м (К.4), δ = 0,05 (метал);
   *  разом з ним — поздовжнє W_m,cr = (V_cr/V_max)²·W_m (К.6).
   *  Для частини скульптури d·dz замінюється площею проєкції частини, φ(z) — переміщення вузла кріплення у формі коливань.
   */
  L.vortex = function (pr, mdl, P, clim, modal, Htot) {
    const N = SC.norms, vm = N.vortexMeta;
    const shape = pr.design.vortexShape || 'round';
    const St = vm.St[shape], delta = vm.delta;
    const hPed = pr.site.hPed || 0;
    const ze = 0.8 * Htot;
    const Che = N.Ch(ze, pr.site.terrain, modal.modes[0].T, (pr.overrides || {}).ChTables).value;
    const Vmax = 1.28 * Math.sqrt(Che * clim.W0);
    const nodeIdx = P.idx, pos = id => { const n = P.model.nodes[nodeIdx.get(id)]; return [n.x, n.y, n.z]; };
    const res = [];
    for (const md of modal.modes.slice(0, 2)) {
      let sx = 0, sy = 0; P.model.nodes.forEach((n, k) => { sx += md.phi[k * 6] ** 2; sy += md.phi[k * 6 + 1] ** 2; });
      const dir = sx >= sy ? 0 : 1; // напрямок коливань
      const phiMax = Math.max(1e-12, ...P.model.nodes.map((n, k) => Math.abs(md.phi[k * 6 + dir])));
      // характерний поперечний розмір d (перпендикулярно вітру = уздовж коливань): ширина несучої частини на z_e
      const parts = pr.parts || [];
      const body = parts.filter(p => p.kind === 'dist').reduce((m, p) => (!m || (p.z2 - p.z1) > (m.z2 - m.z1) ? p : m), null) || parts[0];
      const hb = body ? Math.max(0.1, (body.z2 || body.z) - (body.z1 || 0)) : 1;
      const d = body ? (dir === 0 ? body.Ay : body.Ax) / hb : 0.5; // Ay — проєкція для вітру вздовж Y, її ширина — розмір уздовж X
      const n = 1 / md.T, Vcr = n * d / St;
      const Hd = Htot / Math.max(d, 0.05);
      const Ce = shape === 'round' ? 0.3 : (Vcr / Vmax < 0.8 ? 1.1 : 0.6);
      res.push({ T: md.T, n, dir: dir === 0 ? 'X' : 'Y', d, Vcr, Vmax, ze, Che, St, Ce, Hd, required: Hd > 10, resonance: Vcr <= Vmax, phiMax, md, dirIdx: dir });
    }
    const gov = res.filter(r => r.resonance).sort((a, b) => a.Vcr - b.Vcr)[0] || null;
    let VX = null;
    if (gov) {
      const thWind = gov.dirIdx === 0 ? 90 : 0; // вітер перпендикулярно до коливань
      VX = { nodal: [], dist: [], dir: gov.dirIdx === 0 ? [1, 0, 0] : [0, 1, 0], info: { parts: [], thWind, ratio: (gov.Vcr / gov.Vmax) ** 2 } };
      (pr.parts || []).forEach((p, pi) => {
        const pa = mdl.partAttach.find(a => a.part === pi);
        const A = gov.dirIdx === 0 ? p.Ay : p.Ax;
        let Fp = 0;
        pa.targets.forEach(t => {
          const k = nodeIdx.get(t.nodes[0]);
          const phi = Math.abs(gov.md.phi[k * 6 + gov.dirIdx]) / gov.phiMax;
          const F = 0.75 * gov.Vcr ** 2 * gov.Ce * phi * A * (t.shareW != null ? t.shareW : t.share) / delta;
          const Fv = gov.dirIdx === 0 ? [F, 0, 0] : [0, F, 0];
          Fp += F;
          pushDistributed(VX.nodal, t, Fv, pos, p.kind === 'cant' || p.kind === 'train' ? null : [p.x, p.y, t.c[2]]);
        });
        VX.info.parts.push({ name: p.name, F: Fp });
      });
      VX.alongTheta = thWind;
    }
    return { modes: res, gov, VX, shape, St, delta, src: vm.src };
  };

  /** Лінійна комбінація завантажень: [{case, k}] → навантаження. */
  L.combine = function (terms) {
    const out = { nodal: [], dist: [], therm: [] };
    for (const { c, k } of terms) {
      if (!c || !k) continue;
      for (const n of c.nodal || []) out.nodal.push({ node: n.node, f: n.f.map(v => v * k) });
      for (const d of c.dist || []) out.dist.push({ elem: d.elem, w: d.w.map(v => v * k) });
      for (const t of c.therm || []) out.therm.push({ elem: t.elem, eps: t.eps * k });
    }
    return out;
  };

  /** Еквівалентні горизонтальні сили від глобальної недосконалості φ = φ0·αh·αm (EN 1993-1-1, 5.3.2). */
  L.imperfection = function (load, mdl, P, dir) {
    const h = Math.max(mdl.H, 0.1);
    const ah = Math.min(1, Math.max(2 / 3, 2 / Math.sqrt(h)));
    const m = mdl.posts;
    const am = Math.sqrt(0.5 * (1 + 1 / m));
    const phi = ah * am / 200;
    const out = { nodal: [], dist: [], phi };
    // вертикальні навантаження: вузлові + розподілені (половина на кожен вузол)
    const Vz = new Map();
    for (const n of load.nodal) Vz.set(n.node, (Vz.get(n.node) || 0) + n.f[2]);
    for (const d of load.dist) { const el = P.els[d.elem]; const half = d.w[2] * el.L / 2; for (const ni of [el.ni, el.nj]) { const id = P.model.nodes[ni].id; Vz.set(id, (Vz.get(id) || 0) + half); } }
    for (const [id, fz] of Vz) { if (fz >= 0) continue; const H = -fz * phi; out.nodal.push({ node: id, f: [H * dir[0], H * dir[1], 0, 0, 0, 0] }); }
    return out;
  };

  /** Сейсмічні маси у вузлах (кг) для особливого сполучення: (0,9·G + 0,5·S)·γ / g. */
  L.seismicMasses = function (cases, P, clim) {
    const mass = new Float64Array(P.nn);
    // ф. (7.1): ΣG_k + Σψ_E·Q_k — характеристичні значення (без γ_f); сніг — короткочасне на покриття, ψ_E = 0,5
    const kc = SC.norms.seismicComb;
    const addCase = (c, k) => {
      for (const n of c.nodal) mass[P.idx.get(n.node)] += -n.f[2] * k / g;
      for (const d of c.dist) { const el = P.els[d.elem]; const m = -d.w[2] * el.L * k / g / 2; mass[el.ni] += m; mass[el.nj] += m; }
    };
    addCase(cases.G, kc.G);
    addCase(cases.S, kc.snow);
    for (let i = 0; i < mass.length; i++) if (mass[i] < 0) mass[i] = 0;
    return mass;
  };

  /**
   * Спектральний метод: інерційні сили форми i у вузлі k (напрямок dir 0/1/2) при a₀ = 1 і γpl = 1:
   *   S_ik = m_k·g·β_i·η_ik, η_ik·m_k = m_k·φ_ik·Γ_i (форми нормовані за масою).
   *  Розрахункові значення — множенням на a₀·γpl·γI/m (ДБН В.1.1-12:2025, ф. (7.3), табл. 7.3, 7.4, 7.7).
   */
  L.seismicModalLoads = function (P, masses, modal, clim, dir, factor) {
    const sz = clim.seis;
    return modal.modes.map((md, i) => {
      const beta = SC.norms.seismicBeta(md.T, sz.soil);
      const Sa = g * beta * (factor || 1);
      const nodal = [];
      P.model.nodes.forEach((nd, k) => {
        const m = masses[k]; if (!m) return;
        // η_ik·m_k = m_k·φ_k,dir·Γ_i (M-нормовані форми) — проєкція на всі 3 напрямки
        const f = [0, 0, 0, 0, 0, 0];
        for (let a = 0; a < 3; a++) f[a] = m * md.phi[k * 6 + a] * md.gamma[dir] * Sa;
        nodal.push({ node: nd.id, f });
      });
      return { mode: i + 1, T: md.T, beta, Sa, meff: md.meff[dir], load: { nodal, dist: [] } };
    });
  };

  SC.loads = L;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
