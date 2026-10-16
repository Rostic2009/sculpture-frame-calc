/* Метод скінченних елементів для просторової стрижневої системи.
 * Вузол: 6 ступенів свободи (ux, uy, uz, rx, ry, rz). Елементи: балка (12×12) та ферма (лише осьова жорсткість).
 * Лінійний розрахунок: K·u = f. Розрахунок 2-го порядку (P-Δ, P-δ): (K + KG(N))·u = f, ітерації до збіжності.
 * Модальний аналіз: K·φ = ω²·M·φ, ітерація в підпросторі.
 */
(function (SC) {
  'use strict';

  const F = {};

  // ---- векторні утиліти ----
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  F.vec = { sub, dot, cross, norm, scale };

  /** Локальні осі елемента: x — уздовж осі; для вертикальних елементів опорний вектор — глобальна X. */
  F.localAxes = function (pi, pj) {
    const d = sub(pj, pi); const L = norm(d);
    const x = scale(d, 1 / L);
    const ref = Math.abs(x[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1];
    let y = cross(ref, x); y = scale(y, 1 / norm(y));
    const z = cross(x, y);
    return { L, x, y, z };
  };

  function zeros(n) { const m = []; for (let i = 0; i < n; i++) m.push(new Float64Array(n)); return m; }

  /** Локальна матриця жорсткості 12×12. */
  F.kLocal = function (E, G, s, L, type) {
    const k = zeros(12);
    const EA = E * s.A / L;
    k[0][0] = EA; k[0][6] = -EA; k[6][6] = EA;
    if (type !== 'truss') {
      const Iz = s.Iz, Iy = s.Iy, GJ = G * s.J / L;
      const a = 12 * E * Iz / L ** 3, b = 6 * E * Iz / L ** 2, c = 4 * E * Iz / L, d = 2 * E * Iz / L;
      k[1][1] = a; k[1][5] = b; k[1][7] = -a; k[1][11] = b;
      k[5][5] = c; k[5][7] = -b; k[5][11] = d;
      k[7][7] = a; k[7][11] = -b; k[11][11] = c;
      const e = 12 * E * Iy / L ** 3, f = 6 * E * Iy / L ** 2, g = 4 * E * Iy / L, h = 2 * E * Iy / L;
      k[2][2] = e; k[2][4] = -f; k[2][8] = -e; k[2][10] = -f;
      k[4][4] = g; k[4][8] = f; k[4][10] = h;
      k[8][8] = e; k[8][10] = f; k[10][10] = g;
      k[3][3] = GJ; k[3][9] = -GJ; k[9][9] = GJ;
    }
    for (let i = 0; i < 12; i++) for (let j = 0; j < i; j++) k[i][j] = k[j][i];
    return k;
  };

  /** Локальна геометрична матриця 12×12 для осьової сили N (розтяг > 0). */
  F.kgLocal = function (N, L, type) {
    const k = zeros(12);
    const c = N / L;
    if (type === 'truss') {
      for (const [p, q] of [[1, 7], [2, 8]]) { k[p][p] = c; k[q][q] = c; k[p][q] = -c; k[q][p] = -c; }
      return k;
    }
    const a = 6 / 5 * c, b = L / 10 * c, d = 2 * L * L / 15 * c, e = -L * L / 30 * c;
    k[1][1] = a; k[1][5] = b; k[1][7] = -a; k[1][11] = b;
    k[5][5] = d; k[5][7] = -b; k[5][11] = e;
    k[7][7] = a; k[7][11] = -b; k[11][11] = d;
    k[2][2] = a; k[2][4] = -b; k[2][8] = -a; k[2][10] = -b;
    k[4][4] = d; k[4][8] = b; k[4][10] = e;
    k[8][8] = a; k[8][10] = b; k[10][10] = d;
    for (let i = 0; i < 12; i++) for (let j = 0; j < i; j++) k[i][j] = k[j][i];
    return k;
  };

  /** Матриця перетворення: локальні = T·глобальні (блоки 3×3 по діагоналі). */
  function rot(ax) { return [ax.x, ax.y, ax.z]; }
  function toGlobal(kl, R) {
    // K = Tᵀ k T, T = diag(R,R,R,R)
    const kg = zeros(12);
    const tmp = zeros(12);
    for (let i = 0; i < 12; i++) for (let J = 0; J < 4; J++) for (let b = 0; b < 3; b++) {
      let s = 0; for (let a = 0; a < 3; a++) s += kl[i][J * 3 + a] * R[a][b]; tmp[i][J * 3 + b] = s;
    }
    for (let I = 0; I < 4; I++) for (let bi = 0; bi < 3; bi++) for (let j = 0; j < 12; j++) {
      let s = 0; for (let a = 0; a < 3; a++) s += R[a][bi] * tmp[I * 3 + a][j]; kg[I * 3 + bi][j] = s;
    }
    return kg;
  }
  const rotV = (R, v) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];
  const rotVT = (R, v) => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];

  /** Еквівалентні вузлові навантаження від рівномірного навантаження w (глобальний вектор, Н/м) у локальних осях. */
  function feLocal(wl, L) {
    const [wx, wy, wz] = wl;
    return [wx * L / 2, wy * L / 2, wz * L / 2, 0, -wz * L * L / 12, wy * L * L / 12,
      wx * L / 2, wy * L / 2, wz * L / 2, 0, wz * L * L / 12, -wy * L * L / 12];
  }

  // ---- щільна факторизація Холецького (LLᵀ) ----
  function cholesky(A, n) {
    const L = new Float64Array(n * n);
    let maxd = 0; for (let i = 0; i < n; i++) maxd = Math.max(maxd, A[i * n + i]);
    for (let j = 0; j < n; j++) {
      let s = A[j * n + j];
      const Lj = j * n;
      for (let k = 0; k < j; k++) s -= L[Lj + k] * L[Lj + k];
      if (!(s > 1e-11 * maxd)) return { ok: false, dof: j, L: null };
      const d = Math.sqrt(s); L[Lj + j] = d;
      for (let i = j + 1; i < n; i++) {
        const Li = i * n; let t = A[Li + j];
        for (let k = 0; k < j; k++) t -= L[Li + k] * L[Lj + k];
        L[Li + j] = t / d;
      }
    }
    return { ok: true, L };
  }
  function cholSolve(L, n, b) {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; const Li = i * n; for (let k = 0; k < i; k++) s -= L[Li + k] * y[k]; y[i] = s / L[Li + i]; }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
    return x;
  }

  /**
   * Модель: { nodes:[{id,x,y,z, sup:[6 bool], spring:[6]}], elems:[{id,i,j,sec,type,mat:{E,G}}] }
   * Підготовка: нумерація вільних ступенів свободи, матриці елементів.
   */
  F.prepare = function (model) {
    const nn = model.nodes.length;
    const idx = new Map(model.nodes.map((n, k) => [n.id, k]));
    const free = new Int32Array(nn * 6).fill(-1);
    // вузли, до яких приєднані лише фермові елементи, не мають обертальної жорсткості — обертання фіксуються
    const hasBeam = new Uint8Array(nn);
    for (const e of model.elems) if (e.type !== 'truss') { hasBeam[idx.get(e.i)] = 1; hasBeam[idx.get(e.j)] = 1; }
    let nf = 0;
    model.nodes.forEach((n, k) => { for (let d = 0; d < 6; d++) if (!(n.sup && n.sup[d]) && !(d >= 3 && !hasBeam[k] && !(n.spring && n.spring[d]))) free[k * 6 + d] = nf++; });
    const els = model.elems.map(e => {
      const ni = idx.get(e.i), nj = idx.get(e.j);
      const pi = [model.nodes[ni].x, model.nodes[ni].y, model.nodes[ni].z];
      const pj = [model.nodes[nj].x, model.nodes[nj].y, model.nodes[nj].z];
      const ax = F.localAxes(pi, pj);
      const R = rot(ax);
      const E = (e.mat && e.mat.E) || SC.norms.E, G = (e.mat && e.mat.G) || SC.norms.Gs;
      const kl = F.kLocal(E, G, e.sec, ax.L, e.type);
      const dofs = []; for (let d = 0; d < 6; d++) dofs.push(ni * 6 + d); for (let d = 0; d < 6; d++) dofs.push(nj * 6 + d);
      return { src: e, ni, nj, L: ax.L, ax, R, kl, kg: toGlobal(kl, R), dofs };
    });
    return { model, idx, free, nf, nn, els };
  };

  function assemble(P, Nax) {
    const n = P.nf; const K = new Float64Array(n * n);
    P.els.forEach((el, k) => {
      let ke = el.kg;
      if (Nax) {
        const kgl = F.kgLocal(Nax[k], el.L, el.src.type);
        const kgg = toGlobal(kgl, el.R);
        ke = ke.map((row, i) => row.map((v, j) => v + kgg[i][j]));
      }
      for (let a = 0; a < 12; a++) {
        const fa = P.free[el.dofs[a]]; if (fa < 0) continue;
        for (let b = 0; b < 12; b++) { const fb = P.free[el.dofs[b]]; if (fb < 0) continue; K[fa * n + fb] += ke[a][b]; }
      }
    });
    P.model.nodes.forEach((nd, k) => {
      if (!nd.spring) return;
      for (let d = 0; d < 6; d++) { const f = P.free[k * 6 + d]; if (f >= 0 && nd.spring[d]) K[f * n + f] += nd.spring[d]; }
    });
    return K;
  }

  /**
   * Навантаження: { nodal:[{node, f:[Fx,Fy,Fz,Mx,My,Mz]}], dist:[{elem(index), w:[wx,wy,wz]}] } (глобальні, Н, Н·м, Н/м)
   */
  function loadVector(P, load) {
    const fg = new Float64Array(P.nn * 6);
    for (const nl of load.nodal || []) {
      const k = P.idx.get(nl.node); for (let d = 0; d < 6; d++) fg[k * 6 + d] += nl.f[d] || 0;
    }
    const fe = new Map();
    for (const dl of load.dist || []) {
      const el = P.els[dl.elem];
      const wl = rotV(el.R, dl.w);
      const f = feLocal(wl, el.L);
      const prev = fe.get(dl.elem); if (prev) for (let i = 0; i < 12; i++) prev[i] += f[i]; else fe.set(dl.elem, f);
      for (let J = 0; J < 4; J++) {
        const g = rotVT(el.R, [f[J * 3], f[J * 3 + 1], f[J * 3 + 2]]);
        for (let a = 0; a < 3; a++) fg[el.dofs[J * 3 + a]] += g[a];
      }
    }
    // температурна (початкова) деформація ε0 = α·ΔT: еквівалентні вузлові сили EA·ε0 у локальних осях
    for (const th of load.therm || []) {
      const el = P.els[th.elem];
      const E = (el.src.mat && el.src.mat.E) || SC.norms.E;
      const P0 = E * el.src.sec.A * th.eps;
      const f = new Array(12).fill(0); f[0] = -P0; f[6] = P0;
      const prev = fe.get(th.elem); if (prev) for (let i = 0; i < 12; i++) prev[i] += f[i]; else fe.set(th.elem, f);
      for (let J = 0; J < 4; J++) {
        const g = rotVT(el.R, [f[J * 3], f[J * 3 + 1], f[J * 3 + 2]]);
        for (let a = 0; a < 3; a++) fg[el.dofs[J * 3 + a]] += g[a];
      }
    }
    return { fg, fe };
  }

  function endForces(P, u, fe, Nax) {
    return P.els.map((el, k) => {
      const ue = el.dofs.map(d => u[d]);
      const ul = [];
      for (let J = 0; J < 4; J++) { const v = rotV(el.R, [ue[J * 3], ue[J * 3 + 1], ue[J * 3 + 2]]); ul.push(v[0], v[1], v[2]); }
      let kl = el.kl;
      if (Nax) { const g = F.kgLocal(Nax[k], el.L, el.src.type); kl = kl.map((r, i) => r.map((v, j) => v + g[i][j])); }
      const f = new Array(12).fill(0);
      for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += kl[i][j] * ul[j]; f[i] = s; }
      const q = fe.get(k); if (q) for (let i = 0; i < 12; i++) f[i] -= q[i];
      return f; // сили, з якими вузли діють на елемент (локальні осі)
    });
  }

  /** Внутрішні зусилля в перерізі на відстані s від початку (локальні осі). N>0 — розтяг. */
  F.sectionForces = function (f, wl, s) {
    const [wx, wy, wz] = wl || [0, 0, 0];
    const N = -f[0] - wx * s;
    const Vy = f[1] + wy * s, Vz = f[2] + wz * s;
    const T = -f[3];
    const Mz = -f[5] + f[1] * s + wy * s * s / 2;
    const My = -f[4] - f[2] * s - wz * s * s / 2;
    return { N, Vy, Vz, T, My, Mz };
  };

  /** Розв'язання. opts: {second: bool, maxIt, tol} */
  F.solve = function (P, load, opts) {
    opts = opts || {};
    const { fg, fe } = loadVector(P, load);
    const n = P.nf; const b = new Float64Array(n);
    for (let g = 0; g < P.nn * 6; g++) { const f = P.free[g]; if (f >= 0) b[f] = fg[g]; }
    let K = assemble(P, null);
    let ch = cholesky(K, n);
    if (!ch.ok) return { ok: false, error: 'mechanism', dof: dofName(P, ch.dof) };
    let x = cholSolve(ch.L, n, b);
    let u = expand(P, x);
    let ef = endForces(P, u, fe, null);
    let Nax = null, it = 0, conv = true;
    if (opts.second) {
      conv = false;
      for (it = 1; it <= (opts.maxIt || 8); it++) {
        Nax = ef.map(f => -f[0]); // осьова сила (розтяг > 0) у початку елемента
        K = assemble(P, Nax);
        ch = cholesky(K, n);
        if (!ch.ok) return { ok: false, error: 'instability', dof: dofName(P, ch.dof) };
        const x2 = cholSolve(ch.L, n, b);
        let dmax = 0, umax = 0;
        for (let i = 0; i < n; i++) { dmax = Math.max(dmax, Math.abs(x2[i] - x[i])); umax = Math.max(umax, Math.abs(x2[i])); }
        x = x2; u = expand(P, x); ef = endForces(P, u, fe, Nax);
        if (dmax <= (opts.tol || 1e-4) * Math.max(umax, 1e-12)) { conv = true; break; }
      }
    }
    // реакції: R = K_full·u − f у закріплених напрямках (через рівновагу елементів)
    const R = new Float64Array(P.nn * 6);
    P.els.forEach((el, k) => {
      const f = ef[k].slice(); const q = fe.get(k); if (q) for (let i = 0; i < 12; i++) f[i] += q[i];
      for (let J = 0; J < 4; J++) { const g = rotVT(el.R, [f[J * 3], f[J * 3 + 1], f[J * 3 + 2]]); for (let a = 0; a < 3; a++) R[el.dofs[J * 3 + a]] += g[a]; }
    });
    P.model.nodes.forEach((nd, k) => { if (nd.spring) for (let d = 0; d < 6; d++) if (nd.spring[d] && P.free[k * 6 + d] >= 0) R[k * 6 + d] += nd.spring[d] * u[k * 6 + d]; });
    for (let g = 0; g < P.nn * 6; g++) R[g] -= fg[g];
    const reactions = [];
    P.model.nodes.forEach((nd, k) => {
      const isSup = (nd.sup && nd.sup.some(Boolean)) || (nd.spring && nd.spring.some(Boolean));
      if (!isSup) return;
      const r = []; for (let d = 0; d < 6; d++) {
        const springF = nd.spring && nd.spring[d] && P.free[k * 6 + d] >= 0 ? -nd.spring[d] * u[k * 6 + d] : null;
        r.push(P.free[k * 6 + d] < 0 ? R[k * 6 + d] : (springF != null ? springF : 0));
      }
      reactions.push({ node: nd.id, r });
    });
    // контроль рівноваги: Σ навантажень + Σ реакцій ≈ 0
    const eq = equilibrium(P, fg, reactions);
    const wls = new Map(); for (const dl of load.dist || []) { const w = rotV(P.els[dl.elem].R, dl.w); const p = wls.get(dl.elem); wls.set(dl.elem, p ? p.map((v, i) => v + w[i]) : w); }
    return { ok: true, u, ef, wl: wls, reactions, eq, second: !!opts.second, converged: conv, iterations: it, Nax };
  };

  function expand(P, x) {
    const u = new Float64Array(P.nn * 6);
    for (let g = 0; g < P.nn * 6; g++) { const f = P.free[g]; if (f >= 0) u[g] = x[f]; }
    return u;
  }
  function dofName(P, f) {
    for (let g = 0; g < P.nn * 6; g++) if (P.free[g] === f) return { node: P.model.nodes[Math.floor(g / 6)].id, dof: ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'][g % 6] };
    return null;
  }
  function equilibrium(P, fg, reactions) {
    const sF = [0, 0, 0], sM = [0, 0, 0];
    const add = (p, f) => { for (let a = 0; a < 3; a++) sF[a] += f[a]; const m = cross(p, f.slice(0, 3)); for (let a = 0; a < 3; a++) sM[a] += m[a] + f[3 + a]; };
    let fmax = 1e-9;
    P.model.nodes.forEach((nd, k) => { const f = Array.from(fg.slice(k * 6, k * 6 + 6)); fmax = Math.max(fmax, ...f.slice(0, 3).map(Math.abs)); add([nd.x, nd.y, nd.z], f); });
    for (const r of reactions) { const nd = P.model.nodes[P.idx.get(r.node)]; add([nd.x, nd.y, nd.z], r.r); }
    return { F: sF, M: sM, rel: Math.max(...sF.map(Math.abs)) / fmax };
  }

  /**
   * Модальний аналіз з зосередженими масами (лише поступальні ступені свободи).
   * masses: Float64Array(nn) — маса у вузлі, кг. Повертає форми, періоди, коефіцієнти участі та ефективні маси.
   */
  F.modal = function (P, masses, nModes) {
    const n = P.nf;
    const K = assemble(P, null);
    const ch = cholesky(K, n);
    if (!ch.ok) return { ok: false, error: 'mechanism' };
    const Md = new Float64Array(n);
    for (let k = 0; k < P.nn; k++) for (let d = 0; d < 3; d++) { const f = P.free[k * 6 + d]; if (f >= 0) Md[f] = masses[k]; }
    const nMassDof = Md.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
    const q = Math.min(nModes || 6, nMassDof);
    const p = Math.min(Math.max(2 * q, q + 6), nMassDof);
    // початкові вектори
    let X = [];
    for (let j = 0; j < p; j++) { const v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = Md[i] * (j === 0 ? 1 : Math.sin((i + 1) * (j + 1) * 1.37) + (i % (j + 2) === 0 ? 1 : 0)); X.push(v); }
    let lam = new Array(p).fill(0), Phi = X;
    for (let iter = 0; iter < 60; iter++) {
      const Y = X.map(v => cholSolve(ch.L, n, v.map((x, i) => x * Md[i]).map(x => x)));
      // проекції: Kr = Yᵀ K Y = Yᵀ (M X); Mr = Yᵀ M Y
      const Kr = [], Mr = [];
      for (let a = 0; a < p; a++) { Kr.push(new Float64Array(p)); Mr.push(new Float64Array(p)); }
      for (let a = 0; a < p; a++) for (let b = a; b < p; b++) {
        let sk = 0, sm = 0;
        for (let i = 0; i < n; i++) { sk += Y[a][i] * Md[i] * X[b][i]; sm += Y[a][i] * Md[i] * Y[b][i]; }
        Kr[a][b] = Kr[b][a] = sk; Mr[a][b] = Mr[b][a] = sm;
      }
      const { values, vectors } = genEigJacobi(Kr, Mr, p);
      const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
      const newLam = order.map(i => values[i]);
      Phi = order.map(i => { const v = new Float64Array(n); for (let a = 0; a < p; a++) { const c = vectors[a][i]; if (c) for (let r = 0; r < n; r++) v[r] += c * Y[a][r]; } return v; });
      let conv = true; for (let j = 0; j < q; j++) if (Math.abs(newLam[j] - lam[j]) > 1e-9 * Math.abs(newLam[j])) conv = false;
      lam = newLam; X = Phi;
      if (conv && iter > 2) break;
    }
    const totalM = [0, 0, 0];
    for (let k = 0; k < P.nn; k++) for (let d = 0; d < 3; d++) if (P.free[k * 6 + d] >= 0) totalM[d] += masses[k];
    const modes = [];
    for (let j = 0; j < q; j++) {
      const phi = Phi[j];
      let mm = 0; for (let i = 0; i < n; i++) mm += phi[i] * phi[i] * Md[i];
      const s = 1 / Math.sqrt(mm); for (let i = 0; i < n; i++) phi[i] *= s; // M-нормування
      const gamma = [0, 0, 0];
      for (let k = 0; k < P.nn; k++) for (let d = 0; d < 3; d++) { const f = P.free[k * 6 + d]; if (f >= 0) gamma[d] += phi[f] * masses[k]; }
      const w = Math.sqrt(Math.max(lam[j], 1e-30));
      modes.push({ omega: w, T: 2 * Math.PI / w, f: w / (2 * Math.PI), phi: expand(P, phi), gamma, meff: gamma.map((g, d) => g * g / (totalM[d] || 1)) });
    }
    return { ok: true, modes, totalM };
  };

  /** Узагальнена задача на власні значення A·v = λ·B·v (малі матриці), через Холецького B та Якобі. */
  function genEigJacobi(A, B, p) {
    // B = LLᵀ; C = L⁻¹ A L⁻ᵀ
    const Lb = []; for (let i = 0; i < p; i++) Lb.push(new Float64Array(p));
    for (let j = 0; j < p; j++) {
      let s = B[j][j]; for (let k = 0; k < j; k++) s -= Lb[j][k] ** 2;
      Lb[j][j] = Math.sqrt(Math.max(s, 1e-300));
      for (let i = j + 1; i < p; i++) { let t = B[i][j]; for (let k = 0; k < j; k++) t -= Lb[i][k] * Lb[j][k]; Lb[i][j] = t / Lb[j][j]; }
    }
    const Li = inverseLower(Lb, p);
    const C = matMul(matMul(Li, A, p), transpose(Li, p), p);
    const { values, vectors } = jacobi(C, p);
    const V = matMul(transpose(Li, p), vectors, p);
    return { values, vectors: V };
  }
  function inverseLower(L, p) { const I = []; for (let i = 0; i < p; i++) { I.push(new Float64Array(p)); } for (let c = 0; c < p; c++) { for (let i = 0; i < p; i++) { let s = i === c ? 1 : 0; for (let k = 0; k < i; k++) s -= L[i][k] * I[k][c]; I[i][c] = s / L[i][i]; } } return I; }
  function transpose(A, p) { const T = []; for (let i = 0; i < p; i++) { T.push(new Float64Array(p)); for (let j = 0; j < p; j++) T[i][j] = A[j][i]; } return T; }
  function matMul(A, B, p) { const C = []; for (let i = 0; i < p; i++) { C.push(new Float64Array(p)); for (let k = 0; k < p; k++) { const a = A[i][k]; if (a) for (let j = 0; j < p; j++) C[i][j] += a * B[k][j]; } } return C; }
  function jacobi(A0, p) {
    const A = A0.map(r => Float64Array.from(r));
    const V = []; for (let i = 0; i < p; i++) { V.push(new Float64Array(p)); V[i][i] = 1; }
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) off += A[i][j] ** 2;
      if (off < 1e-24) break;
      for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
        if (Math.abs(A[i][j]) < 1e-300) continue;
        const th = (A[j][j] - A[i][i]) / (2 * A[i][j]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < p; k++) { const aki = A[k][i], akj = A[k][j]; A[k][i] = c * aki - s * akj; A[k][j] = s * aki + c * akj; }
        for (let k = 0; k < p; k++) { const aik = A[i][k], ajk = A[j][k]; A[i][k] = c * aik - s * ajk; A[j][k] = s * aik + c * ajk; }
        for (let k = 0; k < p; k++) { const vki = V[k][i], vkj = V[k][j]; V[k][i] = c * vki - s * vkj; V[k][j] = s * vki + c * vkj; }
      }
    }
    return { values: A.map((r, i) => r[i]), vectors: V };
  }

  /** Критичний коефіцієнт навантаження αcr (пружна стійкість системи) для заданих осьових сил: (K + α·KG)·φ = 0. */
  F.alphaCr = function (P, Nax) {
    const n = P.nf;
    const K = assemble(P, null);
    const ch = cholesky(K, n);
    if (!ch.ok) return null;
    // KG окремо
    const KG = new Float64Array(n * n);
    P.els.forEach((el, k) => {
      const kgg = toGlobal(F.kgLocal(Nax[k], el.L, el.src.type), el.R);
      for (let a = 0; a < 12; a++) { const fa = P.free[el.dofs[a]]; if (fa < 0) continue; for (let b = 0; b < 12; b++) { const fb = P.free[el.dofs[b]]; if (fb < 0) continue; KG[fa * n + fb] += kgg[a][b]; } }
    });
    // степенева ітерація для μ = 1/α: K⁻¹(−KG)x = μ x (найбільше додатне μ)
    let x = new Float64Array(n).map((_, i) => 1 + (i % 7) * 0.1), mu = 0;
    for (let it = 0; it < 300; it++) {
      const y = new Float64Array(n);
      for (let i = 0; i < n; i++) { let s = 0; const r = i * n; for (let j = 0; j < n; j++) s -= KG[r + j] * x[j]; y[i] = s; }
      const z = cholSolve(ch.L, n, y);
      let num = 0, den = 0; for (let i = 0; i < n; i++) { num += z[i] * x[i]; den += x[i] * x[i]; }
      const m2 = num / den;
      let zn = 0; for (let i = 0; i < n; i++) zn = Math.max(zn, Math.abs(z[i]));
      if (zn === 0) return Infinity;
      for (let i = 0; i < n; i++) x[i] = z[i] / zn;
      if (Math.abs(m2 - mu) < 1e-7 * Math.abs(m2)) { mu = m2; break; }
      mu = m2;
    }
    return mu > 0 ? 1 / mu : Infinity;
  };

  SC.fem = F;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
