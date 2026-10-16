/* Перевірки перерізів квадратних труб.
 * Профіль «ДБН»: ДБН В.2.6-198:2014 — Ry = Ryn/γm, γc; міцність (пружна), стійкість центрального стиску φ(λ̄),
 *   граничні гнучкості; стиск зі згином — інтерполяційна формула з коефіцієнтами k (див. звіт: обмеження).
 * Профіль «EN»: ДСТУ-Н Б EN 1993-1-1 — класи перерізу, ефективна площа (кл. 4), χ (криві a/c),
 *   формули (6.61), (6.62) з коефіцієнтами kij за додатком B (метод 2), зсув, кручення, σeq.
 */
(function (SC) {
  'use strict';

  const C = {};

  /** φ за ДБН В.2.6-198 (як у СП 16.13330): δ = 9,87(1−α+β·λ̄)+λ̄²; φ = 0,5(δ − √(δ² − 39,48·λ̄²))/λ̄². */
  C.phiDBN = function (lam, type) {
    const p = { a: [0.03, 0.06], b: [0.04, 0.09], c: [0.04, 0.14] }[type || 'b'];
    if (lam <= 0.4) return 1.0;
    const d = 9.87 * (1 - p[0] + p[1] * lam) + lam * lam;
    let phi = 0.5 * (d - Math.sqrt(d * d - 39.48 * lam * lam)) / (lam * lam);
    if (lam > 3.8) phi = Math.min(phi, 7.6 / (lam * lam)); // обмеження для великих гнучкостей
    return Math.min(phi, 1);
  };

  /** χ за EN 1993-1-1 (6.49). */
  C.chiEN = function (lam, curve) {
    const a = { a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76 }[curve || 'c'];
    if (lam <= 0.2) return 1;
    const Ph = 0.5 * (1 + a * (lam - 0.2) + lam * lam);
    return Math.min(1, 1 / (Ph + Math.sqrt(Ph * Ph - lam * lam)));
  };

  /** Клас перерізу SHS при стиску (EN 1993-1-1, табл. 5.2): c = b − 3t. */
  C.sectionClass = function (sec, fy) {
    const eps = Math.sqrt(235 / fy);
    const ct = (sec.bmm - 3 * sec.tmm) / sec.tmm;
    const cls = ct <= 33 * eps ? 1 : ct <= 38 * eps ? 2 : ct <= 42 * eps ? 3 : 4;
    // ефективна площа для класу 4 (EN 1993-1-5, ψ = 1, kσ = 4)
    let Aeff = sec.A, Weff = sec.Wel;
    if (cls === 4) {
      const lp = ct / (28.4 * eps * 2);
      const rho = Math.min(1, (lp - 0.22) / (lp * lp));
      const c = (sec.bmm - 3 * sec.tmm) / 1000;
      Aeff = sec.A - 4 * (1 - rho) * c * sec.t;
      Weff = sec.Wel * Aeff / sec.A; // наближено (консервативно для згину)
    }
    return { cls, ct, eps, Aeff, Weff, lim: [33 * eps, 38 * eps, 42 * eps] };
  };

  /**
   * Перевірка елемента для набору внутрішніх зусиль.
   * f: {N(розтяг +), Vy, Vz, T, My, Mz}, Н, Н·м; L_cr — розрахункова довжина, м; opt: {gammaC, gammaM0, gammaM1, curve, Cm}
   */
  C.member = function (sec, steel, f, Lcr, opt) {
    opt = opt || {};
    const E = SC.norms.E;
    const res = { dbn: {}, en: {} };
    const Nc = Math.max(0, -f.N), Nt = Math.max(0, f.N);
    const My = Math.abs(f.My), Mz = Math.abs(f.Mz), V = Math.hypot(f.Vy, f.Vz), T = Math.abs(f.T);
    // ---------- ДБН ----------
    const Ry = steel.Ryn * 1e6 / (steel.norm === 'dbn' ? steel.gm : 1.025), Rs = 0.58 * Ry, gc = opt.gammaC || 1.0;
    const lam = Lcr / sec.i;
    const lamBar = lam * Math.sqrt(Ry / E);
    const phi = C.phiDBN(lamBar, opt.dbnType || 'b');
    const sN = f.N / sec.A, sM = My / sec.Wel + Mz / sec.Wel;
    const tau = V / sec.Av + T / sec.Wt;
    const sig = Math.abs(sN) + sM;
    res.dbn.Ry = Ry; res.dbn.lam = lam; res.dbn.lamBar = lamBar; res.dbn.phi = phi;
    res.dbn.strength = sig / (Ry * gc);
    res.dbn.shear = tau / (Rs * gc);
    res.dbn.eq = Math.sqrt(sig * sig + 3 * tau * tau) / (1.15 * Ry * gc); // ДБН: σef ≤ 1,15·Ry·γc
    const NcrE = Math.PI ** 2 * E * sec.Iy / (Lcr * Lcr);
    const Cm = opt.Cm != null ? opt.Cm : 0.9;
    const amp = Nc > 0 ? 1 / Math.max(1e-6, 1 - Nc / NcrE) : 1;
    res.dbn.stability = Nc > 0 ? Nc / (phi * sec.A * Ry * gc) + Cm * amp * (My + Mz) / (sec.Wel * Ry * gc) : 0;
    res.dbn.NcrE = NcrE;
    // ---------- EN 1993-1-1 ----------
    const fy = steel.Ryn * 1e6, g0 = opt.gammaM0 || 1.0, g1 = opt.gammaM1 || 1.0;
    const cl = C.sectionClass(sec, steel.Ryn);
    const Aef = cl.Aeff;
    const W = cl.cls <= 2 ? sec.Wpl : cl.cls === 3 ? sec.Wel : cl.Weff;
    const NRk = Aef * fy, MRk = W * fy;
    const lamEN = Math.sqrt(Aef * fy / NcrE);
    const chi = C.chiEN(lamEN, opt.curve || 'c');
    res.en.cls = cl.cls; res.en.ct = cl.ct; res.en.lam = lamEN; res.en.chi = chi;
    // міцність перерізу (6.2.1(7) — лінійна сума, консервативно)
    res.en.strength = Math.abs(f.N) / (Aef * fy / g0) + My / (MRk / g0) + Mz / (MRk / g0);
    // зсув: Vpl,Rd = Av·fy/√3/γM0, з урахуванням кручення (6.2.7(9)): τt = T/Wt
    const tauT = T / sec.Wt;
    const Vpl = sec.Av * fy / Math.sqrt(3) / g0;
    const VplT = (1 - tauT / (fy / Math.sqrt(3) / g0)) * Vpl;
    res.en.shear = V / Math.max(VplT, 1e-9);
    res.en.torsion = tauT / (fy / Math.sqrt(3) / g0);
    const sx = Math.abs(f.N) / Aef + My / sec.Wel + Mz / sec.Wel;
    const tx = V / sec.Av + tauT;
    res.en.eq = Math.sqrt(sx * sx + 3 * tx * tx) / (fy / g0); // (6.1)
    // стійкість (6.61), (6.62), додаток B; SHS не схильні до втрати стійкості плоскої форми згину (χLT = 1)
    if (Nc > 0) {
      const NbRd = chi * NRk / g1;
      const n = Nc / NbRd;
      let kyy, kzz, kyz, kzy;
      if (cl.cls <= 2) {
        kyy = Cm * Math.min(1 + (lamEN - 0.2) * n, 1 + 0.8 * n); kzz = kyy; kyz = 0.6 * kzz; kzy = 0.6 * kyy;
      } else {
        kyy = Cm * Math.min(1 + 0.6 * lamEN * n, 1 + 0.6 * n); kzz = kyy; kyz = kzz; kzy = 0.8 * kyy;
      }
      const u1 = n + kyy * My / (MRk / g1) + kyz * Mz / (MRk / g1);
      const u2 = n + kzy * My / (MRk / g1) + kzz * Mz / (MRk / g1);
      res.en.stability = Math.max(u1, u2);
      res.en.k = { kyy, kzz, kyz, kzy };
    } else res.en.stability = 0;
    res.dbn.max = Math.max(res.dbn.strength, res.dbn.shear, res.dbn.eq, res.dbn.stability);
    res.en.max = Math.max(res.en.strength, res.en.shear, res.en.eq, res.en.stability, res.en.torsion);
    res.Nc = Nc; res.Nt = Nt; res.My = My; res.Mz = Mz; res.V = V; res.T = T; res.Lcr = Lcr;
    return res;
  };

  /** Гранична гнучкість (ДБН В.2.6-198, табл. 30, 31 — спрощено). */
  C.lambdaLimit = function (kind, util) {
    const a = Math.max(0.5, Math.min(1, util || 1));
    if (kind === 'tension') return 400;
    if (kind === 'brace') return 200;
    if (kind === 'main') return 180 - 60 * a;
    return 210 - 60 * a;
  };

  SC.checks = C;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
