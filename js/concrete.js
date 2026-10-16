/* Залізобетон фундаменту та геотехніка.
 * Осідання — метод пошарового підсумовування (ДБН В.2.1-10): s = β·Σ σ_zp,i·h_i / E_i, β = 0,8;
 *   σ_zp = α·p₀, α — за розв'язком Буссінеска для центру прямокутника (4 кутові точки), межа стисливої товщі σ_zp = 0,2·σ_zg.
 * Крен жорсткої плити (наближено як круглого штампа рівного моменту інерції): tg i = 3(1−ν²)·M / (4·E·r³).
 * Плита: згин в обох напрямках (низ/верх), поперечна сила (EN 1992-1-1, 6.2.2), продавлювання (6.4), тріщини (7.3.3, табл. 7.2N/7.3N),
 *   мінімальне армування (9.2.1.1), довжина анкерування (8.4). Підколонник: вертикальна арматура, хомути.
 */
(function (SC) {
  'use strict';

  const C = {};
  const g = 9.81;

  /** Коефіцієнт α для центру прямокутника B×L на глибині z (точний розв'язок, сума чотирьох кутових). */
  C.alphaCenter = function (B, L, z) {
    if (z <= 1e-9) return 1;
    const m = (B / 2) / z, n = (L / 2) / z;
    const m2 = m * m, n2 = n * n, r = Math.sqrt(m2 + n2 + 1);
    let at = Math.atan2(2 * m * n * r, m2 + n2 + 1 - m2 * n2);
    if (at < 0) at += Math.PI;
    const corner = (1 / (4 * Math.PI)) * (2 * m * n * r / (m2 + n2 + 1 + m2 * n2) * (m2 + n2 + 2) / (m2 + n2 + 1) + at);
    return 4 * corner;
  };

  /** Природний тиск ґрунту σ_zg на глибині z від поверхні (кПа), з урахуванням зважування нижче рівня ґрунтових вод. */
  C.sigmaZg = function (layers, gwl, z) {
    let s = 0, top = 0;
    for (const L of layers) {
      const bot = top + L.h;
      const a = Math.min(z, bot);
      if (a > top) {
        const dryPart = Math.max(0, Math.min(a, gwl) - top), wetPart = Math.max(0, a - Math.max(top, gwl));
        s += dryPart * L.gamma + wetPart * Math.max(L.gamma - 10, 0);
      }
      if (z <= bot) return s;
      top = bot;
    }
    const last = layers[layers.length - 1] || { gamma: 18 };
    return s + (z - top) * (z > gwl ? last.gamma - 10 : last.gamma);
  };
  C.layerAt = function (layers, z) {
    let top = 0;
    for (const L of layers) { if (z <= top + L.h) return L; top += L.h; }
    return layers[layers.length - 1];
  };

  /** Осідання центру фундаменту (м) і крен. pmean — середній тиск (Па) під підошвою від SLS; M — момент на підошві (Н·м). */
  C.settlement = function (fd, pmean, Mx, My) {
    const layers = (fd.layers && fd.layers.length) ? fd.layers : [{ name: 'ґрунт', h: 10, gamma: fd.gammaSoil || 18, E: fd.Esoil || 15, nu: 0.3 }];
    const gwl = fd.gwl != null ? fd.gwl : 99;
    const d = fd.depth, b = Math.min(fd.B, fd.L);
    const szg0 = C.sigmaZg(layers, gwl, d);
    const p = pmean / 1000;
    const p0 = Math.max(0, p - szg0);
    const dz = Math.min(0.4 * b, 0.4);
    const rows = [];
    let s = 0, z = 0, Hc = 0;
    for (let k = 0; k < 400; k++) {
      const zm = z + dz / 2;
      const a = C.alphaCenter(fd.B, fd.L, zm);
      const szp = a * p0;
      const szg = C.sigmaZg(layers, gwl, d + zm);
      const L = C.layerAt(layers, d + zm);
      const ds = 0.8 * szp * dz / (L.E * 1000);
      if (szp <= 0.2 * szg && k > 0) { Hc = z; break; }
      s += ds; rows.push({ z: zm, alpha: a, szp, szg, E: L.E, ds, layer: L.name });
      z += dz; Hc = z;
    }
    // крен
    const Ea = rows.length ? rows.reduce((a, r) => a + r.E, 0) / rows.length : 15;
    const nu = (layers[0].nu != null ? layers[0].nu : 0.3);
    const tilt = (M, Lrot, Bw) => { const r = Math.pow(Bw * Lrot ** 3 / (3 * Math.PI), 0.25); return 3 * (1 - nu * nu) * Math.abs(M) / (4 * Ea * 1e6 * r ** 3); };
    const ix = tilt(My, fd.B, fd.L), iy = tilt(Mx, fd.L, fd.B);
    return { s, p0: p0, szg0, Hc, rows, tilt: Math.max(ix, iy), ix, iy, Ea, layers };
  };

  /** Розрахунковий опір R для верхнього шару під підошвою (якщо задано шари). */
  C.soilRLayer = function (fd) {
    const layers = fd.layers && fd.layers.length ? fd.layers : null;
    if (!layers) return SC.found.soilR(fd);
    const L = C.layerAt(layers, fd.depth + 0.01);
    return SC.found.soilR(Object.assign({}, fd, { phi: L.phi != null ? L.phi : fd.phi, cII: L.c != null ? L.c : fd.cII, gammaSoil: L.gamma || fd.gammaSoil }));
  };

  /** Площа одного стрижня, м². */
  const Abar = d => Math.PI * (d / 1000) ** 2 / 4;
  const kgm = d => Abar(d) * 7850;
  C.kgm = kgm;

  /** Добір стрижнів: найменша площа ≥ Areq (м²/м) при кроці 100…200 мм. */
  C.pickBars = function (Areq, dmin) {
    let pick = null;
    for (const dia of [10, 12, 14, 16, 18, 20, 22, 25, 28]) {
      if (dia < (dmin || 10)) continue;
      for (const s of [200, 150, 125, 100]) {
        const a = Abar(dia) * (1000 / s);
        if (a >= Areq && (!pick || a < pick.As - 1e-12)) pick = { dia, s, As: a };
      }
    }
    return pick || { dia: 28, s: 100, As: Abar(28) * 10 };
  };

  /** Довжина анкерування l_bd (EN 1992-1-1, 8.4): l_b,rqd = (φ/4)·(σ_sd/f_bd), f_bd = 2,25·η₁·η₂·f_ctd. */
  C.lbd = function (dia, conc, sigma, good) {
    const fctd = 1.0 * 0.7 * conc.fctm / 1.5;
    const fbd = 2.25 * (good === false ? 0.7 : 1.0) * 1.0 * fctd;
    const lbrqd = dia / 4 * (sigma / 1e6) / fbd;
    const lbmin = Math.max(0.3 * lbrqd, 10 * dia, 100);
    return { fbd, lbrqd, lbd: Math.max(lbrqd, lbmin) };
  };

  /**
   * Розрахунок плити фундаменту за епюрами тиску ULS (з відривом) і SLS (тріщини).
   * uls/sls: [{p: результат F.pressure, res}] ; повертає армування низу/верху в обох напрямках, перевірки.
   */
  C.slab = function (fd, uls, sls) {
    const conc = SC.norms.concretes.find(c => c.id === fd.concrete) || SC.norms.concretes[2];
    const rb = SC.norms.rebars.find(r => r.id === fd.rebar) || SC.norms.rebars[0];
    const fyd = rb.fyk / 1.15 * 1e6, fck = conc.fck;
    const cover = fd.cover / 1000;
    const dBot = fd.h - cover - 0.016, dTop = fd.h - cover - 0.012;
    const wSelf = fd.h * fd.rhoC * g, wSoil = Math.max(0, fd.depth - fd.h) * fd.rhoSoil * g;
    const strips = (list, kSelf) => {
      let MxB = 0, MyB = 0, MxT = 0, MyT = 0, Vx = 0, Vy = 0, Vp = 0, gov = {};
      for (const u of list) {
        if (!u.p || !u.p.ok) continue;
        const cells = u.p.cells, pr = u.p.sol.p;
        const down = (wSelf * kSelf[0] + wSoil * kSelf[1]);
        for (const sgn of [1, -1]) {
          let mx = 0, my = 0, mxt = 0, myt = 0, vx = 0, vy = 0;
          cells.forEach((c, i) => {
            const q = pr[i] - down; // нетто тиск вгору
            const ax = sgn * c.x - fd.pedB / 2, ay = sgn * c.y - fd.pedL / 2;
            if (ax > 0) { mx += q * c.A * ax; if (ax > dBot) vx += q * c.A; }
            if (ay > 0) { my += q * c.A * ay; if (ay > dBot) vy += q * c.A; }
          });
          if (mx / fd.L > MxB) { MxB = mx / fd.L; gov.mx = u.name; }
          if (my / fd.B > MyB) { MyB = my / fd.B; gov.my = u.name; }
          MxT = Math.max(MxT, -mx / fd.L); MyT = Math.max(MyT, -my / fd.B);
          Vx = Math.max(Vx, vx / fd.L); Vy = Math.max(Vy, vy / fd.B);
          void mxt; void myt;
        }
        let inside = 0; cells.forEach((c, i) => { if (Math.abs(c.x) <= fd.pedB / 2 + 2 * dBot && Math.abs(c.y) <= fd.pedL / 2 + 2 * dBot) inside += pr[i] * c.A; });
        Vp = Math.max(Vp, -u.res.Fz - inside - (wSelf * kSelf[0] + wSoil * kSelf[1]) * 0);
      }
      return { MxB, MyB, MxT, MyT, Vx, Vy, Vp, gov };
    };
    const U = strips(uls, [1.1, 1.15]);
    const asMin = d => Math.max(0.26 * conc.fctm / rb.fyk, 0.0013) * d;
    const design = (M, d) => { const As = M / (0.9 * d * fyd); const Areq = Math.max(As, asMin(d)); const pick = C.pickBars(Areq, 12); return { M, d, As, Asmin: asMin(d), Areq, pick }; };
    const bx = design(U.MxB, dBot), by = design(U.MyB, dBot - 0.016);
    const tx = design(U.MxT, dTop), ty = design(U.MyT, dTop - 0.012);
    // поперечна сила без поперечного армування (6.2.2): V_Rd,c = [C_Rd,c·k·(100ρf_ck)^(1/3)]·b·d ≥ v_min·b·d
    const vrdc = (d, As) => { const k = Math.min(2, 1 + Math.sqrt(0.2 / d)); const rho = Math.min(0.02, As / d); return Math.max(0.18 / 1.5 * k * Math.cbrt(100 * rho * fck), 0.035 * Math.pow(k, 1.5) * Math.sqrt(fck)) * 1e6 * d; };
    const shearX = U.Vx / vrdc(dBot, bx.pick.As), shearY = U.Vy / vrdc(dBot, by.pick.As);
    // продавлювання (6.4): u₁ на відстані 2d, β ≈ 1,15
    const u1 = 2 * (fd.pedB + fd.pedL) + 2 * Math.PI * 2 * dBot;
    const vRd = vrdc(dBot, Math.sqrt(bx.pick.As * by.pick.As)) / dBot;
    const vEd = 1.15 * Math.max(0, U.Vp) / (u1 * dBot);
    // тріщини: σ_s під квазіпостійним сполученням (SLS), допустимий діаметр (табл. 7.2N, w_k = 0,3 мм)
    const S = strips(sls, [1, 1]);
    const sigS = Math.max(S.MxB / (0.9 * dBot * bx.pick.As), S.MyB / (0.9 * (dBot - 0.016) * by.pick.As)) / 1e6;
    const tab = [[160, 32], [200, 25], [240, 16], [280, 12], [320, 10], [360, 8], [400, 6], [450, 5]];
    let phiMax = 40; for (const [sg, ph] of tab) { if (sigS <= sg) { phiMax = ph; break; } phiMax = ph; }
    if (sigS > 450) phiMax = 0;
    const crack = Math.max(bx.pick.dia, by.pick.dia) / Math.max(phiMax, 1e-9);
    const lb = C.lbd(Math.max(bx.pick.dia, by.pick.dia), conc, fyd, true);
    return { conc, rb, fyd, dBot, dTop, bx, by, tx, ty, shearX, shearY, u1, vEd, vRdc: vRd, punching: vEd / vRd, sigS, phiMax, crack, lb, Mx: U.MxB, My: U.MyB, govern: U.gov,
      max: Math.max(shearX, shearY, vEd / vRd, crack) };
  };

  /** Підколонник: вертикальна арматура (EN 9.5.2), згин від H·h + M, хомути. */
  C.pedestal = function (fd, Nmin, Mmax, Hmax) {
    const conc = SC.norms.concretes.find(c => c.id === fd.concrete) || SC.norms.concretes[2];
    const rb = SC.norms.rebars.find(r => r.id === fd.rebar) || SC.norms.rebars[0];
    const fyd = rb.fyk / 1.15 * 1e6;
    const Ac = fd.pedB * fd.pedL;
    const M = Mmax + Hmax * fd.pedH;
    const d = Math.min(fd.pedB, fd.pedL) - fd.cover / 1000 - 0.016;
    const AsFace = Math.max(0, M / (0.9 * d * fyd) - Math.max(0, Nmin) / (2 * fyd));
    const AsMinTot = Math.max(0.002 * Ac, 0.1 * Math.abs(Nmin) / fyd);
    const perim = 2 * (fd.pedB + fd.pedL);
    const nMin = Math.max(8, Math.ceil(perim / 0.2));
    let dia = 12, n = nMin;
    for (const dd of [12, 14, 16, 18, 20, 22, 25]) { dia = dd; n = Math.max(nMin, Math.ceil(AsMinTot / Abar(dd))); const perFace = Math.ceil(n / 4) * Abar(dd); if (perFace >= AsFace && n <= perim / 0.1) break; }
    const hoop = { dia: Math.max(8, Math.ceil(dia / 4)), s: Math.min(20 * dia, Math.min(fd.pedB, fd.pedL) * 1000, 400) };
    return { M, d, AsFace, AsMinTot, n, dia, hoop, util: (Math.ceil(n / 4) * Abar(dia)) > 0 ? AsFace / (Math.ceil(n / 4) * Abar(dia)) : 0, perim };
  };

  /** Відомість деталей арматури (позиції, довжини, кількість, маса). */
  C.schedule = function (fd, slab, ped, anchorReinf, nSupports, nAnchors) {
    const cov = fd.cover / 1000;
    const rows = [];
    const add = (pos, name, dia, len, cnt) => rows.push({ pos, name, dia, len, cnt, total: len * cnt, mass: len * cnt * kgm(dia) });
    const lbB = C.lbd(slab.bx.pick.dia, slab.conc, slab.fyd).lbd / 1000;
    const hookB = Math.max(0, Math.min(fd.h - 2 * cov, lbB * 0.3));
    add(1, 'Низ плити, уздовж X', slab.bx.pick.dia, fd.B - 2 * cov + 2 * hookB, Math.floor((fd.L - 2 * cov) / (slab.bx.pick.s / 1000)) + 1);
    add(2, 'Низ плити, уздовж Y', slab.by.pick.dia, fd.L - 2 * cov + 2 * hookB, Math.floor((fd.B - 2 * cov) / (slab.by.pick.s / 1000)) + 1);
    add(3, 'Верх плити, уздовж X', slab.tx.pick.dia, fd.B - 2 * cov, Math.floor((fd.L - 2 * cov) / (slab.tx.pick.s / 1000)) + 1);
    add(4, 'Верх плити, уздовж Y', slab.ty.pick.dia, fd.L - 2 * cov, Math.floor((fd.B - 2 * cov) / (slab.ty.pick.s / 1000)) + 1);
    const lbP = C.lbd(ped.dia, slab.conc, slab.fyd).lbd / 1000;
    add(5, 'Підколонник, вертикальні (з відгином у плиті)', ped.dia, fd.pedH + fd.h - cov + Math.max(0.15, lbP * 0.5), ped.n);
    const hoopLen = 2 * (fd.pedB + fd.pedL - 4 * cov) + 0.2;
    add(6, 'Підколонник, хомути', ped.hoop.dia, hoopLen, Math.ceil(fd.pedH / (ped.hoop.s / 1000)) + 1);
    add(7, 'Каркаси-підтримки верхньої сітки (Ø10, 1 шт./м²)', 10, fd.h - 2 * cov + 0.3, Math.ceil(fd.B * fd.L));
    if (anchorReinf && anchorReinf.on) {
      const ds = Math.min(anchorReinf.ds || 12, 16);
      const len = 2 * ((anchorReinf.hLoop || 0.8 * (fd.pedH + fd.h))) + 0.25;
      add(8, `Додаткове армування анкерів (хомути-петлі Ø${ds}, ds ≤ 16 мм)`, ds, len, (anchorReinf.nPerAnchor || 2) * nAnchors * nSupports);
    }
    const total = rows.reduce((a, r) => a + r.mass, 0);
    return { rows, total };
  };

  SC.concrete = C;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
