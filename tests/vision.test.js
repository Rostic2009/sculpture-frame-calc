require('../js/norms.js'); require('../js/mesh.js'); require('../js/vision.js');
const V = SC.vision; let fails = 0;
const ck = (n, g, e, t) => { const ok = Math.abs(g - e) <= t * Math.abs(e); if (!ok) fails++; console.log((ok ? 'OK  ' : 'FAIL') + ' ' + n + ': ' + (+g).toPrecision(5) + ' / ' + (+e).toPrecision(5)); };
// синтетичне зображення 400×600: світлий фон з градієнтом і шумом, темний циліндр (прямокутний силует) 100×400 пкс
function img(w, h, rect) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, inside = x >= rect[0] && x < rect[0] + rect[2] && y >= rect[1] && y < rect[1] + rect[3];
    const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 * 6;
    if (inside) { d[i] = 90 + n; d[i + 1] = 70 + n; d[i + 2] = 50 + n; } else { d[i] = 225 - y / 20 + n; d[i + 1] = 228 - y / 20 + n; d[i + 2] = 232 - y / 20 + n; }
    d[i + 3] = 255;
  }
  return { data: d, width: w, height: h };
}
const F = img(400, 600, [150, 100, 100, 400]);
const am = V.autoMask(F, { tol: 18 });
let n = 0; for (const v of am.mask) n += v;
ck('автомаска: площа силуету, пкс', n, 100 * 400, 0.02);
const S = img(400, 600, [170, 100, 60, 400]);
const as = V.autoMask(S, { tol: 18 });
// мітка частини 2
const mF = am.mask.map(v => v ? 2 : 0), mS = as.mask.map(v => v ? 2 : 0);
// масштаб: висота 400 пкс = 4 м → s = 0,01 м/пкс; основа (u0, v0) = (200, 500)
const dimS = V.scaleFrom({ p1: [200, 100], p2: [200, 500], value: 4, type: 'vertical' });
ck('масштаб s, м/пкс', dimS, 0.01, 1e-9);
const front = { m: mF, w: 400, h: 600, s: 0.01, u0: 200, v0: 500 }, side = { m: mS, w: 400, h: 600, s: 0.01, u0: 200, v0: 500 };
const part = V.buildPart(front, side, 2, 2, { nSeg: 48 });
const an = SC.mesh.analyze(part.tris, { noRecenter: true, step: 90, res: 400 });
ck('висота 3D, м', part.zTop - part.zBot, 4, 0.01);
ck('A(0°) = проєкція на площину YZ = 0,6×4 (бічна ширина)', an.areaTable[0], 0.6 * 4, 0.03);
ck('A(90°) = 1,0×4', an.areaTable[1], 1.0 * 4, 0.03);
const perim = Math.PI * (3 * (0.5 + 0.3) - Math.sqrt((3 * 0.5 + 0.3) * (0.5 + 3 * 0.3)));
ck('площа бічної поверхні еліптичного циліндра (Рамануджан) + торці', an.area, perim * 4 + 2 * Math.PI * 0.5 * 0.3, 0.02);
ck('IoU силуету (фронт)', V.iouFront(part.tris, front, 2), 1, 0.03);
const dc = V.dimConflicts({ dims: [{ id: 'a', confirmed: true, main: true, p1: [200, 100], p2: [200, 500], value: 4, type: 'vertical' }, { id: 'b', confirmed: true, p1: [150, 300], p2: [250, 300], value: 1.2, type: 'horizontal' }] });
ck('конфлікт розмірів ε (1,0 м за масштабом проти 1,2 введених)', dc.list[1].eps, 1 / 6, 1e-6);
console.log(dc.list[1].conflict ? 'OK   конфлікт виявлено' : 'FAIL конфлікт не виявлено'); if (!dc.list[1].conflict) fails++;
const rl = V.rle(mF); const back = V.unrle(rl, mF.length); let same = true; for (let i = 0; i < mF.length; i++) if (back[i] !== mF[i]) { same = false; break; }
console.log(same ? 'OK   RLE' : 'FAIL RLE'); if (!same) fails++;
console.log(fails ? fails + ' FAIL' : 'ALL OK'); process.exit(fails ? 1 : 0);
