/* Сортамент квадратних гнутозварних труб і геометричні характеристики перерізу.
 * Характеристики обчислюються з урахуванням заокруглення кутів за формулами EN 10219-2 (додаток B):
 * зовнішній радіус ro = 2t (t ≤ 6 мм), 2,5t (6 < t ≤ 10 мм), 3t (t > 10 мм); ri = ro − t.
 * Формула ТЗ A = b² − (b − 2t)² (без заокруглень) завищує A та I; залишена лише для порівняння.
 */
(function (SC) {
  'use strict';

  const S = {};

  // Типорозміри (b, мм) і доступні товщини стінки (t, мм) — ДСТУ EN 10219-2 / ГОСТ 30245-2003
  S.catalog = [
    [20, [1.5, 2]], [25, [1.5, 2, 2.5, 3]], [30, [2, 2.5, 3]], [40, [2, 2.5, 3, 4]],
    [50, [2, 2.5, 3, 4, 5]], [60, [2, 2.5, 3, 4, 5, 6]], [70, [3, 4, 5, 6]],
    [80, [3, 4, 5, 6, 8]], [90, [3, 4, 5, 6]], [100, [3, 4, 5, 6, 8, 10]],
    [120, [4, 5, 6, 8, 10]], [140, [4, 5, 6, 8, 10]], [150, [4, 5, 6, 8, 10, 12]],
    [160, [4, 5, 6, 8, 10, 12]], [180, [5, 6, 8, 10, 12]], [200, [5, 6, 8, 10, 12]],
    [250, [6, 8, 10, 12]], [300, [8, 10, 12]],
  ];

  S.cornerRadius = function (t) {
    if (t <= 6) return 2 * t;
    if (t <= 10) return 2.5 * t;
    return 3 * t;
  };

  // Прямокутник B×H з заокругленими кутами радіуса r: A, I (відносно осі, паралельної B), Z (пластичний момент опору)
  function roundedRect(B, H, r) {
    const a = (1 - Math.PI / 4) * r * r;                 // площа «кутової» ділянки (квадрат − ¼ кола)
    const yb = r * (10 - 3 * Math.PI) / (12 - 3 * Math.PI); // відстань її ц.м. від зовнішньої грані
    const Iedge = r ** 4 * (1 - 5 * Math.PI / 16);       // момент інерції ділянки відносно зовнішньої грані
    const Ic = Iedge - a * yb * yb;
    const d = H / 2 - yb;
    const A = B * H - 4 * a;
    const I = B * H ** 3 / 12 - 4 * (Ic + a * d * d);
    const Z = B * H * H / 4 - 4 * a * d;                 // статичний момент половини × 2
    return { A, I, Z };
  }

  /** Характеристики квадратної труби b×t (мм) → SI (м, м², м⁴, м³). */
  S.shs = function (b, t, opts) {
    opts = opts || {};
    const ro = opts.ro != null ? opts.ro : S.cornerRadius(t);
    const ri = Math.max(ro - t, 0);
    const o = roundedRect(b, b, ro), i = roundedRect(b - 2 * t, b - 2 * t, ri);
    const A = o.A - i.A;           // мм²
    const I = o.I - i.I;           // мм⁴
    const Wel = I / (b / 2);       // мм³
    const Wpl = o.Z - i.Z;         // мм³
    // Кручення (EN 10219-2, B.2)
    const Rc = (ro + ri) / 2;
    const h = 2 * ((b - t) + (b - t)) - 2 * Rc * (4 - Math.PI);
    const Ah = (b - t) * (b - t) - Rc * Rc * (4 - Math.PI);
    const K = 2 * Ah * t / h;
    const It = t ** 3 * h / 3 + 2 * K * Ah; // мм⁴
    const Wt = It / (t + K / t);            // мм³
    const mm2 = 1e-6, mm4 = 1e-12, mm3 = 1e-9;
    return {
      name: `□${b}×${fmtT(t)}`, b: b / 1000, t: t / 1000, bmm: b, tmm: t, ro: ro / 1000,
      A: A * mm2, Iy: I * mm4, Iz: I * mm4, J: It * mm4, Wel: Wel * mm3, Wpl: Wpl * mm3, Wt: Wt * mm3,
      Am: Ah * mm2, // площа, обмежена серединною лінією (для τ = T / (2·Am·t))
      i: Math.sqrt(I / A) / 1000,
      mass: A * mm2 * SC.norms.rhoSteel, // кг/м
      perim: (4 * b - 2 * ro * (4 - Math.PI)) / 1000, // зовнішній периметр, м (фарбування)
      Av: A * mm2 / 2,
      // Наближення ТЗ без заокруглень — для довідки
      A_tz: (b * b - (b - 2 * t) ** 2) * mm2,
      I_tz: (b ** 4 - (b - 2 * t) ** 4) / 12 * mm4,
    };
  };

  function fmtT(t) { return Number.isInteger(t) ? String(t) : String(t).replace('.', ','); }

  S.list = function () {
    const out = [];
    for (const [b, ts] of S.catalog) for (const t of ts) out.push(S.shs(b, t));
    return out;
  };

  S.byName = function (name) {
    const m = /(\d+)[×x](\d+(?:[.,]\d+)?)/.exec(name || '');
    if (!m) return null;
    return S.shs(parseFloat(m[1]), parseFloat(m[2].replace(',', '.')));
  };

  // Жорстка вставка (для моделювання жорсткого зв'язку оболонки/вузла)
  S.rigid = function (ref) {
    const r = ref || S.shs(200, 10);
    return { name: 'жорстка вставка', rigid: true, A: r.A * 100, Iy: r.Iy * 100, Iz: r.Iz * 100, J: r.J * 100,
      Wel: r.Wel * 100, Wpl: r.Wpl * 100, mass: 0, b: r.b, t: r.t, perim: 0 };
  };

  SC.sections = S;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
