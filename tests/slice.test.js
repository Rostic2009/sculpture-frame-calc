// Перерізи 3D-моделі, ядро в перерізі, розкрій обшивки — на циліндрі з відомими відповідями
require('../js/mesh.js');
const M = SC.mesh;
let fail = 0; const ok = (c, m, v) => { if (!c) { fail++; console.log('FAIL', m, v); } else console.log('ok', m, v === undefined ? '' : v); };
// циліндр r = 0,5, H = 2 з кришками, 128 сегментів
const r = 0.5, H = 2, N = 128, t = [];
const P = k => [r * Math.cos(2 * Math.PI * k / N), r * Math.sin(2 * Math.PI * k / N)];
for (let k = 0; k < N; k++) {
  const a = P(k), b = P(k + 1);
  t.push(a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], H); t.push(a[0], a[1], 0, b[0], b[1], H, a[0], a[1], H);
  t.push(0, 0, 0, b[0], b[1], 0, a[0], a[1], 0); t.push(0, 0, H, a[0], a[1], H, b[0], b[1], H);
}
const T = Float64Array.from(t);
const exA = N / 2 * r * r * Math.sin(2 * Math.PI / N), exP = 2 * N * r * Math.sin(Math.PI / N);
const s = M.sectionProps(M.sectionAt(T, 1.0).loops);
ok(Math.abs(s.A - exA) < 1e-9, 'площа перерізу = площі 128-кутника', s.A.toFixed(6));
ok(Math.abs(s.per - exP) < 1e-9, 'периметр перерізу', s.per.toFixed(6));
ok(Math.hypot(s.c[0], s.c[1]) < 1e-9 && !s.open, 'центр перерізу на осі, контур замкнений');
const sl = M.slices(T, { step: 0.5, t: 2, rho: 7850 });
ok(sl.bands.length === 4, '4 смуги по 0,5 м');
const side = exP * 0.5, cap = exA;
ok(Math.abs(sl.bands[1].A - side) < 1e-9, 'площа бічної поверхні смуги', sl.bands[1].A.toFixed(6));
ok(Math.abs(sl.bands[0].A - side - cap) < 1e-9, 'нижня смуга + дно', sl.bands[0].A.toFixed(6));
ok(Math.abs(sl.M - (2 * cap + exP * H) * 0.002 * 7850) < 1e-6, 'маса оболонки = ρ·t·A', sl.M.toFixed(3));
ok(Math.abs(sl.cg[2] - 1) < 1e-9, 'центр мас по висоті = H/2', sl.cg[2]);
ok(Math.abs(sl.bands[1].Ax - 2 * r * 0.5) < 0.02, 'проєкція смуги A_x ≈ 2r·h', sl.bands[1].Ax.toFixed(4));
const a = M.fitCore(sl.secs[2].loops, [0, 0], 1, 0);
ok(Math.abs(a - 2 * r * Math.cos(Math.PI / N) / Math.SQRT2 * 1) < 0.01, 'вписаний квадрат ≈ r√2', a.toFixed(4));
const a2 = M.fitCore(sl.secs[2].loops, [0, 0], 1, 0.05);
ok(Math.abs(a2 - (a - 0.1)) < 0.01, 'зазор 50 мм з кожного боку', a2.toFixed(4));
const pc = M.proposeCore(sl, { clr: 0.05, aMin: 0.25, beltStep: 1.0, z0: 0.1 });
ok(pc && pc.a > 0.5 && pc.a < 0.62 && pc.levels.length >= 2, 'пропозиція ядра', JSON.stringify({ a: pc.a, aTop: pc.aTop, zTop: pc.zTop, levels: pc.levels }));
const sg = M.segments(sl, { wMax: 1.25, hMax: 2.5 });
ok(Math.abs(sg.A - (cap + exP * H)) < 1e-9, 'сума сегментів = площа оболонки без підошви', sg.A.toFixed(5));
ok(Math.abs(sg.list.find(q => q.band === 2).w - exP / 3) < 1e-9, 'розгорнута ширина сектора = периметр / 3', sg.list.find(q => q.band === 2).w.toFixed(4));
ok(sg.list.length === 4 * 3 && sg.list[0].band === 4, 'сегменти: 4 смуги × 3 сектори, нумерація згори', sg.list.length);
process.exit(fail ? 1 : 0);
