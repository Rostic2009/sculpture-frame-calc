/* Зварні шви (ТЗ, розділ WLD).
 * Кутові шви по контуру квадратної труби (кінці елементів у вузлах каркаса, приєднання до опорної пластини),
 * шви ребер жорсткості. Зусилля розкладаються на компоненти на одиницю довжини (q_n — уздовж осі елемента,
 * q_t — поперечні в площині шва, q_∥ — уздовж шва) і перевіряються в найнебезпечнішій точці (кут контуру).
 * Метод напрямків EN 1993-1-8 (4.5.3.2):  √(σ⊥² + 3(τ⊥² + τ∥²)) ≤ f_u/(β_w·γ_M2);  σ⊥ ≤ 0,9·f_u/γ_M2
 * ДБН В.2.6-198:  τ_f = q/(β_f·k_f) ≤ R_wf·γ_c (по металу шва);  τ_z = q/(β_z·k_f) ≤ R_wz·γ_c (по межі сплавлення)
 */
(function (SC) {
  'use strict';

  const W = {};

  W.electrodes = [
    { id: 'Е42 / Э42 (ручне)', Rwf: 180, fuw: 410, bf: 0.7, bz: 1.0 },
    { id: 'Е46 / Э46 (ручне)', Rwf: 200, fuw: 450, bf: 0.7, bz: 1.0 },
    { id: 'G3Si1 / Св-08Г2С (напівавтомат у CO₂)', Rwf: 215, fuw: 490, bf: 0.9, bz: 1.05 },
  ];
  W.meta = { src: 'ДБН В.2.6-198:2014 (табл. Г.2, р. 14.1); EN 1993-1-8, 4.5.3', status: 'verify' };

  /** Мінімальний катет за товщиною товстішого елемента (ДБН В.2.6-198, табл. 38 — для Ryn ≤ 430 МПа, ручне зварювання). */
  W.kfMin = function (tmax) {
    const t = [[4, 3], [5, 4], [10, 5], [16, 6], [22, 7], [32, 8], [40, 9], [80, 10]];
    for (const [lim, k] of t) if (tmax <= lim) return k;
    return 12;
  };

  /**
   * Шов по контуру квадратної труби b (м), катет kf (м). f — зусилля в місці приєднання (локальні осі елемента):
   * {N, Vy, Vz, T, My, Mz}. steel — основний метал {Run}. Повертає компоненти й коефіцієнти використання.
   */
  W.tubeContour = function (b, kf, f, steel, el, opt) {
    opt = opt || {};
    const gM2 = 1.25, gc = opt.gammaC || 1.0;
    const a = 0.7 * kf;                       // ефективна товщина горла (рівні катети: a = k/√2 ≈ 0,7k)
    const Lw = 4 * b;                         // суцільний шов по контуру — без зменшення на кратери
    const Iw = 2 * b * (b / 2) ** 2 + 2 * b ** 3 / 12; // м³ (на одиницю товщини)
    const qN = Math.abs(f.N) / Lw;            // Н/м
    const qMy = Math.abs(f.My) * (b / 2) / Iw, qMz = Math.abs(f.Mz) * (b / 2) / Iw;
    const qn = qN + qMy + qMz;                // у куті контуру — сумуються
    const qT = Math.abs(f.T) / (2 * b * b);   // потік зсуву від кручення (Бредт): q = T/(2A)
    // поперечні сили: шви, паралельні силі, працюють на поздовжній зсув (τ∥); перпендикулярні — на τ⊥ в площині
    const qVy = Math.abs(f.Vy) / (2 * b), qVz = Math.abs(f.Vz) / (2 * b);
    const walls = [
      { name: 'стінки ∥ y', qpar: qVy + qT, qt: qVz },
      { name: 'стінки ∥ z', qpar: qVz + qT, qt: qVy },
    ];
    let worst = null;
    for (const w of walls) {
      const sp = (qn + w.qt) / (a * Math.SQRT2), tp = sp, tpar = w.qpar / a;
      const fu = Math.min(steel.Run, el ? el.fuw : steel.Run) * 1e6;
      const bw = steel.Ryn >= 345 ? 0.9 : steel.Ryn >= 275 ? 0.85 : 0.8;
      const sEq = Math.sqrt(sp * sp + 3 * (tp * tp + tpar * tpar));
      const uEN = Math.max(sEq / (fu / (bw * gM2)), sp / (0.9 * fu / gM2));
      const q = Math.hypot(qn, w.qt, w.qpar);  // результуюче зусилля на одиницю довжини
      const Rwf = (el ? el.Rwf : 180) * 1e6, bf = el ? el.bf : 0.7, bz = el ? el.bz : 1.0;
      const Rwz = 0.45 * steel.Run * 1e6;
      const uDBN = Math.max(q / (bf * kf) / (Rwf * gc), q / (bz * kf) / (Rwz * gc));
      const r = { wall: w.name, qn, qt: w.qt, qpar: w.qpar, q, sp, tp, tpar, sEq, uEN, uDBN, u: Math.max(uEN, uDBN), FwRd: (fu / Math.sqrt(3)) / (bw * gM2) * a };
      if (!worst || r.u > worst.u) worst = r;
    }
    return Object.assign(worst, { a, Lw, Iw, kf, contributions: { N: qN, My: qMy, Mz: qMz, T: qT, Vy: qVy, Vz: qVz } });
  };

  /** Перевірка конструктивних обмежень катета (ДБН: k_f,min за табл. 38; k_f ≤ 1,2·t_min). */
  W.legLimits = function (kfmm, tmin, tmax) {
    const kmax = 1.2 * tmin;
    // якщо k_f,min за товстішим елементом перевищує 1,2·t тоншого — приймається k_f,min = 1,2·t (примітка до табл. 38)
    const kmin = Math.min(W.kfMin(tmax), Math.max(3, Math.floor(kmax + 1e-9)));
    return { kmin, kmax, ok: kfmm >= kmin - 1e-9 && kfmm <= kmax + 1e-9 };
  };

  /**
   * Усі шви каркаса: кінці кожного елемента в кожному вузлі (крім опорних — вони в опорному вузлі).
   * Зусилля беруться з усіх розв'язаних сполучень; для кожного шва — визначальне.
   */
  W.frame = function (R) {
    const pr = R.pr, out = [];
    const el = W.electrodes.find(e => e.id === pr.design.electrode) || W.electrodes[0];
    let n = 0;
    R.mdl.elems.forEach((e, k) => {
      const P = R.P, fe = P.els[k];
      for (const end of [0, 1]) {
        const node = P.model.nodes[end ? fe.nj : fe.ni];
        if (node.sup) continue; // шов до опорної пластини — у розрахунку опорного вузла
        const tOther0 = Math.max(...R.mdl.elems.filter(x => x !== e && (x.i === node.id || x.j === node.id)).map(x => x.sec.tmm), e.sec.tmm);
        const set = e.type === 'truss' ? pr.design.weldLegBrace : pr.design.weldLegFrame;
        // «авто»: мінімальний конструктивний катет; збільшується до 1,2·t, якщо міцності не вистачає
        const lim0 = W.legLimits(3, e.sec.tmm, tOther0);
        const legs = [];
        if (set === 'auto' || !set) { for (let k = Math.ceil(lim0.kmin - 1e-9); k <= Math.max(Math.floor(lim0.kmax + 1e-9), Math.ceil(lim0.kmin - 1e-9)); k++) legs.push(k); } else legs.push(+set);
        let kf = legs[0] / 1000;
        let best = null;
        for (const kTry of legs) {
          kf = kTry / 1000; best = null;
        for (const s of R.solved) {
          const f = s.forces[k][end ? s.forces[k].length - 1 : 0];
          const r = W.tubeContour(e.sec.b, kf, f, e.steel, el, { gammaC: pr.frame.gammaC });
          if (!best || r.u > best.u) best = Object.assign(r, { combo: s.cb.id + ': ' + s.cb.name, f });
        }
        if (R.seis) for (const S of R.seis.res) {
          const fs = R.seis.staticForces[k][end ? 4 : 0], fe2 = S.env[k][end ? 4 : 0];
          const f = { N: Math.abs(fs.N) + fe2.N, Vy: Math.abs(fs.Vy) + fe2.Vy, Vz: Math.abs(fs.Vz) + fe2.Vz, T: Math.abs(fs.T) + fe2.T, My: Math.abs(fs.My) + fe2.My, Mz: Math.abs(fs.Mz) + fe2.Mz };
          const r = W.tubeContour(e.sec.b, kf, f, e.steel, el, { gammaC: pr.frame.gammaC });
          if (!best || r.u > best.u) best = Object.assign(r, { combo: 'E' + S.dir, f });
        }
          if (best && best.u <= 1) break;
        }
        // товщина «приймаючого» елемента в вузлі — найбільша стінка серед елементів вузла
        const tOther = Math.max(...R.mdl.elems.filter(x => x !== e && (x.i === node.id || x.j === node.id)).map(x => x.sec.tmm), e.sec.tmm);
        const lim = W.legLimits(kf * 1000, e.sec.tmm, tOther);
        n++;
        out.push(Object.assign(best, { id: 'W-' + String(n).padStart(3, '0'), elem: e.id, group: e.group, node: node.id, sec: e.sec.name, type: 'кутовий по контуру', Lgeom: 4 * e.sec.b, lim, electrode: el.id }));
      }
    });
    return out;
  };

  SC.welds = W;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
