/* Імпорт 3D-моделі (STL ASCII/бінарний, OBJ) та геометричні розрахунки за ТЗ, р. 4:
 *   A_i = ½‖(b−a)×(c−a)‖, n_i, r_i = (a+b+c)/3, A_shell = ΣA_i, r_G = Σm_i·r_i / Σm_i;
 *   A_ref(θ) = Area[⋃ Π_θ(T_i)] — площа об'єднання проєкцій (растеризація без подвійного врахування перекриттів);
 *   A_h — горизонтальна проєкція граней, орієнтованих догори (для снігу).
 */
(function (SC) {
  'use strict';

  const Me = {};

  Me.parse = function (buf, name) {
    const lower = (name || '').toLowerCase();
    if (lower.endsWith('.obj')) return parseOBJ(new TextDecoder().decode(buf));
    const head = new TextDecoder().decode(buf.slice(0, 256));
    const dv = new DataView(buf);
    if (buf.byteLength >= 84) {
      const n = dv.getUint32(80, true);
      if (84 + n * 50 === buf.byteLength) return parseSTLbin(dv, n);
    }
    if (/^\s*solid/.test(head)) return parseSTLascii(new TextDecoder().decode(buf));
    throw new Error('Невідомий формат файлу');
  };
  function parseSTLbin(dv, n) {
    const tris = new Float64Array(n * 9);
    for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) tris[i * 9 + k] = dv.getFloat32(o + k * 4, true); }
    return tris;
  }
  function parseSTLascii(t) {
    const v = []; const re = /vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/g; let m;
    while ((m = re.exec(t))) v.push(+m[1], +m[2], +m[3]);
    return Float64Array.from(v);
  }
  function parseOBJ(t) {
    const vs = [], out = [];
    for (const line of t.split(/\r?\n/)) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'v') vs.push([+p[1], +p[2], +p[3]]);
      else if (p[0] === 'f') {
        const id = p.slice(1).map(s => { const i = parseInt(s.split('/')[0], 10); return i < 0 ? vs.length + i : i - 1; });
        for (let k = 1; k < id.length - 1; k++) for (const q of [id[0], id[k], id[k + 1]]) out.push(...vs[q]);
      }
    }
    return Float64Array.from(out);
  }

  /**
   * Аналіз сітки. opts: {scale (до м), upAxis: 'z'|'y', offset:[x,y,z], step (°), res}
   */
  Me.analyze = function (tris0, opts) {
    opts = opts || {};
    const s = opts.scale || 1;
    const n = tris0.length / 9;
    const T = new Float64Array(tris0.length);
    for (let i = 0; i < n * 3; i++) {
      let x = tris0[i * 3] * s, y = tris0[i * 3 + 1] * s, z = tris0[i * 3 + 2] * s;
      if (opts.upAxis === 'y') { const t = y; y = -z; z = t; }
      T[i * 3] = x; T[i * 3 + 1] = y; T[i * 3 + 2] = z;
    }
    // зсув: основа на z = 0, центр у плані — у початку координат (якщо не задано)
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n * 3; i++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], T[i * 3 + a]); mx[a] = Math.max(mx[a], T[i * 3 + a]); }
    const off = opts.noRecenter ? [0, 0, 0] : (opts.offset || [-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]]);
    for (let i = 0; i < n * 3; i++) for (let a = 0; a < 3; a++) T[i * 3 + a] += off[a];
    for (let a = 0; a < 3; a++) { mn[a] += off[a]; mx[a] += off[a]; }
    let Aall = 0; const c = [0, 0, 0];
    let Aup = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const ab = [T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]];
      const ac = [T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]];
      const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const A = 0.5 * Math.hypot(cr[0], cr[1], cr[2]);
      Aall += A;
      for (let a = 0; a < 3; a++) c[a] += A * (T[o + a] + T[o + 3 + a] + T[o + 6 + a]) / 3;
      if (A > 0 && cr[2] / (2 * A) > 0.5) Aup += A; // нахил < 60° — потенційне накопичення снігу
    }
    for (let a = 0; a < 3; a++) c[a] /= Aall || 1;
    const step = opts.step || 15;
    const res = opts.res || 300;
    const table = [];
    const zcp = [];
    for (let th = 0; th < 360; th += step) {
      const r = th * Math.PI / 180;
      const e = [-Math.sin(r), Math.cos(r)]; // вісь u у площині, перпендикулярній вітру
      const pr = rasterUnion(T, n, (x, y, z) => [x * e[0] + y * e[1], z], res);
      table.push(pr.area); zcp.push(pr.cy);
    }
    // горизонтальна проєкція граней, орієнтованих догори (об'єднання)
    const up = [];
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const ab = [T[o + 3] - T[o], T[o + 4] - T[o + 1]], ac = [T[o + 6] - T[o], T[o + 7] - T[o + 1]];
      if (ab[0] * ac[1] - ab[1] * ac[0] > 0) for (let k = 0; k < 9; k++) up.push(T[o + k]);
    }
    const Ah = up.length ? rasterUnion(Float64Array.from(up), up.length / 9, (x, y) => [x, y], res).area : 0;
    return {
      nTri: n, area: Aall, centroid: c, bbox: { mn, mx }, areaTable: table, zcpTable: zcp, step, Ah, Aup,
      Ax: table[0], Ay: table[Math.round(90 / step)] || table[0], tris: T, offset: off,
    };
  };

  /** Площа об'єднання проєкцій трикутників (растр res×res) і центр площі (по другій координаті). */
  function rasterUnion(T, n, proj, res) {
    const P = new Float64Array(n * 6);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
      const o = i * 9 + k * 3; const [u, v] = proj(T[o], T[o + 1], T[o + 2]);
      P[i * 6 + k * 2] = u; P[i * 6 + k * 2 + 1] = v;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const w = Math.max(u1 - u0, v1 - v0) || 1;
    const h = w / res;
    const nu = Math.ceil((u1 - u0) / h) + 1, nv = Math.ceil((v1 - v0) / h) + 1;
    const grid = new Uint8Array(nu * nv);
    for (let i = 0; i < n; i++) {
      const ax = P[i * 6], ay = P[i * 6 + 1], bx = P[i * 6 + 2], by = P[i * 6 + 3], cx = P[i * 6 + 4], cy = P[i * 6 + 5];
      const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(d) < 1e-18) continue;
      const iu0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - u0) / h)), iu1 = Math.min(nu - 1, Math.ceil((Math.max(ax, bx, cx) - u0) / h));
      const iv0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - v0) / h)), iv1 = Math.min(nv - 1, Math.ceil((Math.max(ay, by, cy) - v0) / h));
      for (let iv = iv0; iv <= iv1; iv++) {
        const py = v0 + (iv + 0.5) * h;
        for (let iu = iu0; iu <= iu1; iu++) {
          const px = u0 + (iu + 0.5) * h;
          const w1 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / d;
          const w2 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / d;
          if (w1 >= 0 && w2 >= 0 && w1 + w2 <= 1) grid[iv * nu + iu] = 1;
        }
      }
    }
    let cnt = 0, sy = 0;
    for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) if (grid[iv * nu + iu]) { cnt++; sy += v0 + (iv + 0.5) * h; }
    return { area: cnt * h * h, cy: cnt ? sy / cnt : 0 };
  }


  // ---------------- Перерізи по висоті ----------------

  /** Відрізки перетину сітки площиною z = const → замкнені контури [[x,y],...]. */
  Me.sectionAt = function (T, z) {
    const n = T.length / 9, segs = [];
    const zz = z + 1e-9; // вершини точно на площині зсуваються вгору — без вироджених відрізків
    for (let i = 0; i < n; i++) {
      const o = i * 9, P = [[T[o], T[o + 1], T[o + 2]], [T[o + 3], T[o + 4], T[o + 5]], [T[o + 6], T[o + 7], T[o + 8]]];
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const a = P[k], b = P[(k + 1) % 3], da = a[2] - zz, db = b[2] - zz;
        if ((da < 0) !== (db < 0)) { const t = da / (da - db); pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      if (pts.length === 2) segs.push(pts);
    }
    return { loops: chain(segs), nSeg: segs.length };
  };
  function chain(segs) {
    if (!segs.length) return [];
    let span = 0; segs.forEach(s => s.forEach(p => { span = Math.max(span, Math.abs(p[0]), Math.abs(p[1])); }));
    const q = Math.max(span, 1) * 1e-7, key = p => Math.round(p[0] / q) + ',' + Math.round(p[1] / q);
    const adj = new Map(), used = new Uint8Array(segs.length);
    segs.forEach((s, i) => s.forEach((p, e) => { const k = key(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push([i, e]); }));
    const loops = [];
    for (let i0 = 0; i0 < segs.length; i0++) {
      if (used[i0]) continue;
      used[i0] = 1;
      const loop = [segs[i0][0], segs[i0][1]];
      let cur = segs[i0][1], closed = false;
      for (let guard = 0; guard < segs.length; guard++) {
        const cand = (adj.get(key(cur)) || []).find(([j]) => !used[j]);
        if (!cand) break;
        const [j, e] = cand; used[j] = 1;
        cur = segs[j][1 - e];
        if (key(cur) === key(loop[0])) { closed = true; break; }
        loop.push(cur);
      }
      if (loop.length >= 3) loops.push({ pts: loop, closed });
    }
    return loops;
  }
  const polyArea = pts => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return a / 2; };
  const inPoly = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  Me.inPoly = inPoly;

  /** Площа перерізу (правило парності вкладених контурів), центр, периметр, габарит. */
  Me.sectionProps = function (loops) {
    let A = 0, cx = 0, cy = 0, per = 0, mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    loops.forEach((L, i) => {
      const pts = L.pts;
      for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; if (k < pts.length - 1 || L.closed) per += Math.hypot(b[0] - a[0], b[1] - a[1]); mn = [Math.min(mn[0], a[0]), Math.min(mn[1], a[1])]; mx = [Math.max(mx[0], a[0]), Math.max(mx[1], a[1])]; }
      if (!L.closed) return;
      const depth = loops.filter((M, j) => j !== i && M.closed && inPoly(pts[0], M.pts)).length;
      const sa = Math.abs(polyArea(pts)) * (depth % 2 ? -1 : 1);
      let gx = 0, gy = 0, a2 = 0;
      for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) { const cr = pts[j][0] * pts[k][1] - pts[k][0] * pts[j][1]; a2 += cr; gx += (pts[j][0] + pts[k][0]) * cr; gy += (pts[j][1] + pts[k][1]) * cr; }
      if (Math.abs(a2) > 1e-12) { cx += gx / (3 * a2) * sa; cy += gy / (3 * a2) * sa; }
      A += sa;
    });
    const open = loops.some(L => !L.closed);
    return { A, c: A > 1e-9 ? [cx / A, cy / A] : [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2], per, bbox: { mn, mx }, open, nLoops: loops.length };
  };

  /** Відсікання трикутника смугою z0 ≤ z ≤ z1 (Сазерленд–Ходжмен) → багатокутник у 3D. */
  function clipBand(tri, z0, z1) {
    let poly = tri;
    for (const [lim, keepAbove] of [[z0, true], [z1, false]]) {
      const out = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        const ia = keepAbove ? a[2] >= lim : a[2] <= lim, ib = keepAbove ? b[2] >= lim : b[2] <= lim;
        if (ia) out.push(a);
        if (ia !== ib) { const t = (lim - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, lim]); }
      }
      poly = out; if (poly.length < 3) return null;
    }
    return poly;
  }
  Me.clipBand = clipBand;

  /** Поверхня в смузі [z0, z1]: площа, центр, трикутники (для проєкцій вітру й розкрою). */
  Me.band = function (T, z0, z1) {
    const n = T.length / 9, tris = []; let A = 0; const c = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      if (Math.max(T[o + 2], T[o + 5], T[o + 8]) < z0 || Math.min(T[o + 2], T[o + 5], T[o + 8]) > z1) continue;
      const poly = clipBand([[T[o], T[o + 1], T[o + 2]], [T[o + 3], T[o + 4], T[o + 5]], [T[o + 6], T[o + 7], T[o + 8]]], z0, z1);
      if (!poly) continue;
      for (let k = 1; k < poly.length - 1; k++) {
        const a = poly[0], b = poly[k], d = poly[k + 1];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        const ar = 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
        if (ar <= 0) continue;
        A += ar; for (let q = 0; q < 3; q++) c[q] += ar * (a[q] + b[q] + d[q]) / 3;
        tris.push(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]);
      }
    }
    return { A, c: A > 0 ? c.map(v => v / A) : [0, 0, (z0 + z1) / 2], tris: Float64Array.from(tris) };
  };

  /**
   * Перерізи моделі по висоті з кроком step (м): контур і площа перерізу на кожному рівні, а між рівнями —
   * площа поверхні, маса оболонки (ρ·t·A), центр мас смуги, проєкції A_x, A_y (вітер). Підсумок — центр мас усієї оболонки.
   * opts: {step, t (мм), rho, res}
   */
  Me.slices = function (T, opts) {
    opts = opts || {};
    const n = T.length / 9; let z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n * 3; i++) { z0 = Math.min(z0, T[i * 3 + 2]); z1 = Math.max(z1, T[i * 3 + 2]); }
    const step = Math.max(0.05, opts.step || 0.5), t = (opts.t || 2) / 1000, rho = opts.rho || 7850, res = opts.res || 160;
    const nB = Math.max(1, Math.ceil((z1 - z0) / step - 1e-9));
    const levels = Array.from({ length: nB + 1 }, (_, k) => Math.min(z1, z0 + k * step));
    const secs = levels.map(z => { const zz = Math.min(Math.max(z, z0 + 1e-6), z1 - 1e-6); const s = Me.sectionAt(T, zz); return Object.assign({ z }, Me.sectionProps(s.loops), { loops: s.loops.map(L => ({ closed: L.closed, pts: simplify(L.pts, 96) })) }); });
    const bands = [];
    for (let k = 0; k < nB; k++) {
      const b = Me.band(T, levels[k], levels[k + 1]);
      const nt = b.tris.length / 9;
      const Ax = nt ? rasterUnion(b.tris, nt, (x, y, z) => [y, z], res).area : 0;
      const Ay = nt ? rasterUnion(b.tris, nt, (x, y, z) => [x, z], res).area : 0;
      bands.push({ z0: levels[k], z1: levels[k + 1], A: b.A, m: b.A * t * rho, c: b.c, Ax, Ay, tris: b.tris });
    }
    const M = bands.reduce((a, b) => a + b.m, 0);
    const cg = [0, 1, 2].map(q => M > 0 ? bands.reduce((a, b) => a + b.m * b.c[q], 0) / M : 0);
    return { z0, z1, step, levels, secs, bands, M, cg, t: t * 1000, rho };
  };
  function simplify(pts, max) { if (pts.length <= max) return pts.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]); const k = pts.length / max; return Array.from({ length: max }, (_, i) => pts[Math.floor(i * k)]).map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]); }

  /**
   * Найбільший прямокутник ядра a×b (b = a·ratio) з центром c, що вписується в переріз із зазором clr
   * (кути й сторони прямокутника — всередині контуру, жодне ребро контуру не перетинає прямокутник).
   */
  Me.fitCore = function (loops, c, ratio, clr) {
    const closed = loops.filter(L => L.closed);
    if (!closed.length) return 0;
    const inside = p => closed.reduce((k, L) => k + (inPoly(p, L.pts) ? 1 : 0), 0) % 2 === 1;
    const segX = (a, b, r) => { // відрізок ab перетинає прямокутник r = [x0,y0,x1,y1]?
      if (Math.max(a[0], b[0]) < r[0] || Math.min(a[0], b[0]) > r[2] || Math.max(a[1], b[1]) < r[1] || Math.min(a[1], b[1]) > r[3]) return false;
      if (a[0] >= r[0] && a[0] <= r[2] && a[1] >= r[1] && a[1] <= r[3]) return true;
      const E = [[[r[0], r[1]], [r[2], r[1]]], [[r[2], r[1]], [r[2], r[3]]], [[r[2], r[3]], [r[0], r[3]]], [[r[0], r[3]], [r[0], r[1]]]];
      const cr = (p, q, s) => (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
      return E.some(([p, q]) => (cr(a, b, p) > 0) !== (cr(a, b, q) > 0) && (cr(p, q, a) > 0) !== (cr(p, q, b) > 0));
    };
    const fits = a => {
      const hx = a / 2 + clr, hy = a * ratio / 2 + clr, r = [c[0] - hx, c[1] - hy, c[0] + hx, c[1] + hy];
      if (![[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].every(inside)) return false;
      return !closed.some(L => L.pts.some((p, k) => segX(p, L.pts[(k + 1) % L.pts.length], r)));
    };
    if (!inside(c) || !fits(0)) return 0;
    let lo = 0, hi = 20;
    while (fits(hi) && hi < 200) { lo = hi; hi *= 2; }
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    return lo;
  };

  /**
   * Пропозиція ядра за перерізами: найбільше ядро, що вписується в оболонку на кожному рівні (лінійне звуження від низу до верху),
   * верх ядра — найвищий рівень, де вміщується ядро ≥ aMin. Пояси — на рівнях перерізів з кроком beltStep.
   */
  Me.proposeCore = function (sl, o) {
    o = Object.assign({ ratio: 1, clr: 0.08, aMin: 0.25, beltStep: 1.5, center: [0, 0], z0: 0.15 }, o || {});
    const fit = sl.secs.map(s => ({ z: s.z, a: s.z < o.z0 ? Infinity : Me.fitCore(s.loops, o.center, o.ratio, o.clr) }));
    let zTop = 0; fit.forEach(q => { if (q.a >= o.aMin && isFinite(q.a)) zTop = Math.max(zTop, q.z); });
    for (const q of fit) if (q.z > o.z0 && q.z <= zTop && q.a < o.aMin) { zTop = fit.filter(w => w.z < q.z).reduce((m, w) => Math.max(m, w.z), 0); break; }
    if (zTop <= 0) return null;
    const use = fit.filter(q => q.z <= zTop && isFinite(q.a));
    const aTop = Math.min(...use.filter(q => q.z >= 0.7 * zTop).map(q => q.a), Infinity);
    let a = Infinity;
    use.forEach(q => { const tt = q.z / zTop; if (tt < 0.999) a = Math.min(a, (q.a - aTop * tt) / (1 - tt)); });
    const rd = v => Math.max(o.aMin, Math.floor(v / 0.05) * 0.05);
    a = rd(Math.min(a, 2.0)); const aT = rd(Math.min(aTop, a));
    const n = Math.max(1, Math.round(zTop / o.beltStep));
    const levels = Array.from({ length: n + 1 }, (_, k) => +(zTop * k / n).toFixed(2));
    return { a: +a.toFixed(2), b: +(a * o.ratio).toFixed(2), aTop: +aT.toFixed(2), bTop: +(aT * o.ratio).toFixed(2), zTop: +zTop.toFixed(2), levels, fit };
  };

  /**
   * Розкрій обшивки: смуги між перерізами × сектори навколо осі (ширина сектора ≤ wMax по периметру).
   * Нумерація — згори вниз, у кожній смузі за годинниковою стрілкою від фасаду (−Y). Площа й центр — точні (відсічені трикутники).
   */
  Me.segments = function (sl, o) {
    o = Object.assign({ wMax: 1.25, hMax: 2.5, t: sl.t, rho: sl.rho }, o || {});
    const out = []; let num = 0;
    for (let k = sl.bands.length - 1; k >= 0; k--) {
      const b = sl.bands[k], sm = sl.secs[k], sp = sl.secs[k + 1];
      if (!b.A) continue;
      const per = Math.max(sm.per, sp.per, 1e-6), c = [(sm.c[0] + sp.c[0]) / 2, (sm.c[1] + sp.c[1]) / 2];
      const nS = Math.max(1, Math.ceil(per / o.wMax));
      const acc = Array.from({ length: nS }, () => ({ A: 0, c: [0, 0, 0] }));
      const T = b.tris, nt = T.length / 9;
      for (let i = 0; i < nt; i++) {
        const q = i * 9, g = [(T[q] + T[q + 3] + T[q + 6]) / 3, (T[q + 1] + T[q + 4] + T[q + 7]) / 3, (T[q + 2] + T[q + 5] + T[q + 8]) / 3];
        const u = [T[q + 3] - T[q], T[q + 4] - T[q + 1], T[q + 5] - T[q + 2]], v = [T[q + 6] - T[q], T[q + 7] - T[q + 1], T[q + 8] - T[q + 2]];
        const nz = u[0] * v[1] - u[1] * v[0], ar = 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], nz);
        // підошва моделі (горизонтальна грань на рівні низу, нормаль донизу) — це основа, а не обшивка
        if (o.skipBottom !== false && Math.max(T[q + 2], T[q + 5], T[q + 8]) < sl.z0 + 1e-4 && nz < 0) continue;
        // кут від фасаду (−Y) за годинниковою стрілкою (вигляд згори)
        let ang = Math.atan2(g[0] - c[0], -(g[1] - c[1])); if (ang < 0) ang += 2 * Math.PI;
        const j = Math.min(nS - 1, Math.floor(ang / (2 * Math.PI) * nS));
        acc[j].A += ar; for (let w = 0; w < 3; w++) acc[j].c[w] += ar * g[w];
      }
      const wS = (sm.per + sp.per) / 2 / nS; // розгорнута ширина сектора — частка середнього периметра смуги
      acc.forEach((s, j) => {
        if (s.A <= 1e-6) return;
        num++;
        const h = s.A / Math.max(wS, 1e-6); // розгорнута висота заготовки (для похилої поверхні > висоти смуги)
        out.push({ n: num, band: k + 1, sector: j + 1, z0: b.z0, z1: b.z1, A: s.A, m: s.A * o.t / 1000 * o.rho, c: s.c.map(v => v / s.A), w: wS, h, fits: wS <= o.wMax * 1.02 && h <= o.hMax * 1.02 });
      });
    }
    const sheet = o.wMax * o.hMax;
    return { list: out, nBands: sl.bands.length, A: out.reduce((a, s) => a + s.A, 0), M: out.reduce((a, s) => a + s.m, 0), sheets: Math.ceil(out.reduce((a, s) => a + s.A, 0) / (sheet * 0.8)), wMax: o.wMax, hMax: o.hMax, t: o.t, rho: o.rho };
  };

  SC.mesh = Me;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
