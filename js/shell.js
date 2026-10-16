/* Листова оболонка (ненесуче облицювання) і допоміжний каркас (ТЗ, 9; 2.3.2).
 * Панель листа між ребрами: прямокутна пластина a×b, защемлена по контуру (зварна до ребер), рівномірний тиск p.
 * σ_max = β·p·b²/t²;  w_max = α·p·b⁴/(E·t³) (Roark, табл. 11.4, ν = 0,3);  D = E·t³/(12(1−ν²)).
 * Ребро допоміжного каркаса: балка прогоном L_r між вузлами основного каркаса з вантажною шириною s: M = q·L²/8.
 */
(function (SC) {
  'use strict';

  const Sh = {};
  // a/b → β (напруження в середині довгої сторони), α (прогин у центрі) для защемленої пластини
  const RAT = [1, 1.2, 1.4, 1.6, 1.8, 2, 1e9];
  const BETA = [0.3078, 0.3834, 0.4356, 0.4680, 0.4872, 0.4974, 0.5];
  const ALPHA = [0.0138, 0.0188, 0.0226, 0.0251, 0.0267, 0.0277, 0.0284];
  Sh.meta = { src: 'Roark\'s Formulas for Stress and Strain, табл. 11.4 (випадок 8b — защемлена прямокутна пластина)', status: 'checked' };

  Sh.panel = function (a, b, t, p, E, fy, wLimRatio) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const r = hi / lo;
    const beta = SC.norms.interp(RAT, BETA, r), alpha = SC.norms.interp(RAT, ALPHA, r);
    const sig = beta * p * lo * lo / (t * t);
    const w = alpha * p * lo ** 4 / (E * t ** 3);
    const D = E * t ** 3 / (12 * (1 - 0.09));
    // прогин обмежено також товщиною листа (w ≤ t): межа застосовності теорії малих прогинів і видимих «хлопунів»
    const wLim = Math.min(lo / (wLimRatio || 100), t);
    return { a: hi, b: lo, r, beta, alpha, sig, w, D, wLim, uS: sig / fy, uW: w / wLim, u: Math.max(sig / fy, w / wLim) };
  };

  /**
   * Підбір кроку ребер для частини скульптури. p — розрахунковий місцевий тиск (Па), t — товщина листа (м),
   * mat — {E, fy}. Повертає крок s (квадратна панель), перевірку панелі та переріз ребра.
   */
  Sh.design = function (part, p, opts) {
    opts = opts || {};
    const t = (part.tShell || 2) / 1000;
    const rho = part.rhoShell || 7850;
    const mat = rho > 8000 ? { E: 1.1e11, fy: 200e6, name: 'мідь/бронза' } : rho < 3000 ? { E: 0.7e11, fy: 110e6, name: 'алюміній' } : { E: SC.norms.E, fy: 235e6, name: 'сталь' };
    const pTot = p + rho * 9.81 * t; // тиск + власна вага листа (консервативно складаються)
    let s = opts.ribStep ? opts.ribStep / 1000 : null;
    const sMax = (opts.ribStepMax || 600) / 1000;
    if (!s) { s = 0.1; for (let k = 0; k < 60; k++) { if (s + 0.025 > sMax + 1e-9) break; const tr = Sh.panel(s + 0.025, s + 0.025, t, pTot, mat.E, mat.fy, opts.wLim); if (tr.u > 1) break; s += 0.025; } }
    const panel = Sh.panel(s, s, t, pTot, mat.E, mat.fy, opts.wLim);
    // ребро: прогін L_r (відстань між точками кріплення до основного каркаса), вантажна ширина s
    const Lr = (opts.ribSpan || 800) / 1000;
    const q = pTot * s;
    const M = q * Lr * Lr / 8;
    const fyr = 235e6;
    const Wreq = M / fyr;
    const ribs = [[20, 4], [25, 4], [30, 4], [40, 4], [40, 5], [50, 5], [60, 5], [60, 6], [80, 6], [80, 8], [100, 8]]; // штаба h×t, мм
    let rib = null;
    for (const [h, tt] of ribs) { const W = (tt / 1000) * (h / 1000) ** 2 / 6; const I = (tt / 1000) * (h / 1000) ** 3 / 12; const w = 5 * q * Lr ** 4 / (384 * SC.norms.E * I); if (W >= Wreq && w <= Lr / 150) { rib = { h, t: tt, W, I, w, mass: h * tt * 1e-6 * 7850 }; break; } }
    if (!rib) rib = { h: 100, t: 10, W: 0.01 * 0.1 ** 2 / 6, I: 0.01 * 0.1 ** 3 / 12, w: 0, mass: 100 * 10e-6 * 7850, fail: true };
    const ribLenPerM2 = 2 / s;          // ортогональна сітка ребер
    const area = part.shellArea || 0;
    const ribMass = area * ribLenPerM2 * rib.mass;
    // кріплення листа до ребер: переривчастий шов / заклепки — зусилля на 1 м шва
    const qWeld = pTot * s / 2;
    return { mat, t, p, pTot, s, panel, Lr, q, M, rib, ribLenPerM2, ribLen: area * ribLenPerM2, ribMass, qWeld, u: Math.max(panel.u, rib.fail ? 1.5 : M / (rib.W * fyr)) };
  };

  SC.shell = Sh;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
