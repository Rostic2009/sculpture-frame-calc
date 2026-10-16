/* Опорний вузол (пластина, шви, анкери) і фундамент.
 * Розподіл зусиль: жорстка пластина/плита на односторонніх пружинах (стиск — бетон/ґрунт, розтяг — лише анкери);
 * рівновага з можливим відривом розв'язується ітераційно за активними множинами (Ньютон для кусково-лінійної задачі).
 */
(function (SC) {
  'use strict';

  const B = {};

  /**
   * Жорстка плита: точки опирання {x,y,A,k}(стиск), анкери {x,y,k}(розтяг).
   * Діючі на плиту: Fz (вгору +), Mx, My (Н·м). Невідомі: w, θx, θy; δ(x,y) = w + θx·y − θy·x.
   * Повертає контакт і зусилля в анкерах (розтяг +).
   */
  B.rigidPlate = function (cells, anchors, Fz, Mx, My) {
    let w = 0, tx = 0, ty = 0;
    const st = () => ({ c: cells.map(c => w + tx * c.y - ty * c.x < 0), a: anchors.map(a => w + tx * a.y - ty * a.x > 0) });
    let act = { c: cells.map(() => true), a: anchors.map(() => false) };
    for (let it = 0; it < 200; it++) {
      // K·[w,tx,ty] = −[Fz, Mx, My]  (реакції пружин: Rz = −k·δ, моменти Rz·y, −Rz·x)
      const K = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      const addS = (x, y, k) => { const v = [1, y, -x]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) K[i][j] += k * v[i] * v[j]; };
      cells.forEach((c, i) => { if (act.c[i]) addS(c.x, c.y, c.k); });
      anchors.forEach((a, i) => { if (act.a[i]) addS(a.x, a.y, a.k); });
      // м'яка регуляризація, щоб уникнути виродження при малій кількості активних точок
      const tr = K[0][0] + K[1][1] + K[2][2] + 1;
      for (let i = 0; i < 3; i++) K[i][i] += 1e-9 * tr;
      // рівновага: зовнішні + Σ(−k·δ)·[1, y, −x] = 0  →  Σk·δ·[1, y, −x] = [Fz, Mx, My]
      const sol = solve3(K, [Fz, Mx, My]);
      w = sol[0]; tx = sol[1]; ty = sol[2];
      const nw = st();
      let same = true;
      for (let i = 0; i < cells.length; i++) if (nw.c[i] !== act.c[i]) { same = false; break; }
      if (same) for (let i = 0; i < anchors.length; i++) if (nw.a[i] !== act.a[i]) { same = false; break; }
      act = nw;
      if (same) break;
      if (!act.c.some(Boolean) && !act.a.some(Boolean)) return { ok: false, reason: 'немає активних точок опирання (відрив)' };
    }
    // знак: розв'язок w>0 — підйом. Сили на плиту від пружин = −k·δ·(напрям); бетон стискається при δ<0
    const cont = cells.map(c => { const d = w + tx * c.y - ty * c.x; return d < 0 ? -c.k * d / c.A : 0; }); // тиск, Па
    const T = anchors.map(a => { const d = w + tx * a.y - ty * a.x; return d > 0 ? a.k * d : 0; });
    // поле тиску лінійне — максимум у кутових точках комірок (c.h — половина розміру комірки)
    let pEdge = 0;
    cells.forEach((c, i) => { if (!(cont[i] > 0)) return; const h = c.h || 0; for (const sx of [-h, h]) for (const sy of [-h, h]) { const d = w + tx * (c.y + sy) - ty * (c.x + sx); if (d < 0) pEdge = Math.max(pEdge, -c.k * d / c.A); } });
    const area = cells.reduce((s, c, i) => s + (cont[i] > 0 ? c.A : 0), 0);
    const Atot = cells.reduce((s, c) => s + c.A, 0);
    return { ok: true, w, tx, ty, p: cont, T, pmax: Math.max(pEdge, ...cont), contactFrac: area / Atot, Ac: area };
  };
  function solve3(A, b) {
    const M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
    }
    return [0, 1, 2].map(i => M[i][3] / M[i][i]);
  }

  /** Розташування анкерів на пластині (мм, центр пластини — 0,0). */
  B.anchorLayout = function (bp) {
    const x = bp.plateB / 2 - bp.edge, y = bp.plateL / 2 - bp.edge;
    const pts = [[-x, -y], [x, -y], [x, y], [-x, y]];
    if (bp.nAnchor >= 6) pts.push([0, -y], [0, y]);
    if (bp.nAnchor >= 8) pts.push([-x, 0], [x, 0]);
    return pts;
  };

  /**
   * Розрахунок опорного вузла для одного сполучення.
   * r — реакція опори (дія опори на каркас): [Rx,Ry,Rz,Mx,My,Mz] (Н, Н·м); sec — переріз стійки; steelPlate — сталь пластини.
   */
  /** Розташування ребер жорсткості: лінії від граней труби до країв пластини (м). */
  B.ribLines = function (bp, bc) {
    const Bp = bp.plateB / 1000, Lp = bp.plateL / 1000, h = bc / 2, n = bp.nRibs || 0;
    const L = [];
    if (n >= 4) L.push([[h, 0], [Bp / 2, 0]], [[-h, 0], [-Bp / 2, 0]], [[0, h], [0, Lp / 2]], [[0, -h], [0, -Lp / 2]]);
    if (n >= 8) for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const t = Math.min(Bp, Lp) / 2; L.push([[sx * h, sy * h], [sx * t, sy * t]]); }
    return L;
  };
  function distSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
  }

  /** Розрахунковий опір бетону під пластиною f_jd = β_j·α·f_cd, α = √(A_c1/A_c0) ≤ 3 (EN 1993-1-8, 6.2.5; EN 1992-1-1, 6.7). */
  B.bearingStrength = function (bp, conc, opts) {
    const Bp = bp.plateB / 1000, Lp = bp.plateL / 1000;
    const pedB = opts.pedB || 1.4, pedL = opts.pedL || 1.4, hped = opts.pedH || 0.6;
    const px = Math.abs(opts.px || 0), py = Math.abs(opts.py || 0);
    // розподільча площа: у межах підколонника, ≤ 3·b і ≤ b + h (симетрично відносно пластини)
    const room = (half, off, b) => 2 * Math.min(half - off, b / 2 + hped / 2, 1.5 * b);
    const b1 = Math.max(Bp, room(pedB / 2, px, Bp)), d1 = Math.max(Lp, room(pedL / 2, py, Lp));
    const alpha = bp.alphaBearing === 'auto' || bp.alphaBearing == null ? Math.min(3, Math.sqrt(b1 * d1 / (Bp * Lp))) : Math.min(3, +bp.alphaBearing);
    const fcd = conc.fck * 1e6 / 1.5;
    return { alpha, fcd, fjd: (2 / 3) * alpha * fcd, b1, d1 };
  };

  /**
   * Опорний вузол для одного сполучення: стійка → шов → пластина (± ребра) → анкери (болти або закладна деталь зі шпильками) → бетон.
   * r — реакція опори (дія опори на каркас): [Rx,Ry,Rz,Mx,My,Mz].
   */
  B.baseNode = function (bp, r, sec, steelPlate, opts) {
    const N = SC.norms; opts = opts || {};
    const conc = N.concretes.find(c => c.id === bp.concrete) || N.concretes[2];
    const embed = bp.type === 'embed';
    const bolt = embed ? { id: 'шпилька S235J2+C450', fyb: 350, fub: 450 } : (N.boltGrades.find(b => b.id === bp.grade) || N.boltGrades[1]);
    const As = embed ? Math.PI * (bp.d / 1000) ** 2 / 4 : (N.boltAs[bp.d] || 353) * 1e-6;
    const fy = steelPlate.Ryn * 1e6;
    const gM0 = 1.0, gM2 = 1.25;
    const bs = B.bearingStrength(bp, conc, opts);
    const fjd = bs.fjd;
    const tp = bp.tp / 1000, bc = sec.b, Bp = bp.plateB / 1000, Lp = bp.plateL / 1000;
    const c = tp * Math.sqrt(fy / (3 * fjd * gM0));                 // EN 1993-1-8 (6.5)
    const ribs = B.ribLines(bp, bc);
    const Fz = -r[2], Mx = -r[3], My = -r[4], Hx = -r[0], Hy = -r[1], Mz = -r[5];
    const n = 44, cells = [];
    const Ec = conc.Ecm * 1e9, hw = bc / 2;
    let Aeff = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -Bp / 2 + (i + 0.5) * Bp / n, y = -Lp / 2 + (j + 0.5) * Lp / n;
      const dx = Math.abs(x) - hw, dy = Math.abs(y) - hw;
      let dist = (dx > 0 || dy > 0) ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.min(-dx, -dy);
      for (const L of ribs) dist = Math.min(dist, distSeg(x, y, L[0], L[1]) - (bp.tr || 10) / 2000);
      if (dist <= c + tp / 2) { const A = Bp * Lp / (n * n); cells.push({ x, y, A, h: Math.min(Bp, Lp) / n / 2 }); Aeff += A; }
    }
    const kc = Ec / (1.275 * Math.sqrt(Aeff));
    cells.forEach(p => { p.k = kc * p.A; });
    const lay = B.anchorLayout(bp).map(([x, y]) => ({ x: x / 1000, y: y / 1000 }));
    const Lb = embed ? (bp.hef / 1000) * 0.5 : Math.min(8 * bp.d, bp.hef) / 1000 + 0.03 + tp; // вільна довжина (EN 1993-1-8, 6.2.6.12)
    const ka = N.E * As / Lb;
    lay.forEach(a => { a.k = ka; });
    const sol = B.rigidPlate(cells, lay, Fz, Mx, My);
    const out = { type: embed ? "закладна деталь" : "анкерні болти", c, fjd, alpha: bs.alpha, fcd: bs.fcd, Aeff, Lb, kc, ka, sol, anchors: lay, ribLines: ribs, bolt, As };
    if (!sol.ok) { out.fail = sol.reason; out.max = 99; return out; }
    out.sigmaMax = sol.pmax;
    out.bearing = sol.pmax / fjd;
    // --- зусилля в кожному анкері: розтяг (з моделі контакту) і зріз (зсув + кручення відносно центру групи)
    const H = Math.hypot(Hx, Hy);
    out.Tsum = sol.T.reduce((s, v) => s + v, 0);
    const Nc = Math.max(0, -Fz + out.Tsum);
    const shearMode = bp.shear || 'anchors';
    const FfRd = (shearMode === 'friction' || shearMode === 'lug') ? 0 : 0;
    let lugTakes = 0, frictionTakes = 0;
    if (shearMode === 'friction') frictionTakes = Math.min(H, (bp.cf || 0.2) * Nc);
    if (shearMode === 'lug') lugTakes = H;
    const Hrest = Math.max(0, H - frictionTakes - lugTakes);
    const cx0 = lay.reduce((s, a) => s + a.x, 0) / lay.length, cy0 = lay.reduce((s, a) => s + a.y, 0) / lay.length;
    const Ip = lay.reduce((s, a) => s + (a.x - cx0) ** 2 + (a.y - cy0) ** 2, 0);
    const hx = H > 0 ? Hx / H : 0, hy = H > 0 ? Hy / H : 0;
    out.perAnchor = lay.map((a, i) => {
      const vx = Hrest * hx / lay.length - Mz * (a.y - cy0) / (Ip || 1);
      const vy = Hrest * hy / lay.length + Mz * (a.x - cx0) / (Ip || 1);
      return { i: i + 1, x: a.x, y: a.y, N: sol.T[i], Vx: vx, Vy: vy, V: Math.hypot(vx, vy) };
    });
    const Tmax = Math.max(0, ...sol.T); out.Tmax = Tmax;
    const Vmax = Math.max(0, ...out.perAnchor.map(a => a.V));
    out.Vmax = Vmax; out.H = H; out.frictionTakes = frictionTakes; out.lugTakes = lugTakes; out.FfRd = frictionTakes;
    void FfRd;
    // --- сталь анкера (EN 1993-1-8 табл. 3.4, 6.2.2(7); для шпильок — EN 1992-4: N_Rk,s = A_s·f_uk, γ_Ms = 1,5)
    const FtRd = embed ? As * bolt.fub * 1e6 / 1.5 : 0.9 * bolt.fub * 1e6 * As / gM2;
    const FvbRd = embed ? 0.6 * As * bolt.fub * 1e6 / 1.25 : (0.44 - 0.0003 * bolt.fyb) * bolt.fub * 1e6 * As / gM2;
    out.FtRd = FtRd; out.FvbRd = FvbRd;
    out.anchorT = Tmax / FtRd;
    out.anchorSteel = Math.max(...out.perAnchor.map(a => embed ? (a.N / FtRd) ** 2 + (a.V / FvbRd) ** 2 : a.V / FvbRd + a.N / (1.4 * FtRd)), 0);
    // --- пластина над розтягнутим анкером (Т-подібна ділянка). m — до найближчої опори (стінка труби або ребро)
    const e = bp.edge / 1000;
    const aw = 0.7 * (bp.weldLeg || 6) / 1000;
    let mx = Infinity;
    for (const a of lay) {
      const dx = Math.abs(a.x) - hw, dy = Math.abs(a.y) - hw;
      let d = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      for (const L of ribs) d = Math.min(d, distSeg(a.x, a.y, L[0], L[1]));
      mx = Math.min(mx, d);
    }
    mx = Math.max(0.005, mx - 0.8 * Math.SQRT2 * aw);
    const leff = Math.min(2 * Math.PI * mx, Math.PI * mx + 2 * e, 4 * mx + 1.25 * e);
    const MplRd = 0.25 * leff * tp * tp * fy / gM0;
    const FT12 = 2 * MplRd / mx;
    out.plateT = embed ? 0 : (Tmax > 0 ? Tmax / FT12 : 0);
    out.leff = leff; out.m = mx; out.FT12 = FT12;
    // пластина в зоні стиску: виступ за ефективну зону c не перевищує консолі, яку забезпечує t_p (EN 6.2.5) — перевіряємо виліт
    // зона стиску (EN 1993-1-8, 6.2.5): тиск діє лише в смузі c від стінки; m = p·c²/2 ≤ t_p²·f_y/(6·γ_M0)
    out.plateC = sol.pmax * c * c / 2 / (tp * tp * fy / 6 / gM0);
    // --- шов труба–пластина
    const el = SC.welds.electrodes.find(x => x.id === opts.electrode) || SC.welds.electrodes[0];
    const wf = SC.welds.tubeContour(bc, (bp.weldLeg || 6) / 1000, { N: Fz, Vy: Hy, Vz: Hx, T: Mz, My: Mx, Mz: My }, steelPlate, el, {});
    out.weldDetail = wf; out.weld = wf.u; out.weldA = wf.a;
    out.weldLim = SC.welds.legLimits(bp.weldLeg || 6, Math.min(sec.tmm, bp.tp), Math.max(sec.tmm, bp.tp));
    // --- ребра жорсткості
    if (ribs.length) out.ribs = B.ribCheck(bp, sec, steelPlate, sol, cells, lay, el);
    // --- анкерні плити / шайби на кінці закладного болта
    out.washer = B.washerCheck(bp, Tmax, conc, steelPlate);
    // --- зсувний упор
    if (shearMode === 'lug') out.lug = B.lugCheck(bp, H, conc, steelPlate, el, bs);
    // --- бетон (EN 1992-4)
    const conc4 = B.anchorConcrete(bp, lay, sol.T, Hrest, conc, opts);
    out.concrete = conc4;
    // --- жорсткість бази (дотична): ΔM = 1 кН·м навколо поточного стану
    out.stiff = B.baseStiffness(cells, lay, Fz, Mx, My);
    out.max = Math.max(out.bearing, out.anchorSteel, out.anchorT, out.plateT, out.plateC, out.weld, conc4.max, out.washer.max, out.ribs ? out.ribs.max : 0, out.lug ? out.lug.max : 0);
    return out;
  };

  /** Дотична обертальна жорсткість бази S_j = ΔM/Δθ, Н·м/рад (за моделлю контакту пластини та анкерів). */
  B.baseStiffness = function (cells, lay, Fz, Mx, My) {
    const d = 1000;
    const s0 = B.rigidPlate(cells, lay, Fz, Mx, My);
    const sx = B.rigidPlate(cells, lay, Fz, Mx + d, My);
    const sy = B.rigidPlate(cells, lay, Fz, Mx, My + d);
    const kx = sx.ok && s0.ok ? d / Math.max(1e-15, Math.abs(sx.tx - s0.tx)) : 0;
    const ky = sy.ok && s0.ok ? d / Math.max(1e-15, Math.abs(sy.ty - s0.ty)) : 0;
    let kz = 0; cells.forEach((c, i) => { if (s0.p[i] > 0) kz += c.k; });
    return { kx, ky, kz };
  };

  /** Ребра жорсткості: консоль від грані труби; навантаження — тиск на вантажну площу або зусилля анкера. */
  B.ribCheck = function (bp, sec, steel, sol, cells, lay, el) {
    const tr = (bp.tr || 10) / 1000, hr = (bp.hr || 120) / 1000, tp = bp.tp / 1000;
    const fy = steel.Ryn * 1e6, eps = Math.sqrt(235 / steel.Ryn);
    const Bp = bp.plateB / 1000, bc = sec.b;
    const cr = (Bp - bc) / 2;                          // виліт ребра
    const ribs = B.ribLines(bp, bc);
    const nR = ribs.length;
    // вантажна площа одного ребра: ділянка ефективної зони, найближча до ребра; тиск — з моделі
    const Fp = new Array(nR).fill(0), Mp = new Array(nR).fill(0);
    cells.forEach((c, i) => {
      const p = sol.p[i]; if (!(p > 0)) return;
      let best = -1, bd = Infinity;
      ribs.forEach((L, k) => { const d = distSeg(c.x, c.y, L[0], L[1]); if (d < bd) { bd = d; best = k; } });
      const dx = Math.abs(c.x) - bc / 2, dy = Math.abs(c.y) - bc / 2;
      const dWall = (dx > 0 || dy > 0) ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : 0;
      if (best >= 0 && bd < dWall) { Fp[best] += p * c.A; Mp[best] += p * c.A * dWall; }
    });
    lay.forEach((a, i) => {
      const T = sol.T[i]; if (!(T > 0)) return;
      let best = -1, bd = Infinity;
      ribs.forEach((L, k) => { const d = distSeg(a.x, a.y, L[0], L[1]); if (d < bd) { bd = d; best = k; } });
      const dx = Math.abs(a.x) - bc / 2, dy = Math.abs(a.y) - bc / 2;
      const lever = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      Fp[best] += T / 2; Mp[best] += T / 2 * lever; // анкер між двома опорами — половина на ребро
    });
    const F = Math.max(...Fp), M = Math.max(...Mp);
    // переріз: ребро tr×hr + ефективна ділянка пластини b_eff = min(15·ε·t_p·2 + tr, ...)
    const beff = Math.min(2 * 15 * eps * tp + tr, Bp / 2);
    const A1 = tr * hr, A2 = beff * tp;
    const y1 = tp + hr / 2, y2 = tp / 2;
    const yc = (A1 * y1 + A2 * y2) / (A1 + A2);
    const I = tr * hr ** 3 / 12 + A1 * (y1 - yc) ** 2 + beff * tp ** 3 / 12 + A2 * (y2 - yc) ** 2;
    const Wtop = I / (tp + hr - yc);
    const sig = M / Wtop, tau = F / (hr * tr);
    const out = { nR, cr, F, M, beff, I, Wtop, sig, tau };
    out.strength = Math.sqrt(sig * sig + 3 * tau * tau) / (fy / 1.0);
    out.local = (hr / tr) / (14 * eps);            // виступна стінка класу 3: c/t ≤ 14ε
    // шви: ребро–труба (2 шви довжиною hr − 2k), ребро–пластина (2 шви довжиною cr − 2k)
    const k = (bp.ribWeldLeg || 6) / 1000, a = 0.7 * k;
    const Lv = Math.max(0.01, hr - 2 * k), Lh = Math.max(0.01, cr - 2 * k);
    // вертикальний шов: зсув F і момент M (лінійний розподіл по висоті)
    const qV = F / (2 * Lv), qM = M / (2 * Lv * Lv / 6);
    const fu = Math.min(steel.Run, el.fuw) * 1e6, bw = steel.Ryn >= 345 ? 0.9 : steel.Ryn >= 275 ? 0.85 : 0.8;
    const uv = Math.sqrt(3 * (qV / a) ** 2 + 2 * (qM / (a * Math.SQRT2)) ** 2 * 2) / (fu / (bw * 1.25));
    // горизонтальний шов: потік зсуву q = V·S/I
    const S = A2 * Math.abs(yc - y2);
    const qh = F * S / I / 2;
    const uh = Math.sqrt(3 * (qh / a) ** 2) / (fu / (bw * 1.25));
    out.weldV = uv; out.weldH = uh; out.k = k;
    out.max = Math.max(out.strength, out.local, uv, uh);
    return out;
  };

  /** Анкерна плита / шайба на кінці закладного болта (ТЗ: «Вимоги до анкерних плит і шайб»). */
  B.washerCheck = function (bp, Tmax, conc, steel) {
    const d = bp.d / 1000, dw = (bp.dh || 2.5 * bp.d) / 1000, tw = (bp.tw || Math.max(8, bp.d * 0.4)) / 1000;
    const Abrg = Math.PI / 4 * (dw * dw - d * d);
    const sig = Tmax / Abrg;
    const fcd = conc.fck * 1e6 / 1.5;
    // місцеве стискання (EN 1992-1-1, 6.7): F_Rdu = A_c0·f_cd·√(A_c1/A_c0) ≤ 3·f_cd·A_c0
    const bearing = sig / (3 * fcd);
    // згин кільцевої пластини: консоль від гайки (s ≈ 1,7d) до краю шайби, на 1 м довжини кола
    const sNut = 1.7 * d;
    const cant = Math.max(0, (dw - sNut) / 2);
    const m = sig * cant * cant / 2;
    const bend = m / (tw * tw / 4 * steel.Ryn * 1e6);
    return { dw, tw, Abrg, sig, bearing, bend, max: Math.max(bearing, bend) };
  };

  /** Зсувний упор (відрізок труби/двотавра під пластиною): зминання бетону, згин упору, шви. */
  B.lugCheck = function (bp, H, conc, steel, el, bs) {
    const bl = (bp.lugB || 100) / 1000, hl = (bp.lugH || 80) / 1000, tl = (bp.lugT || 10) / 1000;
    const grout = 0.03;
    const sig = H / (bl * Math.max(0.01, hl - grout));
    const bearing = sig / bs.fjd;
    const M = H * (grout + (hl - grout) / 2);
    const W = bl * tl * tl / 6;
    const bend = M / W / (steel.Ryn * 1e6);
    const k = (bp.weldLeg || 6) / 1000, a = 0.7 * k;
    const qn = M / (bl * tl) / 1, qv = H / (2 * bl);
    const fu = Math.min(steel.Run, el.fuw) * 1e6;
    const weld = Math.sqrt(2 * (qn / 2 / a) ** 2 + 3 * (qv / a) ** 2) / (fu / (0.8 * 1.25));
    return { bearing, bend, weld, max: Math.max(bearing, bend, weld) };
  };

  /**
   * Бетонні механізми руйнування анкерної групи (EN 1992-4). Розміри — мм, сили — Н.
   * Розтяг: бетонний конус (або додаткове армування замість конуса), вирив, розколювання, боковий викол.
   * Зсув: крайове сколювання, виколювання (pry-out). Взаємодія: (β_N)^1,5 + (β_V)^1,5 ≤ 1.
   */
  B.anchorConcrete = function (bp, lay, T, V, conc, opts) {
    const fck = conc.fck, hef = bp.hef, d = bp.d;
    const cracked = bp.cracked !== false;
    const gMc = 1.5;
    const res = {};
    const pedB = (opts.pedB || 1.4) * 1000, pedL = (opts.pedL || 1.4) * 1000, hped = (opts.pedH || 0.6) * 1000 + (opts.slabH || 0) * 1000;
    const xs = lay.map(a => a.x * 1000), ys = lay.map(a => a.y * 1000);
    const px = Math.abs((opts.px || 0) * 1000), py = Math.abs((opts.py || 0) * 1000);
    const cx = pedB / 2 - px - Math.max(...xs), cy = pedL / 2 - py - Math.max(...ys);
    const cmin = Math.min(cx, cy);
    res.cx = cx; res.cy = cy; res.cmin = cmin; res.h = hped;
    // конструктивні обмеження (EN 1992-4, 7.1; для закладних анкерів з головкою)
    const smin = Math.min(...lay.flatMap((a, i) => lay.filter((b, j) => j > i).map(b => Math.hypot(a.x - b.x, a.y - b.y) * 1000)));
    res.smin = smin; res.geomOk = smin >= Math.max(50, 4 * d) && cmin >= Math.max(50, 4 * d) && hped >= hef + 30;
    const tens = lay.map((a, i) => ({ x: a.x * 1000, y: a.y * 1000, T: T[i] })).filter(a => a.T > 1e-6);
    const NEg = tens.reduce((s, a) => s + a.T, 0);
    res.NEg = NEg;
    const k1 = cracked ? 8.9 : 12.7;
    const N0 = k1 * Math.sqrt(fck) * Math.pow(hef, 1.5);
    const scr = 3 * hef, ccr = 1.5 * hef;
    let NRkc = 0, psi = {};
    if (tens.length) {
      const minx = Math.min(...tens.map(a => a.x)), maxx = Math.max(...tens.map(a => a.x));
      const miny = Math.min(...tens.map(a => a.y)), maxy = Math.max(...tens.map(a => a.y));
      const ext = (lo, hi, half) => Math.min(ccr, half + lo) + (hi - lo) + Math.min(ccr, half - hi);
      const Ac = ext(minx, maxx, pedB / 2 - px) * ext(miny, maxy, pedL / 2 - py);
      const A0 = scr * scr;
      const psiS = Math.min(1, 0.7 + 0.3 * cmin / ccr);
      const gx = tens.reduce((s, a) => s + a.T * a.x, 0) / NEg, gy = tens.reduce((s, a) => s + a.T * a.y, 0) / NEg;
      const cxg = (minx + maxx) / 2, cyg = (miny + maxy) / 2;
      const psiEc = 1 / (1 + 2 * Math.abs(gx - cxg) / scr) / (1 + 2 * Math.abs(gy - cyg) / scr);
      const psiRe = hef >= 100 ? 1 : 0.5 + hef / 200;
      NRkc = N0 * (Ac / A0) * psiS * psiEc * psiRe;
      psi = { Ac, A0, psiS, psiEc, psiRe };
      // розколювання (7.2.1.7): ψ_h,sp = (h/h_min)^(2/3) ≤ max(1; (2h_ef/h_min)^(2/3)), h_min = 2h_ef; c_cr,sp = 1,5h_ef (прийнято)
      const spNeeded = !(cmin >= 1.5 * ccr && hped >= 2 * hef) && !(bp.splitReinf);
      const psiH = Math.min(Math.pow(hped / (2 * hef), 2 / 3), 1);
      res.NRksp = N0 * (Ac / A0) * psiS * psiEc * psiRe * psiH;
      res.split = spNeeded ? NEg / (res.NRksp / gMc) : 0;
      res.splitNeeded = spNeeded;
    } else { res.split = 0; }
    res.N0 = N0; res.NRkc = NRkc; res.psi = psi;
    res.cone = tens.length ? NEg / (NRkc / gMc) : 0;
    // додаткове армування анкерів (EN 1992-4, 7.2.1.9): замінює перевірку конуса перевіркою арматури та її анкерування
    const ar = bp.anchorReinf;
    if (ar && ar.on && tens.length) {
      const ds = Math.min(ar.ds || 12, 16), nb = (ar.nPerAnchor || 2) * tens.length * 2; // дві гілки хомута
      const fyk = 500, Asb = Math.PI * ds * ds / 4;
      const NRdre = nb * Asb * fyk / 1.15;
      const fctd = 1.0 * 0.7 * conc.fctm / 1.5;
      const fbd = 2.25 * 1.0 * 1.0 * fctd;
      const l1 = Math.max(0, hef - (ar.cover || 50) - (ar.dist || 0.5 * hef) / 1.5);
      const alpha = ar.hooked ? 0.7 : 1.0;
      const l1min = ar.hooked ? 4 * ds : 10 * ds;
      const NRda = nb * l1 * Math.PI * ds * fbd / alpha;
      res.reinf = { ds, nb, NRdre, NRda, l1, l1min, ok: l1 >= l1min && (ar.dist || 0.5 * hef) <= 0.75 * hef };
      res.reinfU = Math.max(NEg / NRdre, NEg / NRda, res.reinf.ok ? 0 : 1.01);
      res.coneEff = res.reinfU;
    } else res.coneEff = res.cone;
    // вирив анкера з головкою: N_Rk,p = k₂·A_h·f_ck
    const Ah = Math.PI / 4 * (bp.dh * bp.dh - d * d);
    const NRkp = (cracked ? 7.5 : 10.5) * Ah * fck;
    const Tmax = Math.max(0, ...T);
    res.NRkp = NRkp; res.Ah = Ah;
    res.pullout = Tmax / (NRkp / 1.5);
    // боковий викол (7.2.1.8): якщо c < 0,5·h_ef
    if (cmin < 0.5 * hef && Tmax > 0) {
      const k5 = cracked ? 8.7 : 12.2;
      const NRkcb = k5 * cmin * Math.sqrt(Ah) * Math.sqrt(fck);
      res.NRkcb = NRkcb; res.blowout = Tmax / (NRkcb / gMc);
    } else res.blowout = 0;
    if (V > 1e-6) {
      const c1 = cmin;
      const lf = d <= 24 ? Math.min(hef, 12 * d) : Math.min(hef, Math.max(8 * d, 300));
      const al = 0.1 * Math.sqrt(lf / c1), be = 0.1 * Math.pow(d / c1, 0.2);
      const k9 = cracked ? 1.7 : 2.4;
      const V0 = k9 * Math.pow(d, al) * Math.pow(lf, be) * Math.sqrt(fck) * Math.pow(c1, 1.5);
      const s2 = (c1 === cx ? (Math.max(...ys) - Math.min(...ys)) : (Math.max(...xs) - Math.min(...xs)));
      const c2 = c1 === cx ? cy : cx;
      const AcV = (Math.min(1.5 * c1, c2) * 2 + s2) * Math.min(hped, 1.5 * c1);
      const A0V = 4.5 * c1 * c1;
      const psiSV = Math.min(1, 0.7 + 0.3 * c2 / (1.5 * c1));
      const psiH = Math.max(1, Math.sqrt(1.5 * c1 / hped));
      const VRkc = V0 * (AcV / A0V) * psiSV * psiH;
      res.VRkc = VRkc; res.V0 = V0;
      res.edge = V / (VRkc / gMc);
      const NRkcAll = N0 * ((Math.max(...xs) - Math.min(...xs) + 2 * Math.min(ccr, cx)) * (Math.max(...ys) - Math.min(...ys) + 2 * Math.min(ccr, cy))) / (scr * scr) * Math.min(1, 0.7 + 0.3 * cmin / ccr);
      res.VRkcp = 2 * NRkcAll;
      res.pryout = V / (res.VRkcp / gMc);
    } else { res.edge = 0; res.pryout = 0; }
    const bN = Math.max(res.coneEff, res.pullout, res.split, res.blowout), bV = Math.max(res.edge, res.pryout);
    res.inter = Math.pow(bN, 1.5) + Math.pow(bV, 1.5);
    res.max = Math.max(res.coneEff, res.pullout, res.split, res.blowout, res.edge, res.pryout, res.inter, res.geomOk ? 0 : 1.01);
    return res;
  };

  // ---------------- ФУНДАМЕНТ ----------------
  const F = {};

  /** Розрахунковий опір ґрунту R, кПа (ДБН В.2.1-10). */
  F.soilR = function (fd) {
    const N = SC.norms.soilM;
    const it = SC.norms.interp;
    const mg = it(N.phi, N.Mg, fd.phi), mq = it(N.phi, N.Mq, fd.phi), mc = it(N.phi, N.Mc, fd.phi);
    const b = Math.min(fd.B, fd.L);
    const R = fd.gammaC1 * fd.gammaC2 / fd.kfactor * (mg * 1 * b * fd.gammaSoil + mq * fd.depth * fd.gammaSoil + mc * fd.cII);
    return { R, mg, mq, mc, b };
  };

  /** Власна вага фундаменту та ґрунту на уступах (Н, характеристичні). */
  F.weights = function (fd) {
    const g = 9.81;
    const Vslab = fd.B * fd.L * fd.h;
    const Vped = fd.pedB * fd.pedL * fd.pedH;
    const soilH = Math.max(0, fd.depth - fd.h);
    const Vsoil = Math.max(0, fd.B * fd.L - fd.pedB * fd.pedL) * soilH;
    return { Vslab, Vped, Vsoil, Gc: (Vslab + Vped) * fd.rhoC * g, Gs: Vsoil * fd.rhoSoil * g };
  };

  /**
   * Зусилля на підошві: сума реакцій опор (дія каркаса на фундамент = −R), перенесених у центр підошви.
   * supports: [{x,y, r:[6]}]; zTop — рівень верху підколонника відносно підошви = pedH + h.
   */
  F.resultant = function (fd, supports, kG) {
    const zArm = fd.pedH + fd.h;
    let Fx = 0, Fy = 0, Fz = 0, Mx = 0, My = 0, Mz = 0;
    for (const s of supports) {
      const f = s.r.map(v => -v);
      Fx += f[0]; Fy += f[1]; Fz += f[2];
      // момент відносно центру підошви (0,0,−zArm): r = (x, y, zArm)
      Mx += f[3] + (s.y * f[2] - zArm * f[1]);
      My += f[4] + (zArm * f[0] - s.x * f[2]);
      Mz += f[5] + (s.x * f[1] - s.y * f[0]);
    }
    const w = F.weights(fd);
    Fz -= (w.Gc + w.Gs) * kG;
    return { Fx, Fy, Fz, Mx, My, Mz, W: w };
  };

  /** Тиск під жорсткою плитою з можливим відривом. Fz — вниз від'ємна. */
  F.pressure = function (fd, res) {
    const n = 40, cells = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -fd.B / 2 + (i + 0.5) * fd.B / n, y = -fd.L / 2 + (j + 0.5) * fd.L / n, A = fd.B * fd.L / (n * n);
      cells.push({ x, y, A, k: 1e7 * A, h: Math.min(fd.B, fd.L) / n / 2 });
    }
    const sol = B.rigidPlate(cells, [], res.Fz, res.Mx, res.My);
    if (!sol.ok) return { ok: false };
    const pmean = -res.Fz / (fd.B * fd.L);
    // аналітична перевірка для повного контакту: q = N/(BL) ± Mx·y/Ix ± My·x/Iy
    const Ix = fd.B * fd.L ** 3 / 12, Iy = fd.L * fd.B ** 3 / 12;
    const qmaxLin = pmean + Math.abs(res.Mx) * (fd.L / 2) / Ix + Math.abs(res.My) * (fd.B / 2) / Iy;
    const qminLin = pmean - Math.abs(res.Mx) * (fd.L / 2) / Ix - Math.abs(res.My) * (fd.B / 2) / Iy;
    return { ok: true, pmax: sol.pmax, pmean, contactFrac: sol.contactFrac, qmaxLin, qminLin, sol, cells };
  };

  /** Перевірки фундаменту для одного сполучення. type: 'sls' | 'uls' */
  F.check = function (fd, res, R, type) {
    const out = { type };
    const p = F.pressure(fd, res);
    if (!p.ok) { out.fail = 'перекидання: рівнодійна поза підошвою'; out.max = 99; return out; }
    out.p = p;
    const H = Math.hypot(res.Fx, res.Fy);
    const Nd = -res.Fz;
    // перекидання: Mstab/Mover відносно ребра підошви для напрямку рівнодійного моменту
    const Mo = Math.hypot(res.Mx, res.My);
    const ux = Mo > 0 ? res.My / Mo : 0, uy = Mo > 0 ? -res.Mx / Mo : 0; // напрямок «перекидання»
    const halfW = Math.abs(ux) * fd.B / 2 + Math.abs(uy) * fd.L / 2;
    out.overturn = Mo > 0 ? Mo / Math.max(1e-9, Nd * halfW) : 0; // = 1/коеф. запасу
    out.slide = H / Math.max(1e-9, fd.frictionMu * Nd);
    if (type === 'sls') {
      out.pMean = p.pmean / (R * 1000);
      out.pMax = p.pmax / (1.2 * R * 1000);
      const mc = fd.minContact || 0.75;
      out.contact = p.contactFrac >= 0.999 ? 0 : (1 - p.contactFrac) / (1 - mc);
      out.max = Math.max(out.pMean, out.pMax, out.contact);
    } else {
      out.max = Math.max(out.overturn * (fd.overturnSF || 1.5), out.slide * 1.2);
    }
    return out;
  };

  /** Армування підошви (нижня сітка) за моментом консолі біля грані підколонника. */
  F.reinforce = function (fd, ulsList) {
    const conc = SC.norms.concretes.find(c => c.id === fd.concrete) || SC.norms.concretes[2];
    const rb = SC.norms.rebars.find(r => r.id === fd.rebar) || SC.norms.rebars[0];
    const fyd = rb.fyk / 1.15 * 1e6;
    const d = fd.h - fd.cover / 1000 - 0.016;
    let MxMax = 0, MyMax = 0, Vpunch = 0;
    for (const u of ulsList) {
      if (!u.p || !u.p.ok) continue;
      const cells = u.p.cells, pr = u.p.sol.p;
      const selfP = fd.h * fd.rhoC * 9.81 * 1.1 + Math.max(0, fd.depth - fd.h) * fd.rhoSoil * 9.81 * 1.15;
      // консолі по x (+/−) — момент на 1 м ширини
      for (const sgn of [1, -1]) {
        let mx = 0, my = 0;
        cells.forEach((c, i) => {
          const q = pr[i] - (pr[i] > 0 ? selfP : 0); // реактивний тиск за вирахуванням ваги плити й ґрунту
          const ax = sgn * c.x - fd.pedB / 2; if (ax > 0) mx += q * c.A * ax;
          const ay = sgn * c.y - fd.pedL / 2; if (ay > 0) my += q * c.A * ay;
        });
        MxMax = Math.max(MxMax, mx / fd.L); MyMax = Math.max(MyMax, my / fd.B);
      }
      // продавлювання: зусилля поза контрольним периметром 2d
      let outside = 0; cells.forEach((c, i) => { if (Math.abs(c.x) > fd.pedB / 2 + 2 * d || Math.abs(c.y) > fd.pedL / 2 + 2 * d) return; outside += pr[i] * c.A; });
      Vpunch = Math.max(Vpunch, -u.res.Fz - outside);
    }
    const Mper = Math.max(MxMax, MyMax);
    const As = Mper / (0.9 * d * fyd); // м²/м
    const Asmin = Math.max(0.26 * conc.fctm / rb.fyk, 0.0013) * d;
    const Areq = Math.max(As, Asmin);
    const bars = [12, 14, 16, 18, 20, 22, 25];
    // найменша площа арматури ≥ Areq при кроці 100…200 мм
    let pick = null;
    for (const dia of bars) for (const s of [200, 150, 125, 100]) {
      const a = Math.PI * (dia / 1000) ** 2 / 4 * (1000 / s);
      if (a >= Areq && (!pick || a < pick.As - 1e-9)) pick = { dia, s, As: a };
    }
    if (!pick) pick = { dia: 25, s: 100, As: Math.PI * 0.025 ** 2 / 4 * 10 };
    // продавлювання (EN 1992-1-1, 6.4): vEd = β·VEd/(u1·d) ≤ vRd,c
    const u1 = 2 * (fd.pedB + fd.pedL) + 2 * Math.PI * 2 * d;
    const k = Math.min(2, 1 + Math.sqrt(0.2 / d));
    const rho = Math.min(0.02, pick.As / d);
    const vRdc = Math.max(0.18 / 1.5 * k * Math.cbrt(100 * rho * conc.fck), 0.035 * Math.pow(k, 1.5) * Math.sqrt(conc.fck)) * 1e6;
    const vEd = 1.15 * Math.max(0, Vpunch) / (u1 * d);
    return { d, Mx: MxMax, My: MyMax, As, Asmin, Areq, pick, punching: vEd / vRdc, vEd, vRdc, u1 };
  };

  SC.base = B;
  SC.found = F;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
