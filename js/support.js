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
  B.baseNode = function (bp, r, sec, steelPlate, opts) {
    const N = SC.norms; opts = opts || {};
    const conc = N.concretes.find(c => c.id === bp.concrete) || N.concretes[2];
    const bolt = N.boltGrades.find(b => b.id === bp.grade) || N.boltGrades[1];
    const As = (N.boltAs[bp.d] || 353) * 1e-6;
    const fy = steelPlate.Ryn * 1e6, fu = steelPlate.Run * 1e6;
    const gM0 = 1.0, gM2 = 1.25, gc = 1.5;
    const fcd = 1.0 * conc.fck * 1e6 / gc;
    const fjd = (2 / 3) * Math.min(bp.alphaBearing || 1.5, 3) * fcd; // EN 1993-1-8 (6.6): βj·α·fcd
    const tp = bp.tp / 1000, bc = sec.b, Bp = bp.plateB / 1000, Lp = bp.plateL / 1000;
    const c = tp * Math.sqrt(fy / (3 * fjd * gM0));                 // ширина опорної зони (6.5)
    // дії на пластину від стійки: протилежні реакції
    const Fz = -r[2], Mx = -r[3], My = -r[4], Hx = -r[0], Hy = -r[1], Mz = -r[5];
    // сітка ефективної зони опирання (відстань до стінки труби ≤ c), обмежена пластиною
    const n = 40, cells = [];
    const Ec = conc.Ecm * 1e9;
    const xs = [], hw = bc / 2;
    let Aeff = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -Bp / 2 + (i + 0.5) * Bp / n, y = -Lp / 2 + (j + 0.5) * Lp / n;
      const dx = Math.abs(x) - hw, dy = Math.abs(y) - hw;
      const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      const inside = Math.min(-dx, -dy);
      const dist = (dx > 0 || dy > 0) ? outside : inside;
      if (dist <= c + tp / 2) { const A = Bp * Lp / (n * n); xs.push({ x, y, A, h: Bp / n / 2 }); Aeff += A; }
    }
    const kc = Ec / (1.275 * Math.sqrt(Aeff)); // Па/м
    xs.forEach(p => { p.k = kc * p.A; cells.push(p); });
    const lay = B.anchorLayout(bp).map(([x, y]) => ({ x: x / 1000, y: y / 1000 }));
    const Lb = Math.min(8 * bp.d, bp.hef) / 1000 + 0.03 + tp; // вільна довжина анкера (EN 1993-1-8, 6.2.6.12)
    const ka = N.E * As / Lb;
    lay.forEach(a => { a.k = ka; });
    const sol = B.rigidPlate(cells, lay, Fz, Mx, My);
    const out = { c, fjd, Aeff, Lb, kc, ka, sol, anchors: lay, fcd };
    if (!sol.ok) { out.fail = sol.reason; return out; }
    out.sigmaMax = sol.pmax;
    out.bearing = sol.pmax / fjd;
    // --- анкери: сталь (EN 1993-1-8, табл. 3.4; 6.2.6.12)
    const Tmax = Math.max(0, ...sol.T); out.Tmax = Tmax; out.Tsum = sol.T.reduce((s, v) => s + v, 0);
    const FtRd = 0.9 * bolt.fub * 1e6 * As / gM2;
    const abc = 0.44 - 0.0003 * bolt.fyb;
    const FvbRd = abc * bolt.fub * 1e6 * As / gM2;
    const H = Math.hypot(Hx, Hy);
    const Nc = Math.max(0, -Fz + out.Tsum); // стиск у контакті (з урахуванням натягу анкерів)
    const FfRd = bp.shear === 'friction' ? (bp.cf || 0.2) * Nc : 0;
    const Hanch = Math.max(0, H - FfRd);
    const na = lay.length;
    const r2 = lay.reduce((s, a) => s + a.x * a.x + a.y * a.y, 0);
    const rmax = Math.max(...lay.map(a => Math.hypot(a.x, a.y)));
    const Vmax = Hanch / na + Math.abs(Mz) * rmax / r2;
    out.Vmax = Vmax; out.H = H; out.FfRd = FfRd;
    out.FtRd = FtRd; out.FvbRd = FvbRd;
    out.anchorSteel = Vmax / FvbRd + Tmax / (1.4 * FtRd);
    out.anchorT = Tmax / FtRd;
    // --- пластина в зоні розтягу (Т-подібна ділянка, без важеля для анкерних болтів)
    const mx = Math.max(0.005, (Bp / 2 - bp.edge / 1000) - bc / 2 - 0.8 * Math.SQRT2 * (bp.weldLeg || 6) / 1000 * 0.7);
    const e = bp.edge / 1000;
    const leff = Math.min(2 * Math.PI * mx, Math.PI * mx + 2 * e, 4 * mx + 1.25 * e);
    const MplRd = 0.25 * leff * tp * tp * fy / gM0;
    const FT12 = 2 * MplRd / mx;
    // опір Т-подібної ділянки на один анкер (форма 1-2 без важеля, EN 1993-1-8 табл. 6.2)
    out.plateT = Tmax > 0 ? Tmax / FT12 : 0;
    out.leff = leff; out.m = mx; out.FT12 = FT12;
    // --- шов труба–пластина (кутовий по периметру, метод напрямків EN 1993-1-8 4.5.3.2)
    const a = 0.7 * (bp.weldLeg || 6) / 1000;
    const Lw = 4 * bc, Ww = 4 * bc * bc / 3;
    const fM = Math.abs(Mx) / Ww + Math.abs(My) / Ww;
    const fn = Math.abs(Fz) / Lw + fM;   // нормальна до шва, Н/м
    const fv = H / (2 * bc) + Math.abs(Mz) / (2 * bc * bc); // поздовжня (зсув сприймають 2 стінки) + кручення
    const sp = fn / (a * Math.SQRT2), tp_ = fn / (a * Math.SQRT2), tpar = fv / a;
    const bw = steelPlate.Ryn >= 345 ? 0.9 : steelPlate.Ryn >= 275 ? 0.85 : 0.8;
    out.weld = Math.max(Math.sqrt(sp * sp + 3 * (tp_ * tp_ + tpar * tpar)) / (fu / (bw * gM2)), sp / (0.9 * fu / gM2));
    out.weldA = a;
    // --- бетон (EN 1992-4)
    const conc4 = B.anchorConcrete(bp, lay, sol.T, Hanch, conc, opts);
    out.concrete = conc4;
    out.max = Math.max(out.bearing, out.anchorSteel, out.anchorT, out.plateT, out.weld, conc4.max);
    return out;
  };

  /** Бетонні механізми руйнування анкерної групи (EN 1992-4), одиниці Н, мм → результати в Н. */
  B.anchorConcrete = function (bp, lay, T, V, conc, opts) {
    const fck = conc.fck, hef = bp.hef, d = bp.d;
    const cracked = bp.cracked !== false;
    const gMc = 1.5;
    const res = {};
    // відстань від крайніх анкерів до граней підколонника (мм)
    const pedB = (opts.pedB || 1.4) * 1000, pedL = (opts.pedL || 1.4) * 1000;
    const xs = lay.map(a => a.x * 1000), ys = lay.map(a => a.y * 1000);
    // анкери біля краю підколонника: враховується положення стійки (px, py) на спільному підколоннику
    const px = Math.abs((opts.px || 0) * 1000), py = Math.abs((opts.py || 0) * 1000);
    const cx = pedB / 2 - px - Math.max(...xs), cy = pedL / 2 - py - Math.max(...ys);
    const cmin = Math.min(cx, cy);
    res.cx = cx; res.cy = cy;
    const tens = lay.map((a, i) => ({ x: a.x * 1000, y: a.y * 1000, T: T[i] })).filter(a => a.T > 1e-6);
    const NEg = tens.reduce((s, a) => s + a.T, 0);
    res.NEg = NEg;
    // --- бетонний конус
    const k1 = cracked ? 8.9 : 12.7;
    const N0 = k1 * Math.sqrt(fck) * Math.pow(hef, 1.5);
    const scr = 3 * hef, ccr = 1.5 * hef;
    let NRkc = 0, psi = {};
    if (tens.length) {
      const minx = Math.min(...tens.map(a => a.x)), maxx = Math.max(...tens.map(a => a.x));
      const miny = Math.min(...tens.map(a => a.y)), maxy = Math.max(...tens.map(a => a.y));
      const ext = (lo, hi, half) => Math.min(ccr, half + lo) + (hi - lo) + Math.min(ccr, half - hi);
      const Ac = ext(minx, maxx, pedB / 2) * ext(miny, maxy, pedL / 2);
      const A0 = scr * scr;
      const psiS = Math.min(1, 0.7 + 0.3 * cmin / ccr);
      const gx = tens.reduce((s, a) => s + a.T * a.x, 0) / NEg, gy = tens.reduce((s, a) => s + a.T * a.y, 0) / NEg;
      const cxg = (minx + maxx) / 2, cyg = (miny + maxy) / 2;
      const psiEc = 1 / (1 + 2 * Math.abs(gx - cxg) / scr) / (1 + 2 * Math.abs(gy - cyg) / scr);
      const psiRe = hef >= 100 ? 1 : 0.5 + hef / 200;
      NRkc = N0 * (Ac / A0) * psiS * psiEc * psiRe;
      psi = { Ac, A0, psiS, psiEc, psiRe };
    }
    res.N0 = N0; res.NRkc = NRkc; res.psi = psi;
    res.cone = tens.length ? NEg / (NRkc / gMc) : 0;
    // --- вирив (анкер з головкою/шайбою)
    const Ah = Math.PI / 4 * (bp.dh * bp.dh - d * d);
    const NRkp = (cracked ? 7.5 : 10.5) * Ah * fck;
    const Tmax = Math.max(0, ...T);
    res.NRkp = NRkp;
    res.pullout = Tmax / (NRkp / 1.5);
    // --- крайове сколювання при зрізі (до найближчої грані)
    if (V > 1e-6) {
      const c1 = cmin;
      const lf = d <= 24 ? Math.min(hef, 12 * d) : Math.min(hef, Math.max(8 * d, 300));
      const al = 0.1 * Math.sqrt(lf / c1), be = 0.1 * Math.pow(d / c1, 0.2);
      const k9 = cracked ? 1.7 : 2.4;
      const V0 = k9 * Math.pow(d, al) * Math.pow(lf, be) * Math.sqrt(fck) * Math.pow(c1, 1.5);
      const hped = (opts.pedH || 0.6) * 1000;
      const s2 = (c1 === cx ? (Math.max(...ys) - Math.min(...ys)) : (Math.max(...xs) - Math.min(...xs)));
      const c2 = c1 === cx ? cy : cx;
      const AcV = (Math.min(1.5 * c1, c2) * 2 + s2) * Math.min(hped, 1.5 * c1);
      const A0V = 4.5 * c1 * c1;
      const psiSV = Math.min(1, 0.7 + 0.3 * c2 / (1.5 * c1));
      const psiH = Math.max(1, Math.sqrt(1.5 * c1 / hped));
      const VRkc = V0 * (AcV / A0V) * psiSV * psiH;
      res.VRkc = VRkc;
      res.edge = V / (VRkc / gMc);
      // pry-out: VRk,cp = k8·NRk,c (для всієї групи, k8 = 2)
      const NRkcAll = N0 * ((Math.max(...xs) - Math.min(...xs) + 2 * Math.min(ccr, cx)) * (Math.max(...ys) - Math.min(...ys) + 2 * Math.min(ccr, cy))) / (scr * scr) * Math.min(1, 0.7 + 0.3 * cmin / ccr);
      res.VRkcp = 2 * NRkcAll;
      res.pryout = V / (res.VRkcp / gMc);
      const bN = Math.max(res.cone, res.pullout), bV = Math.max(res.edge, res.pryout);
      res.inter = Math.pow(bN, 1.5) + Math.pow(bV, 1.5);
    } else { res.edge = 0; res.pryout = 0; res.inter = Math.pow(Math.max(res.cone, res.pullout), 1.5); }
    res.max = Math.max(res.cone, res.pullout, res.edge, res.pryout, res.inter);
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
