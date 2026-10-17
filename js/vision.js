/* Машинний зір без зовнішніх API (ТЗ, розділ «Модуль машинного зору»):
 *  - виділення скульптури на зображенні: оцінка кольору фону за краями кадру (k-середніх у просторі Lab),
 *    заливка від країв по схожих на фон пікселях, морфологічне очищення, найбільші компоненти;
 *  - інструменти маски: «чарівна паличка» (заливка за кольором), пензель, багатокутник;
 *  - мітки частин: 0 — фон, 1 — скульптура без частини, k ≥ 2 — частина (k−2) з дерева частин;
 *  - масштаб: s = L_real / L_px за підтвердженим розміром; контроль інших розмірів ε = |L_model − L_input| / L_input;
 *  - відновлення 3D з фронтальної та бокової проєкцій: шари з еліптичним перерізом (оболонка «видимого контуру»),
 *    або тонкий лист для відкритих частин; перевірка силуету IoU = |M_model ∩ M_ref| / |M_model ∪ M_ref|.
 */
(function (SC) {
  'use strict';

  const V = {};

  // ---------- колір ----------
  function srgb2lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  V.lab = function (r, g, b) {
    const R = srgb2lin(r), G = srgb2lin(g), B = srgb2lin(b);
    let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = (R * 0.2126 + G * 0.7152 + B * 0.0722), z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  /** Lab-карта зображення (Float32Array 3·w·h). img: {data, width, height}. */
  V.labMap = function (img) {
    const n = img.width * img.height, out = new Float32Array(n * 3), d = img.data;
    for (let i = 0; i < n; i++) { const l = V.lab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); out[i * 3] = l[0]; out[i * 3 + 1] = l[1]; out[i * 3 + 2] = l[2]; }
    return out;
  };

  /** k-середніх для кольорів країв (k = 3). */
  function kmeans(pts, k, it) {
    const c = []; for (let i = 0; i < k; i++) c.push(pts[Math.floor((i + 0.5) * pts.length / k)].slice());
    for (let t = 0; t < (it || 12); t++) {
      const sum = c.map(() => [0, 0, 0, 0]);
      for (const p of pts) { let bi = 0, bd = Infinity; c.forEach((q, i) => { const d = dE(p, q); if (d < bd) { bd = d; bi = i; } }); const s = sum[bi]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; }
      sum.forEach((s, i) => { if (s[3]) c[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    }
    return c;
  }

  /**
   * Автоматичне виділення скульптури. Повертає маску Uint8Array (1 — об'єкт, 0 — фон).
   * opts: {tol (ΔE, типово 18), holes: true — фонові ділянки, оточені об'єктом, теж вважати фоном}
   */
  V.autoMask = function (img, opts) {
    opts = opts || {};
    const w = img.width, h = img.height, lab = V.labMap(img);
    const P = i => [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];
    const border = [];
    const step = Math.max(1, Math.floor((w + h) / 400));
    for (let x = 0; x < w; x += step) { border.push(P(x), P((h - 1) * w + x)); }
    for (let y = 0; y < h; y += step) { border.push(P(y * w), P(y * w + w - 1)); }
    const bg = kmeans(border, 3);
    const tol = opts.tol || 18;
    const isBg = i => { const p = P(i); return bg.some(q => dE(p, q) < tol); };
    const mask = new Uint8Array(w * h).fill(1);
    const stack = [];
    const push = i => { if (mask[i] === 1 && isBg(i)) { mask[i] = 0; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    if (opts.holes) for (let i = 0; i < w * h; i++) if (mask[i] === 1 && isBg(i)) mask[i] = 0;
    V.morph(mask, w, h, 'close', 1); V.morph(mask, w, h, 'open', 1);
    V.keepLarge(mask, w, h, opts.minFrac || 0.002);
    return { mask, bg };
  };

  /** Морфологія (квадратне вікно 2r+1) для бінарної маски (значення > 0 — об'єкт). */
  V.morph = function (m, w, h, op, r) {
    const dil = (src, val) => {
      const out = new Uint8Array(src.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let any = false;
        for (let dy = -r; dy <= r && !any; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; if ((src[yy * w + xx] > 0) === val) { any = true; break; } } }
        out[y * w + x] = val ? (any ? 1 : 0) : (any ? 0 : 1);
      }
      return out;
    };
    let a = Uint8Array.from(m, v => v > 0 ? 1 : 0);
    if (op === 'close') a = dil(dil(a, true), false); else a = dil(dil(a, false), true);
    for (let i = 0; i < m.length; i++) if (!a[i]) m[i] = 0; else if (!m[i]) m[i] = 1;
  };

  /** Видалення дрібних компонент (частка площі кадру менша за minFrac). */
  V.keepLarge = function (m, w, h, minFrac) {
    const lab = new Int32Array(w * h).fill(-1), sizes = [];
    let id = 0;
    for (let i = 0; i < w * h; i++) {
      if (!m[i] || lab[i] >= 0) continue;
      const st = [i]; lab[i] = id; let n = 0;
      while (st.length) { const j = st.pop(); n++; const x = j % w, y = (j / w) | 0; for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (k >= 0 && m[k] && lab[k] < 0) { lab[k] = id; st.push(k); } }
      sizes.push(n); id++;
    }
    const min = minFrac * w * h;
    for (let i = 0; i < w * h; i++) if (m[i] && sizes[lab[i]] < min) m[i] = 0;
    return sizes.length;
  };

  /** «Чарівна паличка»: область, зв'язна з (sx, sy), з ΔE до кольору зразка < tol; constraint — маска дозволених пікселів. */
  V.wand = function (img, lab, sx, sy, tol, constraint) {
    const w = img.width, h = img.height;
    const s0 = sy * w + sx;
    const ref = [lab[s0 * 3], lab[s0 * 3 + 1], lab[s0 * 3 + 2]];
    const out = new Uint8Array(w * h), st = [s0];
    out[s0] = 1;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) {
        if (k < 0 || out[k]) continue;
        if (constraint && !constraint[k]) continue;
        if (dE([lab[k * 3], lab[k * 3 + 1], lab[k * 3 + 2]], ref) < tol) { out[k] = 1; st.push(k); }
      }
    }
    return out;
  };

  /** Пензель: круг радіуса r; set — нове значення мітки; onlyObj — змінювати лише пікселі об'єкта (мітка > 0). */
  V.brush = function (m, w, h, cx, cy, r, set, onlyObj) {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = y * w + x;
        if (onlyObj && !m[i]) continue;
        m[i] = set;
      }
  };

  /** Заливка багатокутника pts [[x,y],…] значенням set (лише по пікселях об'єкта, якщо onlyObj). */
  V.polygon = function (m, w, h, pts, set, onlyObj) {
    if (pts.length < 3) return 0;
    let n = 0;
    const ys = pts.map(p => p[1]);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(h - 1, Math.ceil(Math.max(...ys))); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)); x++) {
          const i = y * w + x; if (onlyObj && !m[i]) continue; m[i] = set; n++;
        }
    }
    return n;
  };

  // ---------- зберігання маски (RLE) ----------
  V.rle = function (m) { const out = []; let v = m[0], n = 0; for (let i = 0; i < m.length; i++) { if (m[i] === v) n++; else { out.push(v, n); v = m[i]; n = 1; } } out.push(v, n); return out.join(','); };
  V.unrle = function (s, len) { const m = new Uint8Array(len); if (!s) return m; const a = s.split(',').map(Number); let p = 0; for (let i = 0; i < a.length; i += 2) { m.fill(a[i], p, p + a[i + 1]); p += a[i + 1]; } return m; };

  // ---------- масштаб і розміри ----------
  /** Масштаб виду за розміром dim {p1:[u,v], p2:[u,v], value (м), type: 'vertical'|'horizontal'|'distance'} → м/піксель. */
  V.scaleFrom = function (dim) {
    const du = dim.p2[0] - dim.p1[0], dv = dim.p2[1] - dim.p1[1];
    const px = dim.type === 'vertical' ? Math.abs(dv) : dim.type === 'horizontal' ? Math.abs(du) : Math.hypot(du, dv);
    return px > 0 ? dim.value / px : NaN;
  };
  /** Перевірка узгодженості: для кожного підтвердженого розміру — ε відносно головного масштабу. */
  V.dimConflicts = function (view, tol) {
    const dims = (view.dims || []).filter(d => d.confirmed && d.value > 0);
    if (!dims.length) return { scale: NaN, list: [] };
    const main = dims.find(d => d.main) || dims[0];
    const s = V.scaleFrom(main);
    const list = dims.map(d => { const L = V.scaleFrom(Object.assign({}, d, { value: 1 })) ; const model = s / L; return { id: d.id, input: d.value, model, eps: Math.abs(model - d.value) / d.value, conflict: Math.abs(model - d.value) / d.value > (tol || 0.03) }; });
    return { scale: s, main: main.id, list };
  };

  // ---------- відновлення геометрії ----------
  /** Інтервали мітки label у рядку v: [[u0,u1],…]. */
  function rowIntervals(m, w, v, label) {
    const out = []; let s = -1;
    for (let u = 0; u < w; u++) { const on = m[v * w + u] === label; if (on && s < 0) s = u; if (!on && s >= 0) { out.push([s, u - 1]); s = -1; } }
    if (s >= 0) out.push([s, w - 1]);
    return out;
  }
  /** Межі мітки: {vmin, vmax, umin, umax, area(px)}. */
  V.bounds = function (m, w, h, label) {
    let vmin = h, vmax = -1, umin = w, umax = -1, n = 0;
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) if (m[v * w + u] === label) { n++; if (v < vmin) vmin = v; if (v > vmax) vmax = v; if (u < umin) umin = u; if (u > umax) umax = u; }
    return n ? { vmin, vmax, umin, umax, n } : null;
  };

  /**
   * Побудова 3D-сітки частини з двох проєкцій.
   * front: {m, w, h, s (м/пкс), u0, v0 (піксель початку координат — центр основи)}; side — те саме (може бути null);
   * label — мітка частини; opts: {shape: 'volume'|'sheet', depthRatio, sideSign (+1: праворуч на боковому виді = +Y), nSeg}
   */
  V.buildPart = function (front, side, labelF, labelS, opts) {
    opts = opts || {};
    const nSeg = opts.nSeg || 20;
    const bF = V.bounds(front.m, front.w, front.h, labelF);
    if (!bF) return null;
    const zTop = (front.v0 - bF.vmin) * front.s, zBot = (front.v0 - bF.vmax) * front.s;
    const nz = Math.max(4, Math.min(160, Math.round((bF.vmax - bF.vmin + 1) / 2)));
    const dz = (zTop - zBot) / nz;
    const slices = [];
    let assumed = !side || !V.bounds(side.m, side.w, side.h, labelS);
    for (let k = 0; k <= nz; k++) {
      const z = zBot + k * dz;
      const vF = Math.round(front.v0 - z / front.s);
      const ivF = vF >= 0 && vF < front.h ? rowIntervals(front.m, front.w, vF, labelF) : [];
      if (!ivF.length) { slices.push(null); continue; }
      let yA, yB;
      if (!assumed) {
        const vS = Math.round(side.v0 - z / side.s);
        const ivS = vS >= 0 && vS < side.h ? rowIntervals(side.m, side.w, vS, labelS) : [];
        if (ivS.length) {
          const u0 = Math.min(...ivS.map(i => i[0])), u1 = Math.max(...ivS.map(i => i[1])) + 1;
          const sg = opts.sideSign || 1;
          const y0 = sg * (u0 - side.u0) * side.s, y1 = sg * (u1 - side.u0) * side.s;
          yA = Math.min(y0, y1); yB = Math.max(y0, y1);
        }
      }
      const ell = ivF.map(([u0, u1]) => {
        const xa = (u0 - front.u0) * front.s, xb = (u1 + 1 - front.u0) * front.s;
        let ya = yA, yb = yB;
        if (ya == null) { const d = (xb - xa) * (opts.depthRatio || 0.6); ya = (opts.yCenter || 0) - d / 2; yb = (opts.yCenter || 0) + d / 2; }
        return { cx: (xa + xb) / 2, cy: (ya + yb) / 2, a: (xb - xa) / 2, b: Math.max((yb - ya) / 2, 0.002) };
      });
      slices.push({ z, ell });
    }
    const tris = [];
    const ring = (e, z) => { const r = []; for (let i = 0; i < nSeg; i++) { const t = 2 * Math.PI * i / nSeg; r.push([e.cx + e.a * Math.cos(t), e.cy + e.b * Math.sin(t), z]); } return r; };
    const push = (a, b, c) => tris.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const sheet = opts.shape === 'sheet';
    for (let k = 0; k < slices.length - 1; k++) {
      const A = slices[k], B = slices[k + 1];
      if (!A || !B) continue;
      // з'єднуємо найближчі еліпси сусідніх шарів
      for (const ea of A.ell) {
        const eb = B.ell.reduce((m, e) => Math.abs(e.cx - ea.cx) < Math.abs(m.cx - ea.cx) ? e : m, B.ell[0]);
        if (Math.abs(eb.cx - ea.cx) > ea.a + eb.a) continue;
        if (sheet) {
          const p = [[ea.cx - ea.a, ea.cy, A.z], [ea.cx + ea.a, ea.cy, A.z], [eb.cx + eb.a, eb.cy, B.z], [eb.cx - eb.a, eb.cy, B.z]];
          push(p[0], p[1], p[2]); push(p[0], p[2], p[3]);
          continue;
        }
        const ra = ring(ea, A.z), rb = ring(eb, B.z);
        for (let i = 0; i < nSeg; i++) { const j = (i + 1) % nSeg; push(ra[i], ra[j], rb[j]); push(ra[i], rb[j], rb[i]); }
      }
    }
    if (!sheet) {
      // торці (кришки) на першому/останньому шарі кожної ділянки
      for (let k = 0; k < slices.length; k++) {
        const S = slices[k]; if (!S) continue;
        const below = k > 0 && slices[k - 1], above = k < slices.length - 1 && slices[k + 1];
        for (const e of S.ell) {
          const cap = (dir) => { const r = ring(e, S.z), c = [e.cx, e.cy, S.z]; for (let i = 0; i < nSeg; i++) { const j = (i + 1) % nSeg; if (dir > 0) push(c, r[i], r[j]); else push(c, r[j], r[i]); } };
          if (!below) cap(-1); if (!above) cap(1);
        }
      }
    }
    // профіль по висоті: габарит перерізу (об'єднання еліпсів шару) — для вписування ядра каркаса в оболонку
    const prof = slices.filter(Boolean).map(S => ({ z: S.z, x0: Math.min(...S.ell.map(e => e.cx - e.a)), x1: Math.max(...S.ell.map(e => e.cx + e.a)), y0: Math.min(...S.ell.map(e => e.cy - e.b)), y1: Math.max(...S.ell.map(e => e.cy + e.b)), n: S.ell.length }));
    return { tris: Float64Array.from(tris), assumed, slices: slices.filter(Boolean).length, zTop, zBot, prof };
  };

  /**
   * Аналіз відновленої геометрії та пропозиція каркаса (без API — детерміновані правила).
   *  parts: [{name, kind, c:[x,y,z], z1, z2, H, area, Ax, Ay, Ah, prof, assumed}]
   *  Ядро вписується в найвужчий переріз «несучої» частини (тулуб/плащ) із зазором clear
   *  (лист + ребра допоміжного каркаса); рівні — крок ≤ step і висоти кріплення консолей.
   */
  V.describe = function (parts, opts) {
    opts = opts || {};
    const clear = opts.clear != null ? opts.clear : 0.08, step = opts.step || 1.5;
    if (!parts || !parts.length) return null;
    const H = Math.max(...parts.map(p => p.z2));
    const all = parts.flatMap(p => p.prof || []);
    const X0 = Math.min(...all.map(q => q.x0)), X1 = Math.max(...all.map(q => q.x1)), Y0 = Math.min(...all.map(q => q.y0)), Y1 = Math.max(...all.map(q => q.y1));
    const Atot = parts.reduce((a, p) => a + (p.area || 0), 0);
    const cg = [0, 1, 2].map(k => parts.reduce((a, p) => a + (p.area || 0) * p.c[k], 0) / Math.max(Atot, 1e-9));
    // несуча (вертикальна) частина: найвища з найбільшою площею серед тих, що стоять на основі
    const grounded = parts.filter(p => p.z1 < 0.15 * H);
    const body = (grounded.length ? grounded : parts).reduce((m, p) => (!m || p.H * (p.area || 1) > m.H * (m.area || 1) ? p : m), null);
    const prof = (body.prof || []).filter(q => q.z >= 0.02 * H);
    const inner = prof.map(q => ({ z: q.z, wx: q.x1 - q.x0 - 2 * clear, wy: q.y1 - q.y0 - 2 * clear, cx: (q.x0 + q.x1) / 2, cy: (q.y0 + q.y1) / 2 }));
    const zTopCore = Math.max(0.5, Math.min(body.z2, H) - Math.max(0.15, 0.04 * H));
    const band = (z0, z1) => inner.filter(q => q.z >= z0 && q.z <= z1);
    const minOf = (arr, k) => arr.length ? Math.min(...arr.map(q => q[k])) : NaN;
    const low = band(0, zTopCore * 0.5), high = band(zTopCore * 0.5, zTopCore);
    const r05 = v => Math.floor(v * 20) / 20;
    const wxL = minOf(low, 'wx'), wyL = minOf(low, 'wy'), wxH = minOf(high, 'wx'), wyH = minOf(high, 'wy');
    const fit = Math.min(wxL, wyL, wxH, wyH);
    const cants = parts.filter(p => p !== body).map(p => ({ p, r: Math.hypot(p.c[0] - body.c[0], p.c[1] - body.c[1]), z: p.c[2] })).sort((a, b) => b.r - a.r);
    // схема ядра
    let type, a, b, aTop, bTop, why;
    if (!isFinite(fit) || fit < 0.3) {
      type = 'single'; a = b = aTop = bTop = 0.4;
      why = `найвужчий внутрішній переріз оболонки ${isFinite(fit) ? Math.round(fit * 1000) + ' мм' : 'не визначено'} < 300 мм — просторове ядро не вміщується, прийнято одну консольну стійку`;
    } else {
      type = 'core4';
      a = Math.min(1.2, Math.max(0.3, r05(0.85 * Math.min(wxL, wxH > 0 ? wxL : wxL)))); b = Math.min(1.2, Math.max(0.3, r05(0.85 * wyL)));
      aTop = Math.min(a, Math.max(0.25, r05(0.85 * wxH))); bTop = Math.min(b, Math.max(0.25, r05(0.85 * wyH)));
      why = `чотиригранне ядро вписано в найвужчий внутрішній переріз оболонки (з зазором ${Math.round(clear * 1000)} мм на лист і ребра): унизу ${Math.round(wxL * 1000)}×${Math.round(wyL * 1000)} мм, угорі ${Math.round(wxH * 1000)}×${Math.round(wyH * 1000)} мм; план ядра прийнято 85 % від просвіту`;
    }
    // рівні: рівномірний крок ≤ step + рівні на висотах консолей (консоль виходить з вузла, а не з середини стійки)
    const n = Math.max(2, Math.ceil(zTopCore / step));
    let levels = Array.from({ length: n + 1 }, (_, i) => +(zTopCore * i / n).toFixed(2));
    for (const ct of cants) {
      const z = Math.min(zTopCore, Math.max(0.3, ct.z));
      if (z < zTopCore - 0.05 && levels.every(L => Math.abs(L - z) > 0.35)) levels.push(+z.toFixed(2));
    }
    levels = [...new Set(levels)].sort((x, y) => x - y);
    const secPost = H < 3 ? '□80×4' : H < 6 ? '□100×5' : H < 9 ? '□120×6' : '□140×6';
    const secBrace = H < 6 ? '□50×3' : '□60×4', secRing = H < 6 ? '□60×4' : '□80×4';
    const cantSec = r => r < 0.8 ? '□60×4' : r < 1.5 ? '□80×5' : '□100×5';
    const slender = H / Math.max(0.1, Math.min(X1 - X0, Y1 - Y0));
    const ecc = Math.hypot(cg[0], cg[1]);
    const text = [
      `Габарити скульптури: висота ${f2(H)} м, ширина (X) ${f2(X1 - X0)} м, глибина (Y) ${f2(Y1 - Y0)} м; гнучкість H/b = ${f2(slender)}.`,
      `Частин: ${parts.length}. Площа поверхні оболонки ${f2(Atot)} м²; найбільша фронтальна площа парусності ${f2(Math.max(...parts.map(p => p.Ax || 0)))} м² (частина «${parts.reduce((m, p) => (p.Ax || 0) > (m.Ax || 0) ? p : m, parts[0]).name}»).`,
      `Центр поверхні (≈ центр мас оболонки): x = ${f2(cg[0])}, y = ${f2(cg[1])}, z = ${f2(cg[2])} м; ексцентриситет у плані ${Math.round(ecc * 1000)} мм — ${ecc > 0.1 * Math.min(X1 - X0, Y1 - Y0) ? 'суттєвий: власна вага створює постійний момент на фундамент' : 'малий: власна вага передається майже центрально'}.`,
      `Несуча частина — «${body.name}» (z = ${f2(body.z1)}…${f2(body.z2)} м)${body.assumed ? ', глибина припущена — уточніть боковим видом' : ''}.`,
      cants.some(ct => ct.r >= 0.2) ? `Виноси в плані: ${cants.filter(ct => ct.r >= 0.2).map(ct => `«${ct.p.name}» ${Math.round(ct.r * 1000)} мм на висоті ${f2(ct.z)} м`).join('; ')}. Найбільший винос визначає згин консолі й крутний момент на ядро.` : 'Виносних частин у плані немає.',
      cants.some(ct => ct.r < 0.2) ? `Над ядром (вертикальні консолі): ${cants.filter(ct => ct.r < 0.2).map(ct => `«${ct.p.name}» — центр на ${f2(Math.max(0, ct.z - zTopCore))} м вище верху ядра`).join('; ')}.` : '',
      `Пропозиція каркаса: ${why}. Рівні поясів: ${levels.map(f2).join('; ')} м (крок ≤ ${f2(step)} м${levels.length > n + 1 ? ', додано рівні на висотах кріплення консолей' : ''}). Початкові перерізи: стійки ${secPost}, пояси ${secRing}, зв'язки ${secBrace}; остаточно — автоматичним підбором після розрахунку.`,
    ];
    return { H, B: X1 - X0, D: Y1 - Y0, Atot, cg, ecc, body: body.name, fit, frame: { type, a, b, aTop, bTop, levels, bracing: type === 'single' ? 'none' : 'X', secPost, secRing, secBrace }, cants: cants.map(ct => ({ name: ct.p.name, r: ct.r, z: ct.z, vertical: ct.r < 0.2, sec: cantSec(Math.max(ct.r, ct.z - zTopCore)) })), text: text.filter(Boolean) };
  };
  const f2 = v => (Math.round(v * 100) / 100).toLocaleString('uk-UA');

  /** IoU силуету: проєкція сітки на фронтальний вид проти маски мітки. */
  V.iouFront = function (tris, front, label) {
    const w = front.w, h = front.h, M = new Uint8Array(w * h);
    for (let t = 0; t < tris.length / 9; t++) {
      const P = [0, 1, 2].map(k => [front.u0 + tris[t * 9 + k * 3] / front.s, front.v0 - tris[t * 9 + k * 3 + 2] / front.s]);
      V.polygon(M, w, h, P, 1, false);
    }
    let inter = 0, uni = 0;
    for (let i = 0; i < w * h; i++) { const a = M[i] === 1, b = front.m[i] === label; if (a && b) inter++; if (a || b) uni++; }
    return uni ? inter / uni : 0;
  };

  /** Дані про якість зображення (етап 1): роздільність, обрізаність об'єкта, різкість (дисперсія лапласіана). */
  V.quality = function (img, mask) {
    const w = img.width, h = img.height, d = img.data;
    const gray = i => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) { const i = y * w + x; const L = 4 * gray(i) - gray(i - 1) - gray(i + 1) - gray(i - w) - gray(i + w); s += L; s2 += L * L; n++; }
    const lapVar = s2 / n - (s / n) ** 2;
    let cut = [];
    if (mask) {
      let top = 0, bot = 0, lef = 0, rig = 0;
      for (let x = 0; x < w; x++) { if (mask[x]) top++; if (mask[(h - 1) * w + x]) bot++; }
      for (let y = 0; y < h; y++) { if (mask[y * w]) lef++; if (mask[y * w + w - 1]) rig++; }
      if (top > 2) cut.push('верх'); if (lef > 2) cut.push('лівий край'); if (rig > 2) cut.push('правий край');
      void bot;
    }
    let over = 0; for (let i = 0; i < w * h; i += 7) if (d[i * 4] > 250 && d[i * 4 + 1] > 250 && d[i * 4 + 2] > 250) over++;
    const warnings = [];
    if (Math.max(w, h) < 600) warnings.push(`низька роздільність ${w}×${h} пкс`);
    if (lapVar < 30) warnings.push('зображення розмите (мала різкість)');
    if (cut.length) warnings.push('об\'єкт обрізаний: ' + cut.join(', '));
    if (over / (w * h / 7) > 0.3) warnings.push('значна пересвічена ділянка');
    return { w, h, lapVar, warnings };
  };

  SC.vision = V;
})(typeof window !== 'undefined' ? (window.SC = window.SC || {}) : (global.SC = global.SC || {}));
