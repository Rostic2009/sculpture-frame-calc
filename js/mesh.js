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
    const off = opts.offset || [-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]];
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

  SC.mesh = Me;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
