/* Розрахунок фундаментних (анкерних) болтів за «Пособием по проектированию анкерных болтов для крепления
 * строительных конструкций и оборудования (к СНиП 2.09.03)», ЦНИИпромзданий — розділ 3, формули (1)–(19), табл. 2–10, 14.
 * Посібник — методичний документ (не чинна норма України); застосовується як незалежна перевірка поряд з
 * EN 1993-1-8 / EN 1992-4 / ДБН В.2.6-198. Одиниці: Н, м, Па (таблиці — у МПа, мм, см², як у Посібнику).
 */
(function (SC) {
  'use strict';
  const PB = {};
  PB.src = 'Пособие по проектированию анкерных болтов (к СНиП 2.09.03), ЦНИИпромзданий';

  // табл. 3: R_ba, МПа — за маркою сталі й діапазоном діаметрів
  const RBA = {
    'ВСт3': [[30, 145], [56, 145], [80, 145], [100, 145], [140, 145]],
    '09Г2С': [[30, 185], [56, 180], [80, 175], [100, 170], [140, 170]],
    '10Г2С1': [[30, 190], [56, 180], [80, 170], [100, 170], [140, 165]],
  };
  PB.Rba = (steel, d) => { const t = RBA[steel] || RBA['ВСт3']; for (const [dm, r] of t) if (d <= dm) return r; return t[t.length - 1][1]; };
  // відповідність класів міцності болтів маркам сталі Посібника (п. 3.2 прим.: допускаються сталі з властивостями не нижче табличних)
  PB.steelOf = grade => /09Г2С/.test(grade) ? '09Г2С' : /10Г2С1/.test(grade) ? '10Г2С1' : /8\.8|10\.9/.test(grade) ? '09Г2С' : 'ВСт3';
  // табл. 4: типи болтів
  PB.types = {
    bent: { name: 'з відгином', H: 25, s: 6, c: 4, eta: 0.4, k: [1.9, 1.3] },
    plate: { name: 'з анкерною плитою (глухий)', H: 15, s: 8, c: 6, eta: 0.4, k: [1.9, 1.3] },
    removable: { name: 'знімний з анкерною плитою', H: 30, s: 10, c: 6, eta: 0.25, k: [1.5, 1.5] },
    straight: { name: 'прямий (у свердлованій свердловині)', H: 10, s: 5, c: 5, eta: 0.6, k: [2.5, 2.0] },
    conical: { name: 'конічний (розпірний)', H: 10, s: 8, c: 8, eta: 0.55, k: [2.3, 1.8] },
  };
  // табл. 5: масштабний фактор β
  PB.beta = d => d <= 12 ? 0.9 : d <= 16 ? 1.0 : d <= 24 ? 1.1 : d <= 36 ? 1.3 : d <= 48 ? 1.6 : d <= 72 ? 1.8 : d <= 90 ? 2.0 : d <= 125 ? 2.2 : 2.5;
  // табл. 6: γ за кількістю циклів (для ≥ 5·10⁶ у тексті Посібника нечітко; приклад 1 приймає γ = 1)
  PB.gammaCycles = n => n <= 0.05e6 ? 3.15 : n <= 0.2e6 ? 2.25 : n <= 0.8e6 ? 1.57 : n <= 2e6 ? 1.25 : 1.0;
  // табл. 7, 9: R_b, R_bt бетону, МПа
  const RB = { B10: [5.8, 0.61], 'B12.5': [7.3, 0.7], B15: [8.7, 0.8], B20: [11.5, 0.95], B25: [14.5, 1.1], B30: [17, 1.2] };
  // клас EN C f_ck/f_ck,cube → клас B (кубикова міцність); понад B30 — значення B30 (у запас)
  PB.classB = c => { const m = /C(\d+)\/(\d+)/.exec(c || ''); const cube = m ? +m[2] : 25; const ks = [['B10', 10], ['B12.5', 12.5], ['B15', 15], ['B20', 20], ['B25', 25], ['B30', 30]]; let k = 'B10'; for (const [n, v] of ks) if (cube >= v) k = n; return k; };
  PB.Rb = cls => RB[cls][0]; PB.Rbt = cls => RB[cls][1];
  // табл. 8: χ, м (для M_кр = F·χ)
  const CHI = [[10, 2e-3], [12, 2.4e-3], [16, 3.2e-3], [20, 4.4e-3], [24, 5.8e-3], [30, 7.5e-3], [36, 9e-3], [42, 1.1e-2], [48, 1.2e-2], [56, 1.4e-2], [64, 1.7e-2], [72, 1.9e-2], [80, 2.1e-2], [90, 2.3e-2], [100, 2.5e-2], [110, 2.8e-2], [125, 3.2e-2], [140, 3.5e-2]];
  PB.chi = d => (CHI.find(r => r[0] >= d) || CHI[CHI.length - 1])[1];
  // табл. 10: A_sa, см² (у Посібнику для М48 надруковано 19,72 см² — помилка: фактична площа по різьбі 14,7 см², ISO 898-1)
  PB.Asa = { 10: 0.571, 12: 0.842, 16: 1.57, 20: 2.45, 24: 3.52, 30: 5.60, 36: 8.26, 42: 11.2, 48: 14.7, 56: 20.29, 64: 26.75, 72: 34.58, 80: 43.44, 90: 55.91, 100: 69.95 };
  // табл. 14: допустимий крутний момент затягування конструктивних болтів, Н·м
  PB.Mmax = { 10: 12, 12: 24, 16: 60, 20: 100, 24: 250, 30: 550, 36: 950, 42: 1500, 48: 2300 };

  /** ξ_R за (8): ω = 0,85 − 0,008R_b; ξ_R = ω / (1 + R_ba/400·(1 − ω/1,1)), R_b, R_ba — МПа. */
  PB.xiR = (Rb, Rba) => { const w = 0.85 - 0.008 * Rb; return w / (1 + Rba / 400 * (1 - w / 1.1)); };

  /**
   * Зусилля в розтягнутому болті бази колони суцільного типу, формули (5)–(7):
   *  x = l_a − √(l_a² − 2(M + N·c)/(R_b·b_s)) [ф. (6) з N·e₀ = M], P = (R_b·b_s·x − N)/n.
   *  N > 0 — стиск, Н; M ≥ 0 — момент, Н·м; R_b — Па; l_a, c, b_s — м.
   */
  PB.solidBase = function ({ N, M, la, c, bs, Rb, n }) {
    const disc = la * la - 2 * (M + N * c) / (Rb * bs);
    if (disc < 0) return { ok: false, reason: 'l_a² < 2(M + Nc)/(R_b·b_s): бетону під плитою недостатньо' };
    const x = la - Math.sqrt(disc);
    const P = (Rb * bs * x - N) / n;
    return { ok: true, x, P: Math.max(0, P), Praw: P };
  };
  /** Формула (3): P = −N/n + M·y₁/Σy_i² (група болтів, вісь повороту — центр опорної поверхні). */
  PB.group = ({ N, M, y }) => { const y1 = Math.max(...y.map(Math.abs)); const s2 = y.reduce((a, v) => a + v * v, 0); return -N / y.length + M * y1 / s2; };

  /**
   * Перевірка анкерних болтів опорного вузла за Посібником для однієї реакції r (з МСЕ, у знаках опори).
   *  bp — параметри бази; conc — клас бетону фундаменту; opt: {dynamic, cycles, Hmin}.
   */
  PB.check = function (bp, r, conc, opt) {
    opt = opt || {};
    const d = bp.d, type = PB.types[bp.boltType || 'plate'], steel = PB.steelOf(bp.grade);
    const Rba = PB.Rba(steel, d) * 1e6, cls = PB.classB(conc), Rb = PB.Rb(cls) * 1e6;
    const Asa = (PB.Asa[d] || (SC.norms.boltAs[d] || 245) / 100) * 1e-4;
    const N = r[2]; // стиск у стійці (реакція вгору)
    const B = bp.plateB / 1000, Lp = bp.plateL / 1000, e = bp.edge / 1000;
    const nSide = Math.max(1, Math.round(bp.nAnchor / 2));
    const res = { steel, Rba, cls, Rb, Asa, type, d, N };
    // два напрямки згину: навколо X (M_x, плита розміром L уздовж Y) і навколо Y
    const dirs = [{ ax: 'x', M: Math.abs(r[3]), L: Lp, bs: B }, { ax: 'y', M: Math.abs(r[4]), L: B, bs: Lp }].map(o => {
      const c = o.L / 2 - e, la = o.L / 2 + c;
      const sb = PB.solidBase({ N, M: o.M, la, c, bs: o.bs, Rb, n: nSide });
      const xiR = PB.xiR(Rb / 1e6, Rba / 1e6);
      return Object.assign(o, sb, { c, la, xiR, xLim: xiR * la, xOk: sb.ok && sb.x <= xiR * la, Pgroup: PB.group({ N, M: o.M, y: [-c, -c, c, c].slice(0, Math.max(2, bp.nAnchor)) }) });
    });
    const gov = dirs.reduce((a, b) => ((b.ok ? b.P : Infinity) > (a.ok ? a.P : Infinity) ? b : a));
    res.dirs = dirs; res.gov = gov;
    const P = gov.ok ? gov.P : NaN;
    res.P = P;
    // (1) площа за міцністю
    const ko = opt.dynamic ? 1.35 : 1.05;
    res.ko = ko;
    res.AsaReq = ko * P / Rba;
    res.uStrength = res.AsaReq / Asa;
    // (2) витривалість — лише при динамічних навантаженнях (резонансне вихрове збудження)
    if (opt.dynamic) { res.beta = PB.beta(d); res.gammaN = PB.gammaCycles(opt.cycles || 5e6); res.AsaFat = 1.8 * type.eta * res.beta * P / (res.gammaN * Rba); res.uFatigue = res.AsaFat / Asa; }
    // п. 3.8, (18): попереднє затягування і крутний момент
    res.F = (opt.dynamic ? 1.1 : 0.75) * P;
    res.chi = PB.chi(d); res.Mkr = res.F * res.chi;
    res.Mmax = PB.Mmax[d] || null;
    // (17): зсув тертям від N і затягування, f = 0,25; n — болти з одного боку (стиснуті)
    const H = Math.hypot(r[0], r[1]);
    const Nmin = opt.Nmin != null ? opt.Nmin : N;
    res.H = H; res.Qf = 0.25 * (nSide * Asa * Rba / 4 + Math.max(0, Nmin));
    res.uShearFriction = H / res.Qf;
    // (12)–(14): зсув сприймають стрижні болтів (зсувонедопускне з'єднання не виконується)
    const nAll = bp.nAnchor;
    res.Qbolt = 0.4 * Asa * Rba * nAll; res.Pbolt = 0.6 * Asa * Rba * nAll;
    res.uShearBolt = Math.max(H / res.Qbolt, (P * nSide) / res.Pbolt);
    // (19): мінімальна глибина закладення H₀ = H·m₁·m₂
    const m1 = PB.Rbt('B12.5') / PB.Rbt(cls), m2 = Rba / (145e6);
    res.m1 = m1; res.m2 = m2; res.H0 = type.H * d / 1000 * m1 * m2;
    res.uDepth = res.H0 / (bp.hef / 1000);
    // табл. 4, п. 3.23: відстані
    res.sMin = type.s * d; res.cMin = Math.max(type.c * d, d <= 30 ? 100 : d <= 48 ? 150 : 200);
    return res;
  };

  /** Перевірка за всіма розрахунковими сполученнями для кожної опори: визначальна — за найбільшим U. */
  PB.run = function (R) {
    const pr = R.pr, bp = pr.base;
    if (bp.type === 'embed') return { applicable: false, reason: 'закладна деталь зі шпильками — Посібник не поширюється (EN 1992-4)' };
    const dynamic = !!(R.vortex && R.vortex.gov);
    let best = null;
    for (const s of R.supportRes) {
      for (const sv of R.solved) {
        const rr = sv.r.reactions.find(x => x.node === s.node.id); if (!rr) continue;
        const c = PB.check(bp, rr.r, pr.found.concrete, { dynamic, Nmin: sv.cb.favourable ? rr.r[2] : undefined });
        const u = Math.max(c.uStrength || 0, c.uFatigue || 0, Math.min(c.uShearFriction, c.uShearBolt), c.uDepth, c.gov.ok ? 0 : 9.99);
        if (!best || u > best.u) best = { u, c, node: s.node.id, combo: sv.cb.id + ': ' + sv.cb.name };
      }
    }
    return { applicable: true, dynamic, best };
  };

  /** Приклади з Додатка 2 Посібника — для перевірки ядра (ru: kN, m, kPa як у тексті). */
  PB.examples = function () {
    const out = [];
    // Приклад 1: A_sa = 1,35·50/1,45e5 = 4,6 см²; витривалість 1,8·0,4·1,3·50/(1·1,45e5) = 3,23 см²; H₀ = 25·0,03·0,875 = 0,66 м
    out.push(['Приклад 1: A_sa = k₀P/R_ba, см²', 1.35 * 50e3 / 145e6 * 1e4, 4.66]);
    out.push(['Приклад 1: витривалість A_sa = 1,8ηβP/(γR_ba), см²', 1.8 * 0.4 * PB.beta(30) * 50e3 / (1 * 145e6) * 1e4, 3.23]);
    out.push(['Приклад 1: H₀ = 25d·m₁·m₂, м', 25 * 0.03 * (PB.Rbt('B12.5') / PB.Rbt('B15')) * 1, 0.656]);
    // Приклад 2: F₁ = 1,3(60 − 10·0,25)/(4·0,25) = 74,75 кН; A_sa = (1,3·1,05·130 + 74,75)/(1,3·1,8e5) = 10,8 см²
    const F1 = 1.3 * (60 - 10 * 0.25) / (4 * 0.25);
    out.push(['Приклад 2: F₁ = k(Q − Nf)/(nf), кН', F1, 74.75]);
    out.push(['Приклад 2: A_sa = (k·k₀P + F₁)/(kR_ba), см²', (1.3 * 1.05 * 130 + F1) / (1.3 * 1.8e5) * 1e4, 10.78]);
    out.push(['Приклад 2: H₀ = 15d·m₁·m₂, м', 15 * 0.042 * 1 * (180 / 145), 0.782]);
    // Приклад 3: P = −100/8 + 1200·2/16,41 = 133,75 кН
    out.push(['Приклад 3: P = −N/n + My₁/Σy², кН', PB.group({ N: 100, M: 1200, y: [0, 0, 1.45, -1.45, 1.45, -1.45, 2, -2] }), 133.75]);
    // Приклад 5: x = 0,48 м; ξ_R = 0,706; P = 444 кН; Q ≤ 212,7 кН
    const sb = PB.solidBase({ N: 1200e3, M: 900e3, la: 0.9, c: 0.4, bs: 0.5, Rb: 8.7e6, n: 2 });
    out.push(['Приклад 5: x = l_a − √(l_a² − 2N(e₀+c)/(R_b b_s)), м', sb.x, 0.481]);
    out.push(['Приклад 5: ξ_R за (8)', PB.xiR(8.7, 145), 0.706]);
    out.push(['Приклад 5: P = (R_b b_s x − N)/n, кН', sb.P / 1e3, 446.4]);
    out.push(['Приклад 5: Q ≤ f(nA_saR_ba/4 + N), кН', 0.25 * (2 * 0.003458 * 1.45e5 / 4 + 600), 212.68]);
    return out;
  };

  SC.posobie = PB;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
